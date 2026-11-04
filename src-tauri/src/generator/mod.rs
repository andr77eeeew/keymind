//! Exercise text generation. Stage 1 draws random frequent words and picks built-in passages.
//! The brain's targeted exercises join at stage 3.

pub mod content;

use rand_chacha::ChaCha8Rng;
use rand_chacha::rand_core::{Rng, SeedableRng};

pub use content::{ContentError, ContentStore, Passage};

/// Picks `count` words uniformly from the `pool` most frequent ones, never the same word twice in
/// a row, and joins them with spaces. The same arguments always give the same text, so a seed in
/// the journal is enough to repeat an exercise.
pub fn generate_words(words: &[String], pool: usize, count: usize, seed: u32) -> String {
    let pool = &words[..pool.min(words.len())];
    if pool.is_empty() || count == 0 {
        return String::new();
    }
    let mut rng = ChaCha8Rng::seed_from_u64(u64::from(seed));
    let mut text = String::with_capacity(count * 6);
    let mut previous = usize::MAX;
    for i in 0..count {
        let mut index = below(&mut rng, pool.len());
        if index == previous && pool.len() > 1 {
            // Move to the next word instead of drawing again. The tiny bias is harmless here, and
            // the number of random draws per word stays fixed.
            index = (index + 1) % pool.len();
        }
        previous = index;
        if i > 0 {
            text.push(' ');
        }
        text.push_str(&pool[index]);
    }
    text
}

/// Picks a passage of the given difficulty, or of any difficulty for `None`.
pub fn pick_passage(passages: &[Passage], difficulty: Option<u8>, seed: u32) -> Option<&Passage> {
    let matching: Vec<&Passage> = passages
        .iter()
        .filter(|p| difficulty.is_none_or(|d| p.difficulty == d))
        .collect();
    if matching.is_empty() {
        return None;
    }
    let mut rng = ChaCha8Rng::seed_from_u64(u64::from(seed));
    Some(matching[below(&mut rng, matching.len())])
}

/// An unbiased number below `limit`. Written here instead of taken from `rand`, whose sampling may
/// change between versions: old seeds in the journal have to keep giving the same text.
fn below(rng: &mut ChaCha8Rng, limit: usize) -> usize {
    let limit = limit as u64;
    let zone = u64::MAX - (u64::MAX % limit);
    loop {
        let value = rng.next_u64();
        if value < zone {
            return (value % limit) as usize;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn words(n: usize) -> Vec<String> {
        (0..n).map(|i| format!("w{i}")).collect()
    }

    fn passage(id: &str, difficulty: u8) -> Passage {
        Passage {
            id: id.to_owned(),
            text: "text".to_owned(),
            source: "source".to_owned(),
            difficulty,
        }
    }

    #[test]
    fn the_same_seed_gives_the_same_text() {
        let list = words(100);
        assert_eq!(
            generate_words(&list, 50, 200, 7),
            generate_words(&list, 50, 200, 7)
        );
        assert_ne!(
            generate_words(&list, 50, 200, 7),
            generate_words(&list, 50, 200, 8)
        );
    }

    #[test]
    fn the_output_of_a_seed_never_changes() {
        // A guard for journals: if this fails, old seeds would give different texts.
        let list = words(1000);
        assert_eq!(generate_words(&list, 1000, 3, 42), EXPECTED_SEED_42);
    }

    const EXPECTED_SEED_42: &str = "w737 w312 w20";

    #[test]
    fn it_gives_the_requested_number_of_words_from_the_pool() {
        let list = words(100);
        let text = generate_words(&list, 10, 500, 1);
        let drawn: Vec<&str> = text.split(' ').collect();
        assert_eq!(drawn.len(), 500);
        assert!(drawn.iter().all(|w| list[..10].iter().any(|x| x == w)));
    }

    #[test]
    fn a_word_never_repeats_right_away() {
        let list = words(3);
        let text = generate_words(&list, 3, 2000, 5);
        let drawn: Vec<&str> = text.split(' ').collect();
        assert!(drawn.windows(2).all(|pair| pair[0] != pair[1]));
    }

    #[test]
    fn every_word_of_the_pool_is_reachable() {
        let list = words(5);
        let text = generate_words(&list, 5, 500, 9);
        assert!(list.iter().all(|w| text.split(' ').any(|x| x == w)));
    }

    #[test]
    fn a_pool_larger_than_the_list_is_clamped_and_empty_input_is_empty() {
        assert_eq!(generate_words(&words(1), 100, 3, 1), "w0 w0 w0");
        assert_eq!(generate_words(&[], 100, 3, 1), "");
        assert_eq!(generate_words(&words(5), 5, 0, 1), "");
    }

    #[test]
    fn passages_respect_the_difficulty_filter() {
        let list = [passage("easy", 1), passage("hard", 3)];
        for seed in 0..20 {
            assert_eq!(pick_passage(&list, Some(3), seed).unwrap().id, "hard");
        }
        assert!(pick_passage(&list, Some(2), 1).is_none());
        assert!(pick_passage(&list, None, 1).is_some());
    }
}
