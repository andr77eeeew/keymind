//! Turns journal events into table rows. Everything a later chunk needs is saved with this chunk,
//! so the projector can stop after any line and go on later with the same result.
//!
//! Key and transition times are integer microseconds. Floating-point sums depend on the order of
//! the additions, so with them a catch-up in several steps would not match a rebuild in one.

use std::collections::{BTreeMap, HashMap, HashSet};

use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;

use super::ProjectorError;
use super::layout::key_for_char;
use crate::brain::{letter_of, letter_of_code};
use crate::journal::event::{Ignored, KeyKind, Keystroke, SessionStarted, TextSource};
use crate::journal::{Event, EventBody};
use crate::stats::{GAP_LIMIT_MS, SessionStats};

/// The last counted press of a session, needed to time the next one.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
struct PreviousPress {
    t: f64,
    /// The character the text asked for, or the typed one in Zen.
    character: Option<String>,
    pos: Option<u64>,
    correct: bool,
}

/// What an unfinished session needs to go on. Stored as JSON in `session_state`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
struct Checkpoint {
    stats: SessionStats,
    date: String,
    layout: String,
    previous: Option<PreviousPress>,
    /// The targets of an adaptive session, counted the same way as the daily tables. Older
    /// checkpoints have none.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    targets: BTreeMap<String, Counters>,
    /// The keys of a starting test by code, for its own map. `None` in every other mode.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    keys: Option<BTreeMap<String, Counters>>,
}

struct Slot {
    last_seq: u64,
    /// `None` for a session that ended in an earlier chunk.
    checkpoint: Option<Checkpoint>,
    closed: bool,
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
struct Counters {
    presses: i64,
    samples: i64,
    sum_us: i64,
    sum_sq_us: i64,
    errors: i64,
}

impl Counters {
    fn add(&mut self, interval_us: Option<i64>, error: bool) {
        self.presses += 1;
        self.errors += i64::from(error);
        if let Some(us) = interval_us {
            self.samples += 1;
            self.sum_us += us;
            self.sum_sq_us += us * us;
        }
    }
}

/// What happened to the lines of one chunk, kept per file so damage can be reported.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct Tally {
    pub events: i64,
    pub bad_lines: i64,
    pub unknown: i64,
    pub duplicates: i64,
    /// Events of a session whose start was lost, or that came after its end.
    pub orphans: i64,
}

/// SQLite integers are signed. A sequence number that large only comes from a damaged line.
fn int(value: u64) -> i64 {
    i64::try_from(value).unwrap_or(i64::MAX)
}

/// Collects one chunk in memory and writes it in `flush`, inside the caller's transaction.
pub struct Applier<'a> {
    connection: &'a Connection,
    device: &'a str,
    sessions: HashMap<String, Slot>,
    touched: HashSet<String>,
    keys: HashMap<(String, String, String), Counters>,
    bigrams: HashMap<(String, String, String, String), Counters>,
    pub tally: Tally,
}

impl<'a> Applier<'a> {
    pub fn new(connection: &'a Connection, device: &'a str) -> Self {
        Self {
            connection,
            device,
            sessions: HashMap::new(),
            touched: HashSet::new(),
            keys: HashMap::new(),
            bigrams: HashMap::new(),
            tally: Tally::default(),
        }
    }

    pub fn apply(&mut self, event: &Event) -> Result<(), ProjectorError> {
        self.tally.events += 1;
        let Some((sid, seq)) = event.session_key() else {
            // Settings changes have their own reader and add nothing to the statistics.
            return Ok(());
        };
        self.load(sid)?;

        let Some(slot) = self.sessions.get_mut(sid) else {
            match &event.body {
                EventBody::SessionStarted(start) => self.begin(start, event)?,
                _ => self.tally.orphans += 1,
            }
            return Ok(());
        };
        if seq <= slot.last_seq {
            self.tally.duplicates += 1;
            return Ok(());
        }
        let Some(checkpoint) = slot.checkpoint.as_mut().filter(|_| !slot.closed) else {
            self.tally.orphans += 1;
            return Ok(());
        };

        slot.last_seq = seq;
        checkpoint.stats.push(event);
        match &event.body {
            EventBody::Keystroke(key) => {
                push_key(checkpoint, key, &mut self.keys, &mut self.bigrams);
            }
            EventBody::SessionPaused(_) | EventBody::SessionResumed(_) => {
                checkpoint.previous = None;
            }
            EventBody::SessionEnded(_) => slot.closed = true,
            _ => {}
        }
        if !self.touched.contains(sid) {
            self.touched.insert(sid.to_owned());
        }
        Ok(())
    }

    fn load(&mut self, sid: &str) -> Result<(), ProjectorError> {
        if self.sessions.contains_key(sid) {
            return Ok(());
        }
        let row: Option<(i64, Option<String>)> = self
            .connection
            .prepare_cached("SELECT last_seq, state FROM session_state WHERE sid = ?1")?
            .query_row([sid], |row| Ok((row.get(0)?, row.get(1)?)))
            .optional()?;
        if let Some((last_seq, state)) = row {
            let checkpoint = state
                .map(|json| serde_json::from_str::<Checkpoint>(&json))
                .transpose()
                .map_err(ProjectorError::BadState)?;
            self.sessions.insert(
                sid.to_owned(),
                Slot {
                    last_seq: last_seq.max(0).cast_unsigned(),
                    closed: checkpoint.is_none(),
                    checkpoint,
                },
            );
        }
        Ok(())
    }

    /// A start line with an unreadable time counts as lost, so its session is dropped as a whole.
    fn begin(&mut self, start: &SessionStarted, event: &Event) -> Result<(), ProjectorError> {
        let Some((date, started_ms)) = parse_start(&start.ts) else {
            self.tally.orphans += 1;
            return Ok(());
        };
        let source = serde_json::to_string(&start.source).map_err(ProjectorError::BadState)?;
        self.connection
            .prepare_cached(
                "INSERT INTO sessions (sid, device, ts, started_ms, date, mode, layout, source,
                     duration_ms, chars, correct, judged, judged_correct, backspaces, cpm, wpm)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, 0, 0, 0, 0, 0, 0, 0)",
            )?
            .execute(params![
                start.sid,
                self.device,
                start.ts,
                started_ms,
                date,
                start.mode,
                start.layout,
                source,
            ])?;
        let mut targets = BTreeMap::new();
        if let TextSource::Adaptive { recipe, .. } = &start.source {
            let mut insert = self.connection.prepare_cached(
                "INSERT INTO session_targets (sid, gram, before_ms, presses, samples, sum_us, errors)
                 VALUES (?1, ?2, ?3, 0, 0, 0, 0)",
            )?;
            for gram in recipe.target_grams() {
                insert.execute(params![start.sid, gram, recipe.before.get(&gram)])?;
                targets.insert(gram, Counters::default());
            }
        }
        let keys = matches!(start.source, TextSource::Test { .. }).then(BTreeMap::new);
        let mut stats = SessionStats::new(&start.sid);
        stats.push(event);
        self.sessions.insert(
            start.sid.clone(),
            Slot {
                last_seq: start.seq,
                checkpoint: Some(Checkpoint {
                    stats,
                    date,
                    layout: start.layout.clone(),
                    previous: None,
                    targets,
                    keys,
                }),
                closed: false,
            },
        );
        self.touched.insert(start.sid.clone());
        Ok(())
    }

    /// Writes the chunk. The caller commits it together with the new file offset.
    pub fn flush(self) -> Result<Tally, ProjectorError> {
        let mut update = self.connection.prepare_cached(
            "UPDATE sessions SET reason = ?2, duration_ms = ?3, chars = ?4, correct = ?5,
                 judged = ?6, judged_correct = ?7, backspaces = ?8, cpm = ?9, wpm = ?10,
                 accuracy = ?11, rhythm = ?12
             WHERE sid = ?1",
        )?;
        let mut target = self.connection.prepare_cached(
            "UPDATE session_targets SET presses = ?3, samples = ?4, sum_us = ?5, errors = ?6
             WHERE sid = ?1 AND gram = ?2",
        )?;
        let mut key = self.connection.prepare_cached(
            "INSERT INTO session_keys (sid, layout, code, presses, samples, sum_us, errors)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT (sid, layout, code) DO UPDATE SET
                 presses = excluded.presses,
                 samples = excluded.samples,
                 sum_us = excluded.sum_us,
                 errors = excluded.errors",
        )?;
        let mut save = self.connection.prepare_cached(
            "INSERT INTO session_state (sid, last_seq, state) VALUES (?1, ?2, ?3)
             ON CONFLICT (sid) DO UPDATE SET last_seq = excluded.last_seq, state = excluded.state",
        )?;
        for sid in &self.touched {
            let Some(slot) = self.sessions.get(sid) else {
                continue;
            };
            let Some(checkpoint) = &slot.checkpoint else {
                continue;
            };
            let summary = checkpoint.stats.summary();
            let (judged, judged_correct) = checkpoint.stats.judged();
            update.execute(params![
                sid,
                summary.reason,
                summary.duration_ms,
                int(summary.chars),
                int(summary.correct),
                int(judged),
                int(judged_correct),
                int(summary.backspaces),
                summary.cpm,
                summary.wpm,
                summary.accuracy,
                summary.rhythm,
            ])?;
            // A finished session keeps only its last sequence number, which still catches a
            // repeated batch.
            let state = if slot.closed {
                None
            } else {
                Some(serde_json::to_string(checkpoint).map_err(ProjectorError::BadState)?)
            };
            for (gram, c) in &checkpoint.targets {
                target.execute(params![sid, gram, c.presses, c.samples, c.sum_us, c.errors])?;
            }
            for (code, c) in checkpoint.keys.iter().flatten() {
                key.execute(params![
                    sid,
                    checkpoint.layout,
                    code,
                    c.presses,
                    c.samples,
                    c.sum_us,
                    c.errors
                ])?;
            }
            save.execute(params![sid, int(slot.last_seq), state])?;
        }

        let mut add_key = self.connection.prepare_cached(
            "INSERT INTO key_stats (date, layout, code, presses, samples, sum_us, sum_sq_us, errors)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT (date, layout, code) DO UPDATE SET
                 presses = presses + excluded.presses,
                 samples = samples + excluded.samples,
                 sum_us = sum_us + excluded.sum_us,
                 sum_sq_us = sum_sq_us + excluded.sum_sq_us,
                 errors = errors + excluded.errors",
        )?;
        for ((date, layout, code), c) in &self.keys {
            add_key.execute(params![
                date,
                layout,
                code,
                c.presses,
                c.samples,
                c.sum_us,
                c.sum_sq_us,
                c.errors,
            ])?;
        }

        let mut add_bigram = self.connection.prepare_cached(
            "INSERT INTO bigram_stats
                 (date, layout, first, second, presses, samples, sum_us, sum_sq_us, errors)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT (date, layout, first, second) DO UPDATE SET
                 presses = presses + excluded.presses,
                 samples = samples + excluded.samples,
                 sum_us = sum_us + excluded.sum_us,
                 sum_sq_us = sum_sq_us + excluded.sum_sq_us,
                 errors = errors + excluded.errors",
        )?;
        for ((date, layout, first, second), c) in &self.bigrams {
            add_bigram.execute(params![
                date,
                layout,
                first,
                second,
                c.presses,
                c.samples,
                c.sum_us,
                c.sum_sq_us,
                c.errors,
            ])?;
        }
        Ok(self.tally)
    }
}

/// The local date as written, because a session belongs to the day the user saw on the clock, and
/// the instant, which orders sessions across time zones.
fn parse_start(ts: &str) -> Option<(String, i64)> {
    let parsed = OffsetDateTime::parse(ts, &Rfc3339).ok()?;
    let date = format!(
        "{:04}-{:02}-{:02}",
        parsed.year(),
        u8::from(parsed.month()),
        parsed.day()
    );
    let started_ms = parsed.unix_timestamp() * 1000 + i64::from(parsed.millisecond());
    Some((date, started_ms))
}

/// The definitions from ADR-0008, in one place.
fn push_key(
    checkpoint: &mut Checkpoint,
    key: &Keystroke,
    keys: &mut HashMap<(String, String, String), Counters>,
    bigrams: &mut HashMap<(String, String, String, String), Counters>,
) {
    if matches!(key.ignored, Some(Ignored::Layout | Ignored::Policy)) {
        return;
    }
    match key.kind {
        KeyKind::Modifier => {}
        KeyKind::Backspace => checkpoint.previous = None,
        KeyKind::Char => {
            let correct = key.correct != Some(false);
            let character = key.expected.as_ref().or(key.key.as_ref()).cloned();
            let previous = checkpoint.previous.as_ref();
            let interval_us = if correct {
                previous.and_then(|before| timed_interval(before, key.t))
            } else {
                None
            };
            let date = &checkpoint.date;
            let layout = &checkpoint.layout;

            // A correct press is on the key the journal saw. A wrong one is blamed on the key that
            // should have been pressed, because that is the key the user does not yet know.
            let code = if correct {
                Some(key.code.as_str())
            } else {
                key.expected
                    .as_deref()
                    .and_then(|expected| key_for_char(layout, expected))
            };
            if let Some(code) = code {
                keys.entry((date.clone(), layout.clone(), code.to_owned()))
                    .or_default()
                    .add(interval_us, !correct);
                if let Some(counters) = letter_of_code(code)
                    .and_then(|letter| checkpoint.targets.get_mut(letter.to_string().as_str()))
                {
                    counters.add(interval_us, !correct);
                }
                if let Some(own) = checkpoint.keys.as_mut() {
                    own.entry(code.to_owned())
                        .or_default()
                        .add(interval_us, !correct);
                }
            }

            if let (Some(before), Some(second)) = (previous, character.as_ref())
                && before.correct
                && let Some(first) = &before.character
                && before.pos.is_some()
                && before.pos.map(|pos| pos + 1) == key.pos
            {
                bigrams
                    .entry((date.clone(), layout.clone(), first.clone(), second.clone()))
                    .or_default()
                    .add(interval_us, !correct);
                if let (Some(a), Some(b)) = (letter_of(first), letter_of(second))
                    && let Some(counters) = checkpoint.targets.get_mut(format!("{a}{b}").as_str())
                {
                    counters.add(interval_us, !correct);
                }
            }

            checkpoint.previous = Some(PreviousPress {
                t: key.t,
                character,
                pos: key.pos,
                correct,
            });
        }
    }
}

/// `None` after an error, because that time is spent noticing it, and over the gap limit, because
/// that is a break. A negative interval can only come from a damaged line.
fn timed_interval(previous: &PreviousPress, t: f64) -> Option<i64> {
    let interval = t - previous.t;
    if !previous.correct || !(0.0..=GAP_LIMIT_MS).contains(&interval) {
        return None;
    }
    Some((interval * 1000.0).round() as i64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_date_is_the_local_one_as_written() {
        // Already the next day in UTC, still the 5th on the user's clock.
        let (date, ms) = parse_start("2026-11-05T23:30:00-02:00").unwrap();
        assert_eq!(date, "2026-11-05");
        let (utc_date, utc_ms) = parse_start("2026-11-06T01:30:00Z").unwrap();
        assert_eq!(utc_date, "2026-11-06");
        assert_eq!(ms, utc_ms);
    }

    #[test]
    fn a_broken_time_is_not_a_date() {
        assert_eq!(parse_start("yesterday"), None);
    }

    #[test]
    fn counters_keep_integer_squares() {
        let mut counters = Counters::default();
        counters.add(Some(150_000), false);
        counters.add(None, true);
        assert_eq!(
            counters,
            Counters {
                presses: 2,
                samples: 1,
                sum_us: 150_000,
                sum_sq_us: 22_500_000_000,
                errors: 1,
            }
        );
    }

    #[test]
    fn the_gap_limit_is_inclusive() {
        let previous = PreviousPress {
            t: 0.0,
            character: None,
            pos: None,
            correct: true,
        };
        assert_eq!(timed_interval(&previous, 2000.0), Some(2_000_000));
        assert_eq!(timed_interval(&previous, 2000.1), None);
        assert_eq!(timed_interval(&previous, -1.0), None);
    }

    #[test]
    fn time_after_an_error_is_not_counted() {
        let previous = PreviousPress {
            t: 0.0,
            character: None,
            pos: None,
            correct: false,
        };
        assert_eq!(timed_interval(&previous, 100.0), None);
    }
}
