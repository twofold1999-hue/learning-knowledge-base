use crate::{
    app_paths::AppDirectories,
    desktop_secret_store::{
        SecretStatus, SecretStore, SecretStoreError, SecretValue, WindowsCredentialSecretStore,
    },
};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File},
    io::{self, Write},
    net::IpAddr,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};
use tauri::State;
use url::Url;
use zeroize::Zeroizing;

pub const AI_SETTINGS_FILE: &str = "ai-settings.json";
pub const AI_SETTINGS_SCHEMA_VERSION: u32 = 1;
pub const DEFAULT_AI_BASE_URL: &str = "https://api.deepseek.com";
pub const DEFAULT_AI_MODEL: &str = "deepseek-v4-flash";
pub const DEFAULT_AI_TIMEOUT_MS: u32 = 65_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopAiConfig {
    pub schema_version: u32,
    pub provider: String,
    pub base_url: String,
    pub model: String,
    pub timeout_ms: u32,
    pub enabled: bool,
}

pub fn default_settings() -> DesktopAiConfig {
    DesktopAiConfig {
        schema_version: AI_SETTINGS_SCHEMA_VERSION,
        provider: "deepseek".to_owned(),
        base_url: DEFAULT_AI_BASE_URL.to_owned(),
        model: DEFAULT_AI_MODEL.to_owned(),
        timeout_ms: DEFAULT_AI_TIMEOUT_MS,
        enabled: false,
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveDesktopAiSettingsInput {
    pub provider: String,
    pub base_url: String,
    pub model: String,
    pub timeout_ms: u32,
    pub enabled: bool,
    pub api_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopAiSettingsView {
    pub schema_version: u32,
    pub provider: String,
    pub base_url: String,
    pub model: String,
    pub timeout_ms: u32,
    pub enabled: bool,
    pub credential_configured: bool,
    pub credential_mask: Option<String>,
    pub transport_ready: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ConfigError {
    Corrupt,
    Validation,
    WriteFailed,
    SecretStore,
    PartialUpdate,
    Unsupported,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopAiCommandError {
    pub code: &'static str,
    pub message: &'static str,
    pub retryable: bool,
}

impl From<ConfigError> for DesktopAiCommandError {
    fn from(error: ConfigError) -> Self {
        match error {
            ConfigError::Corrupt => Self {
                code: "AI_CONFIG_CORRUPT",
                message: "桌面 AI 配置文件无效，请在修复后重试。",
                retryable: false,
            },
            ConfigError::Validation => Self {
                code: "AI_CONFIG_INVALID",
                message: "桌面 AI 配置不符合安全要求。",
                retryable: false,
            },
            ConfigError::WriteFailed => Self {
                code: "AI_CONFIG_WRITE_FAILED",
                message: "无法保存桌面 AI 配置。",
                retryable: true,
            },
            ConfigError::SecretStore => Self {
                code: "AI_SECRET_STORE_ERROR",
                message: "无法更新 Windows 凭据，请重试。",
                retryable: true,
            },
            ConfigError::PartialUpdate => Self {
                code: "AI_PARTIAL_UPDATE",
                message: "配置未能完整更新，请检查后重试。",
                retryable: true,
            },
            ConfigError::Unsupported => Self {
                code: "AI_DESKTOP_UNSUPPORTED",
                message: "当前系统不支持桌面凭据存储。",
                retryable: false,
            },
        }
    }
}

pub struct DesktopAiConfigStore {
    config_path: PathBuf,
}

impl DesktopAiConfigStore {
    pub fn from_directories(directories: &AppDirectories) -> Self {
        Self {
            config_path: directories.config.join(AI_SETTINGS_FILE),
        }
    }

    #[cfg(test)]
    fn from_config_dir(config_dir: PathBuf) -> Self {
        Self {
            config_path: config_dir.join(AI_SETTINGS_FILE),
        }
    }

    fn load(&self) -> Result<DesktopAiConfig, ConfigError> {
        let content = match fs::read_to_string(&self.config_path) {
            Ok(content) => content,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(default_settings()),
            Err(_) => return Err(ConfigError::WriteFailed),
        };
        let settings: DesktopAiConfig =
            serde_json::from_str(&content).map_err(|_| ConfigError::Corrupt)?;
        validate_config(settings)
    }

    fn save(&self, config: &DesktopAiConfig) -> Result<(), ConfigError> {
        let serialized = serde_json::to_vec_pretty(config).map_err(|_| ConfigError::WriteFailed)?;
        atomic_write(&self.config_path, &serialized).map_err(|_| ConfigError::WriteFailed)
    }
}

pub struct DesktopAiState {
    config_store: DesktopAiConfigStore,
    secret_store: Box<dyn SecretStore>,
}

impl DesktopAiState {
    pub fn initialize(directories: &AppDirectories) -> Self {
        Self {
            config_store: DesktopAiConfigStore::from_directories(directories),
            secret_store: Box::new(WindowsCredentialSecretStore::new()),
        }
    }

    #[cfg(test)]
    fn with_store(config_dir: PathBuf, secret_store: Box<dyn SecretStore>) -> Self {
        Self {
            config_store: DesktopAiConfigStore::from_config_dir(config_dir),
            secret_store,
        }
    }

    fn current_view(&self) -> Result<DesktopAiSettingsView, ConfigError> {
        let config = self.config_store.load()?;
        let status = self.secret_store.status().map_err(map_secret_error)?;
        Ok(view_from(config, status))
    }

    fn save_settings(
        &self,
        input: SaveDesktopAiSettingsInput,
    ) -> Result<DesktopAiSettingsView, ConfigError> {
        self.config_store.load()?;
        let existing_secret = self
            .secret_store
            .read_for_backend()
            .map_err(map_secret_error)?;
        let inbound_secret = input.api_key.map(Zeroizing::new);
        let replacement = inbound_secret
            .as_ref()
            .filter(|key| !key.trim().is_empty())
            .map(|key| SecretValue::new(key.as_str().to_owned()).map_err(map_secret_error))
            .transpose()?;
        let candidate = validate_config(DesktopAiConfig {
            schema_version: AI_SETTINGS_SCHEMA_VERSION,
            provider: input.provider,
            base_url: input.base_url,
            model: input.model,
            timeout_ms: input.timeout_ms,
            enabled: input.enabled,
        })?;
        if candidate.enabled && replacement.is_none() && existing_secret.is_none() {
            return Err(ConfigError::Validation);
        }

        if let Some(new_secret) = replacement {
            self.secret_store
                .write(new_secret)
                .map_err(map_secret_error)?;
            if self.config_store.save(&candidate).is_err() {
                return restore_secret(
                    &*self.secret_store,
                    existing_secret,
                    ConfigError::WriteFailed,
                );
            }
        } else {
            self.config_store.save(&candidate)?;
        }
        self.current_view()
    }

    fn forget_credential(&self) -> Result<DesktopAiSettingsView, ConfigError> {
        let previous = self.config_store.load()?;
        let disabled = DesktopAiConfig {
            enabled: false,
            ..previous.clone()
        };
        self.config_store.save(&disabled)?;
        if self.secret_store.delete().is_err() {
            return match self.config_store.save(&previous) {
                Ok(()) => Err(ConfigError::SecretStore),
                Err(_) => Err(ConfigError::PartialUpdate),
            };
        }
        self.current_view()
    }
}

fn map_secret_error(error: SecretStoreError) -> ConfigError {
    match error {
        SecretStoreError::Unavailable => ConfigError::Unsupported,
        SecretStoreError::OperationFailed | SecretStoreError::InvalidSecret => {
            ConfigError::SecretStore
        }
    }
}

fn restore_secret(
    store: &dyn SecretStore,
    old_secret: Option<SecretValue>,
    original_error: ConfigError,
) -> Result<DesktopAiSettingsView, ConfigError> {
    let rollback = match old_secret {
        Some(secret) => store.write(secret),
        None => store.delete(),
    };
    if rollback.is_err() {
        return Err(ConfigError::PartialUpdate);
    }
    Err(original_error)
}

fn view_from(config: DesktopAiConfig, secret_status: SecretStatus) -> DesktopAiSettingsView {
    let (credential_configured, credential_mask) = match secret_status {
        SecretStatus::NotConfigured => (false, None),
        SecretStatus::Configured { mask } => (true, mask),
    };
    DesktopAiSettingsView {
        schema_version: config.schema_version,
        provider: config.provider,
        base_url: config.base_url,
        model: config.model,
        timeout_ms: config.timeout_ms,
        enabled: config.enabled && credential_configured,
        credential_configured,
        credential_mask,
        transport_ready: false,
    }
}

fn validate_config(mut config: DesktopAiConfig) -> Result<DesktopAiConfig, ConfigError> {
    if config.schema_version != AI_SETTINGS_SCHEMA_VERSION || config.provider.trim() != "deepseek" {
        return Err(ConfigError::Validation);
    }
    config.provider = "deepseek".to_owned();
    config.base_url = normalize_base_url(&config.base_url)?;
    config.model = normalize_model(&config.model)?;
    if !(5_000..=120_000).contains(&config.timeout_ms) {
        return Err(ConfigError::Validation);
    }
    Ok(config)
}

fn normalize_base_url(value: &str) -> Result<String, ConfigError> {
    let url = Url::parse(value.trim()).map_err(|_| ConfigError::Validation)?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
        || url.port_or_known_default() != Some(443)
    {
        return Err(ConfigError::Validation);
    }
    let host = url.host_str().ok_or(ConfigError::Validation)?;
    let lower_host = host.to_ascii_lowercase();
    if lower_host == "localhost"
        || lower_host.ends_with(".local")
        || lower_host.ends_with(".internal")
        || is_private_literal_ip(&lower_host)
    {
        return Err(ConfigError::Validation);
    }
    Ok(format!("https://{lower_host}"))
}

fn is_private_literal_ip(host: &str) -> bool {
    match host.parse::<IpAddr>() {
        Ok(IpAddr::V4(ip)) => {
            ip.is_private() || ip.is_loopback() || ip.is_link_local() || ip.is_unspecified()
        }
        Ok(IpAddr::V6(ip)) => {
            let segment = ip.segments()[0];
            ip.is_loopback()
                || ip.is_unspecified()
                || (segment & 0xfe00) == 0xfc00
                || (segment & 0xffc0) == 0xfe80
        }
        Err(_) => false,
    }
}

fn normalize_model(value: &str) -> Result<String, ConfigError> {
    let model = value.trim();
    if model.is_empty()
        || model.len() > 128
        || model.chars().any(|character| {
            !character.is_ascii_alphanumeric() && !matches!(character, '-' | '_' | '.' | '/')
        })
    {
        return Err(ConfigError::Validation);
    }
    Ok(model.to_owned())
}

static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

fn atomic_write(path: &Path, contents: &[u8]) -> io::Result<()> {
    atomic_write_with(path, contents, |from, to| fs::rename(from, to))
}

fn atomic_write_with<F>(path: &Path, contents: &[u8], replace: F) -> io::Result<()>
where
    F: FnOnce(&Path, &Path) -> io::Result<()>,
{
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::other("missing config directory"))?;
    let temporary = parent.join(format!(
        ".ai-settings-{}.tmp",
        TEMP_COUNTER.fetch_add(1, Ordering::Relaxed)
    ));
    let result = (|| {
        let mut file = File::create(&temporary)?;
        file.write_all(contents)?;
        file.sync_all()?;
        replace(&temporary, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

#[tauri::command]
pub fn get_desktop_ai_settings(
    state: State<'_, DesktopAiState>,
) -> Result<DesktopAiSettingsView, DesktopAiCommandError> {
    state.current_view().map_err(Into::into)
}

#[tauri::command]
pub fn save_desktop_ai_settings(
    state: State<'_, DesktopAiState>,
    input: SaveDesktopAiSettingsInput,
) -> Result<DesktopAiSettingsView, DesktopAiCommandError> {
    state.save_settings(input).map_err(Into::into)
}

#[tauri::command]
pub fn forget_desktop_ai_credential(
    state: State<'_, DesktopAiState>,
) -> Result<DesktopAiSettingsView, DesktopAiCommandError> {
    state.forget_credential().map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::desktop_secret_store::InMemorySecretStore;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "lkb-ai-config-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn input(enabled: bool, key: Option<&str>) -> SaveDesktopAiSettingsInput {
        SaveDesktopAiSettingsInput {
            provider: "deepseek".to_owned(),
            base_url: "https://api.deepseek.com/".to_owned(),
            model: "deepseek-v4-flash".to_owned(),
            timeout_ms: 65_000,
            enabled,
            api_key: key.map(str::to_owned),
        }
    }

    #[test]
    fn missing_configuration_uses_safe_defaults() {
        let root = temp_dir();
        let store = DesktopAiConfigStore::from_config_dir(root.clone());
        assert_eq!(store.load().unwrap(), default_settings());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn valid_configuration_round_trips_without_changing_schema() {
        let root = temp_dir();
        let store = DesktopAiConfigStore::from_config_dir(root.clone());
        let config = validate_config(DesktopAiConfig {
            base_url: "https://api.deepseek.com/".to_owned(),
            ..default_settings()
        })
        .unwrap();
        store.save(&config).unwrap();
        assert_eq!(store.load().unwrap(), config);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_unknown_provider() {
        assert_eq!(
            validate_config(DesktopAiConfig {
                provider: "other".to_owned(),
                ..default_settings()
            }),
            Err(ConfigError::Validation)
        );
    }
    #[test]
    fn validates_public_root_https_configuration_and_normalizes_slashes() {
        let valid = validate_config(DesktopAiConfig {
            base_url: "https://api.deepseek.com/".to_owned(),
            ..default_settings()
        })
        .unwrap();
        assert_eq!(valid.base_url, "https://api.deepseek.com");
        for invalid in [
            "http://api.deepseek.com",
            "https://localhost",
            "https://127.0.0.1",
            "https://192.168.1.1",
            "https://user:pass@api.deepseek.com",
            "https://api.deepseek.com/path",
            "https://api.deepseek.com?x=1",
            "https://api.deepseek.com#x",
            "https://api.deepseek.com:444",
        ] {
            assert!(normalize_base_url(invalid).is_err(), "{invalid}");
        }
    }

    #[test]
    fn validates_model_and_timeout_boundaries() {
        assert!(normalize_model("").is_err());
        assert!(normalize_model("invalid\nmodel").is_err());
        assert!(normalize_model(&"a".repeat(129)).is_err());
        assert!(validate_config(DesktopAiConfig {
            timeout_ms: 4_999,
            ..default_settings()
        })
        .is_err());
        assert!(validate_config(DesktopAiConfig {
            timeout_ms: 120_001,
            ..default_settings()
        })
        .is_err());
        assert!(validate_config(DesktopAiConfig {
            timeout_ms: 5_000,
            ..default_settings()
        })
        .is_ok());
        assert!(validate_config(DesktopAiConfig {
            timeout_ms: 120_000,
            ..default_settings()
        })
        .is_ok());
    }

    #[test]
    fn corrupt_configuration_is_not_overwritten() {
        let root = temp_dir();
        let path = root.join(AI_SETTINGS_FILE);
        fs::write(&path, b"not-json").unwrap();
        let store = DesktopAiConfigStore::from_config_dir(root.clone());
        assert_eq!(store.load(), Err(ConfigError::Corrupt));
        assert_eq!(fs::read(&path).unwrap(), b"not-json");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn failed_atomic_replacement_keeps_the_existing_configuration() {
        let root = temp_dir();
        let path = root.join(AI_SETTINGS_FILE);
        fs::write(&path, b"old-config").unwrap();
        assert!(
            atomic_write_with(&path, b"new-config", |_temporary, _target| Err(
                io::Error::other("replace failed")
            ))
            .is_err()
        );
        assert_eq!(fs::read(&path).unwrap(), b"old-config");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn enabled_requires_a_credential_and_views_never_include_it() {
        let root = temp_dir();
        let state = DesktopAiState::with_store(root.clone(), Box::new(InMemorySecretStore::new()));
        assert_eq!(
            state.save_settings(input(true, None)),
            Err(ConfigError::Validation)
        );
        let view = state
            .save_settings(input(true, Some("lkb-test-credential-1234")))
            .unwrap();
        assert!(view.credential_configured);
        assert_eq!(view.credential_mask, Some("••••1234".to_owned()));
        let serialized = serde_json::to_string(&view).unwrap();
        assert!(!serialized.contains("lkb-test-credential-1234"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn failed_config_write_restores_the_previous_credential() {
        let root = temp_dir();
        let state =
            DesktopAiState::with_store(root.join("missing"), Box::new(InMemorySecretStore::new()));
        assert_eq!(
            state.save_settings(input(true, Some("lkb-test-credential-1234"))),
            Err(ConfigError::WriteFailed)
        );
        assert_eq!(
            state.secret_store.status().unwrap(),
            SecretStatus::NotConfigured
        );
        assert!(!root.join("missing").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn saved_json_contains_only_non_secret_configuration() {
        let root = temp_dir();
        let state = DesktopAiState::with_store(root.clone(), Box::new(InMemorySecretStore::new()));
        state
            .save_settings(input(true, Some("lkb-test-credential-1234")))
            .unwrap();
        let saved = fs::read_to_string(root.join(AI_SETTINGS_FILE)).unwrap();
        assert!(saved.contains("deepseek"));
        assert!(!saved.contains("lkb-test-credential-1234"));
        assert!(!saved.contains("credentialMask"));
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn forgetting_is_idempotent_and_disables_ai() {
        let root = temp_dir();
        let state = DesktopAiState::with_store(root.clone(), Box::new(InMemorySecretStore::new()));
        state
            .save_settings(input(true, Some("lkb-test-credential-1234")))
            .unwrap();
        let view = state.forget_credential().unwrap();
        assert!(!view.enabled);
        assert!(!view.credential_configured);
        assert!(!state.forget_credential().unwrap().credential_configured);
        fs::remove_dir_all(root).unwrap();
    }
}
