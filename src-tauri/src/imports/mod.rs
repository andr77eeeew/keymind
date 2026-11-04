//! The user's own texts. They live only in a local cache folder, never in the repository, and the
//! journal stores only their id.

pub mod epub;
pub mod normalize;

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

pub use normalize::{Normalized, normalize_text};

/// A larger file is almost certainly not a text to type.
pub const MAX_IMPORT_BYTES: usize = 128 * 1024 * 1024;

#[derive(Debug, thiserror::Error)]
pub enum ImportError {
    #[error(transparent)]
    Epub(#[from] epub::EpubError),
    #[error("this file type is not supported. Use a .txt or .epub file")]
    UnsupportedType,
    #[error("this file is larger than the 128 MB limit")]
    TooLarge,
    #[error("this file has no text that can be typed on the English layout")]
    NothingToType,
    #[error("no imported text has this id")]
    NotFound,
    #[error("could not access the imported texts at {path}: {source}")]
    Io {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("could not encode the list of imported texts: {0}")]
    Encode(#[from] serde_json::Error),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ImportedText {
    pub id: String,
    pub title: String,
    pub chars: u64,
    /// Characters left out because they have no key on the layout.
    pub removed: u64,
    /// Where the next session continues.
    pub offset: u64,
}

/// A folder holding `index.json` and one `<id>.txt` per text.
pub struct Library {
    dir: PathBuf,
}

impl Library {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    pub fn list(&self) -> Result<Vec<ImportedText>, ImportError> {
        let path = self.index_path();
        match fs::read(&path) {
            // A damaged index loses the list, not the app. The texts stay on disk.
            Ok(bytes) => Ok(serde_json::from_slice(&bytes).unwrap_or_default()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
            Err(source) => Err(ImportError::Io { path, source }),
        }
    }

    /// Reads a file's bytes, extracts its text and stores the result.
    pub fn add(&self, file_name: &str, bytes: &[u8]) -> Result<ImportedText, ImportError> {
        if bytes.len() > MAX_IMPORT_BYTES {
            return Err(ImportError::TooLarge);
        }
        let (title, raw) = extract(file_name, bytes)?;
        let normalized = normalize_text(&raw);
        if normalized.text.is_empty() {
            return Err(ImportError::NothingToType);
        }
        let entry = ImportedText {
            id: uuid::Uuid::new_v4().to_string(),
            title,
            chars: normalized.text.len() as u64,
            removed: normalized.removed as u64,
            offset: 0,
        };
        self.ensure_dir()?;
        let text_path = self.text_path(&entry.id);
        fs::write(&text_path, &normalized.text).map_err(|source| ImportError::Io {
            path: text_path,
            source,
        })?;
        let mut list = self.list()?;
        list.push(entry.clone());
        self.save(&list)?;
        Ok(entry)
    }

    pub fn load(&self, id: &str) -> Result<String, ImportError> {
        let entry = self.find(id)?;
        let path = self.text_path(&entry.id);
        fs::read_to_string(&path).map_err(|source| ImportError::Io { path, source })
    }

    pub fn set_offset(&self, id: &str, offset: u64) -> Result<(), ImportError> {
        let mut list = self.list()?;
        let entry = list
            .iter_mut()
            .find(|e| e.id == id)
            .ok_or(ImportError::NotFound)?;
        entry.offset = offset.min(entry.chars);
        self.save(&list)
    }

    pub fn remove(&self, id: &str) -> Result<(), ImportError> {
        let entry = self.find(id)?;
        let mut list = self.list()?;
        list.retain(|e| e.id != id);
        self.save(&list)?;
        let path = self.text_path(&entry.id);
        fs::remove_file(&path).map_err(|source| ImportError::Io { path, source })
    }

    /// Looks the id up in the index, so a value from outside can never name another path.
    fn find(&self, id: &str) -> Result<ImportedText, ImportError> {
        self.list()?
            .into_iter()
            .find(|e| e.id == id)
            .ok_or(ImportError::NotFound)
    }

    fn save(&self, list: &[ImportedText]) -> Result<(), ImportError> {
        self.ensure_dir()?;
        let path = self.index_path();
        let temporary = self.dir.join("index.json.tmp");
        let data = serde_json::to_vec_pretty(list)?;
        fs::write(&temporary, data)
            .and_then(|()| fs::rename(&temporary, &path))
            .map_err(|source| ImportError::Io { path, source })
    }

    fn ensure_dir(&self) -> Result<(), ImportError> {
        fs::create_dir_all(&self.dir).map_err(|source| ImportError::Io {
            path: self.dir.clone(),
            source,
        })
    }

    fn index_path(&self) -> PathBuf {
        self.dir.join("index.json")
    }

    fn text_path(&self, id: &str) -> PathBuf {
        self.dir.join(format!("{id}.txt"))
    }
}

fn extract(file_name: &str, bytes: &[u8]) -> Result<(String, String), ImportError> {
    let path = Path::new(file_name);
    let stem = path.file_stem().map_or_else(
        || "Untitled".to_owned(),
        |s| s.to_string_lossy().into_owned(),
    );
    let extension = path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    match extension.as_str() {
        "txt" => Ok((stem, decode_text(bytes))),
        "epub" => {
            let book = epub::extract(bytes)?;
            Ok((book.title.unwrap_or(stem), book.text))
        }
        _ => Err(ImportError::UnsupportedType),
    }
}

/// Handles UTF-8 and the UTF-16 that Windows Notepad can save. Anything else decodes lossily, and
/// the damaged characters are reported as removed by the normalizer.
fn decode_text(bytes: &[u8]) -> String {
    let utf16 = |bytes: &[u8], read: fn([u8; 2]) -> u16| {
        let (pairs, _) = bytes.as_chunks::<2>();
        let units: Vec<u16> = pairs.iter().map(|pair| read(*pair)).collect();
        String::from_utf16_lossy(&units)
    };
    match bytes {
        [0xFF, 0xFE, rest @ ..] => utf16(rest, u16::from_le_bytes),
        [0xFE, 0xFF, rest @ ..] => utf16(rest, u16::from_be_bytes),
        [0xEF, 0xBB, 0xBF, rest @ ..] => String::from_utf8_lossy(rest).into_owned(),
        _ => String::from_utf8_lossy(bytes).into_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn library() -> (tempfile::TempDir, Library) {
        let dir = tempfile::tempdir().unwrap();
        let library = Library::new(dir.path().join("imports"));
        (dir, library)
    }

    #[test]
    fn a_text_file_is_normalized_stored_and_listed() {
        let (_dir, library) = library();
        let entry = library
            .add("My Notes.txt", "one\r\ntwo \u{043F}".as_bytes())
            .unwrap();
        assert_eq!(entry.title, "My Notes");
        assert_eq!(entry.chars, 7);
        assert_eq!(entry.removed, 1);
        assert_eq!(library.load(&entry.id).unwrap(), "one two");
        assert_eq!(library.list().unwrap(), vec![entry]);
    }

    #[test]
    fn an_epub_is_imported_under_its_own_title() {
        let (_dir, library) = library();
        let entry = library
            .add("file.epub", &epub::tests::sample_epub())
            .unwrap();
        assert_eq!(entry.title, "A Small Book");
        assert!(
            library
                .load(&entry.id)
                .unwrap()
                .starts_with("First Tom & Jerry's")
        );
    }

    #[test]
    fn notepad_encodings_decode() {
        assert_eq!(decode_text(&[0xFF, 0xFE, b'h', 0, b'i', 0]), "hi");
        assert_eq!(decode_text(&[0xFE, 0xFF, 0, b'h', 0, b'i']), "hi");
        assert_eq!(decode_text(&[0xEF, 0xBB, 0xBF, b'h', b'i']), "hi");
    }

    #[test]
    fn unsupported_and_untypable_files_are_refused() {
        let (_dir, library) = library();
        assert!(matches!(
            library.add("a.pdf", b"x"),
            Err(ImportError::UnsupportedType)
        ));
        assert!(matches!(
            library.add("a.txt", "\u{043F}\u{0440}".as_bytes()),
            Err(ImportError::NothingToType)
        ));
        assert!(library.list().unwrap().is_empty());
    }

    #[test]
    fn the_offset_is_saved_and_clamped() {
        let (_dir, library) = library();
        let entry = library.add("a.txt", b"hello").unwrap();
        library.set_offset(&entry.id, 3).unwrap();
        assert_eq!(library.list().unwrap()[0].offset, 3);
        library.set_offset(&entry.id, 999).unwrap();
        assert_eq!(library.list().unwrap()[0].offset, 5);
    }

    #[test]
    fn removing_deletes_the_entry_and_the_text() {
        let (_dir, library) = library();
        let entry = library.add("a.txt", b"hello").unwrap();
        library.remove(&entry.id).unwrap();
        assert!(library.list().unwrap().is_empty());
        assert!(matches!(
            library.load(&entry.id),
            Err(ImportError::NotFound)
        ));
    }

    #[test]
    fn an_id_cannot_reach_outside_the_folder() {
        let (dir, library) = library();
        fs::write(dir.path().join("secret.txt"), "secret").unwrap();
        assert!(matches!(
            library.load("../secret"),
            Err(ImportError::NotFound)
        ));
    }

    #[test]
    fn a_damaged_index_reads_as_empty() {
        let (dir, library) = library();
        let imports = dir.path().join("imports");
        fs::create_dir_all(&imports).unwrap();
        fs::write(imports.join("index.json"), b"{broken").unwrap();
        assert!(library.list().unwrap().is_empty());
    }
}
