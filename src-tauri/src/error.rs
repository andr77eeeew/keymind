//! Typed errors for the core.

use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Tauri runtime error: {0}")]
    Tauri(#[from] tauri::Error),
    #[error("could not open the local data folder: {0}")]
    Storage(std::io::Error),
    #[error(transparent)]
    Settings(#[from] crate::settings::SettingsError),
}
