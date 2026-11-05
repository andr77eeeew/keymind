//! Pseudowords from a character chain trained on the dictionary. While few letters are open, real
//! words made of them are few, and pseudowords keep the text from repeating. See ADR-0011.

use std::collections::BTreeMap;

use rand_chacha::ChaCha8Rng;

use super::below;

/// Marks the start and the end of a word in a context.
const EDGE: u8 = b'^';

/// How often each letter follows each pair of letters. A second-order chain: one letter of context
/// gives noise, three copy the dictionary.
#[derive(Debug, Default)]
pub struct Chain {
    /// Context, then the next letters with counts in byte order. `EDGE` as the next letter ends
    /// the word.
    next: BTreeMap<[u8; 2], Vec<(u8, u32)>>,
}

impl Chain {
    /// Counts every lowercase word of letters a to z. Order does not matter.
    pub fn train<'a>(words: impl IntoIterator<Item = &'a String>) -> Self {
        let mut counts: BTreeMap<[u8; 2], BTreeMap<u8, u32>> = BTreeMap::new();
        for word in words {
            if word.is_empty() || !word.bytes().all(|b| b.is_ascii_lowercase()) {
                continue;
            }
            let mut context = [EDGE, EDGE];
            for b in word.bytes().chain([EDGE]) {
                *counts.entry(context).or_default().entry(b).or_default() += 1;
                context = [context[1], b];
            }
        }
        Self {
            next: counts
                .into_iter()
                .map(|(context, next)| (context, next.into_iter().collect()))
                .collect(),
        }
    }

    /// One pseudoword of `min..=max` letters, all of them in `allowed`. `None` when the chain runs
    /// into a context with no allowed way on, which is common with few letters; the caller simply
    /// tries again.
    pub fn word(
        &self,
        rng: &mut ChaCha8Rng,
        allowed: &[char],
        min: usize,
        max: usize,
    ) -> Option<String> {
        let mut word = String::new();
        let mut context = [EDGE, EDGE];
        loop {
            let options: Vec<(u8, u32)> = self
                .next
                .get(&context)?
                .iter()
                .copied()
                .filter(|&(b, _)| {
                    if b == EDGE {
                        word.len() >= min
                    } else {
                        word.len() < max && allowed.contains(&char::from(b))
                    }
                })
                .collect();
            let total: u32 = options.iter().map(|&(_, count)| count).sum();
            if total == 0 {
                return None;
            }
            let mut pick = below(rng, total as usize) as u32;
            let mut chosen = EDGE;
            for (b, count) in options {
                if pick < count {
                    chosen = b;
                    break;
                }
                pick -= count;
            }
            if chosen == EDGE {
                return Some(word);
            }
            word.push(char::from(chosen));
            context = [context[1], chosen];
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand_chacha::rand_core::SeedableRng;

    fn chain() -> Chain {
        let words: Vec<String> = [
            "tea", "ten", "net", "tone", "note", "eaten", "intent", "x-ray",
        ]
        .iter()
        .map(|w| (*w).to_owned())
        .collect();
        Chain::train(&words)
    }

    #[test]
    fn pseudowords_use_only_allowed_letters_and_keep_their_length() {
        let chain = chain();
        let mut rng = ChaCha8Rng::seed_from_u64(1);
        let allowed = ['e', 't', 'a', 'o', 'i', 'n'];
        let mut made = 0;
        for _ in 0..500 {
            if let Some(word) = chain.word(&mut rng, &allowed, 3, 8) {
                assert!((3..=8).contains(&word.len()), "{word}");
                assert!(word.chars().all(|c| allowed.contains(&c)), "{word}");
                made += 1;
            }
        }
        assert!(made > 100);
    }

    #[test]
    fn a_word_with_other_characters_is_not_learned() {
        let chain = chain();
        assert!(!chain.next.contains_key(b"x-"));
    }

    #[test]
    fn no_allowed_way_on_gives_none() {
        let chain = chain();
        let mut rng = ChaCha8Rng::seed_from_u64(1);
        assert_eq!(chain.word(&mut rng, &['q'], 3, 8), None);
    }
}
