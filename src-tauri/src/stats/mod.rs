//! Session metrics. See ADR-0005 for the formulas.
//!
//! The accumulator takes events one at a time and keeps a fixed amount of state, so it costs the
//! same on a live session and on a replayed journal. The projector uses the same code, so a summary
//! and the statistics screen can never disagree.

use serde::{Deserialize, Serialize};

use crate::journal::event::{Ignored, KeyKind, Keystroke};
use crate::journal::{Event, EventBody};

/// A longer gap is a break, not typing, so it stays out of rhythm and of key times.
pub const GAP_LIMIT_MS: f64 = 2000.0;
/// Below this many intervals an evenness figure means nothing.
const RHYTHM_MIN_INTERVALS: u64 = 2;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SessionSummary {
    pub sid: String,
    pub reason: Option<String>,
    /// Active typing from the first to the last press, without pauses.
    pub duration_ms: f64,
    /// All character presses that counted.
    pub chars: u64,
    /// Correct character presses. In Zen every press counts, because nothing is expected.
    pub correct: u64,
    pub backspaces: u64,
    pub cpm: f64,
    pub wpm: f64,
    /// Percent. `None` in Zen.
    pub accuracy: Option<f64>,
    /// Percent, 100 is perfectly even. `None` when there are too few intervals.
    pub rhythm: Option<f64>,
}

/// Serializable, so the projector can stop in the middle of a session and go on later.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct SessionStats {
    sid: String,
    reason: Option<String>,
    last_seq: Option<u64>,
    first_t: Option<f64>,
    last_t: f64,
    /// Pause time that lies before `last_t`. A pause after the last press changes nothing.
    paused_before_last: f64,
    paused_total: f64,
    pause_started: Option<f64>,
    chars: u64,
    correct: u64,
    judged: u64,
    judged_correct: u64,
    backspaces: u64,
    previous_char_t: Option<f64>,
    interval_count: u64,
    interval_mean: f64,
    /// Sum of squared differences from the mean (Welford's running variance).
    interval_m2: f64,
}

impl SessionStats {
    pub fn new(sid: impl Into<String>) -> Self {
        Self {
            sid: sid.into(),
            ..Self::default()
        }
    }

    /// Feeds one event. A repeated or older `seq`, left by a retried batch, is ignored.
    pub fn push(&mut self, event: &Event) {
        let Some((_, seq)) = event.session_key() else {
            return;
        };
        if self.last_seq.is_some_and(|last| seq <= last) {
            return;
        }
        self.last_seq = Some(seq);

        match &event.body {
            EventBody::Keystroke(key) => self.push_key(key),
            EventBody::SessionPaused(mark) => {
                self.pause_started = Some(mark.t);
                self.previous_char_t = None;
            }
            EventBody::SessionResumed(mark) => {
                if let Some(start) = self.pause_started.take() {
                    self.paused_total += (mark.t - start).max(0.0);
                }
                self.previous_char_t = None;
            }
            EventBody::SessionEnded(end) => self.reason = Some(end.reason.clone()),
            _ => {}
        }
    }

    fn push_key(&mut self, key: &Keystroke) {
        if matches!(key.ignored, Some(Ignored::Layout | Ignored::Policy)) {
            return;
        }
        match key.kind {
            KeyKind::Modifier => {}
            KeyKind::Backspace => {
                self.mark_press(key.t);
                self.backspaces += 1;
                // The time around a correction says nothing about rhythm.
                self.previous_char_t = None;
            }
            KeyKind::Char => {
                self.mark_press(key.t);
                self.chars += 1;
                if key.correct != Some(false) {
                    self.correct += 1;
                }
                if let Some(correct) = key.correct {
                    self.judged += 1;
                    self.judged_correct += u64::from(correct);
                }
                if let Some(previous) = self.previous_char_t {
                    self.push_interval(key.t - previous);
                }
                self.previous_char_t = Some(key.t);
            }
        }
    }

    fn mark_press(&mut self, t: f64) {
        self.first_t.get_or_insert(t);
        self.last_t = t;
        self.paused_before_last = self.paused_total;
    }

    fn push_interval(&mut self, interval: f64) {
        if interval > GAP_LIMIT_MS {
            return;
        }
        self.interval_count += 1;
        let delta = interval - self.interval_mean;
        self.interval_mean += delta / self.interval_count as f64;
        self.interval_m2 += delta * (interval - self.interval_mean);
    }

    /// Presses judged against a text, and how many of those were correct. Daily accuracy is built
    /// from these, because an average of session percentages would be wrong.
    pub fn judged(&self) -> (u64, u64) {
        (self.judged, self.judged_correct)
    }

    pub fn summary(&self) -> SessionSummary {
        let duration_ms = match self.first_t {
            Some(first) => (self.last_t - first - self.paused_before_last).max(0.0),
            None => 0.0,
        };
        let cpm = if duration_ms > 0.0 {
            self.correct as f64 / (duration_ms / 60_000.0)
        } else {
            0.0
        };
        SessionSummary {
            sid: self.sid.clone(),
            reason: self.reason.clone(),
            duration_ms,
            chars: self.chars,
            correct: self.correct,
            backspaces: self.backspaces,
            cpm,
            wpm: cpm / 5.0,
            accuracy: (self.judged > 0)
                .then(|| 100.0 * self.judged_correct as f64 / self.judged as f64),
            rhythm: self.rhythm(),
        }
    }

    fn rhythm(&self) -> Option<f64> {
        if self.interval_count < RHYTHM_MIN_INTERVALS || self.interval_mean <= 0.0 {
            return None;
        }
        let deviation = (self.interval_m2 / self.interval_count as f64).sqrt();
        let variation = deviation / self.interval_mean;
        Some(100.0 * (1.0 - variation.min(1.0)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::journal::event::{SessionEnded, SessionMark};

    fn key(seq: u64, t: f64, kind: KeyKind, correct: Option<bool>) -> Event {
        Event::new(EventBody::Keystroke(Keystroke {
            sid: "s".to_owned(),
            seq,
            t,
            kind,
            code: "KeyA".to_owned(),
            key: None,
            expected: None,
            correct,
            pos: None,
            mods: Vec::new(),
            ignored: None,
        }))
    }

    fn char_key(seq: u64, t: f64, correct: bool) -> Event {
        key(seq, t, KeyKind::Char, Some(correct))
    }

    fn mark(seq: u64, t: f64) -> SessionMark {
        SessionMark {
            sid: "s".to_owned(),
            seq,
            t,
        }
    }

    fn run(events: &[Event]) -> SessionSummary {
        let mut stats = SessionStats::new("s");
        for event in events {
            stats.push(event);
        }
        stats.summary()
    }

    #[test]
    fn speed_counts_correct_presses_per_minute() {
        // 60 correct presses over exactly one minute.
        let events: Vec<_> = (0..=60)
            .map(|i| char_key(i + 1, i as f64 * 1000.0, i != 0))
            .collect();
        let summary = run(&events);
        assert_eq!(summary.duration_ms, 60_000.0);
        assert_eq!(summary.correct, 60);
        assert_eq!(summary.cpm, 60.0);
        assert_eq!(summary.wpm, 12.0);
    }

    #[test]
    fn a_corrected_error_stays_in_the_accuracy_denominator() {
        let summary = run(&[
            char_key(1, 0.0, true),
            char_key(2, 100.0, false),
            key(3, 200.0, KeyKind::Backspace, None),
            char_key(4, 300.0, true),
        ]);
        assert_eq!(summary.chars, 3);
        assert_eq!(summary.backspaces, 1);
        let accuracy = summary.accuracy.unwrap();
        assert!((accuracy - 200.0 / 3.0).abs() < 1e-9);
    }

    #[test]
    fn perfectly_even_typing_scores_100() {
        let events: Vec<_> = (0..10)
            .map(|i| char_key(i + 1, i as f64 * 150.0, true))
            .collect();
        assert_eq!(run(&events).rhythm, Some(100.0));
    }

    #[test]
    fn uneven_typing_scores_by_the_coefficient_of_variation() {
        // Intervals 100, 300: mean 200, deviation 100, variation 0.5.
        let summary = run(&[
            char_key(1, 0.0, true),
            char_key(2, 100.0, true),
            char_key(3, 400.0, true),
        ]);
        assert!((summary.rhythm.unwrap() - 50.0).abs() < 1e-9);
    }

    #[test]
    fn very_uneven_typing_floors_at_zero() {
        // Intervals 1, 1, 1, 1, 1900: variation is above 1.
        let summary = run(&[
            char_key(1, 0.0, true),
            char_key(2, 1.0, true),
            char_key(3, 2.0, true),
            char_key(4, 3.0, true),
            char_key(5, 4.0, true),
            char_key(6, 1904.0, true),
        ]);
        assert_eq!(summary.rhythm, Some(0.0));
    }

    #[test]
    fn a_long_gap_stays_out_of_rhythm_but_inside_duration() {
        let summary = run(&[
            char_key(1, 0.0, true),
            char_key(2, 100.0, true),
            char_key(3, 200.0, true),
            char_key(4, 5200.0, true),
        ]);
        assert_eq!(summary.rhythm, Some(100.0));
        assert_eq!(summary.duration_ms, 5200.0);
    }

    #[test]
    fn too_few_intervals_give_no_rhythm() {
        let summary = run(&[char_key(1, 0.0, true), char_key(2, 100.0, true)]);
        assert_eq!(summary.rhythm, None);
    }

    #[test]
    fn a_pause_leaves_duration_and_rhythm() {
        let summary = run(&[
            char_key(1, 0.0, true),
            char_key(2, 100.0, true),
            char_key(3, 200.0, true),
            Event::new(EventBody::SessionPaused(mark(4, 250.0))),
            Event::new(EventBody::SessionResumed(mark(5, 10_250.0))),
            char_key(6, 10_300.0, true),
            char_key(7, 10_400.0, true),
        ]);
        assert_eq!(summary.duration_ms, 400.0);
        assert_eq!(summary.rhythm, Some(100.0));
    }

    #[test]
    fn a_pause_after_the_last_press_changes_nothing() {
        let summary = run(&[
            char_key(1, 0.0, true),
            char_key(2, 100.0, true),
            Event::new(EventBody::SessionPaused(mark(3, 200.0))),
            Event::new(EventBody::SessionResumed(mark(4, 9000.0))),
            Event::new(EventBody::SessionPaused(mark(5, 9100.0))),
        ]);
        assert_eq!(summary.duration_ms, 100.0);
    }

    #[test]
    fn zen_counts_every_press_and_has_no_accuracy() {
        let summary = run(&[
            key(1, 0.0, KeyKind::Char, None),
            key(2, 30_000.0, KeyKind::Char, None),
        ]);
        assert_eq!(summary.correct, 2);
        assert_eq!(summary.cpm, 4.0);
        assert_eq!(summary.accuracy, None);
    }

    #[test]
    fn modifiers_and_ignored_presses_do_not_count() {
        let mut ignored = char_key(3, 150.0, false);
        if let EventBody::Keystroke(k) = &mut ignored.body {
            k.ignored = Some(Ignored::Layout);
        }
        let summary = run(&[
            char_key(1, 0.0, true),
            key(2, 50.0, KeyKind::Modifier, None),
            ignored,
            char_key(4, 200.0, true),
        ]);
        assert_eq!(summary.chars, 2);
        assert_eq!(summary.accuracy, Some(100.0));
        assert_eq!(summary.duration_ms, 200.0);
    }

    #[test]
    fn a_repeated_batch_is_counted_once() {
        let batch = [char_key(1, 0.0, true), char_key(2, 100.0, true)];
        let summary = run(&[
            batch[0].clone(),
            batch[1].clone(),
            batch[0].clone(),
            batch[1].clone(),
        ]);
        assert_eq!(summary.chars, 2);
    }

    #[test]
    fn an_empty_session_has_zeroes_and_no_ratios() {
        let summary = run(&[]);
        assert_eq!(summary.duration_ms, 0.0);
        assert_eq!(summary.wpm, 0.0);
        assert_eq!(summary.accuracy, None);
        assert_eq!(summary.rhythm, None);
    }

    #[test]
    fn the_reason_comes_from_session_ended() {
        let summary = run(&[Event::new(EventBody::SessionEnded(SessionEnded {
            sid: "s".to_owned(),
            seq: 1,
            t: 0.0,
            reason: "aborted".to_owned(),
            duration: 0.0,
        }))]);
        assert_eq!(summary.reason.as_deref(), Some("aborted"));
    }

    #[test]
    fn a_saved_state_goes_on_exactly_where_it_stopped() {
        // Intervals that have no exact binary form, so a lossy save would change the result.
        let events: Vec<_> = (0u32..50)
            .map(|i| char_key(u64::from(i) + 1, f64::from(i) * 152.3 + 0.1, i % 7 != 0))
            .collect();
        let whole = run(&events);

        for split in 0..events.len() {
            let mut stats = SessionStats::new("s");
            for event in &events[..split] {
                stats.push(event);
            }
            let saved = serde_json::to_string(&stats).unwrap();
            let mut restored: SessionStats = serde_json::from_str(&saved).unwrap();
            assert_eq!(restored, stats);
            for event in &events[split..] {
                restored.push(event);
            }
            assert_eq!(restored.summary(), whole);
        }
    }

    #[test]
    fn golden_journal_gives_the_expected_summary() {
        let mut stats = SessionStats::new("s1");
        for line in include_str!("../../testdata/journal_v1.jsonl").lines() {
            if let Ok(event) = serde_json::from_str::<Event>(line) {
                stats.push(&event);
            }
        }
        let summary = stats.summary();
        // Presses at 0, 200 and 5500, backspace at 310, pause of 5000 between them.
        assert_eq!(summary.chars, 3);
        assert_eq!(summary.correct, 2);
        assert_eq!(summary.backspaces, 1);
        assert_eq!(summary.duration_ms, 500.0);
        assert_eq!(summary.reason.as_deref(), Some("completed"));
    }
}
