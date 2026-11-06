use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::mpsc;
use std::time::Duration;

use super::queries::{self, dump, overview};
use super::*;
use crate::journal::event::{KeyKind, Keystroke, SessionEnded, SessionStarted, TextSource};
use crate::journal::{Event, EventBody, JournalService};

fn golden_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/golden")
}

fn golden_cases() -> Vec<PathBuf> {
    let mut cases: Vec<_> = fs::read_dir(golden_root())
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .filter(|path| path.is_dir())
        .collect();
    cases.sort();
    assert!(cases.len() >= 9, "golden cases are missing");
    cases
}

/// Every journal file of a case, in the order the projector reads them, as (relative path, bytes).
fn case_files(case: &Path) -> Vec<(PathBuf, Vec<u8>)> {
    let mut found = Vec::new();
    for device in fs::read_dir(case).unwrap() {
        let device = device.unwrap().path();
        if !device.is_dir() {
            continue;
        }
        for file in fs::read_dir(&device).unwrap() {
            let file = file.unwrap().path();
            let relative = file.strip_prefix(case).unwrap().to_path_buf();
            found.push((relative, fs::read(&file).unwrap()));
        }
    }
    found.sort();
    found
}

fn catch_up(database: &Path, journal: &Path, chunk_bytes: usize) -> String {
    let (projector, _) = Projector::open(database, journal, false).unwrap();
    let mut projector = projector.with_chunk_bytes(chunk_bytes);
    projector.catch_up(&mut |_| {}).unwrap();
    dump(projector.connection())
}

fn one_pass(files: &[(PathBuf, Vec<u8>)]) -> String {
    let dir = tempfile::tempdir().unwrap();
    let journal = dir.path().join("journal");
    write_files(&journal, files);
    catch_up(&dir.path().join("derived.sqlite"), &journal, CHUNK_BYTES)
}

fn write_files(journal: &Path, files: &[(PathBuf, Vec<u8>)]) {
    for (relative, bytes) in files {
        let path = journal.join(relative);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, bytes).unwrap();
    }
}

/// The files as they looked when only the first `cut` bytes of the whole journal were written.
fn prefix(files: &[(PathBuf, Vec<u8>)], cut: usize) -> Vec<(PathBuf, Vec<u8>)> {
    let mut left = cut;
    let mut out = Vec::new();
    for (relative, bytes) in files {
        if left == 0 {
            break;
        }
        let take = left.min(bytes.len());
        out.push((relative.clone(), bytes[..take].to_vec()));
        left -= take;
    }
    out
}

/// Every line end, plus the middle of every line, which is what a read during a write can see.
fn cut_points(files: &[(PathBuf, Vec<u8>)]) -> Vec<usize> {
    let mut cuts = Vec::new();
    let mut base = 0;
    let mut previous_end = 0;
    for (_, bytes) in files {
        for (index, byte) in bytes.iter().enumerate() {
            if *byte == b'\n' {
                let end = base + index + 1;
                cuts.push(previous_end + (end - previous_end) / 2);
                cuts.push(end);
                previous_end = end;
            }
        }
        base += bytes.len();
    }
    cuts
}

// ---- Golden files -----------------------------------------------------------------------------

#[test]
fn each_golden_journal_gives_the_expected_tables() {
    let update = std::env::var_os("UPDATE_GOLDEN").is_some();
    for case in golden_cases() {
        let actual = one_pass(&case_files(&case));
        let expected_path = case.join("expected.txt");
        if update {
            fs::write(&expected_path, &actual).unwrap();
            continue;
        }
        let expected = fs::read_to_string(&expected_path).unwrap();
        assert_eq!(actual, expected, "case {}", case.display());
    }
}

/// The main invariant of ADR-0008: it does not matter where a catch-up stopped.
#[test]
fn a_catch_up_cut_anywhere_gives_the_same_tables_as_one_pass() {
    for case in golden_cases() {
        let files = case_files(&case);
        let whole = one_pass(&files);
        for cut in cut_points(&files) {
            let dir = tempfile::tempdir().unwrap();
            let journal = dir.path().join("journal");
            let database = dir.path().join("derived.sqlite");

            write_files(&journal, &prefix(&files, cut));
            catch_up(&database, &journal, CHUNK_BYTES);

            write_files(&journal, &files);
            let resumed = catch_up(&database, &journal, CHUNK_BYTES);
            assert_eq!(resumed, whole, "case {} cut at {cut}", case.display());
        }
    }
}

#[test]
fn chunk_size_changes_nothing() {
    for case in golden_cases() {
        let files = case_files(&case);
        let whole = one_pass(&files);
        for chunk_bytes in [1, 50, 300] {
            let dir = tempfile::tempdir().unwrap();
            let journal = dir.path().join("journal");
            write_files(&journal, &files);
            let database = dir.path().join("derived.sqlite");
            let dumped = catch_up(&database, &journal, chunk_bytes);
            assert_eq!(dumped, whole, "case {} chunk {chunk_bytes}", case.display());
        }
    }
}

#[test]
fn a_rebuild_gives_the_same_tables_byte_for_byte() {
    for case in golden_cases() {
        let files = case_files(&case);
        let dir = tempfile::tempdir().unwrap();
        let journal = dir.path().join("journal");
        write_files(&journal, &files);
        let database = dir.path().join("derived.sqlite");
        let first = catch_up(&database, &journal, CHUNK_BYTES);
        let (projector, created) = Projector::open(&database, &journal, true).unwrap();
        assert!(created);
        drop(projector);
        assert_eq!(catch_up(&database, &journal, CHUNK_BYTES), first);
    }
}

#[test]
fn a_journal_arriving_from_another_device_later_changes_nothing() {
    let files = case_files(&golden_root().join("two_devices"));
    let whole = one_pass(&files);

    let dir = tempfile::tempdir().unwrap();
    let journal = dir.path().join("journal");
    let database = dir.path().join("derived.sqlite");
    // The second device first, which is the opposite of the order of a rebuild.
    write_files(&journal, &files[1..]);
    catch_up(&database, &journal, CHUNK_BYTES);
    write_files(&journal, &files[..1]);
    assert_eq!(catch_up(&database, &journal, CHUNK_BYTES), whole);
}

// ---- Numbers worked out by hand ---------------------------------------------------------------

fn golden_overview(case: &str) -> queries::StatsOverview {
    let dir = tempfile::tempdir().unwrap();
    let journal = dir.path().join("journal");
    write_files(&journal, &case_files(&golden_root().join(case)));
    let (mut projector, _) =
        Projector::open(&dir.path().join("derived.sqlite"), &journal, false).unwrap();
    projector.catch_up(&mut |_| {}).unwrap();
    overview(projector.connection(), None).unwrap()
}

/// `(presses, samples, mean_ms, errors)`
fn key(stats: &queries::StatsOverview, code: &str) -> (i64, i64, Option<f64>, i64) {
    let row = stats
        .keys
        .iter()
        .find(|row| row.code == code)
        .unwrap_or_else(|| panic!("no row for {code}"));
    (row.presses, row.samples, row.mean_ms, row.errors)
}

fn bigram(
    stats: &queries::StatsOverview,
    first: &str,
    second: &str,
) -> (i64, i64, Option<f64>, i64) {
    let row = stats
        .bigrams
        .iter()
        .find(|row| row.first == first && row.second == second)
        .unwrap_or_else(|| panic!("no row for {first}{second}"));
    (row.presses, row.samples, row.mean_ms, row.errors)
}

fn has_key(stats: &queries::StatsOverview, code: &str) -> bool {
    stats.keys.iter().any(|row| row.code == code)
}

#[test]
fn a_wrong_press_counts_against_the_expected_key_and_breaks_the_timing() {
    // t h [r for e] space a, at 0, 150, 300, 500, 640.
    let stats = golden_overview("words");
    assert_eq!(key(&stats, "KeyT"), (1, 0, None, 0));
    assert_eq!(key(&stats, "KeyH"), (1, 1, Some(150.0), 0));
    assert_eq!(key(&stats, "KeyE"), (1, 0, None, 1));
    assert!(
        !has_key(&stats, "KeyR"),
        "the key pressed by mistake is not to blame"
    );
    assert_eq!(key(&stats, "Space"), (1, 0, None, 0));
    assert_eq!(key(&stats, "KeyA"), (1, 1, Some(140.0), 0));

    assert_eq!(bigram(&stats, "t", "h"), (1, 1, Some(150.0), 0));
    assert_eq!(bigram(&stats, "h", "e"), (1, 0, None, 1));
    assert_eq!(bigram(&stats, " ", "a"), (1, 1, Some(140.0), 0));
    assert_eq!(stats.bigrams.len(), 3, "e then space follows a wrong press");

    let day = &stats.days[0];
    assert_eq!(day.sessions, 1);
    assert_eq!(day.duration_ms, 640.0);
    assert_eq!(day.wpm, Some(75.0));
    assert_eq!(day.accuracy, Some(80.0));
}

#[test]
fn a_modifier_does_not_break_the_timing_and_capitals_keep_their_case() {
    let stats = golden_overview("texts");
    assert_eq!(key(&stats, "KeyH"), (1, 1, Some(120.0), 0));
    assert_eq!(key(&stats, "KeyI"), (1, 1, Some(180.0), 0));
    assert!(!has_key(&stats, "ShiftRight"));
    assert_eq!(bigram(&stats, "h", "I"), (1, 1, Some(180.0), 0));
}

#[test]
fn zen_counts_key_times_but_stays_out_of_the_trends() {
    let stats = golden_overview("zen");
    assert_eq!(key(&stats, "KeyB"), (1, 1, Some(100.0), 0));
    assert_eq!(key(&stats, "KeyC"), (1, 1, Some(150.0), 0));
    assert_eq!(key(&stats, "KeyD"), (1, 0, None, 0), "follows a Backspace");
    assert_eq!(key(&stats, "KeyE"), (1, 1, Some(100.0), 0));
    assert_eq!(bigram(&stats, "a", "b"), (1, 1, Some(100.0), 0));
    assert_eq!(bigram(&stats, "d", "e"), (1, 1, Some(100.0), 0));
    assert_eq!(stats.bigrams.len(), 3, "nothing crosses the Backspace");

    let day = &stats.days[0];
    assert_eq!(day.sessions, 1);
    assert_eq!(day.duration_ms, 500.0);
    assert_eq!((day.wpm, day.accuracy, day.rhythm), (None, None, None));
}

#[test]
fn a_pause_a_correction_and_a_long_gap_each_leave_the_timing() {
    let stats = golden_overview("breaks");
    assert_eq!(key(&stats, "KeyB"), (1, 1, Some(100.0), 0));
    assert_eq!(key(&stats, "KeyC"), (1, 0, None, 0), "follows a pause");
    assert_eq!(key(&stats, "KeyD"), (1, 1, Some(100.0), 0));
    assert_eq!(
        key(&stats, "KeyE"),
        (1, 1, Some(100.0), 0),
        "an ignored press changes nothing"
    );
    assert_eq!(
        key(&stats, "KeyF"),
        (2, 0, None, 1),
        "wrong, then corrected"
    );
    assert_eq!(
        key(&stats, "KeyG"),
        (1, 0, None, 0),
        "the gap is over the limit"
    );

    assert!(
        stats.bigrams.iter().all(|row| row.first != "b"),
        "a pause breaks a transition"
    );
    assert_eq!(bigram(&stats, "e", "f"), (1, 0, None, 1));
    assert_eq!(
        bigram(&stats, "f", "g"),
        (1, 0, None, 0),
        "the long gap has no time"
    );
}

#[test]
fn stop_mode_counts_every_wrong_press_on_the_key_and_one_on_the_transition() {
    let stats = golden_overview("stop_on_error");
    assert_eq!(key(&stats, "KeyB"), (3, 0, None, 2));
    assert_eq!(key(&stats, "KeyC"), (1, 1, Some(100.0), 0));
    assert_eq!(bigram(&stats, "a", "b"), (1, 0, None, 1));
    assert_eq!(bigram(&stats, "b", "c"), (1, 1, Some(100.0), 0));
}

#[test]
fn damage_is_counted_and_a_session_stays_on_the_day_it_started() {
    let stats = golden_overview("damage");
    assert_eq!(stats.skipped.duplicates, 2);
    assert_eq!(stats.skipped.bad_lines, 1);
    assert_eq!(stats.days.len(), 1);
    assert_eq!(stats.days[0].date, "2026-11-06");
    assert_eq!(key(&stats, "KeyC"), (1, 1, Some(200.0), 0));
    assert_eq!(stats.recent[0].reason.as_deref(), Some("completed"));
}

#[test]
fn two_devices_add_up_exactly() {
    let stats = golden_overview("two_devices");
    assert_eq!(key(&stats, "KeyB"), (2, 2, Some(150.0), 0));
    let day = &stats.days[0];
    assert_eq!(day.sessions, 2);
    assert_eq!(day.duration_ms, 300.0);
    // 4 correct characters over 300 ms, from the sums and not from the mean of two session speeds.
    assert_eq!(day.wpm, Some(4.0 / (300.0 / 60_000.0) / 5.0));
    // Instants decide, not the clock on the wall: 08:30+01:00 comes after 09:00+02:00.
    assert_eq!(stats.recent[0].sid, "b1");
}

#[test]
fn an_interrupted_session_stays_without_a_reason() {
    let stats = golden_overview("aborted");
    let row = |sid: &str| stats.recent.iter().find(|row| row.sid == sid).unwrap();
    assert_eq!(row("k1").reason, None);
    assert_eq!(row("k1").chars, 2);
    assert_eq!(row("k2").reason.as_deref(), Some("aborted"));
    assert_eq!(key(&stats, "KeyB"), (1, 1, Some(100.0), 0));
}

#[test]
fn a_saved_session_reads_back_with_its_source() {
    let stats = golden_overview("aborted");
    let row = stats.recent.iter().find(|row| row.sid == "k2").unwrap();
    assert!(row.source.get("kind").is_some());
    assert!(stats.bigrams.iter().all(|row| row.last_date.len() == 10));
}

#[test]
fn what_this_version_cannot_use_changes_no_number() {
    let stats = golden_overview("unknown_lines");
    assert_eq!(stats.skipped.unknown, 1);
    assert_eq!(stats.skipped.bad_lines, 1);
    // A press with no start, a press after the end, a start with a bad time and its press.
    assert_eq!(stats.skipped.orphans, 4);
    assert_eq!(stats.recent.len(), 1);
    assert_eq!(key(&stats, "KeyB"), (1, 1, Some(100.0), 0));
    assert!(
        !has_key(&stats, "KeyC"),
        "the press after the end does not count"
    );
    assert!(
        !has_key(&stats, "KeyZ"),
        "the press of a lost session does not count"
    );
}

// ---- Agreement with the summary screen --------------------------------------------------------

fn start_event(sid: &str, ts: &str, mode: &str, source: TextSource) -> Event {
    Event::new(EventBody::SessionStarted(SessionStarted {
        sid: sid.to_owned(),
        seq: 1,
        ts: ts.to_owned(),
        mode: mode.to_owned(),
        layout: "en-qwerty".to_owned(),
        source,
        settings: serde_json::json!({}),
        app: "0.1.0".to_owned(),
    }))
}

fn press_event(sid: &str, seq: u64, t: f64, pos: u64, correct: bool) -> Event {
    Event::new(EventBody::Keystroke(Keystroke {
        sid: sid.to_owned(),
        seq,
        t,
        kind: KeyKind::Char,
        code: "KeyA".to_owned(),
        key: Some(if correct { "a" } else { "s" }.to_owned()),
        expected: Some("a".to_owned()),
        correct: Some(correct),
        pos: Some(pos),
        mods: Vec::new(),
        ignored: None,
    }))
}

fn end_event(sid: &str, seq: u64, t: f64, reason: &str) -> Event {
    Event::new(EventBody::SessionEnded(SessionEnded {
        sid: sid.to_owned(),
        seq,
        t,
        reason: reason.to_owned(),
        duration: t,
    }))
}

/// A session of `count` presses spaced `step` ms apart.
fn session(sid: &str, ts: &str, count: u64, step: f64, reason: &str) -> Vec<Event> {
    let words = TextSource::Words {
        seed: 1,
        pool: 1000,
        count: Some(10),
        seconds: None,
    };
    let mut events = vec![start_event(sid, ts, "words", words)];
    for i in 0..count {
        events.push(press_event(sid, i + 2, i as f64 * step, i, i % 11 != 3));
    }
    events.push(end_event(sid, count + 2, count as f64 * step, reason));
    events
}

#[test]
fn a_session_row_equals_the_summary_on_the_same_journal() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("journal");
    let service = JournalService::start(root.join("dev-a")).unwrap();
    service
        .append(session(
            "s",
            "2026-11-05T10:00:00+02:00",
            40,
            137.3,
            "completed",
        ))
        .unwrap();
    let summary = service.take_summary("s".to_owned()).unwrap().unwrap();

    let (mut projector, _) = Projector::open(&dir.path().join("d.sqlite"), &root, false).unwrap();
    projector.catch_up(&mut |_| {}).unwrap();
    let stats = overview(projector.connection(), None).unwrap();
    let row = &stats.recent[0];

    assert_eq!(row.sid, summary.sid);
    assert_eq!(row.reason, summary.reason);
    assert_eq!(row.duration_ms, summary.duration_ms);
    assert_eq!(row.chars.cast_unsigned(), summary.chars);
    assert_eq!(row.correct.cast_unsigned(), summary.correct);
    assert_eq!(row.backspaces.cast_unsigned(), summary.backspaces);
    assert_eq!(row.cpm, summary.cpm);
    assert_eq!(row.wpm, summary.wpm);
    assert_eq!(row.accuracy, summary.accuracy);
    assert_eq!(row.rhythm, summary.rhythm);
}

// ---- Queries ----------------------------------------------------------------------------------

fn project(root: &Path, device: &str, day: &str, events: &[Event]) {
    let folder = root.join(device);
    fs::create_dir_all(&folder).unwrap();
    let mut text = String::new();
    for event in events {
        text.push_str(&serde_json::to_string(event).unwrap());
        text.push('\n');
    }
    fs::write(folder.join(format!("{day}.jsonl")), text).unwrap();
}

#[test]
fn a_day_uses_exact_sums_and_rhythm_is_weighted_by_characters() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("journal");
    let mut events = session("long", "2026-11-05T10:00:00+02:00", 100, 100.0, "completed");
    events.extend(session(
        "short",
        "2026-11-05T11:00:00+02:00",
        5,
        400.0,
        "completed",
    ));
    project(&root, "dev-a", "2026-11-05", &events);

    let (mut projector, _) = Projector::open(&dir.path().join("d.sqlite"), &root, false).unwrap();
    projector.catch_up(&mut |_| {}).unwrap();
    let stats = overview(projector.connection(), None).unwrap();
    let day = &stats.days[0];

    let row = |sid: &str| stats.recent.iter().find(|row| row.sid == sid).unwrap();
    let (long, short) = (row("long"), row("short"));
    let correct = (long.correct + short.correct) as f64;
    let minutes = (long.duration_ms + short.duration_ms) / 60_000.0;
    assert_eq!(day.wpm, Some(correct / minutes / 5.0));
    assert_ne!(day.wpm, Some((long.wpm + short.wpm) / 2.0));

    let weighted =
        long.rhythm.unwrap() * long.chars as f64 + short.rhythm.unwrap() * short.chars as f64;
    let expected = weighted / (long.chars + short.chars) as f64;
    assert!((day.rhythm.unwrap() - expected).abs() < 1e-9);
}

#[test]
fn a_period_starts_on_its_date_and_records_ignore_it() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("journal");
    project(
        &root,
        "dev-a",
        "2026-11-01",
        &session("old", "2026-11-01T10:00:00+02:00", 150, 100.0, "completed"),
    );
    project(
        &root,
        "dev-a",
        "2026-11-05",
        &session("new", "2026-11-05T10:00:00+02:00", 150, 200.0, "completed"),
    );
    let (mut projector, _) = Projector::open(&dir.path().join("d.sqlite"), &root, false).unwrap();
    projector.catch_up(&mut |_| {}).unwrap();

    let all = overview(projector.connection(), None).unwrap();
    assert_eq!(all.days.len(), 2);
    let recent = overview(projector.connection(), Some("2026-11-05")).unwrap();
    assert_eq!(recent.days.len(), 1);
    assert_eq!(recent.days[0].date, "2026-11-05");
    assert_eq!(recent.keys[0].presses, 150);
    assert_eq!(recent.records.best_wpm.as_ref().unwrap().sid, "old");
}

#[test]
fn a_record_needs_a_completed_session_of_a_hundred_correct_characters() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("journal");
    let mut events = session("short", "2026-11-05T10:00:00+02:00", 50, 10.0, "completed");
    events.extend(session(
        "left",
        "2026-11-05T11:00:00+02:00",
        200,
        10.0,
        "aborted",
    ));
    project(&root, "dev-a", "2026-11-05", &events);
    let (mut projector, _) = Projector::open(&dir.path().join("d.sqlite"), &root, false).unwrap();
    projector.catch_up(&mut |_| {}).unwrap();
    let stats = overview(projector.connection(), None).unwrap();
    assert_eq!(stats.records.best_wpm, None);
    assert_eq!(stats.records.best_accuracy, None);

    project(
        &root,
        "dev-a",
        "2026-11-06",
        &session("good", "2026-11-06T10:00:00+02:00", 200, 150.0, "completed"),
    );
    projector.catch_up(&mut |_| {}).unwrap();
    let stats = overview(projector.connection(), None).unwrap();
    assert_eq!(stats.records.best_wpm.as_ref().unwrap().sid, "good");
    assert_eq!(stats.records.best_accuracy.as_ref().unwrap().sid, "good");
}

#[test]
fn the_last_setup_of_each_mode_knows_its_device() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("journal");
    let words = |seed| TextSource::Words {
        seed,
        pool: 1000,
        count: Some(25),
        seconds: None,
    };
    project(
        &root,
        "dev-a",
        "2026-11-05",
        &[
            start_event("w1", "2026-11-05T09:00:00+02:00", "words", words(1)),
            start_event("w2", "2026-11-05T10:00:00+02:00", "words", words(2)),
            start_event("z1", "2026-11-05T08:00:00+02:00", "zen", TextSource::Zen),
        ],
    );
    project(
        &root,
        "dev-b",
        "2026-11-05",
        &[start_event(
            "t1",
            "2026-11-05T07:00:00+02:00",
            "texts",
            TextSource::Import {
                id: "abc".to_owned(),
                offset: 40,
            },
        )],
    );
    let (mut projector, _) = Projector::open(&dir.path().join("d.sqlite"), &root, false).unwrap();
    projector.catch_up(&mut |_| {}).unwrap();

    let setups = queries::last_setups(projector.connection(), "dev-a").unwrap();
    let modes: Vec<_> = setups.iter().map(|setup| setup.mode.as_str()).collect();
    assert_eq!(modes, ["texts", "words", "zen"]);
    assert_eq!(setups[1].sid, "w2");
    assert_eq!(setups[1].source["seed"], 2);
    assert!(setups[1].this_device);
    assert!(!setups[0].this_device);
    assert_eq!(setups[0].source["id"], "abc");
}

// ---- Failure and recovery ---------------------------------------------------------------------

#[test]
fn a_missing_journal_gives_empty_statistics() {
    let dir = tempfile::tempdir().unwrap();
    let (mut projector, created) = Projector::open(
        &dir.path().join("derived.sqlite"),
        &dir.path().join("no-such-folder"),
        false,
    )
    .unwrap();
    assert!(created);
    projector.catch_up(&mut |_| {}).unwrap();
    let stats = overview(projector.connection(), None).unwrap();
    assert!(stats.keys.is_empty());
    assert!(stats.days.is_empty());
    assert_eq!(stats.records.best_wpm, None);
}

#[test]
fn another_schema_version_is_replaced() {
    let dir = tempfile::tempdir().unwrap();
    let database = dir.path().join("derived.sqlite");
    let journal = dir.path().join("journal");
    {
        let old = rusqlite::Connection::open(&database).unwrap();
        old.execute_batch("CREATE TABLE sessions (old TEXT); PRAGMA user_version = 999;")
            .unwrap();
    }
    let (projector, created) = Projector::open(&database, &journal, false).unwrap();
    assert!(created);
    assert!(overview(projector.connection(), None).is_ok());
}

#[test]
fn a_file_of_the_current_version_is_kept() {
    let dir = tempfile::tempdir().unwrap();
    let database = dir.path().join("derived.sqlite");
    let journal = dir.path().join("journal");
    drop(Projector::open(&database, &journal, false).unwrap());
    let (_, created) = Projector::open(&database, &journal, false).unwrap();
    assert!(!created);
}

#[test]
fn a_damaged_file_is_replaced() {
    let dir = tempfile::tempdir().unwrap();
    let database = dir.path().join("derived.sqlite");
    fs::write(&database, b"this is certainly not a database, only text").unwrap();
    let (projector, created) =
        Projector::open(&database, &dir.path().join("journal"), false).unwrap();
    assert!(created);
    assert!(overview(projector.connection(), None).is_ok());
}

#[test]
fn a_shrunk_or_missing_journal_file_calls_for_a_rebuild() {
    let files = case_files(&golden_root().join("words"));
    for damage in [true, false] {
        let dir = tempfile::tempdir().unwrap();
        let journal = dir.path().join("journal");
        write_files(&journal, &files);
        let database = dir.path().join("derived.sqlite");
        catch_up(&database, &journal, CHUNK_BYTES);

        let path = journal.join(&files[0].0);
        if damage {
            fs::write(&path, b"{}\n").unwrap();
        } else {
            fs::remove_file(&path).unwrap();
        }
        let (mut projector, _) = Projector::open(&database, &journal, false).unwrap();
        let error = projector.catch_up(&mut |_| {}).unwrap_err();
        assert!(matches!(error, ProjectorError::JournalRewritten));
        assert!(error.calls_for_rebuild());
    }
}

#[test]
fn a_bad_saved_state_calls_for_a_rebuild() {
    let files = case_files(&golden_root().join("aborted"));
    let dir = tempfile::tempdir().unwrap();
    let journal = dir.path().join("journal");
    write_files(&journal, &files);
    let database = dir.path().join("derived.sqlite");
    catch_up(&database, &journal, CHUNK_BYTES);

    let (mut projector, _) = Projector::open(&database, &journal, false).unwrap();
    projector
        .connection()
        .execute(
            "UPDATE session_state SET state = 'garbage' WHERE sid = 'k1'",
            [],
        )
        .unwrap();
    let path = journal.join(&files[0].0);
    let mut bytes = files[0].1.clone();
    bytes.extend_from_slice(
        br#"{"v":1,"type":"keystroke","sid":"k1","seq":9,"t":200.0,"kind":"char","code":"KeyC"}
"#,
    );
    fs::write(path, bytes).unwrap();
    let error = projector.catch_up(&mut |_| {}).unwrap_err();
    assert!(error.calls_for_rebuild());
}

// ---- The thread -------------------------------------------------------------------------------

struct Started {
    service: ProjectorService,
    statuses: mpsc::Receiver<ProjectorStatus>,
    _dir: tempfile::TempDir,
    journal: PathBuf,
    database: PathBuf,
}

fn start_service(before: impl FnOnce(&Path, &Path)) -> Started {
    let dir = tempfile::tempdir().unwrap();
    let journal = dir.path().join("journal");
    let database = dir.path().join("derived.sqlite");
    before(&journal, &database);
    let (sender, statuses) = mpsc::channel();
    let sender = Mutex::new(sender);
    let service = ProjectorService::start(&database, &journal, move |status| {
        let _ = sender.lock().unwrap().send(status.clone());
    })
    .unwrap();
    Started {
        service,
        statuses,
        _dir: dir,
        journal,
        database,
    }
}

impl Started {
    fn wait_until(&self, wanted: impl Fn(&ProjectorStatus) -> bool) -> ProjectorStatus {
        loop {
            let status = self
                .statuses
                .recv_timeout(Duration::from_secs(30))
                .expect("the projector did not report in time");
            if wanted(&status) {
                return status;
            }
        }
    }

    fn wait_idle(&self) {
        self.wait_until(|status| matches!(status, ProjectorStatus::Idle));
    }

    fn sessions(&self) -> usize {
        self.service
            .read(|connection| overview(connection, None))
            .unwrap()
            .recent
            .len()
    }
}

#[test]
fn the_service_catches_up_at_start_and_on_request() {
    let started = start_service(|journal, _| {
        project(
            journal,
            "dev-a",
            "2026-11-05",
            &session("one", "2026-11-05T10:00:00+02:00", 5, 100.0, "completed"),
        );
    });
    started.wait_idle();
    assert_eq!(started.sessions(), 1);

    project(
        &started.journal,
        "dev-a",
        "2026-11-06",
        &session("two", "2026-11-06T10:00:00+02:00", 5, 100.0, "completed"),
    );
    started.service.request_catch_up();
    started.wait_until(|status| matches!(status, ProjectorStatus::Working { .. }));
    started.wait_idle();
    assert_eq!(started.sessions(), 2);
}

#[test]
fn the_service_rebuilds_on_request_with_the_same_result() {
    let started = start_service(|journal, _| {
        project(
            journal,
            "dev-a",
            "2026-11-05",
            &session("one", "2026-11-05T10:00:00+02:00", 5, 100.0, "completed"),
        );
    });
    started.wait_idle();
    let before = started
        .service
        .read(|connection| Ok(dump(connection)))
        .unwrap();

    started.service.request_rebuild();
    started.wait_until(|status| matches!(status, ProjectorStatus::Rebuilding { .. }));
    started.wait_idle();
    let after = started
        .service
        .read(|connection| Ok(dump(connection)))
        .unwrap();
    assert_eq!(after, before);
}

#[test]
fn the_service_starts_over_on_a_damaged_file_and_on_a_rewritten_journal() {
    let started = start_service(|journal, database| {
        project(
            journal,
            "dev-a",
            "2026-11-05",
            &session("one", "2026-11-05T10:00:00+02:00", 5, 100.0, "completed"),
        );
        fs::write(database, b"not a database at all, just some text").unwrap();
    });
    started.wait_idle();
    assert_eq!(started.sessions(), 1);

    project(
        &started.journal,
        "dev-a",
        "2026-11-05",
        &session("new", "2026-11-05T10:00:00+02:00", 1, 100.0, "completed"),
    );
    started.service.request_catch_up();
    started.wait_until(|status| matches!(status, ProjectorStatus::Rebuilding { .. }));
    started.wait_idle();
    let stats = started
        .service
        .read(|connection| overview(connection, None))
        .unwrap();
    assert_eq!(stats.recent[0].sid, "new");
    assert_eq!(stats.recent.len(), 1);
}

#[test]
fn a_failure_is_reported_and_the_next_request_recovers() {
    let started = start_service(|_, database| {
        // A folder where the database file should be cannot be opened, or removed as a file.
        fs::create_dir_all(database).unwrap();
    });
    started.wait_until(|status| matches!(status, ProjectorStatus::Failed { .. }));
    assert!(matches!(
        started.service.status().unwrap(),
        ProjectorStatus::Failed { .. }
    ));

    fs::remove_dir(&started.database).unwrap();
    started.service.request_catch_up();
    started.wait_idle();
    assert_eq!(started.sessions(), 0);
}

#[test]
fn reading_before_the_database_exists_says_not_ready() {
    let dir = tempfile::tempdir().unwrap();
    let error = schema::open_reader(&dir.path().join("derived.sqlite")).unwrap_err();
    assert!(matches!(error, ProjectorError::NotReady));
}

#[test]
fn the_brain_reads_its_traces_and_every_opened_letter() {
    let dir = tempfile::tempdir().unwrap();
    let journal = dir.path().join("journal");
    write_files(&journal, &case_files(&golden_root().join("adaptive")));
    let (mut projector, _) =
        Projector::open(&dir.path().join("derived.sqlite"), &journal, false).unwrap();
    projector.catch_up(&mut |_| {}).unwrap();
    let knowledge = super::model::knowledge(projector.connection(), "en-qwerty").unwrap();

    // The second session opened `s`, and letters never close.
    assert_eq!(knowledge.opened.iter().collect::<String>(), "aeinost");
    let e = knowledge.keys[&'e'];
    // Seven samples at 200 ms, halved by two days, then seven at 450 ms.
    assert_eq!(e.samples, 10.5);
    assert_eq!(e.sum_ms, 3850.0);
    assert_eq!(e.half_life, 1.0);
    assert!(e.mastered);
    assert_eq!(knowledge.pairs[&('e', 'a')].errors, 1.0);
    // Only letters take part: the space is in no trace.
    assert_eq!(knowledge.keys.len(), 3);
    assert!(
        super::model::knowledge(projector.connection(), "ru")
            .unwrap()
            .keys
            .is_empty()
    );
}
