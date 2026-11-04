//! The writer thread. Disk work happens here, never on the input path.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::mpsc;
use std::thread;

use time::OffsetDateTime;

use super::{Event, EventBody, JournalError, JournalWriter};
use crate::stats::{SessionStats, SessionSummary};

enum Request {
    Append {
        events: Vec<Event>,
        reply: mpsc::Sender<Result<(), JournalError>>,
    },
    Summary {
        sid: String,
        reply: mpsc::Sender<Option<SessionSummary>>,
    },
}

/// A handle to the writer thread. Requests run strictly in the order they were sent, so a summary
/// requested after a batch always sees that batch.
#[derive(Clone)]
pub struct JournalService {
    sender: mpsc::Sender<Request>,
}

#[derive(Debug, thiserror::Error)]
pub enum ServiceError {
    #[error(transparent)]
    Journal(#[from] JournalError),
    #[error("the journal writer has stopped")]
    Stopped,
}

impl JournalService {
    pub fn start(dir: impl Into<PathBuf>) -> std::io::Result<Self> {
        let (sender, receiver) = mpsc::channel();
        let mut writer = JournalWriter::new(dir);
        thread::Builder::new()
            .name("journal-writer".to_owned())
            .spawn(move || run(&mut writer, &receiver))?;
        Ok(Self { sender })
    }

    /// Blocks until the events are on disk or the write has failed.
    pub fn append(&self, events: Vec<Event>) -> Result<(), ServiceError> {
        let (reply, answer) = mpsc::channel();
        self.sender
            .send(Request::Append { events, reply })
            .map_err(|_| ServiceError::Stopped)?;
        answer.recv().map_err(|_| ServiceError::Stopped)??;
        Ok(())
    }

    /// Returns the metrics of a session and forgets it. `None` if no event of it was written.
    pub fn take_summary(&self, sid: String) -> Result<Option<SessionSummary>, ServiceError> {
        let (reply, answer) = mpsc::channel();
        self.sender
            .send(Request::Summary { sid, reply })
            .map_err(|_| ServiceError::Stopped)?;
        answer.recv().map_err(|_| ServiceError::Stopped)
    }
}

fn run(writer: &mut JournalWriter, receiver: &mpsc::Receiver<Request>) {
    let mut sessions: HashMap<String, SessionStats> = HashMap::new();
    while let Ok(request) = receiver.recv() {
        match request {
            Request::Append { events, reply } => {
                let result = writer.append(OffsetDateTime::now_utc().date(), &events);
                if result.is_ok() {
                    track(&mut sessions, &events);
                }
                // The caller may have gone away during shutdown, and that is fine.
                let _ = reply.send(result);
            }
            Request::Summary { sid, reply } => {
                let summary = sessions.remove(&sid).map(|stats| stats.summary());
                let _ = reply.send(summary);
            }
        }
    }
}

fn track(sessions: &mut HashMap<String, SessionStats>, events: &[Event]) {
    for event in events {
        if matches!(event.body, EventBody::SettingsChanged(_)) {
            continue;
        }
        if let Some((sid, _)) = event.session_key() {
            sessions
                .entry(sid.to_owned())
                .or_insert_with(|| SessionStats::new(sid))
                .push(event);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::event::{KeyKind, Keystroke, SessionEnded};
    use super::*;
    use crate::journal::read_dir;

    fn key(seq: u64, t: f64) -> Event {
        Event::new(EventBody::Keystroke(Keystroke {
            sid: "s".to_owned(),
            seq,
            t,
            kind: KeyKind::Char,
            code: "KeyA".to_owned(),
            key: Some("a".to_owned()),
            expected: Some("a".to_owned()),
            correct: Some(true),
            pos: Some(seq),
            mods: Vec::new(),
            ignored: None,
        }))
    }

    #[test]
    fn events_reach_the_disk_and_the_summary_in_order() {
        let dir = tempfile::tempdir().unwrap();
        let service = JournalService::start(dir.path()).unwrap();

        service.append(vec![key(1, 0.0), key(2, 100.0)]).unwrap();
        service
            .append(vec![Event::new(EventBody::SessionEnded(SessionEnded {
                sid: "s".to_owned(),
                seq: 3,
                t: 100.0,
                reason: "completed".to_owned(),
                duration: 100.0,
            }))])
            .unwrap();

        let summary = service.take_summary("s".to_owned()).unwrap().unwrap();
        assert_eq!(summary.chars, 2);
        assert_eq!(summary.reason.as_deref(), Some("completed"));

        let mut count = 0;
        read_dir(dir.path(), &mut |_| count += 1).unwrap();
        assert_eq!(count, 3);
    }

    #[test]
    fn a_summary_is_given_once() {
        let dir = tempfile::tempdir().unwrap();
        let service = JournalService::start(dir.path()).unwrap();
        service.append(vec![key(1, 0.0)]).unwrap();
        assert!(service.take_summary("s".to_owned()).unwrap().is_some());
        assert!(service.take_summary("s".to_owned()).unwrap().is_none());
    }

    #[test]
    fn a_failed_write_reports_an_error_and_a_retry_succeeds() {
        let dir = tempfile::tempdir().unwrap();
        // A file where the journal folder should be makes the write fail.
        let blocked = dir.path().join("device");
        std::fs::write(&blocked, b"not a folder").unwrap();
        let service = JournalService::start(&blocked).unwrap();

        assert!(service.append(vec![key(1, 0.0)]).is_err());
        assert!(service.take_summary("s".to_owned()).unwrap().is_none());

        std::fs::remove_file(&blocked).unwrap();
        service.append(vec![key(1, 0.0)]).unwrap();
        let summary = service.take_summary("s".to_owned()).unwrap().unwrap();
        assert_eq!(summary.chars, 1);
    }
}
