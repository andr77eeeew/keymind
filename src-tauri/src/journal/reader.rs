//! Reads journal files. A reader tolerates damage: it never fails on a bad line.

use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
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

/// What one line of a journal turned out to be.
///
/// A `Line` is unpacked right where it is read and never stored, so its size costs nothing, while a
/// `Box` would add an allocation per line to a rebuild.
#[allow(clippy::large_enum_variant)]
#[derive(Debug, Clone, PartialEq)]
pub enum Line {
    Blank,
    Event(Event),
    /// A valid event of a type this version does not know.
    Unknown,
    /// Not a valid event, such as a line cut by a crash.
    Bad,
}

/// The one place that decides what a line means, shared by every reader.
pub fn parse_line(line: &[u8]) -> Line {
    if line.iter().all(u8::is_ascii_whitespace) {
        return Line::Blank;
    }
    match serde_json::from_slice::<Event>(line) {
        Ok(event) if event.body == EventBody::Unknown => Line::Unknown,
        Ok(event) => Line::Event(event),
        Err(_) => Line::Bad,
    }
}

/// Complete lines read from the middle of a file.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct LineChunk {
    /// Whole lines, each ending in a line feed. Empty when no complete line follows the offset.
    pub bytes: Vec<u8>,
    /// Where the next read should start.
    pub next_offset: u64,
}

/// Reads about `max_bytes` of complete lines from `offset`. An unfinished last line is left for a
/// later read, so a file can be read safely while the writer is appending to it. A single line
/// longer than `max_bytes` still comes back whole.
pub fn read_lines_from(
    path: &Path,
    offset: u64,
    max_bytes: usize,
) -> Result<LineChunk, JournalError> {
    let failed = |source| JournalError::Io {
        path: path.to_path_buf(),
        source,
    };
    let mut file = File::open(path).map_err(failed)?;
    file.seek(SeekFrom::Start(offset)).map_err(failed)?;

    let mut bytes = Vec::new();
    let mut limit = max_bytes.max(1);
    loop {
        let wanted = (limit - bytes.len()) as u64;
        let read = file
            .by_ref()
            .take(wanted)
            .read_to_end(&mut bytes)
            .map_err(failed)? as u64;
        if let Some(end) = bytes.iter().rposition(|byte| *byte == b'\n') {
            bytes.truncate(end + 1);
            let next_offset = offset + bytes.len() as u64;
            return Ok(LineChunk { bytes, next_offset });
        }
        if read < wanted {
            return Ok(LineChunk {
                bytes: Vec::new(),
                next_offset: offset,
            });
        }
        limit *= 2;
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
        match parse_line(line) {
            Line::Blank => {}
            Line::Unknown => report.unknown += 1,
            Line::Bad => report.bad_lines += 1,
            Line::Event(event) if !deduper.is_new(&event) => report.duplicates += 1,
            Line::Event(event) => {
                report.events += 1;
                visit(event);
            }
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

#[cfg(test)]
mod tests {
    use super::*;

    fn chunk(contents: &[u8], offset: u64, max_bytes: usize) -> LineChunk {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("day.jsonl");
        fs::write(&path, contents).unwrap();
        read_lines_from(&path, offset, max_bytes).unwrap()
    }

    #[test]
    fn a_chunk_stops_at_the_last_complete_line() {
        let read = chunk(b"one\ntwo\nthr", 0, 100);
        assert_eq!(read.bytes, b"one\ntwo\n");
        assert_eq!(read.next_offset, 8);
    }

    #[test]
    fn a_chunk_starts_at_the_offset_and_respects_the_limit() {
        let read = chunk(b"one\ntwo\nthree\n", 4, 5);
        assert_eq!(read.bytes, b"two\n");
        assert_eq!(read.next_offset, 8);
    }

    #[test]
    fn a_torn_tail_alone_gives_nothing_and_keeps_the_offset() {
        let read = chunk(b"one\ntw", 4, 100);
        assert!(read.bytes.is_empty());
        assert_eq!(read.next_offset, 4);
    }

    #[test]
    fn a_line_longer_than_the_limit_still_comes_back_whole() {
        let read = chunk(b"a long line\nnext\n", 0, 3);
        assert_eq!(read.bytes, b"a long line\n");
        assert_eq!(read.next_offset, 12);
    }

    #[test]
    fn the_end_of_the_file_gives_nothing() {
        let read = chunk(b"one\n", 4, 100);
        assert!(read.bytes.is_empty());
        assert_eq!(read.next_offset, 4);
    }

    #[test]
    fn lines_are_classified() {
        assert_eq!(parse_line(b"  "), Line::Blank);
        assert_eq!(parse_line(br#"{"v":1,"type":"future"}"#), Line::Unknown);
        assert_eq!(parse_line(br#"{"v":1,"type":"keystr"#), Line::Bad);
    }
}
