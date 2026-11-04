//! Append-only event journal, the single source of truth. See ADR-0001 and ADR-0003.

pub mod event;
pub mod reader;
pub mod writer;

use std::path::PathBuf;

pub use event::{Event, EventBody};
pub use reader::{ReadReport, read_dir};
pub use writer::JournalWriter;

#[derive(Debug, thiserror::Error)]
pub enum JournalError {
    #[error("journal I/O failed at {path}: {source}")]
    Io {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("could not encode a journal event: {0}")]
    Encode(#[from] serde_json::Error),
    #[error("refusing to write an event of an unknown type")]
    UnknownEvent,
}

#[cfg(test)]
mod tests;
