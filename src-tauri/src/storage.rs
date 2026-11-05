//! Where local data lives, and the device id.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use uuid::Uuid;

/// Layout of the per-user data folder. Nothing here goes into a sync target except the journal, so
/// the database sits beside the journal folder and never inside it.
#[derive(Debug, Clone)]
pub struct AppPaths {
    pub settings_cache: PathBuf,
    pub imports: PathBuf,
    /// The journal folder of this device.
    pub journal: PathBuf,
    /// The folder holding the journals of every device.
    pub journal_root: PathBuf,
    /// Derived tables, rebuilt from the journals at any time.
    pub database: PathBuf,
    /// The name of this device's folder under `journal_root`.
    pub device: String,
}

impl AppPaths {
    /// Creates the data folder and resolves the journal folder of this device.
    pub fn prepare(root: &Path) -> io::Result<Self> {
        fs::create_dir_all(root)?;
        let device = device_id(root)?;
        let journal_root = root.join("journal");
        Ok(Self {
            settings_cache: root.join("settings.json"),
            imports: root.join("imports"),
            journal: journal_root.join(&device),
            journal_root,
            database: root.join("derived.sqlite"),
            device,
        })
    }
}

/// Reads the device id, or creates one on first use. It is random, so a journal folder in a sync
/// target reveals nothing about the computer.
fn device_id(root: &Path) -> io::Result<String> {
    let path = root.join("device-id");
    if let Ok(existing) = fs::read_to_string(&path) {
        let existing = existing.trim();
        // A damaged id only starts a new journal folder. No data is lost.
        if Uuid::parse_str(existing).is_ok() {
            return Ok(existing.to_owned());
        }
    }
    let id = Uuid::new_v4().to_string();
    fs::write(&path, &id)?;
    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_device_id_is_created_once_and_then_kept() {
        let dir = tempfile::tempdir().unwrap();
        let first = AppPaths::prepare(dir.path()).unwrap();
        let second = AppPaths::prepare(dir.path()).unwrap();
        assert_eq!(first.journal, second.journal);
        let name = first.journal.file_name().unwrap().to_string_lossy();
        assert!(Uuid::parse_str(&name).is_ok());
    }

    #[test]
    fn the_database_stays_out_of_the_journal_folder() {
        let dir = tempfile::tempdir().unwrap();
        let paths = AppPaths::prepare(dir.path()).unwrap();
        assert!(!paths.database.starts_with(&paths.journal_root));
        assert!(paths.journal.starts_with(&paths.journal_root));
    }

    #[test]
    fn a_damaged_device_id_is_replaced() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("device-id"), "../../elsewhere").unwrap();
        let paths = AppPaths::prepare(dir.path()).unwrap();
        let name = paths.journal.file_name().unwrap().to_string_lossy();
        assert!(Uuid::parse_str(&name).is_ok());
    }
}
