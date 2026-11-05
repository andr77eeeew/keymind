//! User settings. The journal holds the truth as `settings_changed` events, and `settings.json` is
//! only a cache of the result that can be rebuilt from them at any time.

use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;

use crate::journal::event::SettingsChanged;
use crate::journal::{Event, EventBody, JournalError, read_dir};

/// What a wrong key does.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OnError {
    #[default]
    Continue,
    Stop,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BackspacePolicy {
    #[default]
    Allowed,
    Blocked,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Theme {
    Light,
    Dark,
    /// Follows Windows. The UI resolves it, since the webview is what knows the current scheme.
    #[default]
    System,
}

/// How letters open in the adaptive mode (ADR-0010).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LetterPolicy {
    /// By frequency, as the open ones are learned.
    #[default]
    Gradual,
    /// Every letter from the start.
    All,
}

/// Missing keys take their default, so old caches and journals keep working.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub on_error: OnError,
    pub backspace: BackspacePolicy,
    pub theme: Theme,
    /// WPM, accuracy and elapsed time on the typing screen. A time limit always shows.
    pub live_figures: bool,
    /// The first-launch step is done. It needs its own flag, because choosing the value that is
    /// already set writes no event, so the theme alone cannot tell.
    pub theme_chosen: bool,
    pub letters: LetterPolicy,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            on_error: OnError::default(),
            backspace: BackspacePolicy::default(),
            theme: Theme::default(),
            live_figures: true,
            theme_chosen: false,
            letters: LetterPolicy::default(),
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum SettingsError {
    #[error("unknown setting or value: {key} = {value}")]
    Invalid { key: String, value: Value },
    #[error(transparent)]
    Journal(#[from] JournalError),
    #[error("could not encode the settings: {0}")]
    Encode(#[from] serde_json::Error),
    #[error("could not format the current time: {0}")]
    Clock(#[from] time::error::Format),
}

impl Settings {
    /// Returns these settings with one key changed, or `None` if the key or value is not valid.
    pub fn with(&self, key: &str, value: &Value) -> Option<Self> {
        let Ok(Value::Object(mut map)) = serde_json::to_value(self) else {
            return None;
        };
        if !map.contains_key(key) {
            return None;
        }
        map.insert(key.to_owned(), value.clone());
        serde_json::from_value(Value::Object(map)).ok()
    }

    /// Replays changes in time order, so the latest one wins on every key. Changes this version
    /// does not understand are skipped.
    pub fn from_changes(mut changes: Vec<SettingsChanged>) -> Self {
        changes.sort_by(|a, b| a.ts.cmp(&b.ts));
        changes.iter().fold(Self::default(), |settings, change| {
            settings.with(&change.key, &change.new).unwrap_or(settings)
        })
    }

    fn value_of(&self, key: &str) -> Value {
        match serde_json::to_value(self) {
            Ok(Value::Object(map)) => map.get(key).cloned().unwrap_or(Value::Null),
            _ => Value::Null,
        }
    }
}

/// Builds the event for a change. `None` means the value is already set, so nothing has to be
/// journaled.
pub fn change_event(
    current: &Settings,
    key: &str,
    value: &Value,
    now: OffsetDateTime,
) -> Result<Option<(Settings, Event)>, SettingsError> {
    let invalid = || SettingsError::Invalid {
        key: key.to_owned(),
        value: value.clone(),
    };
    let next = current.with(key, value).ok_or_else(invalid)?;
    if next == *current {
        return Ok(None);
    }
    let event = Event::new(EventBody::SettingsChanged(SettingsChanged {
        ts: now.format(&Rfc3339)?,
        key: key.to_owned(),
        old: current.value_of(key),
        new: value.clone(),
    }));
    Ok(Some((next, event)))
}

/// Whether to ask for a theme on this launch: not once it was answered, and not for someone who
/// already has sessions here or from another computer. If the journal cannot be read the answer is
/// no, because a look is no reason to stand in the way.
pub fn asks_for_theme(settings: &Settings, journal_root: &Path) -> bool {
    !settings.theme_chosen && matches!(any_session(journal_root), Ok(false))
}

/// Stops at the first session, and a journal without sessions holds only a few settings events, so
/// this stays short at any journal size.
fn any_session(journal_root: &Path) -> std::io::Result<bool> {
    let devices = match fs::read_dir(journal_root) {
        Ok(devices) => devices,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(error),
    };
    for device in devices {
        let device = device?.path();
        if !device.is_dir() {
            continue;
        }
        for file in fs::read_dir(&device)? {
            let file = file?.path();
            if file.extension().is_some_and(|ext| ext == "jsonl") {
                for line in BufReader::new(fs::File::open(&file)?).split(b'\n') {
                    if contains(&line?, b"\"session_started\"") {
                        return Ok(true);
                    }
                }
            }
        }
    }
    Ok(false)
}

fn contains(line: &[u8], needle: &[u8]) -> bool {
    line.windows(needle.len()).any(|part| part == needle)
}

/// Reads the cache, and rebuilds it from the journal when it is missing or damaged.
pub fn load(cache: &Path, journal_dir: &Path) -> Result<Settings, SettingsError> {
    if let Some(settings) = fs::read(cache)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
    {
        return Ok(settings);
    }
    let mut changes = Vec::new();
    read_dir(journal_dir, &mut |event| {
        if let EventBody::SettingsChanged(change) = event.body {
            changes.push(change);
        }
    })?;
    let settings = Settings::from_changes(changes);
    // The cache only saves time, so a failure to write it changes nothing.
    let _ = save_cache(cache, &settings);
    Ok(settings)
}

/// Writes through a temporary file, so a crash cannot leave half a cache.
pub fn save_cache(cache: &Path, settings: &Settings) -> std::io::Result<()> {
    let mut temporary = PathBuf::from(cache);
    temporary.set_extension("json.tmp");
    fs::write(&temporary, serde_json::to_vec_pretty(settings)?)?;
    fs::rename(&temporary, cache)
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use time::macros::{date, datetime};

    use super::*;
    use crate::journal::JournalWriter;

    fn change(ts: &str, key: &str, new: Value) -> SettingsChanged {
        SettingsChanged {
            ts: ts.to_owned(),
            key: key.to_owned(),
            old: Value::Null,
            new,
        }
    }

    #[test]
    fn the_defaults_are_the_policies_from_the_spec() {
        let settings = Settings::default();
        assert_eq!(settings.on_error, OnError::Continue);
        assert_eq!(settings.backspace, BackspacePolicy::Allowed);
        assert_eq!(settings.theme, Theme::System);
        assert!(settings.live_figures);
        assert!(!settings.theme_chosen);
        assert_eq!(settings.letters, LetterPolicy::Gradual);
    }

    #[test]
    fn with_changes_one_key_and_rejects_nonsense() {
        let settings = Settings::default();
        assert_eq!(
            settings.with("on_error", &json!("stop")).unwrap().on_error,
            OnError::Stop
        );
        assert!(settings.with("on_error", &json!("maybe")).is_none());
        assert!(settings.with("no_such_key", &json!("stop")).is_none());
    }

    #[test]
    fn the_latest_change_wins_regardless_of_file_order() {
        let settings = Settings::from_changes(vec![
            change("2026-11-04T10:00:00Z", "theme", json!("light")),
            change("2026-11-04T09:00:00Z", "theme", json!("dark")),
            change("2026-11-04T09:30:00Z", "on_error", json!("stop")),
        ]);
        assert_eq!(settings.theme, Theme::Light);
        assert_eq!(settings.on_error, OnError::Stop);
    }

    #[test]
    fn a_change_from_a_newer_version_is_skipped() {
        let settings = Settings::from_changes(vec![
            change("2026-11-04T09:00:00Z", "theme", json!("dark")),
            change("2026-11-04T10:00:00Z", "theme", json!("solarized")),
            change("2026-11-04T10:00:00Z", "sparkles", json!(true)),
        ]);
        assert_eq!(settings.theme, Theme::Dark);
    }

    #[test]
    fn the_system_theme_is_a_valid_value() {
        let settings = Settings::default().with("theme", &json!("system")).unwrap();
        assert_eq!(settings.theme, Theme::System);
        assert_eq!(settings.value_of("theme"), json!("system"));
    }

    #[test]
    fn a_change_event_records_old_and_new_and_a_noop_records_nothing() {
        let now = datetime!(2026-11-04 12:00 UTC);
        let (next, event) = change_event(&Settings::default(), "theme", &json!("dark"), now)
            .unwrap()
            .unwrap();
        assert_eq!(next.theme, Theme::Dark);
        let EventBody::SettingsChanged(body) = event.body else {
            panic!("wrong event type");
        };
        assert_eq!(body.old, json!("system"));
        assert_eq!(body.new, json!("dark"));
        assert_eq!(body.ts, "2026-11-04T12:00:00Z");

        assert!(
            change_event(&Settings::default(), "theme", &json!("system"), now)
                .unwrap()
                .is_none()
        );
        assert!(change_event(&Settings::default(), "theme", &json!(3), now).is_err());
    }

    #[test]
    fn without_a_cache_the_settings_are_rebuilt_from_the_journal() {
        let dir = tempfile::tempdir().unwrap();
        let journal = dir.path().join("journal");
        let cache = dir.path().join("settings.json");
        let now = datetime!(2026-11-04 12:00 UTC);
        let (_, event) = change_event(&Settings::default(), "on_error", &json!("stop"), now)
            .unwrap()
            .unwrap();
        JournalWriter::new(&journal)
            .append(date!(2026 - 11 - 04), &[event])
            .unwrap();

        let rebuilt = load(&cache, &journal).unwrap();
        assert_eq!(rebuilt.on_error, OnError::Stop);
        assert!(cache.exists(), "the rebuild writes the cache");

        // A damaged cache takes the same way back.
        fs::write(&cache, b"{broken").unwrap();
        assert_eq!(load(&cache, &journal).unwrap().on_error, OnError::Stop);
    }

    #[test]
    fn the_theme_is_asked_for_until_answered_and_only_without_sessions() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("journal");
        let settings = Settings::default();
        assert!(asks_for_theme(&settings, &root), "no journal yet");

        let device = root.join("device-a");
        fs::create_dir_all(&device).unwrap();
        fs::write(
            device.join("2026-11-05.jsonl"),
            "{\"type\":\"settings_changed\"}\n",
        )
        .unwrap();
        assert!(asks_for_theme(&settings, &root), "only settings so far");

        let answered = Settings {
            theme_chosen: true,
            ..settings
        };
        assert!(!asks_for_theme(&answered, &root));

        let other = root.join("device-b");
        fs::create_dir_all(&other).unwrap();
        fs::write(
            other.join("2026-11-05.jsonl"),
            "{\"type\":\"session_started\"}\n",
        )
        .unwrap();
        assert!(!asks_for_theme(&settings, &root), "another computer counts");
    }

    #[test]
    fn a_missing_key_in_the_cache_takes_its_default() {
        let dir = tempfile::tempdir().unwrap();
        let cache = dir.path().join("settings.json");
        fs::write(&cache, br#"{"theme":"dark"}"#).unwrap();
        let settings = load(&cache, &dir.path().join("journal")).unwrap();
        assert_eq!(settings.theme, Theme::Dark);
        assert_eq!(settings.on_error, OnError::Continue);
    }
}
