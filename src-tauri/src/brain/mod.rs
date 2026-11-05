//! The brain: what the student knows and what to train next. Stage 3 has the Bayesian student
//! model and the heuristic. The ML decision model of stage 8 will sit next to the heuristic, which
//! always stays as the fallback. See ADR-0010.

pub mod heuristic;
pub mod model;
pub mod session;
pub mod unlock;

/// The bar for "this key is learned": 35 WPM, five characters a word. `model_state` is folded
/// with the bar, so a change here must raise the projector's `SCHEMA_VERSION`.
pub const BAR_MS: f64 = 60_000.0 / (35.0 * 5.0);
/// At most 5% of presses wrong.
pub const BAR_ERRORS: f64 = 0.05;
/// Letters open at the very start.
pub const START_LETTERS: usize = 6;
/// The only layout before stage 11.
pub const LAYOUT: &str = crate::projector::layout::EN_QWERTY;

/// `KeyE` gives `e`. Other keys are not letters and stay out of the model.
pub fn letter_of_code(code: &str) -> Option<char> {
    let rest = code.strip_prefix("Key")?;
    let mut chars = rest.chars();
    let c = chars.next()?;
    (chars.next().is_none() && c.is_ascii_uppercase()).then(|| c.to_ascii_lowercase())
}

/// A lowercase letter from a one-character string.
pub fn letter_of(text: &str) -> Option<char> {
    let mut chars = text.chars();
    let c = chars.next()?;
    (chars.next().is_none() && c.is_ascii_lowercase()).then_some(c)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_bar_is_35_wpm() {
        assert!((BAR_MS - 342.857).abs() < 0.001);
    }

    #[test]
    fn letter_keys_map_to_letters_and_nothing_else_does() {
        assert_eq!(letter_of_code("KeyE"), Some('e'));
        assert_eq!(letter_of_code("Digit1"), None);
        assert_eq!(letter_of_code("KeyEE"), None);
        assert_eq!(letter_of("q"), Some('q'));
        assert_eq!(letter_of("Q"), None);
        assert_eq!(letter_of(" "), None);
        assert_eq!(letter_of("ab"), None);
    }
}
