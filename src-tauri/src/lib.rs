mod app_lifecycle;
mod app_paths;
mod desktop_ai_config;
mod desktop_baseline;
mod desktop_secret_store;
mod external_source_opener;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            desktop_baseline::focus_existing_main_window(app);
        }))
        .setup(|app| {
            let directories = app_paths::initialize_app_directories(app.handle())?;
            let lifecycle =
                app_lifecycle::AppLifecycleState::initialize(directories.runtime.clone())?;
            app.manage(desktop_ai_config::DesktopAiState::initialize(&directories));
            app.manage(directories);
            app.manage(lifecycle);
            app.manage(desktop_baseline::DesktopBaselineState::initialized());

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_lifecycle::desktop_lifecycle_status,
            desktop_ai_config::get_desktop_ai_settings,
            desktop_ai_config::save_desktop_ai_settings,
            desktop_ai_config::forget_desktop_ai_credential,
            app_lifecycle::cancel_close_request,
            app_lifecycle::request_graceful_exit,
            app_lifecycle::request_forced_exit,
            desktop_baseline::desktop_baseline_status,
            external_source_opener::open_external_learning_source
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app, event| {
        if let tauri::RunEvent::WindowEvent {
            event: tauri::WindowEvent::CloseRequested { api, .. },
            ..
        } = event
        {
            let close_authorized = app
                .try_state::<app_lifecycle::AppLifecycleState>()
                .is_some_and(|state| state.close_authorized());

            if !close_authorized {
                api.prevent_close();
                app_lifecycle::emit_close_requested(app);
            }
        }
    });
}
