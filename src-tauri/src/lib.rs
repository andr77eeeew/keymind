//! Keymind core. Pure logic lives in the domain modules; `commands` is the only
//! layer that knows about the UI bridge, which keeps the logic unit-testable.

pub mod brain;
pub mod commands;
pub mod error;
pub mod generator;
pub mod imports;
pub mod integrations;
pub mod journal;
pub mod projector;
pub mod rules;
pub mod settings;
pub mod stats;
pub mod storage;
pub mod sync;

use std::sync::{Arc, Mutex};

use tauri::Manager;
use tauri::path::BaseDirectory;

pub use error::AppError;

/// Opens the data folder and starts the writer thread before the first window needs them.
fn prepare_state(app: &tauri::App) -> Result<commands::AppState, AppError> {
    let root = app.path().app_local_data_dir()?;
    let paths = storage::AppPaths::prepare(&root).map_err(AppError::Storage)?;
    let journal = journal::JournalService::start(&paths.journal).map_err(AppError::Storage)?;
    let settings = settings::load(&paths.settings_cache, &paths.journal)?;
    let content_dir = app
        .path()
        .resolve("content", BaseDirectory::Resource)
        .map_err(AppError::Tauri)?;
    Ok(commands::AppState {
        paths,
        journal,
        content: Arc::new(generator::ContentStore::new(content_dir)),
        settings: Arc::new(Mutex::new(settings)),
    })
}

/// Builds and runs the desktop application until its last window closes.
pub fn run() -> Result<(), AppError> {
    tauri::Builder::default()
        .setup(|app| {
            let state = prepare_state(app)?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::append_events,
            commands::session_summary,
            commands::generate_words,
            commands::pick_passage,
            commands::clean_text,
            commands::import_file,
            commands::list_imports,
            commands::load_import,
            commands::save_import_offset,
            commands::delete_import,
            commands::get_settings,
            commands::set_setting,
        ])
        .run(tauri::generate_context!())?;
    Ok(())
}
