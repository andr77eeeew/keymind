//! Which letters are open. They open by frequency, one at a time once every open letter keeps within
//! the bar, and any letter that already keeps within the bar opens at once. See ADR-0010.

use std::collections::{BTreeSet, HashMap};

use serde::Serialize;

use super::START_LETTERS;
use super::model::{Prior, Trace, estimate, pooled};

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Letters {
    /// Most frequent first.
    pub open: Vec<char>,
    /// The letter that opens next, once every open one keeps within the bar.
    pub next: Option<char>,
    /// Open now but not in any earlier session.
    pub new: Vec<char>,
    /// What an unknown key starts from: the pooled open keys.
    #[serde(skip)]
    pub prior: Prior,
}

/// Opens letters. `order` is every letter, most frequent first, and `opened` the letters of every
/// earlier adaptive session, so a letter never closes again, even when it is forgotten. With
/// `gradual` off every letter is open.
pub fn open_letters(
    order: &[char],
    opened: &BTreeSet<char>,
    keys: &HashMap<char, Trace>,
    today: i32,
    gradual: bool,
) -> Letters {
    let mut open: BTreeSet<char> = if gradual {
        order
            .iter()
            .take(START_LETTERS)
            .chain(opened.iter().filter(|c| order.contains(c)))
            .copied()
            .collect()
    } else {
        order.iter().copied().collect()
    };
    let prior_of = |open: &BTreeSet<char>| pooled(open.iter().filter_map(|c| keys.get(c)), today);
    let prior = prior_of(&open);
    let meets = |c: &char, prior: Prior| estimate(keys.get(c), prior, today).meets_bar();

    // What is already typed well opens now, whatever its place in the order.
    let ready: Vec<char> = order
        .iter()
        .filter(|c| !open.contains(c) && meets(c, prior))
        .copied()
        .collect();
    open.extend(ready);

    let prior = prior_of(&open);
    if open.iter().all(|c| meets(c, prior))
        && let Some(next) = order.iter().find(|c| !open.contains(c))
    {
        open.insert(*next);
    }

    let prior = prior_of(&open);
    Letters {
        open: order.iter().filter(|c| open.contains(c)).copied().collect(),
        next: order.iter().find(|c| !open.contains(c)).copied(),
        new: order
            .iter()
            .filter(|c| open.contains(c) && !opened.contains(c))
            .copied()
            .collect(),
        prior,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::brain::model::{Day, fold};

    const ORDER: [char; 10] = ['e', 't', 'a', 'o', 'i', 'n', 's', 'h', 'r', 'd'];

    fn trace(ms: f64, samples: i64) -> Trace {
        let us = (ms * 1000.0) as i64;
        fold(&[Day {
            day: 0,
            presses: samples,
            samples,
            sum_us: us * samples,
            sum_sq_us: us * us * samples,
            errors: 0,
        }])
        .unwrap()
    }

    fn keys(entries: &[(char, f64)]) -> HashMap<char, Trace> {
        entries.iter().map(|&(c, ms)| (c, trace(ms, 100))).collect()
    }

    #[test]
    fn a_beginner_starts_with_six_letters() {
        let letters = open_letters(&ORDER, &BTreeSet::new(), &HashMap::new(), 0, true);
        assert_eq!(letters.open, vec!['e', 't', 'a', 'o', 'i', 'n']);
        assert_eq!(letters.next, Some('s'));
        assert_eq!(letters.new.len(), 6);
    }

    #[test]
    fn the_next_letter_opens_once_every_open_one_meets_the_bar() {
        let slow = keys(&[
            ('e', 250.0),
            ('t', 250.0),
            ('a', 250.0),
            ('o', 250.0),
            ('i', 250.0),
            ('n', 500.0),
        ]);
        let letters = open_letters(&ORDER, &BTreeSet::new(), &slow, 0, true);
        assert_eq!(letters.open.len(), 6);

        let fast = keys(&[
            ('e', 250.0),
            ('t', 250.0),
            ('a', 250.0),
            ('o', 250.0),
            ('i', 250.0),
            ('n', 300.0),
        ]);
        let letters = open_letters(&ORDER, &BTreeSet::new(), &fast, 0, true);
        assert_eq!(letters.open, vec!['e', 't', 'a', 'o', 'i', 'n', 's']);
        assert_eq!(letters.next, Some('h'));
    }

    #[test]
    fn a_letter_already_typed_well_opens_out_of_order() {
        let known = keys(&[('n', 500.0), ('r', 250.0), ('d', 250.0)]);
        let letters = open_letters(&ORDER, &BTreeSet::new(), &known, 0, true);
        assert!(letters.open.contains(&'r') && letters.open.contains(&'d'));
        assert!(!letters.open.contains(&'s'));
        assert_eq!(letters.next, Some('s'));
    }

    #[test]
    fn letters_never_close_again() {
        let opened: BTreeSet<char> = ['s', 'h'].into_iter().collect();
        // Nothing typed for a year: every estimate has faded.
        let letters = open_letters(&ORDER, &opened, &keys(&[('s', 250.0)]), 365, true);
        assert!(letters.open.contains(&'s') && letters.open.contains(&'h'));
        assert!(letters.new.iter().all(|c| !opened.contains(c)));
    }

    #[test]
    fn with_gradual_opening_off_every_letter_is_open() {
        let letters = open_letters(&ORDER, &BTreeSet::new(), &HashMap::new(), 0, false);
        assert_eq!(letters.open, ORDER.to_vec());
        assert_eq!(letters.next, None);
    }
}
