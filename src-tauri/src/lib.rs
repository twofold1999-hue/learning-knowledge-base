mod app_paths;
mod desktop_baseline;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            desktop_baseline::focus_existing_main_window(app);
        }))
        .setup(|app| {
            app_paths::initialize_app_directories(app.handle())?;
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
            desktop_baseline::desktop_baseline_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
