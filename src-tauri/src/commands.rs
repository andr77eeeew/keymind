//! Thin Tauri commands. They translate between the UI bridge and pure logic and hold no logic of
//! their own. Anything that touches the disk runs on a blocking thread, so a slow disk can never
//! hold up the UI.

use std::sync::Mutex;

use serde::{Serialize, Serializer};
use serde_json::Value;
use tauri::State;
use tauri::ipc::{InvokeBody, Request};
use time::OffsetDateTime;

use crate::brain::heuristic::{Choice, Knowledge, choose};
use crate::brain::model::day_number;
use crate::brain::session::{AdaptiveSession, next_session};
use crate::generator::{self, ContentError, ContentStore, Passage};
use crate::imports::{ImportError, ImportedText, Library, Normalized, normalize_text};
use crate::journal::{Event, EventBody, JournalService, ServiceError};
use crate::projector::queries::{self, LastSetup, SessionRow, StatsOverview};
use crate::projector::{ProjectorError, ProjectorService, ProjectorStatus};
use crate::settings::{self, LetterPolicy, Settings, SettingsError};
use crate::stats::SessionSummary;
use crate::storage::AppPaths;

/// Everything the commands share.
pub struct AppState {
    pub paths: AppPaths,
    pub journal: JournalService,
    pub projector: ProjectorService,
    pub content: std::sync::Arc<ContentStore>,
    pub settings: std::sync::Arc<Mutex<Settings>>,
}

/// Every command error reaches the UI as a plain sentence.
#[derive(Debug, thiserror::Error)]
pub enum CommandError {
    #[error(transparent)]
    Journal(#[from] ServiceError),
    #[error(transparent)]
    Content(#[from] ContentError),
    #[error(transparent)]
    Import(#[from] ImportError),
    #[error(transparent)]
    Settings(#[from] SettingsError),
    #[error(transparent)]
    Projector(#[from] ProjectorError),
    #[error("the built-in content has no passage of that difficulty")]
    NoPassage,
    #[error("the settings are unavailable because an earlier change failed")]
    SettingsLocked,
    #[error("not a local date: {0}")]
    BadDate(String),
    #[error("the file could not be read: {0}")]
    BadRequest(&'static str),
    #[error("a background task failed: {0}")]
    Task(#[from] tauri::Error),
}

impl Serialize for CommandError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

async fn blocking<T, F>(work: F) -> Result<T, CommandError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, CommandError> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work).await?
}

/// Basic facts about the running core, also used by the UI as an IPC health check.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AppInfo {
    pub name: &'static str,
    pub version: &'static str,
}

fn current_app_info() -> AppInfo {
    AppInfo {
        name: env!("CARGO_PKG_NAME"),
        version: env!("CARGO_PKG_VERSION"),
    }
}

#[tauri::command]
pub fn app_info() -> AppInfo {
    current_app_info()
}

#[tauri::command]
pub async fn append_events(
    state: State<'_, AppState>,
    events: Vec<Event>,
) -> Result<(), CommandError> {
    let journal = state.journal.clone();
    let projector = state.projector.clone();
    blocking(move || {
        let ended = ends_a_session(&events);
        journal.append(events)?;
        // Only after the end of a session, so that nothing runs while the user types.
        if ended {
            projector.request_catch_up();
        }
        Ok(())
    })
    .await
}

fn ends_a_session(events: &[Event]) -> bool {
    events
        .iter()
        .any(|event| matches!(event.body, EventBody::SessionEnded(_)))
}

#[tauri::command]
pub async fn session_summary(
    state: State<'_, AppState>,
    sid: String,
) -> Result<Option<SessionSummary>, CommandError> {
    let journal = state.journal.clone();
    blocking(move || Ok(journal.take_summary(sid)?)).await
}

#[tauri::command]
pub fn stats_status(state: State<'_, AppState>) -> Result<ProjectorStatus, CommandError> {
    Ok(state.projector.status()?)
}

/// `from_date` is the local `YYYY-MM-DD` the period starts on, or nothing for all time.
#[tauri::command]
pub async fn stats_overview(
    state: State<'_, AppState>,
    from_date: Option<String>,
) -> Result<StatsOverview, CommandError> {
    let projector = state.projector.clone();
    blocking(move || {
        Ok(projector.read(|connection| queries::overview(connection, from_date.as_deref()))?)
    })
    .await
}

/// One saved session, which the tables open as a summary.
#[tauri::command]
pub async fn stats_session(
    state: State<'_, AppState>,
    sid: String,
) -> Result<Option<SessionRow>, CommandError> {
    let projector = state.projector.clone();
    blocking(move || Ok(projector.read(|connection| queries::session(connection, &sid))?)).await
}

#[tauri::command]
pub async fn last_setups(state: State<'_, AppState>) -> Result<Vec<LastSetup>, CommandError> {
    let projector = state.projector.clone();
    let device = state.paths.device.clone();
    blocking(move || Ok(projector.read(|connection| queries::last_setups(connection, &device))?))
        .await
}

/// Returns at once. The UI follows the rebuild through `stats-status` events.
#[tauri::command]
pub fn rebuild_stats(state: State<'_, AppState>) {
    state.projector.request_rebuild();
}

/// Whether the first-launch step comes before Home.
#[tauri::command]
pub async fn asks_for_theme(state: State<'_, AppState>) -> Result<bool, CommandError> {
    let settings = *state
        .settings
        .lock()
        .map_err(|_| CommandError::SettingsLocked)?;
    let root = state.paths.journal_root.clone();
    blocking(move || Ok(settings::asks_for_theme(&settings, &root))).await
}

#[tauri::command]
pub async fn generate_words(
    state: State<'_, AppState>,
    pool: u32,
    count: u32,
    seed: u32,
) -> Result<String, CommandError> {
    let content = state.content.clone();
    blocking(move || {
        let words = content.words()?;
        Ok(generator::generate_words(
            &words,
            pool as usize,
            count as usize,
            seed,
        ))
    })
    .await
}

/// What the brain knows, or nothing while the statistics are not readable. Typing must never
/// wait for them, and letters never close, because every recipe adds its letters back.
fn knowledge_or_nothing(projector: &ProjectorService) -> (Knowledge, bool) {
    match projector
        .read(|connection| crate::projector::model::knowledge(connection, crate::brain::LAYOUT))
    {
        Ok(knowledge) => (knowledge, true),
        Err(_) => (Knowledge::default(), false),
    }
}

/// The next adaptive session, with its recipe for the journal.
#[derive(Serialize)]
pub struct AdaptivePlan {
    #[serde(flatten)]
    pub session: AdaptiveSession,
    /// False when the statistics could not be read and the brain started from nothing.
    pub informed: bool,
}

/// `today` is the local `YYYY-MM-DD`, which the UI knows.
#[tauri::command]
pub async fn next_adaptive(
    state: State<'_, AppState>,
    seed: u32,
    today: String,
) -> Result<AdaptivePlan, CommandError> {
    let day = day_number(&today).ok_or(CommandError::BadDate(today))?;
    let gradual = letters_gradual(&state)?;
    let content = state.content.clone();
    let projector = state.projector.clone();
    blocking(move || {
        let (knowledge, informed) = knowledge_or_nothing(&projector);
        let (order, words, chain) = (content.letter_order()?, content.words()?, content.chain()?);
        let session = next_session(&order, &knowledge, day, gradual, &words, &chain, seed);
        Ok(AdaptivePlan { session, informed })
    })
    .await
}

/// What the next adaptive session would work on, without its text.
#[tauri::command]
pub async fn brain_next(state: State<'_, AppState>, today: String) -> Result<Choice, CommandError> {
    let day = day_number(&today).ok_or(CommandError::BadDate(today))?;
    let gradual = letters_gradual(&state)?;
    let content = state.content.clone();
    let projector = state.projector.clone();
    blocking(move || {
        let (knowledge, _) = knowledge_or_nothing(&projector);
        Ok(choose(&content.letter_order()?, &knowledge, day, gradual))
    })
    .await
}

fn letters_gradual(state: &State<'_, AppState>) -> Result<bool, CommandError> {
    let settings = *state
        .settings
        .lock()
        .map_err(|_| CommandError::SettingsLocked)?;
    Ok(settings.letters == LetterPolicy::Gradual)
}

#[tauri::command]
pub async fn pick_passage(
    state: State<'_, AppState>,
    difficulty: Option<u8>,
    seed: u32,
) -> Result<Passage, CommandError> {
    let content = state.content.clone();
    blocking(move || {
        let passages = content.passages()?;
        generator::pick_passage(&passages, difficulty, seed)
            .cloned()
            .ok_or(CommandError::NoPassage)
    })
    .await
}

/// A pasted text goes through the same cleaning as an imported one.
#[derive(Serialize)]
pub struct CleanText {
    pub text: String,
    pub removed: usize,
}

#[tauri::command(async)]
pub fn clean_text(text: String) -> CleanText {
    let Normalized { text, removed } = normalize_text(&text);
    CleanText { text, removed }
}

#[tauri::command]
pub async fn import_file(
    state: State<'_, AppState>,
    request: Request<'_>,
) -> Result<ImportedText, CommandError> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(CommandError::BadRequest("the body is not raw bytes"));
    };
    // The UI encodes the name, because a header can only carry ASCII.
    let file_name = request
        .headers()
        .get("x-file-name")
        .and_then(|value| value.to_str().ok())
        .map(decode_header)
        .ok_or(CommandError::BadRequest("the file name is missing"))?;
    let bytes = bytes.clone();
    let directory = state.paths.imports.clone();
    blocking(move || Ok(Library::new(directory).add(&file_name, &bytes)?)).await
}

/// Decodes the UI's `encodeURIComponent`.
fn decode_header(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%'
            && let Some(byte) = value
                .get(i + 1..i + 3)
                .and_then(|hex| u8::from_str_radix(hex, 16).ok())
        {
            out.push(byte);
            i += 3;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[tauri::command]
pub async fn list_imports(state: State<'_, AppState>) -> Result<Vec<ImportedText>, CommandError> {
    let directory = state.paths.imports.clone();
    blocking(move || Ok(Library::new(directory).list()?)).await
}

#[tauri::command]
pub async fn load_import(state: State<'_, AppState>, id: String) -> Result<String, CommandError> {
    let directory = state.paths.imports.clone();
    blocking(move || Ok(Library::new(directory).load(&id)?)).await
}

#[tauri::command]
pub async fn save_import_offset(
    state: State<'_, AppState>,
    id: String,
    offset: u64,
) -> Result<(), CommandError> {
    let directory = state.paths.imports.clone();
    blocking(move || Ok(Library::new(directory).set_offset(&id, offset)?)).await
}

#[tauri::command]
pub async fn delete_import(state: State<'_, AppState>, id: String) -> Result<(), CommandError> {
    let directory = state.paths.imports.clone();
    blocking(move || Ok(Library::new(directory).remove(&id)?)).await
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<Settings, CommandError> {
    state
        .settings
        .lock()
        .map(|settings| *settings)
        .map_err(|_| CommandError::SettingsLocked)
}

/// Journals the change first. If that fails, the setting stays as it was.
#[tauri::command]
pub async fn set_setting(
    state: State<'_, AppState>,
    key: String,
    value: Value,
) -> Result<Settings, CommandError> {
    let journal = state.journal.clone();
    let shared = state.settings.clone();
    let cache = state.paths.settings_cache.clone();
    blocking(move || {
        let mut current = shared.lock().map_err(|_| CommandError::SettingsLocked)?;
        let now = OffsetDateTime::now_utc();
        let Some((next, event)) = settings::change_event(&current, &key, &value, now)? else {
            return Ok(*current);
        };
        journal.append(vec![event])?;
        *current = next;
        // The cache only saves time at the next start, so a failure here changes nothing.
        let _ = settings::save_cache(&cache, &next);
        Ok(next)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_info_reports_the_package_metadata() {
        let info = current_app_info();

        assert_eq!(info.name, "keymind");
        assert_eq!(info.version, env!("CARGO_PKG_VERSION"));
    }

    #[test]
    fn only_a_batch_with_a_session_end_starts_the_projector() {
        let line = |json: &str| serde_json::from_str::<Event>(json).unwrap();
        let press = line(
            r#"{"v":1,"type":"keystroke","sid":"s","seq":1,"t":0.0,"kind":"char","code":"KeyA"}"#,
        );
        let end = line(
            r#"{"v":1,"type":"session_ended","sid":"s","seq":2,"t":0.0,"reason":"aborted","duration":0.0}"#,
        );
        assert!(!ends_a_session(std::slice::from_ref(&press)));
        assert!(ends_a_session(&[press, end]));
    }

    #[test]
    fn a_header_file_name_decodes_back() {
        assert_eq!(
            decode_header("%D0%BA%D0%BD%D0%B8%D0%B3%D0%B0%20one.epub"),
            "\u{043A}\u{043D}\u{0438}\u{0433}\u{0430} one.epub"
        );
        assert_eq!(decode_header("plain.txt"), "plain.txt");
        assert_eq!(decode_header("100%.txt"), "100%.txt");
    }
}
