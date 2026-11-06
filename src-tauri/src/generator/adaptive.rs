//! The text of an adaptive session, from the brain's recipe. See ADR-0011.
//!
//! The text is never journaled. The seed, the recipe and the content version give it again, so
//! every rule here is part of recipe version 1: a change of rules needs a new version that keeps
//! the old rules for old recipes.

use std::collections::HashSet;

use rand_chacha::ChaCha8Rng;
use rand_chacha::rand_core::SeedableRng;

use super::below;
use super::markov::Chain;

/// Real words come from this many most frequent ones.
pub const POOL: usize = 5000;
/// With fewer real words than this, pseudowords fill the choice up to it.
pub const MIN_CHOICE: usize = 100;
pub const FOCUS_SHARE: f64 = 0.6;
pub const REVIEW_SHARE: f64 = 0.25;
/// The session is about this long at the current speed.
pub const MINUTES: f64 = 3.0;
pub const MIN_WORDS: u32 = 30;
pub const MAX_WORDS: u32 = 150;
const PSEUDO_LETTERS: (usize, usize) = (3, 8);
const PSEUDO_TRIES: usize = 4000;

/// Separate random streams, so that one step drawing more never shifts another.
const PSEUDO_STREAM: u64 = 1;
const ORDER_STREAM: u64 = 2;

fn rng(seed: u32, stream: u64) -> ChaCha8Rng {
    ChaCha8Rng::seed_from_u64(u64::from(seed) | (stream << 32))
}

/// The words a session draws from: frequent real words made only of open letters, filled up with
/// pseudowords while those are few.
pub fn choice(words: &[String], chain: &Chain, letters: &[char], seed: u32) -> Vec<String> {
    let mut seen: HashSet<&str> = HashSet::new();
    let mut out: Vec<String> = Vec::new();
    for word in words.iter().take(POOL) {
        if !word.is_empty()
            && word.chars().all(|c| letters.contains(&c))
            && seen.insert(word.as_str())
        {
            out.push(word.clone());
        }
    }
    if out.len() < MIN_CHOICE {
        let mut known: HashSet<String> = out.iter().cloned().collect();
        let mut rng = rng(seed, PSEUDO_STREAM);
        for _ in 0..PSEUDO_TRIES {
            if out.len() >= MIN_CHOICE {
                break;
            }
            if let Some(word) = chain.word(&mut rng, letters, PSEUDO_LETTERS.0, PSEUDO_LETTERS.1)
                && known.insert(word.clone())
            {
                out.push(word);
            }
        }
    }
    out
}

/// How many words fill about three minutes at `chars_per_minute`.
pub fn word_count(choice: &[String], chars_per_minute: f64) -> u32 {
    if choice.is_empty() {
        return MIN_WORDS;
    }
    let letters: usize = choice.iter().map(String::len).sum();
    // Each word brings its space.
    let per_word = letters as f64 / choice.len() as f64 + 1.0;
    let words = (MINUTES * chars_per_minute / per_word).round();
    if words.is_finite() {
        (words as u32).clamp(MIN_WORDS, MAX_WORDS)
    } else {
        MIN_WORDS
    }
}

#[derive(Clone, Copy)]
enum Slot {
    Focus,
    Review,
    General,
}

/// The text: shares of words with the focus key and with what is due, the rest general, in a
/// random order, never the same word twice in a row.
pub fn compose(choice: &[String], focus: char, review: &[String], words: u32, seed: u32) -> String {
    if choice.is_empty() || words == 0 {
        return String::new();
    }
    let all: Vec<&str> = choice.iter().map(String::as_str).collect();
    let with_focus: Vec<&str> = all.iter().copied().filter(|w| w.contains(focus)).collect();
    let with_review: Vec<&str> = all
        .iter()
        .copied()
        .filter(|w| review.iter().any(|gram| w.contains(gram.as_str())))
        .collect();

    let total = words as usize;
    let share = |part: f64, list: &[&str]| {
        if list.is_empty() {
            0
        } else {
            (total as f64 * part).round() as usize
        }
    };
    let focus_slots = share(FOCUS_SHARE, &with_focus);
    let review_slots = share(REVIEW_SHARE, &with_review).min(total - focus_slots);
    let mut slots: Vec<Slot> = Vec::with_capacity(total);
    slots.extend(std::iter::repeat_n(Slot::Focus, focus_slots));
    slots.extend(std::iter::repeat_n(Slot::Review, review_slots));
    slots.resize(total, Slot::General);

    let mut rng = rng(seed, ORDER_STREAM);
    for i in (1..slots.len()).rev() {
        slots.swap(i, below(&mut rng, i + 1));
    }

    let mut text = String::with_capacity(total * 6);
    let mut previous = "";
    for (i, slot) in slots.iter().enumerate() {
        let list = match slot {
            Slot::Focus => &with_focus,
            Slot::Review => &with_review,
            Slot::General => &all,
        };
        let mut index = below(&mut rng, list.len());
        if list[index] == previous && list.len() > 1 {
            index = (index + 1) % list.len();
        }
        previous = list[index];
        if i > 0 {
            text.push(' ');
        }
        text.push_str(previous);
    }
    text
}

/// The whole text of a recipe.
pub fn text(
    words: &[String],
    chain: &Chain,
    letters: &[char],
    focus: char,
    review: &[String],
    count: u32,
    seed: u32,
) -> String {
    let choice = choice(words, chain, letters, seed);
    compose(&choice, focus, review, count, seed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generator::ContentStore;
    use std::path::Path;

    fn shipped() -> (std::sync::Arc<Vec<String>>, std::sync::Arc<Chain>) {
        let store = ContentStore::new(Path::new(env!("CARGO_MANIFEST_DIR")).join("../content"));
        (store.words().unwrap(), store.chain().unwrap())
    }

    const START: [char; 6] = ['e', 't', 'a', 'o', 'i', 'n'];

    #[test]
    fn only_open_letters_appear() {
        let (words, chain) = shipped();
        let text = text(&words, &chain, &START, 'e', &[], 150, 3);
        assert!(
            text.chars().all(|c| c == ' ' || START.contains(&c)),
            "{text}"
        );
        assert_eq!(text.split(' ').count(), 150);
    }

    #[test]
    fn pseudowords_fill_the_choice_only_while_real_words_are_few() {
        let (words, chain) = shipped();
        let few = choice(&words, &chain, &START, 1);
        assert_eq!(few.len(), MIN_CHOICE);
        assert!(few.iter().any(|w| !words.contains(w)));

        let more: Vec<char> = "etaoinsrh".chars().collect();
        let many = choice(&words, &chain, &more, 1);
        assert!(many.len() > MIN_CHOICE);
        assert!(many.iter().all(|w| words.contains(w)));
    }

    #[test]
    fn the_focus_key_fills_its_share() {
        let (words, chain) = shipped();
        let letters: Vec<char> = "etaoinsrhl".chars().collect();
        let text = text(&words, &chain, &letters, 'l', &[], 100, 5);
        let with_focus = text.split(' ').filter(|w| w.contains('l')).count();
        assert!(with_focus >= 60, "{with_focus}");
        assert!(with_focus < 100);
    }

    #[test]
    fn review_gets_its_share_and_nothing_due_gives_it_away() {
        let (words, chain) = shipped();
        let letters: Vec<char> = "etaoinsrhl".chars().collect();
        let review = vec!["sh".to_owned()];
        let text = text(&words, &chain, &letters, 'l', &review, 100, 5);
        let with_review = text.split(' ').filter(|w| w.contains("sh")).count();
        assert!(with_review >= 25, "{with_review}");
    }

    #[test]
    fn a_word_never_repeats_right_away() {
        let (words, chain) = shipped();
        let text = text(&words, &chain, &START, 'e', &[], 150, 11);
        let drawn: Vec<&str> = text.split(' ').collect();
        assert!(drawn.windows(2).all(|pair| pair[0] != pair[1]));
    }

    #[test]
    fn the_same_recipe_gives_the_same_text() {
        let (words, chain) = shipped();
        let a = text(&words, &chain, &START, 'e', &[], 60, 42);
        assert_eq!(a, text(&words, &chain, &START, 'e', &[], 60, 42));
        assert_ne!(a, text(&words, &chain, &START, 'e', &[], 60, 43));
    }

    #[test]
    fn the_output_of_a_recipe_never_changes() {
        // A guard for journals: if this fails, old recipes would give different texts.
        let list: Vec<String> = ["tea", "ten", "net", "tone", "note", "eat", "in", "on"]
            .iter()
            .map(|w| (*w).to_owned())
            .collect();
        let chain = Chain::train(&list);
        assert_eq!(
            text(&list, &chain, &START, 'o', &[], 8, 42),
            EXPECTED_RECIPE_42
        );
    }

    const EXPECTED_RECIPE_42: &str = "ten on eat note noten note ton on";

    #[test]
    fn the_length_follows_the_speed() {
        let choice: Vec<String> = vec!["four".to_owned(); 10];
        // 5 characters a word with its space: 3 minutes at 100 a minute is 60 words.
        assert_eq!(word_count(&choice, 100.0), 60);
        assert_eq!(word_count(&choice, 10.0), MIN_WORDS);
        assert_eq!(word_count(&choice, 10_000.0), MAX_WORDS);
        assert_eq!(word_count(&[], 100.0), MIN_WORDS);
    }
}
