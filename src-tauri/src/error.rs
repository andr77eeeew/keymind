//! Typed errors for the core.

use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Tauri runtime error: {0}")]
    Tauri(#[from] tauri::Error),
}
