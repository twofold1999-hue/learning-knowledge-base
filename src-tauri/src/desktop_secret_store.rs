#[cfg(test)]
use std::sync::Mutex;
use zeroize::Zeroizing;

pub const DEEPSEEK_CREDENTIAL_TARGET: &str =
    "com.learningknowledgebase.desktop/ai/deepseek/api-key/v1";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SecretStoreError {
    #[allow(dead_code)]
    Unavailable,
    OperationFailed,
    InvalidSecret,
}

#[derive(Clone)]
pub struct SecretValue(Zeroizing<String>);

impl SecretValue {
    pub fn new(value: String) -> Result<Self, SecretStoreError> {
        let trimmed = value.trim();
        if trimmed.is_empty()
            || trimmed.len() > 2_048
            || value
                .chars()
                .any(|character| character == '\0' || character.is_control())
        {
            return Err(SecretStoreError::InvalidSecret);
        }
        Ok(Self(Zeroizing::new(trimmed.to_owned())))
    }

    pub fn as_str(&self) -> &str {
        self.0.as_str()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SecretStatus {
    NotConfigured,
    Configured { mask: Option<String> },
}

pub trait SecretStore: Send + Sync {
    fn status(&self) -> Result<SecretStatus, SecretStoreError>;
    fn read_for_backend(&self) -> Result<Option<SecretValue>, SecretStoreError>;
    fn write(&self, value: SecretValue) -> Result<(), SecretStoreError>;
    fn delete(&self) -> Result<(), SecretStoreError>;
}

pub fn credential_mask(value: &str) -> Option<String> {
    let character_count = value.chars().count();
    if character_count <= 4 {
        return None;
    }
    let suffix: String = value
        .chars()
        .rev()
        .take(4)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    Some(format!("••••{suffix}"))
}

#[cfg(test)]
pub struct InMemorySecretStore {
    value: Mutex<Option<SecretValue>>,
}

#[cfg(test)]
impl InMemorySecretStore {
    pub fn new() -> Self {
        Self {
            value: Mutex::new(None),
        }
    }
}

#[cfg(test)]
impl Default for InMemorySecretStore {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
impl SecretStore for InMemorySecretStore {
    fn status(&self) -> Result<SecretStatus, SecretStoreError> {
        let value = self.read_for_backend()?;
        Ok(match value {
            Some(secret) => SecretStatus::Configured {
                mask: credential_mask(secret.as_str()),
            },
            None => SecretStatus::NotConfigured,
        })
    }

    fn read_for_backend(&self) -> Result<Option<SecretValue>, SecretStoreError> {
        self.value
            .lock()
            .map_err(|_| SecretStoreError::OperationFailed)
            .map(|value| value.clone())
    }

    fn write(&self, value: SecretValue) -> Result<(), SecretStoreError> {
        *self
            .value
            .lock()
            .map_err(|_| SecretStoreError::OperationFailed)? = Some(value);
        Ok(())
    }

    fn delete(&self) -> Result<(), SecretStoreError> {
        *self
            .value
            .lock()
            .map_err(|_| SecretStoreError::OperationFailed)? = None;
        Ok(())
    }
}

#[cfg(target_os = "windows")]
pub struct WindowsCredentialSecretStore;

#[cfg(target_os = "windows")]
impl WindowsCredentialSecretStore {
    pub fn new() -> Self {
        Self
    }
}

#[cfg(target_os = "windows")]
fn credential_target_wide() -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    std::ffi::OsStr::new(DEEPSEEK_CREDENTIAL_TARGET)
        .encode_wide()
        .chain(Some(0))
        .collect()
}

#[cfg(target_os = "windows")]
impl SecretStore for WindowsCredentialSecretStore {
    fn status(&self) -> Result<SecretStatus, SecretStoreError> {
        let value = self.read_for_backend()?;
        Ok(match value {
            Some(secret) => SecretStatus::Configured {
                mask: credential_mask(secret.as_str()),
            },
            None => SecretStatus::NotConfigured,
        })
    }

    fn read_for_backend(&self) -> Result<Option<SecretValue>, SecretStoreError> {
        use std::ptr::null_mut;
        use windows_sys::Win32::{
            Foundation::{GetLastError, ERROR_NOT_FOUND},
            Security::Credentials::{CredFree, CredReadW, CREDENTIALW, CRED_TYPE_GENERIC},
        };

        let target = credential_target_wide();
        let mut raw_credential: *mut CREDENTIALW = null_mut();
        let read = unsafe { CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut raw_credential) };
        if read == 0 {
            return if unsafe { GetLastError() } == ERROR_NOT_FOUND {
                Ok(None)
            } else {
                Err(SecretStoreError::OperationFailed)
            };
        }
        if raw_credential.is_null() {
            return Err(SecretStoreError::OperationFailed);
        }

        let bytes = unsafe {
            let credential = &*raw_credential;
            std::slice::from_raw_parts(
                credential.CredentialBlob,
                credential.CredentialBlobSize as usize,
            )
            .to_vec()
        };
        unsafe { CredFree(raw_credential.cast()) };
        let bytes = Zeroizing::new(bytes);
        let value = std::str::from_utf8(&bytes)
            .map_err(|_| SecretStoreError::OperationFailed)?
            .to_owned();
        SecretValue::new(value).map(Some)
    }

    fn write(&self, value: SecretValue) -> Result<(), SecretStoreError> {
        use std::ptr::null_mut;
        use windows_sys::Win32::Security::Credentials::{
            CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC,
        };

        let mut target = credential_target_wide();
        let mut blob = Zeroizing::new(value.as_str().as_bytes().to_vec());
        let credential = CREDENTIALW {
            Flags: 0,
            Type: CRED_TYPE_GENERIC,
            TargetName: target.as_mut_ptr(),
            Comment: null_mut(),
            LastWritten: Default::default(),
            CredentialBlobSize: blob.len() as u32,
            CredentialBlob: blob.as_mut_ptr(),
            Persist: CRED_PERSIST_LOCAL_MACHINE,
            AttributeCount: 0,
            Attributes: null_mut(),
            TargetAlias: null_mut(),
            UserName: null_mut(),
        };
        if unsafe { CredWriteW(&credential, 0) } == 0 {
            return Err(SecretStoreError::OperationFailed);
        }
        Ok(())
    }

    fn delete(&self) -> Result<(), SecretStoreError> {
        use windows_sys::Win32::{
            Foundation::{GetLastError, ERROR_NOT_FOUND},
            Security::Credentials::{CredDeleteW, CRED_TYPE_GENERIC},
        };

        let target = credential_target_wide();
        if unsafe { CredDeleteW(target.as_ptr(), CRED_TYPE_GENERIC, 0) } == 0
            && unsafe { GetLastError() } != ERROR_NOT_FOUND
        {
            return Err(SecretStoreError::OperationFailed);
        }
        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
pub struct WindowsCredentialSecretStore;

#[cfg(not(target_os = "windows"))]
impl WindowsCredentialSecretStore {
    pub fn new() -> Self {
        Self
    }
}

#[cfg(not(target_os = "windows"))]
impl SecretStore for WindowsCredentialSecretStore {
    fn status(&self) -> Result<SecretStatus, SecretStoreError> {
        Err(SecretStoreError::Unavailable)
    }
    fn read_for_backend(&self) -> Result<Option<SecretValue>, SecretStoreError> {
        Err(SecretStoreError::Unavailable)
    }
    fn write(&self, _value: SecretValue) -> Result<(), SecretStoreError> {
        Err(SecretStoreError::Unavailable)
    }
    fn delete(&self) -> Result<(), SecretStoreError> {
        Err(SecretStoreError::Unavailable)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn in_memory_store_supports_write_replace_delete_and_idempotent_delete() {
        let store = InMemorySecretStore::new();
        assert_eq!(store.status().unwrap(), SecretStatus::NotConfigured);
        store
            .write(SecretValue::new("lkb-test-one-1234".to_owned()).unwrap())
            .unwrap();
        assert_eq!(
            store.status().unwrap(),
            SecretStatus::Configured {
                mask: Some("••••1234".to_owned())
            }
        );
        store
            .write(SecretValue::new("lkb-test-two-5678".to_owned()).unwrap())
            .unwrap();
        assert_eq!(
            store.read_for_backend().unwrap().unwrap().as_str(),
            "lkb-test-two-5678"
        );
        store.delete().unwrap();
        store.delete().unwrap();
        assert_eq!(store.status().unwrap(), SecretStatus::NotConfigured);
    }

    #[test]
    fn masks_only_safe_suffixes_and_rejects_invalid_values() {
        assert_eq!(credential_mask("abcd"), None);
        assert_eq!(credential_mask("abcde"), Some("••••bcde".to_owned()));
        assert!(SecretValue::new("\ninvalid".to_owned()).is_err());
        assert!(SecretValue::new("\0invalid".to_owned()).is_err());
    }

    #[test]
    fn windows_credential_constants_are_stable() {
        assert_eq!(
            DEEPSEEK_CREDENTIAL_TARGET,
            "com.learningknowledgebase.desktop/ai/deepseek/api-key/v1"
        );
    }
}

#[cfg(target_os = "windows")]
#[test]
fn windows_credential_type_and_persistence_are_fixed() {
    use windows_sys::Win32::Security::Credentials::{
        CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC,
    };

    assert_eq!(CRED_TYPE_GENERIC, 1);
    assert_eq!(CRED_PERSIST_LOCAL_MACHINE, 2);
}
