//! Which physical key produces a character. A wrong press is counted against the key that should
//! have been pressed, and the journal holds only the character that key should have produced.

/// The layout name written by the typing screen.
pub const EN_QWERTY: &str = "en-qwerty";

/// The `event.code` for a single character, or `None` if this layout cannot type it.
pub fn key_for_char(layout: &str, text: &str) -> Option<&'static str> {
    if layout != EN_QWERTY {
        return None;
    }
    let mut chars = text.chars();
    let first = chars.next()?;
    if chars.next().is_some() {
        return None;
    }
    en_qwerty(first)
}

fn en_qwerty(c: char) -> Option<&'static str> {
    Some(match c.to_ascii_lowercase() {
        'a' => "KeyA",
        'b' => "KeyB",
        'c' => "KeyC",
        'd' => "KeyD",
        'e' => "KeyE",
        'f' => "KeyF",
        'g' => "KeyG",
        'h' => "KeyH",
        'i' => "KeyI",
        'j' => "KeyJ",
        'k' => "KeyK",
        'l' => "KeyL",
        'm' => "KeyM",
        'n' => "KeyN",
        'o' => "KeyO",
        'p' => "KeyP",
        'q' => "KeyQ",
        'r' => "KeyR",
        's' => "KeyS",
        't' => "KeyT",
        'u' => "KeyU",
        'v' => "KeyV",
        'w' => "KeyW",
        'x' => "KeyX",
        'y' => "KeyY",
        'z' => "KeyZ",
        '1' | '!' => "Digit1",
        '2' | '@' => "Digit2",
        '3' | '#' => "Digit3",
        '4' | '$' => "Digit4",
        '5' | '%' => "Digit5",
        '6' | '^' => "Digit6",
        '7' | '&' => "Digit7",
        '8' | '*' => "Digit8",
        '9' | '(' => "Digit9",
        '0' | ')' => "Digit0",
        '`' | '~' => "Backquote",
        '-' | '_' => "Minus",
        '=' | '+' => "Equal",
        '[' | '{' => "BracketLeft",
        ']' | '}' => "BracketRight",
        '\\' | '|' => "Backslash",
        ';' | ':' => "Semicolon",
        '\'' | '"' => "Quote",
        ',' | '<' => "Comma",
        '.' | '>' => "Period",
        '/' | '?' => "Slash",
        ' ' => "Space",
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn both_cases_of_a_letter_use_one_key() {
        assert_eq!(key_for_char(EN_QWERTY, "a"), Some("KeyA"));
        assert_eq!(key_for_char(EN_QWERTY, "A"), Some("KeyA"));
    }

    #[test]
    fn shifted_symbols_use_the_key_they_are_printed_on() {
        assert_eq!(key_for_char(EN_QWERTY, "!"), Some("Digit1"));
        assert_eq!(key_for_char(EN_QWERTY, "\""), Some("Quote"));
        assert_eq!(key_for_char(EN_QWERTY, "?"), Some("Slash"));
    }

    #[test]
    fn every_printable_ascii_character_has_a_key() {
        // Imported and pasted text is cleaned down to exactly this set.
        for code in 0x20u8..0x7f {
            let text = char::from(code).to_string();
            assert!(
                key_for_char(EN_QWERTY, &text).is_some(),
                "no key for {text:?}"
            );
        }
    }

    #[test]
    fn what_a_layout_cannot_type_has_no_key() {
        assert_eq!(key_for_char(EN_QWERTY, "\u{0436}"), None);
        assert_eq!(key_for_char(EN_QWERTY, ""), None);
        assert_eq!(key_for_char(EN_QWERTY, "ab"), None);
        assert_eq!(key_for_char("uk-standard", "a"), None);
    }
}
