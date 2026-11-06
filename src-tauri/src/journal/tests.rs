use std::fs;

use time::macros::date;

use super::event::{KeyKind, Keystroke, SessionMark};
use super::reader::{Deduper, read_file};
use super::*;

fn key(sid: &str, seq: u64) -> Event {
    Event::new(EventBody::Keystroke(Keystroke {
        sid: sid.to_owned(),
        seq,
        t: seq as f64 * 100.0,
        kind: KeyKind::Char,
        code: "KeyA".to_owned(),
        key: Some("a".to_owned()),
        expected: Some("a".to_owned()),
        correct: Some(true),
        pos: Some(seq),
        mods: Vec::new(),
        ignored: None,
    }))
}

fn read_all(dir: &std::path::Path) -> (Vec<Event>, ReadReport) {
    let mut events = Vec::new();
    let report = read_dir(dir, &mut |event| events.push(event)).unwrap();
    (events, report)
}

#[test]
fn keystroke_line_has_the_documented_shape() {
    let line = serde_json::to_string(&key("s", 42)).unwrap();
    assert_eq!(
        line,
        r#"{"v":1,"type":"keystroke","sid":"s","seq":42,"t":4200.0,"kind":"char","code":"KeyA","key":"a","expected":"a","correct":true,"pos":42}"#
    );
}

#[test]
fn appended_events_read_back_in_order() {
    let dir = tempfile::tempdir().unwrap();
    let mut writer = JournalWriter::new(dir.path());
    let written = vec![key("s", 1), key("s", 2)];
    writer.append(date!(2026 - 11 - 04), &written).unwrap();
    writer
        .append(date!(2026 - 11 - 04), &[key("s", 3)])
        .unwrap();

    let (events, report) = read_all(dir.path());
    assert_eq!(events.len(), 3);
    assert_eq!(events[0], written[0]);
    assert_eq!(report.bad_lines, 0);
    assert!(dir.path().join("2026-11-04.jsonl").exists());
}

#[test]
fn a_new_date_goes_to_a_new_file_and_keeps_the_old_one() {
    let dir = tempfile::tempdir().unwrap();
    let mut writer = JournalWriter::new(dir.path());
    writer
        .append(date!(2026 - 12 - 31), &[key("s", 1)])
        .unwrap();
    writer
        .append(date!(2027 - 01 - 01), &[key("s", 2)])
        .unwrap();

    assert!(dir.path().join("2026-12-31.jsonl").exists());
    assert!(dir.path().join("2027-01-01.jsonl").exists());
    assert_eq!(read_all(dir.path()).0.len(), 2);
}

#[test]
fn a_repeated_batch_is_dropped_by_the_reader_even_across_files() {
    let dir = tempfile::tempdir().unwrap();
    let mut writer = JournalWriter::new(dir.path());
    let batch = [key("s", 1), key("s", 2)];
    writer.append(date!(2026 - 11 - 04), &batch).unwrap();
    writer.append(date!(2026 - 11 - 05), &batch).unwrap();

    let (events, report) = read_all(dir.path());
    assert_eq!(events.len(), 2);
    assert_eq!(report.duplicates, 2);
}

#[test]
fn the_same_seq_in_another_session_is_not_a_duplicate() {
    let dir = tempfile::tempdir().unwrap();
    let mut writer = JournalWriter::new(dir.path());
    writer
        .append(date!(2026 - 11 - 04), &[key("a", 1), key("b", 1)])
        .unwrap();
    assert_eq!(read_all(dir.path()).0.len(), 2);
}

#[test]
fn a_torn_last_line_is_closed_and_counted_but_old_bytes_stay() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("2026-11-04.jsonl");
    let good = serde_json::to_string(&key("s", 1)).unwrap();
    let torn = format!("{good}\n{{\"v\":1,\"type\":\"keys");
    fs::write(&path, &torn).unwrap();

    let mut writer = JournalWriter::new(dir.path());
    writer
        .append(date!(2026 - 11 - 04), &[key("s", 2)])
        .unwrap();

    let content = fs::read_to_string(&path).unwrap();
    assert!(content.starts_with(&torn), "existing bytes must not change");
    let (events, report) = read_all(dir.path());
    assert_eq!(events.len(), 2);
    assert_eq!(report.bad_lines, 1);
}

#[test]
fn golden_v1_journal_keeps_loading() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("2026-11-04.jsonl");
    fs::write(&path, include_str!("../../testdata/journal_v1.jsonl")).unwrap();

    let mut events = Vec::new();
    let report = read_file(&path, &mut Deduper::default(), &mut |e| events.push(e)).unwrap();

    assert_eq!(
        report,
        ReadReport {
            events: 11,
            bad_lines: 1,
            unknown: 1,
            duplicates: 1,
        }
    );
    assert!(matches!(events[0].body, EventBody::SettingsChanged(_)));
    assert!(matches!(
        &events[7].body,
        EventBody::SessionResumed(SessionMark { t, .. }) if *t == 5400.0
    ));
}

#[test]
fn an_unknown_event_is_never_written() {
    let dir = tempfile::tempdir().unwrap();
    let mut writer = JournalWriter::new(dir.path());
    let result = writer.append(date!(2026 - 11 - 04), &[Event::new(EventBody::Unknown)]);
    assert!(matches!(result, Err(JournalError::UnknownEvent)));
}

#[test]
fn a_missing_folder_reads_as_an_empty_journal() {
    let dir = tempfile::tempdir().unwrap();
    let (events, report) = read_all(&dir.path().join("nothing-here"));
    assert!(events.is_empty());
    assert_eq!(report, ReadReport::default());
}

#[test]
fn adaptive_and_test_sources_read_back_and_tolerate_new_fields() {
    let line = r#"{"kind":"adaptive","seed":7,"recipe":{"v":1,"brain":"heuristic","letters":"etaoin","focus":"e","review":["ta"],"words":40,"before":{"e":412.5},"later":true}}"#;
    let source: event::TextSource = serde_json::from_str(line).unwrap();
    let event::TextSource::Adaptive { seed, recipe } = &source else {
        panic!("not adaptive: {source:?}");
    };
    assert_eq!(*seed, 7);
    assert_eq!(recipe.letters, "etaoin");
    assert_eq!(recipe.before["e"], 412.5);

    // A recipe with fields missing takes their defaults.
    let bare: event::TextSource =
        serde_json::from_str(r#"{"kind":"adaptive","seed":1,"recipe":{}}"#).unwrap();
    assert!(matches!(bare, event::TextSource::Adaptive { recipe, .. } if recipe.v == 1));

    let test: event::TextSource =
        serde_json::from_str(r#"{"kind":"test","passages":["a","b"],"seconds":60}"#).unwrap();
    assert_eq!(
        test,
        event::TextSource::Test {
            passages: vec!["a".to_owned(), "b".to_owned()],
            seconds: 60
        }
    );

    // A source from a later version is kept as unknown, not refused.
    let future: event::TextSource = serde_json::from_str(r#"{"kind":"music","id":"x"}"#).unwrap();
    assert_eq!(future, event::TextSource::Unknown);
}
