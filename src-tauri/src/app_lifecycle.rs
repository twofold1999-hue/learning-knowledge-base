use serde::Serialize;
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicBool, Ordering},
};
use tauri::{AppHandle, Emitter, Manager, State};

pub const UNCLEAN_EXIT_MARKER: &str = "unclean-exit.marker";

pub struct AppLifecycleState {
    marker_path: PathBuf,
    previous_unclean_exit: bool,
    close_requested: AtomicBool,
    close_authorized: AtomicBool,
}

impl AppLifecycleState {
    pub fn initialize(runtime_dir: PathBuf) -> Result<Self, String> {
        let marker_path = runtime_dir.join(UNCLEAN_EXIT_MARKER);
        let previous_unclean_exit = marker_path.exists();
        fs::write(&marker_path, b"").map_err(|_| "无法初始化桌面会话状态".to_string())?;

        Ok(Self {
            marker_path,
            previous_unclean_exit,
            close_requested: AtomicBool::new(false),
            close_authorized: AtomicBool::new(false),
        })
    }

    pub fn begin_close_request(&self) -> bool {
        !self.close_requested.swap(true, Ordering::SeqCst)
    }

    pub fn cancel_close_request(&self) {
        self.close_requested.store(false, Ordering::SeqCst)
    }

    pub fn authorize_close(&self) {
        self.close_authorized.store(true, Ordering::SeqCst)
    }

    pub fn close_authorized(&self) -> bool {
        self.close_authorized.load(Ordering::SeqCst)
    }

    fn graceful_exit(&self) -> Result<(), String> {
        fs::remove_file(&self.marker_path)
            .or_else(|error| {
                if error.kind() == std::io::ErrorKind::NotFound {
                    Ok(())
                } else {
                    Err(error)
                }
            })
            .map_err(|_| "无法完成安全退出".to_string())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopLifecycleStatus {
    runtime: &'static str,
    initialized: bool,
    version: &'static str,
    product_name: &'static str,
    identifier: &'static str,
    directories_ready: bool,
    previous_unclean_exit: bool,
}

#[tauri::command]
pub fn desktop_lifecycle_status(state: State<'_, AppLifecycleState>) -> DesktopLifecycleStatus {
    DesktopLifecycleStatus {
        runtime: "desktop",
        initialized: true,
        version: env!("CARGO_PKG_VERSION"),
        product_name: "学习知识库",
        identifier: "com.learningknowledgebase.desktop",
        directories_ready: true,
        previous_unclean_exit: state.previous_unclean_exit,
    }
}

#[tauri::command]
pub fn cancel_close_request(state: State<'_, AppLifecycleState>) {
    state.cancel_close_request()
}

#[tauri::command]
pub fn request_graceful_exit(
    app: AppHandle,
    state: State<'_, AppLifecycleState>,
) -> Result<(), String> {
    state.graceful_exit()?;
    state.authorize_close();
    app.exit(0);
    Ok(())
}

#[tauri::command]
pub fn request_forced_exit(app: AppHandle, state: State<'_, AppLifecycleState>) {
    state.authorize_close();
    app.exit(1)
}

pub fn emit_close_requested(app: &AppHandle) {
    if let Some(state) = app.try_state::<AppLifecycleState>() {
        if state.close_authorized() {
            return;
        }
        if state.begin_close_request() {
            let _ = app.emit("desktop-close-requested", ());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp() -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "lkb-lifecycle-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock after epoch")
                .as_nanos()
        ));
        fs::create_dir_all(&path).expect("temporary lifecycle directory");
        path
    }

    #[test]
    fn marker_lifecycle_is_safe_and_private() {
        let root = temp();
        let first = AppLifecycleState::initialize(root.clone()).expect("first initialize");
        assert!(!first.previous_unclean_exit);
        assert!(root.join(UNCLEAN_EXIT_MARKER).exists());

        let second = AppLifecycleState::initialize(root.clone()).expect("second initialize");
        assert!(second.previous_unclean_exit);
        // Forced exit intentionally does nothing here, so the marker remains for the next start.
        assert!(root.join(UNCLEAN_EXIT_MARKER).exists());
        second.graceful_exit().expect("graceful cleanup");
        assert!(!root.join(UNCLEAN_EXIT_MARKER).exists());

        fs::remove_dir_all(root).expect("remove generated test directory");
    }

    #[test]
    fn close_request_is_deduplicated_and_cancelable() {
        let root = temp();
        let state = AppLifecycleState::initialize(root.clone()).expect("initialize");

        assert!(state.begin_close_request());
        assert!(!state.begin_close_request());
        state.cancel_close_request();
        assert!(state.begin_close_request());

        fs::remove_dir_all(root).expect("remove generated test directory");
    }

    #[test]
    fn close_authorization_is_explicit_and_does_not_clear_the_marker() {
        let root = temp();
        let state = AppLifecycleState::initialize(root.clone()).expect("initialize");

        assert!(!state.close_authorized());
        state.authorize_close();
        assert!(state.close_authorized());
        assert!(root.join(UNCLEAN_EXIT_MARKER).exists());

        fs::remove_dir_all(root).expect("remove generated test directory");
    }

    #[test]
    fn status_serialization_does_not_include_paths() {
        let root = temp();
        let state = AppLifecycleState::initialize(root.clone()).expect("initialize");
        let json = serde_json::to_string(&DesktopLifecycleStatus {
            runtime: "desktop",
            initialized: true,
            version: "0.2.0",
            product_name: "学习知识库",
            identifier: "com.learningknowledgebase.desktop",
            directories_ready: true,
            previous_unclean_exit: state.previous_unclean_exit,
        })
        .expect("serialize status");

        assert!(!json.contains(&root.to_string_lossy().to_string()));
        assert!(json.contains("initialized"));
        fs::remove_dir_all(root).expect("remove generated test directory");
    }
}
