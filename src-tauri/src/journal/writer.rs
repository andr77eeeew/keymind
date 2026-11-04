//! Appends events to `<dir>/<YYYY-MM-DD>.jsonl`.

use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

use time::Date;

use super::JournalError;
use super::event::{Event, EventBody};

/// Writes one device's journal. Files are opened in append mode only, so this code has no
/// way to change or truncate what is already on disk.
pub struct JournalWriter {
    dir: PathBuf,
    open: Option<(Date, File)>,
}

impl JournalWriter {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self {
            dir: dir.into(),
            open: None,
        }
    }

    /// Writes the events as one block and syncs them to disk. `date` picks the file.
    ///
    /// After an error the caller may send the same events again: a repeated line is dropped by
    /// the reader through `(sid, seq)`, and a torn line is closed before the next write.
    pub fn append(&mut self, date: Date, events: &[Event]) -> Result<(), JournalError> {
        if events.is_empty() {
            return Ok(());
        }
        if events.iter().any(|e| e.body == EventBody::Unknown) {
            return Err(JournalError::UnknownEvent);
        }
        let mut block = Vec::with_capacity(events.len() * 128);
        for event in events {
            serde_json::to_writer(&mut block, event)?;
            block.push(b'\n');
        }

        let path = self.dir.join(file_name(date));
        let result = self.write_block(date, &path, &block);
        if result.is_err() {
            // Reopen next time, which also repairs a line this write may have torn.
            self.open = None;
        }
        result.map_err(|source| JournalError::Io { path, source })
    }

    fn write_block(&mut self, date: Date, path: &Path, block: &[u8]) -> std::io::Result<()> {
        if !matches!(&self.open, Some((open_date, _)) if *open_date == date) {
            self.open = Some((date, open_for_append(&self.dir, path)?));
        }
        let Some((_, file)) = self.open.as_mut() else {
            return Ok(());
        };
        file.write_all(block)?;
        file.sync_data()
    }
}

pub fn file_name(date: Date) -> String {
    format!(
        "{:04}-{:02}-{:02}.jsonl",
        date.year(),
        u8::from(date.month()),
        date.day()
    )
}

fn open_for_append(dir: &Path, path: &Path) -> std::io::Result<File> {
    fs::create_dir_all(dir)?;
    let mut file = OpenOptions::new().create(true).append(true).open(path)?;
    if ends_mid_line(path)? {
        // A crash cut the last line. Finish it instead of editing it, so the damage stays one
        // bad line that readers skip, and the next event starts cleanly.
        file.write_all(b"\n")?;
    }
    Ok(file)
}

fn ends_mid_line(path: &Path) -> std::io::Result<bool> {
    let mut file = File::open(path)?;
    if file.seek(SeekFrom::End(0))? == 0 {
        return Ok(false);
    }
    file.seek(SeekFrom::End(-1))?;
    let mut last = [0u8; 1];
    file.read_exact(&mut last)?;
    Ok(last[0] != b'\n')
}
