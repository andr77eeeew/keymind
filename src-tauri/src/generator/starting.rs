//! The text of the starting test: easy passages, chosen so that one minute touches as many letters
//! as it can.

use std::collections::BTreeSet;

use rand_chacha::ChaCha8Rng;
use rand_chacha::rand_core::SeedableRng;

use super::{Passage, below};

/// The easy passages, by the difficulty in `passages.jsonl`.
const EASY: u8 = 1;
/// More than anyone types in a minute: 150 WPM is 750 characters.
const TEST_CHARS: usize = 1_000;

#[derive(Debug, Clone, PartialEq)]
pub struct StartingTest {
    /// In the order of the text, which is what the journal keeps.
    pub ids: Vec<String>,
    /// The passages joined by a space.
    pub text: String,
}

fn letters(text: &str) -> BTreeSet<char> {
    text.chars()
        .filter(char::is_ascii_alphabetic)
        .map(|c| c.to_ascii_lowercase())
        .collect()
}

/// The first passage is drawn at random, and each next one adds the most letters the text does not
/// have yet. The same seed and content give the same test.
pub fn starting_test(passages: &[Passage], seed: u32) -> Option<StartingTest> {
    let mut pool: Vec<&Passage> = passages.iter().filter(|p| p.difficulty == EASY).collect();
    if pool.is_empty() {
        pool = passages.iter().collect();
    }
    if pool.is_empty() {
        return None;
    }
    let mut rng = ChaCha8Rng::seed_from_u64(u64::from(seed));
    let mut chosen: Vec<&Passage> = Vec::new();
    let mut covered = BTreeSet::new();
    let mut chars = 0;
    while chars < TEST_CHARS && chosen.len() < pool.len() {
        // A random place to start looking, so that ties do not always go to the same passage.
        let start = below(&mut rng, pool.len());
        let mut best: Option<(usize, &Passage)> = None;
        for offset in 0..pool.len() {
            let passage = pool[(start + offset) % pool.len()];
            if chosen.iter().any(|other| other.id == passage.id) {
                continue;
            }
            let new = if chosen.is_empty() {
                0
            } else {
                letters(&passage.text).difference(&covered).count()
            };
            if best.is_none_or(|(most, _)| new > most) {
                best = Some((new, passage));
            }
        }
        let Some((_, passage)) = best else {
            break;
        };
        covered.extend(letters(&passage.text));
        chars += passage.text.chars().count() + usize::from(!chosen.is_empty());
        chosen.push(passage);
    }
    Some(StartingTest {
        ids: chosen.iter().map(|p| p.id.clone()).collect(),
        text: chosen
            .iter()
            .map(|p| p.text.as_str())
            .collect::<Vec<_>>()
            .join(" "),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn passage(id: &str, text: &str, difficulty: u8) -> Passage {
        Passage {
            id: id.to_owned(),
            text: text.to_owned(),
            source: "source".to_owned(),
            difficulty,
        }
    }

    fn long(letter: char) -> String {
        format!("{letter}{}", " aa".repeat(150))
    }

    #[test]
    fn it_takes_easy_passages_until_a_minute_is_covered() {
        let passages: Vec<Passage> = "bcdefghijk"
            .chars()
            .map(|c| passage(&c.to_string(), &long(c), 1))
            .chain([passage("hard", &"zq ".repeat(400), 3)])
            .collect();
        let test = starting_test(&passages, 7).unwrap();
        assert!(test.text.chars().count() >= TEST_CHARS);
        assert!(!test.ids.contains(&"hard".to_owned()));
        assert_eq!(test.text.split(' ').next().map(str::len), Some(1));
    }

    #[test]
    fn each_next_passage_brings_the_most_new_letters() {
        let passages = vec![
            passage("same", &format!("the {}", "the ".repeat(100)), 1),
            passage("first", &format!("the {}", "the ".repeat(100)), 1),
            passage("new", &format!("quick fox {}", "the ".repeat(100)), 1),
        ];
        // Whichever comes first, "new" adds letters and the other plain one adds none.
        for seed in 0..20 {
            let test = starting_test(&passages, seed).unwrap();
            if test.ids[0] != "new" {
                assert_eq!(test.ids[1], "new", "seed {seed}");
            }
        }
    }

    #[test]
    fn the_same_seed_gives_the_same_test() {
        let passages: Vec<Passage> = "bcdefghijklmnop"
            .chars()
            .map(|c| passage(&c.to_string(), &long(c), 1))
            .collect();
        assert_eq!(starting_test(&passages, 3), starting_test(&passages, 3));
        let firsts: BTreeSet<String> = (0..30)
            .map(|seed| starting_test(&passages, seed).unwrap().ids[0].clone())
            .collect();
        assert!(firsts.len() > 3, "the first passage is drawn at random");
    }

    #[test]
    fn without_easy_passages_any_will_do_and_without_any_there_is_no_test() {
        let hard = vec![passage("hard", &long('x'), 3)];
        assert_eq!(starting_test(&hard, 1).unwrap().ids, vec!["hard"]);
        assert_eq!(starting_test(&[], 1), None);
    }
}
