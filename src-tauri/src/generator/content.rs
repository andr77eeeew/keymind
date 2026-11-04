//! Built-in word lists and passages, shipped as files next to the app.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, thiserror::Error)]
pub enum ContentError {
    #[error("could not read the built-in content at {path}: {message}")]
    Unreadable { path: String, message: String },
    #[error("the built-in content at {path} is damaged: {message}")]
    Damaged { path: String, message: String },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Passage {
    pub id: String,
    pub text: String,
    /// Author, title and year, shown under the text.
    pub source: String,
    /// 1 easy, 2 medium, 3 hard.
    pub difficulty: u8,
}

#[derive(Deserialize)]
struct WordEntry {
    word: String,
}

/// Loads each file on first use and keeps it. The first session of a run pays for the read, and
/// that happens on the way to the typing screen, never on the input path.
pub struct ContentStore {
    dir: PathBuf,
    words: OnceLock<Result<Arc<Vec<String>>, ContentError>>,
    passages: OnceLock<Result<Arc<Vec<Passage>>, ContentError>>,
}

impl ContentStore {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self {
            dir: dir.into(),
            words: OnceLock::new(),
            passages: OnceLock::new(),
        }
    }

    /// English words, most frequent first.
    pub fn words(&self) -> Result<Arc<Vec<String>>, ContentError> {
        self.words
            .get_or_init(|| load_words(&self.dir.join("en").join("words.json")).map(Arc::new))
            .clone()
    }

    pub fn passages(&self) -> Result<Arc<Vec<Passage>>, ContentError> {
        self.passages
            .get_or_init(|| {
                load_passages(&self.dir.join("en").join("passages.jsonl")).map(Arc::new)
            })
            .clone()
    }
}

fn read(path: &Path) -> Result<String, ContentError> {
    fs::read_to_string(path).map_err(|error| ContentError::Unreadable {
        path: path.display().to_string(),
        message: error.to_string(),
    })
}

fn damaged(path: &Path, error: &serde_json::Error) -> ContentError {
    ContentError::Damaged {
        path: path.display().to_string(),
        message: error.to_string(),
    }
}

fn load_words(path: &Path) -> Result<Vec<String>, ContentError> {
    let entries: Vec<WordEntry> =
        serde_json::from_str(&read(path)?).map_err(|error| damaged(path, &error))?;
    Ok(entries.into_iter().map(|entry| entry.word).collect())
}

fn load_passages(path: &Path) -> Result<Vec<Passage>, ContentError> {
    read(path)?
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| serde_json::from_str(line).map_err(|error| damaged(path, &error)))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store_with(words: &str, passages: &str) -> (tempfile::TempDir, ContentStore) {
        let dir = tempfile::tempdir().unwrap();
        let en = dir.path().join("en");
        fs::create_dir_all(&en).unwrap();
        fs::write(en.join("words.json"), words).unwrap();
        fs::write(en.join("passages.jsonl"), passages).unwrap();
        let store = ContentStore::new(dir.path());
        (dir, store)
    }

    #[test]
    fn it_reads_words_in_rank_order_and_ignores_extra_fields() {
        let (_dir, store) = store_with(
            r#"[{"word":"the","freq":7.7,"rank":1},{"word":"of","freq":7.4,"rank":2}]"#,
            "",
        );
        assert_eq!(*store.words().unwrap(), vec!["the", "of"]);
    }

    #[test]
    fn it_reads_passages_line_by_line() {
        let (_dir, store) = store_with(
            "[]",
            "{\"id\":\"a\",\"text\":\"t\",\"source\":\"s\",\"license\":\"public-domain\",\"difficulty\":2}\n\n",
        );
        let passages = store.passages().unwrap();
        assert_eq!(passages.len(), 1);
        assert_eq!(passages[0].difficulty, 2);
    }

    #[test]
    fn missing_and_damaged_files_are_errors_not_panics() {
        let dir = tempfile::tempdir().unwrap();
        let store = ContentStore::new(dir.path());
        assert!(matches!(
            store.words(),
            Err(ContentError::Unreadable { .. })
        ));

        let (_dir, store) = store_with("not json", "not json");
        assert!(matches!(store.words(), Err(ContentError::Damaged { .. })));
        assert!(matches!(
            store.passages(),
            Err(ContentError::Damaged { .. })
        ));
    }

    /// Fails if the shipped files stop matching this reader. Stage 1 ships them, so they must exist.
    #[test]
    fn the_shipped_content_loads() {
        let store = ContentStore::new(Path::new(env!("CARGO_MANIFEST_DIR")).join("../content"));
        assert!(store.words().unwrap().len() >= 5000);
        let passages = store.passages().unwrap();
        for difficulty in 1..=3 {
            assert!(passages.iter().any(|p| p.difficulty == difficulty));
        }
        let forbidden = "gutenberg";
        assert!(
            passages
                .iter()
                .all(|p| !p.text.to_lowercase().contains(forbidden))
        );
    }
}
