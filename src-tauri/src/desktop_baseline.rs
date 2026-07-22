use serde::Serialize;
use tauri::{AppHandle, Manager, State, WebviewWindow};

pub const PRODUCT_NAME: &str = "学习知识库";
pub const APP_IDENTIFIER: &str = "com.learningknowledgebase.desktop";

#[derive(Default)]
pub struct DesktopBaselineState {
    directories_ready: bool,
}

impl DesktopBaselineState {
    pub fn initialized() -> Self {
        Self {
            directories_ready: true,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopBaselineStatus {
    runtime: &'static str,
    initialized: bool,
    version: &'static str,
    product_name: &'static str,
    identifier: &'static str,
    directories_ready: bool,
}

#[tauri::command]
pub fn desktop_baseline_status(state: State<'_, DesktopBaselineState>) -> DesktopBaselineStatus {
    baseline_status(state.directories_ready)
}

fn baseline_status(directories_ready: bool) -> DesktopBaselineStatus {
    DesktopBaselineStatus {
        runtime: "desktop",
        initialized: directories_ready,
        version: env!("CARGO_PKG_VERSION"),
        product_name: PRODUCT_NAME,
        identifier: APP_IDENTIFIER,
        directories_ready,
    }
}

pub fn focus_existing_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    restore_and_focus(&TauriWindowActions(&window));
}

trait MainWindowActions {
    fn is_minimized(&self) -> Option<bool>;
    fn is_visible(&self) -> Option<bool>;
    fn restore(&self);
    fn show(&self);
    fn focus(&self);
}

fn restore_and_focus(window: &impl MainWindowActions) {
    if window.is_minimized() == Some(true) {
        window.restore();
    }

    if window.is_visible() == Some(false) {
        window.show();
    }

    window.focus();
}

struct TauriWindowActions<'a>(&'a WebviewWindow);

impl MainWindowActions for TauriWindowActions<'_> {
    fn is_minimized(&self) -> Option<bool> {
        self.0.is_minimized().ok()
    }

    fn is_visible(&self) -> Option<bool> {
        self.0.is_visible().ok()
    }

    fn restore(&self) {
        let _ = self.0.unminimize();
    }

    fn show(&self) {
        let _ = self.0.show();
    }

    fn focus(&self) {
        let _ = self.0.set_focus();
    }
}

#[cfg(test)]
mod tests {
    use super::{baseline_status, restore_and_focus, MainWindowActions};

    struct FakeWindow {
        minimized: Option<bool>,
        visible: Option<bool>,
        actions: std::cell::RefCell<Vec<&'static str>>,
    }

    impl FakeWindow {
        fn new(minimized: Option<bool>, visible: Option<bool>) -> Self {
            Self {
                minimized,
                visible,
                actions: std::cell::RefCell::new(Vec::new()),
            }
        }
    }

    impl MainWindowActions for FakeWindow {
        fn is_minimized(&self) -> Option<bool> {
            self.minimized
        }

        fn is_visible(&self) -> Option<bool> {
            self.visible
        }

        fn restore(&self) {
            self.actions.borrow_mut().push("restore");
        }

        fn show(&self) {
            self.actions.borrow_mut().push("show");
        }

        fn focus(&self) {
            self.actions.borrow_mut().push("focus");
        }
    }

    #[test]
    fn baseline_status_exposes_identity_without_a_filesystem_path() {
        let value = serde_json::to_value(baseline_status(true)).expect("serialize baseline status");

        assert_eq!(value["runtime"], "desktop");
        assert_eq!(value["version"], env!("CARGO_PKG_VERSION"));
        assert_eq!(value["productName"], "学习知识库");
        assert_eq!(value["identifier"], "com.learningknowledgebase.desktop");
        assert_eq!(value["directoriesReady"], true);
        assert!(value.get("path").is_none());
    }

    #[test]
    fn restores_hidden_or_minimized_windows_before_focusing() {
        let window = FakeWindow::new(Some(true), Some(false));

        restore_and_focus(&window);

        assert_eq!(*window.actions.borrow(), ["restore", "show", "focus"]);
    }

    #[test]
    fn focuses_safely_when_window_state_is_unavailable() {
        let window = FakeWindow::new(None, None);

        restore_and_focus(&window);

        assert_eq!(*window.actions.borrow(), ["focus"]);
    }
}
