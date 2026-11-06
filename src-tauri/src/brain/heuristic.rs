//! The cold-start heuristic: the weakest open key goes in focus, and what is due comes back for
//! review. It is also the fallback of the ML brain at stage 8. See ADR-0010.

use std::collections::{BTreeSet, HashMap};

use serde::Serialize;

use super::model::{Estimate, PRIOR_SAMPLES, Prior, Trace, date_text, estimate};
use super::unlock::{Letters, open_letters};
use super::{BAR_ERRORS, BAR_MS};
use crate::journal::event::Recipe;

/// The generator's rules for recipes of this version. See ADR-0011.
pub const RECIPE_VERSION: u32 = 1;
pub const BRAIN: &str = "heuristic";
/// At most this many letters and transitions come back for review in one session.
const REVIEW_LIMIT: usize = 3;
/// Transitions into the focus key that the summary follows.
const TARGET_PAIRS: usize = 3;

/// What the brain knows, read from `model_state`.
#[derive(Debug, Default, Clone)]
pub struct Knowledge {
    pub keys: HashMap<char, Trace>,
    pub pairs: HashMap<(char, char), Trace>,
    /// Letters of every earlier adaptive session.
    pub opened: BTreeSet<char>,
}

/// Why the focus key was chosen, for the "why" line.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Reason {
    /// Too few samples to know it yet. A new letter starts here.
    New,
    Slow,
    Errors,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Target {
    /// A letter or two letters.
    pub gram: String,
    pub estimate: Estimate,
    /// The last day it was practised, `YYYY-MM-DD`, or nothing when it never was.
    pub last_date: Option<String>,
}

/// The heuristic's choice for the next session.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Choice {
    pub letters: Letters,
    pub focus: char,
    pub reason: Reason,
    /// The focus key first, then the slowest transitions into it.
    pub targets: Vec<Target>,
    pub review: Vec<Target>,
    /// Every open letter, in the order it opened, for how close each is to the bar.
    pub open_keys: Vec<Target>,
    /// Typing speed of the open keys, for the length of the session.
    pub chars_per_minute: f64,
}

impl Choice {
    /// The recipe for the journal, once the generator has decided the number of words.
    pub fn recipe(&self, words: u32) -> Recipe {
        Recipe {
            v: RECIPE_VERSION,
            brain: BRAIN.to_owned(),
            letters: self.letters.open.iter().collect(),
            focus: self.focus.to_string(),
            review: self.review.iter().map(|t| t.gram.clone()).collect(),
            words,
            targets: self.targets.iter().map(|t| t.gram.clone()).collect(),
            before: self
                .targets
                .iter()
                .filter(|t| t.estimate.samples >= PRIOR_SAMPLES)
                .map(|t| (t.gram.clone(), (t.estimate.ms * 10.0).round() / 10.0))
                .collect(),
        }
    }
}

/// Chooses the next session. `order` is every letter, most frequent first.
pub fn choose(order: &[char], knowledge: &Knowledge, today: i32, gradual: bool) -> Choice {
    let letters = open_letters(order, &knowledge.opened, &knowledge.keys, today, gradual);
    let prior = letters.prior;
    let key = |c: char| estimate(knowledge.keys.get(&c), prior, today);
    let pair = |a: char, b: char| {
        let into = key(b);
        let prior = Prior {
            ms: into.ms,
            error: into.error,
        };
        estimate(knowledge.pairs.get(&(a, b)), prior, today)
    };
    let last = |trace: Option<&Trace>| trace.and_then(|t| date_text(t.last_day));
    let key_target = |c: char| Target {
        gram: c.to_string(),
        estimate: key(c),
        last_date: last(knowledge.keys.get(&c)),
    };
    let pair_target = |a: char, b: char| Target {
        gram: format!("{a}{b}"),
        estimate: pair(a, b),
        last_date: last(knowledge.pairs.get(&(a, b))),
    };

    // The weakest open key. On a tie the more frequent letter wins, as it comes first.
    let mut focus = letters.open.first().copied().unwrap_or('e');
    let mut focus_estimate = key(focus);
    for &c in &letters.open {
        let e = key(c);
        if e.weakness() > focus_estimate.weakness() {
            focus = c;
            focus_estimate = e;
        }
    }
    let reason = if focus_estimate.samples < PRIOR_SAMPLES {
        Reason::New
    } else if focus_estimate.ms_upper / BAR_MS >= focus_estimate.error_upper / BAR_ERRORS {
        Reason::Slow
    } else {
        Reason::Errors
    };

    let mut into: Vec<Target> = letters
        .open
        .iter()
        .filter(|&&a| knowledge.pairs.contains_key(&(a, focus)))
        .map(|&a| pair_target(a, focus))
        .collect();
    into.sort_by(|a, b| b.estimate.ms.total_cmp(&a.estimate.ms));
    into.truncate(TARGET_PAIRS);
    let mut targets = vec![key_target(focus)];
    targets.extend(into);

    let mut review: Vec<Target> = Vec::new();
    for &c in letters.open.iter().filter(|&&c| c != focus) {
        let target = key_target(c);
        if target.estimate.due() {
            review.push(target);
        }
    }
    for &(a, b) in knowledge.pairs.keys() {
        if letters.open.contains(&a) && letters.open.contains(&b) && b != focus {
            let target = pair_target(a, b);
            if target.estimate.due() {
                review.push(target);
            }
        }
    }
    // Least sure first; the name breaks ties, because map order is not fixed.
    review.sort_by(|a, b| {
        a.estimate
            .confidence
            .total_cmp(&b.estimate.confidence)
            .then_with(|| a.gram.cmp(&b.gram))
    });
    review.truncate(REVIEW_LIMIT);

    let open_keys = letters.open.iter().map(|&c| key_target(c)).collect();
    Choice {
        chars_per_minute: 60_000.0 / prior.ms,
        open_keys,
        letters,
        focus,
        reason,
        targets,
        review,
    }
}

/// The letters of every recipe, for [`Knowledge::opened`].
pub fn opened_letters<'a>(recipes: impl IntoIterator<Item = &'a str>) -> BTreeSet<char> {
    recipes
        .into_iter()
        .flat_map(str::chars)
        .filter(char::is_ascii_lowercase)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::brain::model::{Day, fold};

    const ORDER: [char; 8] = ['e', 't', 'a', 'o', 'i', 'n', 's', 'h'];

    fn trace(day: i32, ms: f64, samples: i64, errors: i64) -> Trace {
        let us = (ms * 1000.0) as i64;
        fold(&[Day {
            day,
            presses: samples + errors,
            samples,
            sum_us: us * samples,
            sum_sq_us: us * us * samples,
            errors,
        }])
        .unwrap()
    }

    fn knowledge(keys: &[(char, f64, i64)]) -> Knowledge {
        Knowledge {
            keys: keys
                .iter()
                .map(|&(c, ms, errors)| (c, trace(0, ms, 200, errors)))
                .collect(),
            ..Knowledge::default()
        }
    }

    #[test]
    fn the_slowest_open_key_is_in_focus() {
        let k = knowledge(&[
            ('e', 250.0, 0),
            ('t', 260.0, 0),
            ('a', 450.0, 0),
            ('o', 300.0, 0),
            ('i', 280.0, 0),
            ('n', 270.0, 0),
        ]);
        let choice = choose(&ORDER, &k, 0, true);
        assert_eq!(choice.focus, 'a');
        assert_eq!(choice.reason, Reason::Slow);
        assert_eq!(choice.targets[0].gram, "a");
    }

    #[test]
    fn errors_can_put_a_fast_key_in_focus() {
        let k = knowledge(&[
            ('e', 250.0, 0),
            ('t', 200.0, 60),
            ('a', 300.0, 0),
            ('o', 300.0, 0),
            ('i', 300.0, 0),
            ('n', 300.0, 0),
        ]);
        let choice = choose(&ORDER, &k, 0, true);
        assert_eq!(choice.focus, 't');
        assert_eq!(choice.reason, Reason::Errors);
    }

    #[test]
    fn a_newly_opened_letter_takes_the_focus() {
        // Every open letter is at the bar, so `s` opens with no data of its own.
        let k = knowledge(&[
            ('e', 250.0, 2),
            ('t', 260.0, 2),
            ('a', 330.0, 2),
            ('o', 300.0, 2),
            ('i', 280.0, 2),
            ('n', 270.0, 2),
        ]);
        let choice = choose(&ORDER, &k, 0, true);
        assert_eq!(choice.letters.new, ORDER.to_vec()[..7].to_vec());
        assert_eq!(choice.focus, 's');
        assert_eq!(choice.reason, Reason::New);
    }

    #[test]
    fn a_beginner_gets_the_first_letter_and_a_slow_length() {
        let choice = choose(&ORDER, &Knowledge::default(), 0, true);
        assert_eq!(choice.focus, 'e');
        assert_eq!(choice.reason, Reason::New);
        assert!((choice.chars_per_minute - 100.0).abs() < 1e-9);
        assert!(choice.review.is_empty());
    }

    #[test]
    fn what_was_learned_and_faded_comes_back_for_review() {
        let mut k = knowledge(&[]);
        for c in ['e', 't', 'a', 'o', 'i'] {
            k.keys.insert(c, trace(30, 250.0, 200, 0));
        }
        k.keys.insert('n', trace(30, 450.0, 200, 0));
        // Learned 30 days ago, then never typed again.
        for pair in [('t', 'e'), ('t', 'a'), ('a', 't'), ('e', 'a'), ('i', 'n')] {
            k.pairs.insert(pair, trace(0, 250.0, 20, 0));
        }
        let choice = choose(&ORDER, &k, 30, true);
        assert_eq!(choice.focus, 'n');
        let grams: Vec<&str> = choice.review.iter().map(|t| t.gram.as_str()).collect();
        // `in` goes into the focus key, so it is trained anyway.
        assert_eq!(grams, vec!["at", "ea", "ta"]);
    }

    #[test]
    fn the_recipe_keeps_the_estimates_at_the_start() {
        let mut k = knowledge(&[('e', 450.0, 0), ('t', 250.0, 0)]);
        k.pairs.insert(('t', 'e'), trace(0, 520.0, 50, 0));
        k.pairs.insert(('a', 'e'), trace(0, 480.0, 50, 0));
        // Two samples: a target, but too little to know, so it has no value at the start.
        k.pairs.insert(('i', 'e'), trace(0, 300.0, 2, 0));
        let choice = choose(&ORDER, &k, 0, true);
        assert_eq!(choice.focus, 'e');
        let recipe = choice.recipe(40);
        assert_eq!(recipe.letters, "etaoin");
        assert_eq!(recipe.focus, "e");
        assert_eq!(recipe.words, 40);
        // The slowest transition into the focus comes first.
        assert_eq!(recipe.targets, vec!["e", "te", "ae", "ie"]);
        assert_eq!(recipe.target_grams(), recipe.targets);
        assert_eq!(
            recipe.before.keys().collect::<Vec<_>>(),
            vec!["ae", "e", "te"]
        );
    }

    #[test]
    fn every_open_letter_comes_with_its_estimate_and_last_day() {
        let k = knowledge(&[('e', 250.0, 0), ('t', 400.0, 0)]);
        let choice = choose(&ORDER, &k, 3, true);
        let grams: String = choice.open_keys.iter().map(|t| t.gram.as_str()).collect();
        assert_eq!(grams, "etaoin");
        assert_eq!(
            choice.open_keys[0].last_date.as_deref(),
            date_text(0).as_deref()
        );
        assert!(choice.open_keys[0].estimate.mastered);
        assert!(!choice.open_keys[1].estimate.mastered);
        assert_eq!(choice.open_keys[2].last_date, None);
    }

    #[test]
    fn opened_letters_collects_every_recipe() {
        let opened = opened_letters(["etaoin", "etaoins", "etaoinsh"]);
        assert_eq!(opened.len(), 8);
    }
}
