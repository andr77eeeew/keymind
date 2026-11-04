//! Keymind core. Pure logic lives in the domain modules; `commands` is the only
//! layer that knows about the UI bridge, which keeps the logic unit-testable.

pub mod brain;
pub mod commands;
pub mod error;
pub mod generator;
pub mod integrations;
pub mod journal;
pub mod projector;
pub mod rules;
pub mod sync;

pub use error::AppError;

/// Builds and runs the desktop application until its last window closes.
pub fn run() -> Result<(), AppError> {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![commands::app_info])
        .run(tauri::generate_context!())?;
    Ok(())
}
