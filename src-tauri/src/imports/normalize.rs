//! Turns any text into what can be typed on the current layout.

use unicode_normalization::UnicodeNormalization;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Normalized {
    pub text: String,
    /// Characters with no key on the layout, left out of the text. The UI reports this.
    pub removed: usize,
}

/// Keeps printable ASCII, the characters of the English QWERTY layout:
///
/// - typographic quotes, dashes and ellipses become their keyboard forms;
/// - accents are stripped, so `café` becomes `cafe`;
/// - any run of whitespace, including line breaks, becomes one space;
/// - everything else is removed and counted. Other alphabets arrive with their layouts at stage 11.
pub fn normalize_text(raw: &str) -> Normalized {
    let mut out = Output {
        text: String::with_capacity(raw.len()),
        pending_space: false,
    };
    let mut removed = 0;

    for c in raw.chars() {
        if let Some(replacement) = typographic(c) {
            replacement.chars().for_each(|r| out.push(r));
        } else if c.is_whitespace() {
            out.pending_space = true;
        } else if c.is_ascii_graphic() {
            out.push(c);
        } else {
            // Compatibility decomposition splits an accented letter from its mark.
            let mut kept = false;
            for d in std::iter::once(c).nfkd().filter(char::is_ascii_graphic) {
                out.push(d);
                kept = true;
            }
            if !kept && !is_invisible(c) {
                removed += 1;
            }
        }
    }
    Normalized {
        text: out.text,
        removed,
    }
}

struct Output {
    text: String,
    pending_space: bool,
}

impl Output {
    /// Writes a held-back space only before the next character, so the text never ends in one.
    fn push(&mut self, c: char) {
        if self.pending_space && !self.text.is_empty() {
            self.text.push(' ');
        }
        self.pending_space = false;
        self.text.push(c);
    }
}

fn typographic(c: char) -> Option<&'static str> {
    Some(match c {
        '\u{2018}' | '\u{2019}' | '\u{201A}' | '\u{201B}' | '\u{2032}' => "'",
        '\u{201C}' | '\u{201D}' | '\u{201E}' | '\u{201F}' | '\u{2033}' | '\u{00AB}'
        | '\u{00BB}' => "\"",
        '\u{2010}' | '\u{2011}' | '\u{2012}' | '\u{2013}' | '\u{2014}' | '\u{2015}'
        | '\u{2212}' => "-",
        '\u{2026}' => "...",
        '\u{00C6}' => "AE",
        '\u{00E6}' => "ae",
        '\u{0152}' => "OE",
        '\u{0153}' => "oe",
        '\u{00DF}' => "ss",
        _ => return None,
    })
}

/// Marks and control characters are not lost content, so they are not reported as removed.
fn is_invisible(c: char) -> bool {
    c.is_control()
        || matches!(c, '\u{00AD}' | '\u{200B}'..='\u{200F}' | '\u{2060}' | '\u{FEFF}' | '\u{0300}'..='\u{036F}')
}

#[cfg(test)]
mod tests {
    use super::*;

    fn clean(raw: &str) -> String {
        normalize_text(raw).text
    }

    #[test]
    fn plain_text_passes_through() {
        let text = "Hello, world! 1 + 1 = 2 {ok} ~`";
        assert_eq!(normalize_text(text).text, text);
        assert_eq!(normalize_text(text).removed, 0);
    }

    #[test]
    fn typographic_marks_become_keyboard_forms() {
        assert_eq!(
            clean("\u{201C}It\u{2019}s\u{201D} \u{2014} well\u{2026}"),
            "\"It's\" - well..."
        );
    }

    #[test]
    fn accents_are_stripped() {
        assert_eq!(
            clean("caf\u{00E9} na\u{00EF}ve \u{00C9}cole"),
            "cafe naive Ecole"
        );
        assert_eq!(clean("Stra\u{00DF}e \u{00E6}on"), "Strasse aeon");
    }

    #[test]
    fn whitespace_collapses_and_edges_are_trimmed() {
        assert_eq!(
            clean("  one\r\n\r\n two\t\tthree\u{00A0}four \n"),
            "one two three four"
        );
    }

    #[test]
    fn characters_without_a_key_are_removed_and_counted() {
        let result = normalize_text("abc \u{043F}\u{0440}\u{0438} \u{1F600} def");
        assert_eq!(result.text, "abc def");
        assert_eq!(result.removed, 4);
    }

    #[test]
    fn invisible_characters_are_removed_silently() {
        let result = normalize_text("\u{FEFF}soft\u{00AD}ware\u{200B} x");
        assert_eq!(result.text, "software x");
        assert_eq!(result.removed, 0);
    }

    #[test]
    fn text_with_no_typable_characters_comes_out_empty() {
        let result = normalize_text("\u{043F}\u{0440}\u{0438}\u{0432}\u{0435}\u{0442}");
        assert_eq!(result.text, "");
        assert_eq!(result.removed, 6);
    }
}
