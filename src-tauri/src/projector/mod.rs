//! Builds the derived SQLite tables from the journal files. See ADR-0008.
//!
//! The projector only ever reads files, so live data, a full rebuild and journals that arrive from
//! a sync all take one path. Each chunk commits its rows together with its file offset, so a crash
//! can neither lose an event nor count it twice.

mod apply;
pub mod layout;
pub mod queries;
pub mod schema;
pub mod service;

#[cfg(test)]
mod tests;

use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use rusqlite::{Connection, ErrorCode, OptionalExtension, TransactionBehavior, params};

use crate::journal::{JournalError, Line, parse_line, read_lines_from};
use apply::{Applier, Tally};

pub use service::{ProjectorService, ProjectorStatus};

/// About 6000 keystroke lines. A larger chunk holds the write lock longer and loses more work on a
/// crash, and a smaller one spends more time on commits.
const CHUNK_BYTES: usize = 1024 * 1024;

#[derive(Debug, thiserror::Error)]
pub enum ProjectorError {
    #[error("the statistics database failed: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error(transparent)]
    Journal(#[from] JournalError),
    #[error("the journal folder could not be read at {path}: {source}")]
    List { path: PathBuf, source: io::Error },
    #[error("the statistics database could not be replaced at {path}: {source}")]
    Remove { path: PathBuf, source: io::Error },
    #[error("a saved session state could not be read: {0}")]
    BadState(serde_json::Error),
    #[error("a journal file disappeared or became shorter")]
    JournalRewritten,
    #[error("the statistics are not ready yet")]
    NotReady,
    #[error("the statistics thread has stopped")]
    Stopped,
}

impl ProjectorError {
    /// The database itself is bad, and rebuilding it from the journal will fix that.
    pub fn is_damage(&self) -> bool {
        match self {
            Self::Sqlite(rusqlite::Error::SqliteFailure(failure, _)) => matches!(
                failure.code,
                ErrorCode::DatabaseCorrupt | ErrorCode::NotADatabase
            ),
            Self::BadState(_) => true,
            _ => false,
        }
    }

    /// Going on from the saved offsets cannot give a correct result.
    pub fn calls_for_rebuild(&self) -> bool {
        self.is_damage() || matches!(self, Self::JournalRewritten)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct JournalFile {
    device: String,
    file: String,
    path: PathBuf,
    length: u64,
}

/// Every `<device>/<date>.jsonl`, in a fixed order. A missing folder is an empty journal.
fn list_files(root: &Path) -> Result<Vec<JournalFile>, ProjectorError> {
    let failed = |path: &Path, source| ProjectorError::List {
        path: path.to_path_buf(),
        source,
    };
    let devices = match fs::read_dir(root) {
        Ok(devices) => devices,
        Err(cause) if cause.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(cause) => return Err(failed(root, cause)),
    };
    let mut files = Vec::new();
    for device in devices.filter_map(Result::ok) {
        let folder = device.path();
        let Some(device_name) = device.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        if !folder.is_dir() {
            continue;
        }
        for entry in fs::read_dir(&folder)
            .map_err(|cause| failed(&folder, cause))?
            .filter_map(Result::ok)
        {
            let path = entry.path();
            let Some(file) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            if path
                .extension()
                .is_none_or(|extension| extension != "jsonl")
            {
                continue;
            }
            let length = entry
                .metadata()
                .map_err(|cause| failed(&path, cause))?
                .len();
            files.push(JournalFile {
                device: device_name.clone(),
                file,
                path,
                length,
            });
        }
    }
    // Dates sort as text, so a session spanning two files is read from its start.
    files.sort_by(|a, b| (&a.device, &a.file).cmp(&(&b.device, &b.file)));
    Ok(files)
}

/// Progress of one catch-up, in bytes of journal.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Progress {
    pub done: u64,
    pub total: u64,
}

/// Owns the writing connection. All of this is plain logic, with no thread and no Tauri.
pub struct Projector {
    connection: Connection,
    journal_root: PathBuf,
    chunk_bytes: usize,
}

impl Projector {
    /// Returns the projector and whether the database is new.
    pub fn open(
        database: &Path,
        journal_root: &Path,
        force_new: bool,
    ) -> Result<(Self, bool), ProjectorError> {
        let (connection, created) = schema::open_writer(database, force_new)?;
        Ok((
            Self {
                connection,
                journal_root: journal_root.to_path_buf(),
                chunk_bytes: CHUNK_BYTES,
            },
            created,
        ))
    }

    /// A small value makes tests commit after every line.
    #[cfg(test)]
    fn with_chunk_bytes(mut self, chunk_bytes: usize) -> Self {
        self.chunk_bytes = chunk_bytes;
        self
    }

    #[cfg(test)]
    fn connection(&self) -> &Connection {
        &self.connection
    }

    /// Journal bytes not yet projected. Fails if a known file has gone or shrunk: the journal is
    /// append-only, so that means someone replaced it and the old offsets mean nothing.
    fn pending(&self) -> Result<(Vec<JournalFile>, u64), ProjectorError> {
        let files = list_files(&self.journal_root)?;
        let mut known: HashMap<(String, String), i64> = HashMap::new();
        {
            let mut statement = self
                .connection
                .prepare_cached("SELECT device, file, bytes FROM projected_files")?;
            let rows =
                statement.query_map([], |row| Ok(((row.get(0)?, row.get(1)?), row.get(2)?)))?;
            for row in rows {
                let (key, bytes) = row?;
                known.insert(key, bytes);
            }
        }

        let mut pending = 0u64;
        for file in &files {
            let key = (file.device.clone(), file.file.clone());
            let done = known.remove(&key).unwrap_or(0).max(0).cast_unsigned();
            if file.length < done {
                return Err(ProjectorError::JournalRewritten);
            }
            pending += file.length - done;
        }
        if !known.is_empty() {
            return Err(ProjectorError::JournalRewritten);
        }
        Ok((files, pending))
    }

    /// Whether a call to `catch_up` would have anything to do.
    pub fn has_work(&self) -> Result<bool, ProjectorError> {
        Ok(self.pending()?.1 > 0)
    }

    /// Projects everything new and calls `progress` after each chunk.
    pub fn catch_up(&mut self, progress: &mut impl FnMut(Progress)) -> Result<(), ProjectorError> {
        let (files, total) = self.pending()?;
        let mut done = 0;
        for file in &files {
            loop {
                let read = self.project_chunk(file)?;
                if read == 0 {
                    break;
                }
                done += read;
                progress(Progress {
                    done,
                    total: total.max(done),
                });
            }
        }
        Ok(())
    }

    /// One transaction: the offset is read inside it, so even a second copy of the app running at
    /// the same moment could not apply a line twice. Returns the bytes consumed.
    fn project_chunk(&mut self, file: &JournalFile) -> Result<u64, ProjectorError> {
        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let offset: i64 = transaction
            .prepare_cached("SELECT bytes FROM projected_files WHERE device = ?1 AND file = ?2")?
            .query_row(params![file.device, file.file], |row| row.get(0))
            .optional()?
            .unwrap_or(0);
        let offset = offset.max(0).cast_unsigned();
        let chunk = read_lines_from(&file.path, offset, self.chunk_bytes)?;
        if chunk.bytes.is_empty() {
            return Ok(0);
        }

        let mut applier = Applier::new(&transaction, &file.device);
        let mut tally = Tally::default();
        for line in chunk.bytes.split(|byte| *byte == b'\n') {
            match parse_line(line) {
                Line::Blank => {}
                Line::Unknown => tally.unknown += 1,
                Line::Bad => tally.bad_lines += 1,
                Line::Event(event) => applier.apply(&event)?,
            }
        }
        let applied = applier.flush()?;
        transaction
            .prepare_cached(
                "INSERT INTO projected_files
                     (device, file, bytes, events, bad_lines, unknown, duplicates, orphans)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                 ON CONFLICT (device, file) DO UPDATE SET
                     bytes = excluded.bytes,
                     events = events + excluded.events,
                     bad_lines = bad_lines + excluded.bad_lines,
                     unknown = unknown + excluded.unknown,
                     duplicates = duplicates + excluded.duplicates,
                     orphans = orphans + excluded.orphans",
            )?
            .execute(params![
                file.device,
                file.file,
                i64::try_from(chunk.next_offset).unwrap_or(i64::MAX),
                applied.events,
                tally.bad_lines,
                tally.unknown,
                applied.duplicates,
                applied.orphans,
            ])?;
        transaction.commit()?;
        Ok(chunk.next_offset - offset)
    }
}
