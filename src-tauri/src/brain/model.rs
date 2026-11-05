//! The student model, v1: a Bayesian estimate per key and per transition, with forgetting. See
//! ADR-0010.
//!
//! The history of a key or transition folds into a [`Trace`], which the projector stores in
//! `model_state`. A trace does not depend on today: forgetting is a multiplication, so its sums are
//! kept as of the last day of practice and decayed to any later day when read.

use serde::Serialize;

use super::{BAR_ERRORS, BAR_MS};

/// Prior weight of the time estimate, in samples.
pub const PRIOR_SAMPLES: f64 = 5.0;
/// Prior weight of the error estimate, in presses.
pub const PRIOR_PRESSES: f64 = 20.0;
/// Stability of a key or transition that has just been met, in days.
pub const START_HALF_LIFE: f64 = 2.0;
pub const MIN_HALF_LIFE: f64 = 1.0;
pub const MAX_HALF_LIFE: f64 = 64.0;
/// A day with fewer samples says too little to change the stability.
pub const DAY_SAMPLES: i64 = 5;
/// Below this confidence a mastered key or transition is due for review.
pub const DUE_CONFIDENCE: f64 = 0.5;
/// The one-sided 80% quantile of the normal distribution, for pessimistic estimates.
const Z80: f64 = 0.8416;

/// One day of one key or transition, as `key_stats` and `bigram_stats` hold it.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Day {
    /// Days since some fixed date, so that a difference is a number of days.
    pub day: i32,
    pub presses: i64,
    pub samples: i64,
    pub sum_us: i64,
    pub sum_sq_us: i64,
    pub errors: i64,
}

impl Day {
    fn mean_ms(&self) -> f64 {
        self.sum_us as f64 / self.samples as f64 / 1000.0
    }

    fn error_rate(&self) -> f64 {
        if self.presses == 0 {
            0.0
        } else {
            self.errors as f64 / self.presses as f64
        }
    }

    /// A day of practice that kept within the bar.
    fn met_bar(&self) -> bool {
        self.mean_ms() <= BAR_MS && self.error_rate() <= BAR_ERRORS
    }
}

/// The folded history of one key or transition. Sums are weighted and decayed to `last_day`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Trace {
    pub half_life: f64,
    pub last_day: i32,
    pub samples: f64,
    pub sum_ms: f64,
    pub sum_sq_ms: f64,
    pub presses: f64,
    pub errors: f64,
    /// It kept within the bar on some day, so it is learned and can become due.
    pub mastered: bool,
    /// Samples without decay, for the screens.
    pub total_samples: i64,
}

/// Folds days in date order. `None` for no days.
pub fn fold(days: &[Day]) -> Option<Trace> {
    let mut trace: Option<Trace> = None;
    let mut practice_days = 0;
    for day in days {
        let t = trace.get_or_insert(Trace {
            half_life: START_HALF_LIFE,
            last_day: day.day,
            samples: 0.0,
            sum_ms: 0.0,
            sum_sq_ms: 0.0,
            presses: 0.0,
            errors: 0.0,
            mastered: false,
            total_samples: 0,
        });
        let keep = decay(t.half_life, day.day - t.last_day);
        t.samples = t.samples * keep + day.samples as f64;
        t.sum_ms = t.sum_ms * keep + day.sum_us as f64 / 1000.0;
        t.sum_sq_ms = t.sum_sq_ms * keep + day.sum_sq_us as f64 / 1_000_000.0;
        t.presses = t.presses * keep + day.presses as f64;
        t.errors = t.errors * keep + day.errors as f64;
        t.last_day = day.day.max(t.last_day);
        t.total_samples += day.samples;

        if day.samples >= DAY_SAMPLES {
            let met = day.met_bar();
            // The first day of practice only starts the clock.
            if practice_days > 0 {
                t.half_life = if met {
                    (t.half_life * 2.0).min(MAX_HALF_LIFE)
                } else {
                    (t.half_life / 2.0).max(MIN_HALF_LIFE)
                };
            }
            t.mastered |= met;
            practice_days += 1;
        }
    }
    trace
}

/// The weight left after `days` with stability `half_life`.
fn decay(half_life: f64, days: i32) -> f64 {
    if days <= 0 {
        1.0
    } else {
        (-f64::from(days) / half_life).exp2()
    }
}

/// What the estimate starts from before any data of its own.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Prior {
    pub ms: f64,
    pub error: f64,
}

impl Prior {
    /// A beginner at 20 WPM with errors at the bar, for someone with no data at all.
    pub const EMPTY: Prior = Prior {
        ms: 600.0,
        error: BAR_ERRORS,
    };
}

/// The estimate of a key or transition on a given day.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Estimate {
    pub ms: f64,
    /// The time it is 80% sure to be under. Wide when there is little data.
    pub ms_upper: f64,
    pub error: f64,
    pub error_upper: f64,
    /// `n / (n + 5)` for `n` samples after forgetting.
    pub confidence: f64,
    /// Samples after forgetting.
    pub samples: f64,
    pub total_samples: i64,
    pub mastered: bool,
}

impl Estimate {
    /// Kept within the bar, with enough recent data to say so.
    pub fn meets_bar(&self) -> bool {
        self.ms <= BAR_MS && self.error <= BAR_ERRORS && self.samples >= PRIOR_SAMPLES
    }

    /// Learned once, and not practised for long enough that the model is unsure again.
    pub fn due(&self) -> bool {
        self.mastered && self.confidence < DUE_CONFIDENCE
    }

    /// How far from the bar it is, pessimistically: 1 is at the bar, more is weaker.
    pub fn weakness(&self) -> f64 {
        (self.ms_upper / BAR_MS).max(self.error_upper / BAR_ERRORS)
    }
}

/// The estimate on `today` for a trace, or for no data at all.
pub fn estimate(trace: Option<&Trace>, prior: Prior, today: i32) -> Estimate {
    let (n, sum, sum_sq, presses, errors, mastered, total) = match trace {
        Some(t) => {
            let keep = decay(t.half_life, today - t.last_day);
            (
                t.samples * keep,
                t.sum_ms * keep,
                t.sum_sq_ms * keep,
                t.presses * keep,
                t.errors * keep,
                t.mastered,
                t.total_samples,
            )
        }
        None => (0.0, 0.0, 0.0, 0.0, 0.0, false, 0),
    };

    let weight = PRIOR_SAMPLES + n;
    let ms = (PRIOR_SAMPLES * prior.ms + sum) / weight;
    // The prior spread is half the prior time, a loose guess that data soon replaces.
    let prior_var = (prior.ms * 0.5).powi(2);
    let spread = if n > 0.0 {
        (sum_sq - sum * sum / n).max(0.0)
    } else {
        0.0
    };
    let var = (PRIOR_SAMPLES * prior_var + spread) / weight;
    let ms_upper = ms + Z80 * (var / weight).sqrt();

    let a = PRIOR_PRESSES * prior.error + errors;
    let b = PRIOR_PRESSES * (1.0 - prior.error) + (presses - errors).max(0.0);
    let error = a / (a + b);
    let error_upper = error + Z80 * (error * (1.0 - error) / (a + b + 1.0)).sqrt();

    Estimate {
        ms,
        ms_upper,
        error,
        error_upper,
        confidence: n / (n + PRIOR_SAMPLES),
        samples: n,
        total_samples: total,
        mastered,
    }
}

/// The pooled time and error rate of several traces on `today`, for the prior of a key.
pub fn pooled<'a>(traces: impl IntoIterator<Item = &'a Trace>, today: i32) -> Prior {
    let (mut n, mut sum, mut presses, mut errors) = (0.0, 0.0, 0.0, 0.0);
    for t in traces {
        let keep = decay(t.half_life, today - t.last_day);
        n += t.samples * keep;
        sum += t.sum_ms * keep;
        presses += t.presses * keep;
        errors += t.errors * keep;
    }
    Prior {
        ms: if n >= 1.0 { sum / n } else { Prior::EMPTY.ms },
        error: if presses >= 1.0 {
            errors / presses
        } else {
            Prior::EMPTY.error
        },
    }
}

/// `YYYY-MM-DD` as a day number. `None` for anything else.
pub fn day_number(date: &str) -> Option<i32> {
    let format = time::macros::format_description!("[year]-[month]-[day]");
    time::Date::parse(date, &format)
        .ok()
        .map(time::Date::to_julian_day)
}

/// The inverse of [`day_number`].
pub fn date_text(day: i32) -> Option<String> {
    let date = time::Date::from_julian_day(day).ok()?;
    Some(format!(
        "{:04}-{:02}-{:02}",
        date.year(),
        u8::from(date.month()),
        date.day()
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A day of `samples` presses at `ms` each, with `errors` wrong presses on top.
    fn day(d: i32, samples: i64, ms: f64, errors: i64) -> Day {
        let us = (ms * 1000.0) as i64;
        Day {
            day: d,
            presses: samples + errors,
            samples,
            sum_us: us * samples,
            sum_sq_us: us * us * samples,
            errors,
        }
    }

    const PRIOR: Prior = Prior {
        ms: 400.0,
        error: 0.05,
    };

    #[test]
    fn with_no_data_the_estimate_is_the_prior_and_wide() {
        let e = estimate(None, PRIOR, 0);
        assert_eq!(e.ms, 400.0);
        assert!(e.ms_upper > 440.0);
        assert!((e.error - 0.05).abs() < 1e-12);
        assert_eq!(e.confidence, 0.0);
        assert!(!e.meets_bar() && !e.due());
    }

    #[test]
    fn a_few_samples_move_the_estimate_part_of_the_way() {
        let trace = fold(&[day(10, 5, 200.0, 0)]).unwrap();
        let e = estimate(Some(&trace), PRIOR, 10);
        // Five prior samples at 400 and five at 200.
        assert!((e.ms - 300.0).abs() < 1e-9);
        assert!((e.confidence - 0.5).abs() < 1e-12);

        let many = fold(&[day(10, 200, 200.0, 0)]).unwrap();
        let e = estimate(Some(&many), PRIOR, 10);
        assert!(e.ms < 206.0);
        assert!(e.ms_upper - e.ms < 3.0);
        assert!(e.meets_bar());
    }

    #[test]
    fn errors_follow_a_beta_estimate() {
        let trace = fold(&[day(1, 80, 250.0, 20)]).unwrap();
        let e = estimate(Some(&trace), PRIOR, 1);
        // (20 * 0.05 + 20) / (20 + 100)
        assert!((e.error - 21.0 / 120.0).abs() < 1e-9);
        assert!(e.error_upper > e.error);
        assert!(!e.meets_bar());
    }

    #[test]
    fn forgetting_halves_the_weight_every_half_life() {
        let trace = fold(&[day(0, 40, 250.0, 0)]).unwrap();
        assert_eq!(trace.half_life, START_HALF_LIFE);
        let now = estimate(Some(&trace), PRIOR, 0);
        let later = estimate(Some(&trace), PRIOR, 2);
        assert!((now.samples - 40.0).abs() < 1e-9);
        assert!((later.samples - 20.0).abs() < 1e-9);
        // The estimate drifts back towards the prior.
        assert!(later.ms > now.ms && later.ms < PRIOR.ms);
    }

    #[test]
    fn stability_doubles_on_good_days_and_halves_on_bad_ones() {
        let good = |d| day(d, 20, 250.0, 0);
        let bad = |d| day(d, 20, 500.0, 0);
        let first = fold(&[good(0)]).unwrap();
        assert_eq!(first.half_life, 2.0);
        assert!(first.mastered);
        assert_eq!(fold(&[good(0), good(1)]).unwrap().half_life, 4.0);
        assert_eq!(fold(&[good(0), good(1), good(3)]).unwrap().half_life, 8.0);
        assert_eq!(fold(&[good(0), good(1), bad(2)]).unwrap().half_life, 2.0);
        assert_eq!(
            fold(&[bad(0), bad(1), bad(2), bad(3)]).unwrap().half_life,
            MIN_HALF_LIFE
        );
        let long: Vec<Day> = (0..20).map(good).collect();
        assert_eq!(fold(&long).unwrap().half_life, MAX_HALF_LIFE);
        // Never within the bar means never learned.
        assert!(!fold(&[bad(0), bad(1)]).unwrap().mastered);
    }

    #[test]
    fn a_day_with_few_samples_changes_the_sums_but_not_the_stability() {
        let trace = fold(&[day(0, 20, 250.0, 0), day(1, 3, 900.0, 0)]).unwrap();
        assert_eq!(trace.half_life, 2.0);
        assert_eq!(trace.total_samples, 23);
        assert_eq!(trace.last_day, 1);
    }

    #[test]
    fn a_mastered_key_becomes_due_when_its_confidence_falls() {
        let trace = fold(&[day(0, 20, 250.0, 0)]).unwrap();
        // 20 samples, half-life 2 days: confidence 0.8 now, 0.5 after 4 days.
        assert!(!estimate(Some(&trace), PRIOR, 0).due());
        assert!(!estimate(Some(&trace), PRIOR, 3).due());
        assert!(estimate(Some(&trace), PRIOR, 5).due());
        // Practice brings it back.
        let again = fold(&[day(0, 20, 250.0, 0), day(5, 20, 250.0, 0)]).unwrap();
        assert!(!estimate(Some(&again), PRIOR, 5).due());
        assert!(again.half_life > trace.half_life);
    }

    #[test]
    fn weakness_is_the_worse_of_speed_and_errors() {
        let slow = estimate(
            Some(&fold(&[day(0, 400, 2.0 * BAR_MS, 0)]).unwrap()),
            PRIOR,
            0,
        );
        assert!((slow.weakness() - 2.0).abs() < 0.05);
        let sloppy = estimate(Some(&fold(&[day(0, 300, 200.0, 100)]).unwrap()), PRIOR, 0);
        assert!(sloppy.weakness() > 4.0);
    }

    #[test]
    fn the_pooled_prior_weights_by_samples() {
        let a = fold(&[day(0, 10, 200.0, 0)]).unwrap();
        let b = fold(&[day(0, 30, 400.0, 10)]).unwrap();
        let prior = pooled([&a, &b], 0);
        assert!((prior.ms - 350.0).abs() < 1e-9);
        assert!((prior.error - 0.2).abs() < 1e-9);
        assert_eq!(pooled([], 0), Prior::EMPTY);
    }

    #[test]
    fn dates_turn_into_day_numbers_and_back() {
        let a = day_number("2026-11-05").unwrap();
        assert_eq!(day_number("2026-11-07").unwrap() - a, 2);
        assert_eq!(day_number("2026-12-01").unwrap() - a, 26);
        assert_eq!(date_text(a).unwrap(), "2026-11-05");
        assert!(day_number("yesterday").is_none());
    }
}
