//! Journal event schema, version 1. See ADR-0003.
//!
//! Readers ignore unknown fields and unknown event types, so a journal written by a newer
//! version still loads in an older one, and the other way round.

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const SCHEMA_VERSION: u32 = 1;

/// One line of a journal file.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Event {
    pub v: u32,
    #[serde(flatten)]
    pub body: EventBody,
}

impl Event {
    pub fn new(body: EventBody) -> Self {
        Self {
            v: SCHEMA_VERSION,
            body,
        }
    }

    /// The identity used to drop a repeated line, for events that belong to a session.
    pub fn session_key(&self) -> Option<(&str, u64)> {
        match &self.body {
            EventBody::SessionStarted(e) => Some((&e.sid, e.seq)),
            EventBody::Keystroke(e) => Some((&e.sid, e.seq)),
            EventBody::SessionPaused(e) | EventBody::SessionResumed(e) => Some((&e.sid, e.seq)),
            EventBody::SessionEnded(e) => Some((&e.sid, e.seq)),
            EventBody::SettingsChanged(_) | EventBody::Unknown => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum EventBody {
    SessionStarted(SessionStarted),
    Keystroke(Keystroke),
    SessionPaused(SessionMark),
    SessionResumed(SessionMark),
    SessionEnded(SessionEnded),
    SettingsChanged(SettingsChanged),
    /// A type this version does not know. Read and skipped, never written.
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SessionStarted {
    pub sid: String,
    pub seq: u64,
    /// Local wall-clock time with its offset, so streaks can use the local date later.
    pub ts: String,
    pub mode: String,
    pub layout: String,
    pub source: TextSource,
    /// Snapshot of the settings. Kept as plain JSON so that later changes to the settings
    /// type can never make an old line unreadable.
    pub settings: Value,
    pub app: String,
}

/// Where the text of a session came from, enough to repeat it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TextSource {
    Words {
        seed: u32,
        pool: u32,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        count: Option<u32>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        seconds: Option<u32>,
    },
    Passage {
        id: String,
    },
    Paste {
        chars: u64,
    },
    Import {
        id: String,
        offset: u64,
    },
    Zen,
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum KeyKind {
    Char,
    Backspace,
    Modifier,
}

/// Why a press did not count as typing. Such a press is kept as data but moves nothing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Ignored {
    /// A non-English layout was active.
    Layout,
    /// A policy blocked it, such as Backspace when corrections are off.
    Policy,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Keystroke {
    pub sid: String,
    pub seq: u64,
    /// Milliseconds since the first press of the session, from `event.timeStamp`.
    pub t: f64,
    pub kind: KeyKind,
    /// `event.code`, the physical key.
    pub code: String,
    /// The typed character. Absent for Backspace and modifiers.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
    /// The character the text asked for. Absent in Zen, where nothing is expected.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expected: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub correct: Option<bool>,
    /// Position in the text.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pos: Option<u64>,
    /// Physical modifier keys held during the press.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub mods: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ignored: Option<Ignored>,
}

/// A pause or a resume. `t` uses the same clock as keystrokes.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SessionMark {
    pub sid: String,
    pub seq: u64,
    pub t: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SessionEnded {
    pub sid: String,
    pub seq: u64,
    pub t: f64,
    /// `completed` or `aborted`.
    pub reason: String,
    /// Milliseconds of active typing, without pauses.
    pub duration: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SettingsChanged {
    /// UTC time in RFC 3339, so the latest change wins when journals are replayed.
    pub ts: String,
    pub key: String,
    pub old: Value,
    pub new: Value,
}
