//! An adaptive session from start to text: the heuristic's choice, the number of words, the
//! recipe and the text. Plain logic, so a test can replay a journal line exactly.

use serde::Serialize;

use super::heuristic::{Choice, Knowledge, choose};
use crate::generator::adaptive;
use crate::generator::markov::Chain;
use crate::journal::event::{Recipe, TextSource};

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct AdaptiveSession {
    pub text: String,
    pub source: TextSource,
    pub choice: Choice,
}

/// Builds the next adaptive session. `order` is every letter, most frequent first.
pub fn next_session(
    order: &[char],
    knowledge: &Knowledge,
    today: i32,
    gradual: bool,
    words: &[String],
    chain: &Chain,
    seed: u32,
) -> AdaptiveSession {
    let choice = choose(order, knowledge, today, gradual);
    let candidates = adaptive::choice(words, chain, &choice.letters.open, seed);
    let count = adaptive::word_count(&candidates, choice.chars_per_minute);
    let recipe = choice.recipe(count);
    let text = adaptive::compose(&candidates, choice.focus, &recipe.review, count, seed);
    AdaptiveSession {
        text,
        source: TextSource::Adaptive { seed, recipe },
        choice,
    }
}

/// The text of a journaled recipe, for checks and for a summary that needs the text again.
pub fn replay(recipe: &Recipe, seed: u32, words: &[String], chain: &Chain) -> String {
    let letters: Vec<char> = recipe.letters.chars().collect();
    let focus = recipe.focus.chars().next().unwrap_or('e');
    adaptive::text(
        words,
        chain,
        &letters,
        focus,
        &recipe.review,
        recipe.words,
        seed,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generator::ContentStore;
    use std::path::Path;

    #[test]
    fn a_journaled_recipe_gives_the_same_text_again() {
        let store = ContentStore::new(Path::new(env!("CARGO_MANIFEST_DIR")).join("../content"));
        let (words, chain, order) = (
            store.words().unwrap(),
            store.chain().unwrap(),
            store.letter_order().unwrap(),
        );
        let session = next_session(&order, &Knowledge::default(), 0, true, &words, &chain, 99);
        // Through the journal and back, as the UI writes it.
        let line = serde_json::to_string(&session.source).unwrap();
        let TextSource::Adaptive { seed, recipe } = serde_json::from_str(&line).unwrap() else {
            panic!("not adaptive: {line}");
        };
        assert_eq!(replay(&recipe, seed, &words, &chain), session.text);
        assert_eq!(recipe.letters, "etaoin");
        assert_eq!(recipe.focus, "e");
        // A beginner at 100 characters a minute gets the shortest length that fits three minutes.
        assert_eq!(session.text.split(' ').count(), recipe.words as usize);
        assert!(recipe.words >= adaptive::MIN_WORDS);
    }
}
