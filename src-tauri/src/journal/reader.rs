//! Reads journal files. A reader tolerates damage: it never fails on a bad line.

use std::collections::HashSet;
use std::fs;
use std::path::Path;

use super::JournalError;
use super::event::{Event, EventBody};

/// What a read skipped, so that damage can be reported instead of hidden.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct ReadReport {
    pub events: usize,
    /// Lines that are not valid events, such as a line cut by a crash.
    pub bad_lines: usize,
    /// Events of a type this version does not know.
    pub unknown: usize,
    /// Repeats of a line already seen, left by a retried batch.
    pub duplicates: usize,
}

impl ReadReport {
    fn add(&mut self, other: ReadReport) {
        self.events += other.events;
        self.bad_lines += other.bad_lines;
        self.unknown += other.unknown;
        self.duplicates += other.duplicates;
    }
}

/// Remembers `(sid, seq)` across files, because a session can span two dates.
#[derive(Debug, Default)]
pub struct Deduper {
    seen: HashSet<(String, u64)>,
}

impl Deduper {
    fn is_new(&mut self, event: &Event) -> bool {
        match event.session_key() {
            Some((sid, seq)) => self.seen.insert((sid.to_owned(), seq)),
            None => true,
        }
    }
}

/// Calls `visit` for every valid, known, first-seen event in one file.
pub fn read_file(
    path: &Path,
    deduper: &mut Deduper,
    visit: &mut impl FnMut(Event),
) -> Result<ReadReport, JournalError> {
    let bytes = fs::read(path).map_err(|source| JournalError::Io {
        path: path.to_path_buf(),
        source,
    })?;
    let mut report = ReadReport::default();
    for line in bytes.split(|b| *b == b'\n') {
        if line.iter().all(u8::is_ascii_whitespace) {
            continue;
        }
        match serde_json::from_slice::<Event>(line) {
            Ok(event) if event.body == EventBody::Unknown => report.unknown += 1,
            Ok(event) if !deduper.is_new(&event) => report.duplicates += 1,
            Ok(event) => {
                report.events += 1;
                visit(event);
            }
            Err(_) => report.bad_lines += 1,
        }
    }
    Ok(report)
}

/// Reads every `.jsonl` file of one device in date order. A missing folder is an empty journal.
pub fn read_dir(dir: &Path, visit: &mut impl FnMut(Event)) -> Result<ReadReport, JournalError> {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(source) if source.kind() == std::io::ErrorKind::NotFound => {
            return Ok(ReadReport::default());
        }
        Err(source) => {
            return Err(JournalError::Io {
                path: dir.to_path_buf(),
                source,
            });
        }
    };
    let mut paths: Vec<_> = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "jsonl"))
        .collect();
    paths.sort();

    let mut deduper = Deduper::default();
    let mut report = ReadReport::default();
    for path in paths {
        report.add(read_file(&path, &mut deduper, visit)?);
    }
    Ok(report)
}
