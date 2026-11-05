//! Reads for the statistics screen and Home. Nothing here writes.

use rusqlite::{Connection, OptionalExtension, Row, params};
use serde::Serialize;
use serde_json::Value;

use super::ProjectorError;

/// A session below this many correct characters is too short to be a record.
const RECORD_MIN_CORRECT: i64 = 100;
const RECENT_SESSIONS: i64 = 20;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct KeyRow {
    pub layout: String,
    pub code: String,
    pub presses: i64,
    pub samples: i64,
    pub mean_ms: Option<f64>,
    pub errors: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct BigramRow {
    pub layout: String,
    pub first: String,
    pub second: String,
    pub presses: i64,
    pub samples: i64,
    pub mean_ms: Option<f64>,
    pub errors: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DayRow {
    pub date: String,
    pub sessions: i64,
    /// All typing of the day, Zen included.
    pub duration_ms: f64,
    /// `None` on a day with only Zen. Exact sums of the day, not an average of sessions.
    pub wpm: Option<f64>,
    pub accuracy: Option<f64>,
    /// Weighted by characters, so a long session counts for more than a short one.
    pub rhythm: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Record {
    pub value: f64,
    pub sid: String,
    pub date: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Records {
    pub best_wpm: Option<Record>,
    pub best_accuracy: Option<Record>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SessionRow {
    pub sid: String,
    pub ts: String,
    pub mode: String,
    /// `None` when the app was closed before the session ended.
    pub reason: Option<String>,
    pub duration_ms: f64,
    pub chars: i64,
    pub correct: i64,
    pub backspaces: i64,
    pub cpm: f64,
    pub wpm: f64,
    pub accuracy: Option<f64>,
    pub rhythm: Option<f64>,
}

/// Lines the projector could not use, so damage is reported instead of hidden.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
pub struct Skipped {
    pub bad_lines: i64,
    pub unknown: i64,
    pub duplicates: i64,
    pub orphans: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct StatsOverview {
    pub keys: Vec<KeyRow>,
    pub bigrams: Vec<BigramRow>,
    pub days: Vec<DayRow>,
    pub records: Records,
    pub recent: Vec<SessionRow>,
    pub skipped: Skipped,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LastSetup {
    pub mode: String,
    pub sid: String,
    pub ts: String,
    pub source: Value,
    /// Tells Home that a file is on another computer rather than deleted.
    pub this_device: bool,
}

/// `from_date` is a local `YYYY-MM-DD`, which the UI knows and sorts correctly as text. `None` means
/// all time. Records and recent sessions ignore the period.
pub fn overview(
    connection: &Connection,
    from_date: Option<&str>,
) -> Result<StatsOverview, ProjectorError> {
    Ok(StatsOverview {
        keys: keys(connection, from_date)?,
        bigrams: bigrams(connection, from_date)?,
        days: days(connection, from_date)?,
        records: Records {
            best_wpm: record(connection, "wpm")?,
            best_accuracy: record(connection, "accuracy")?,
        },
        recent: recent(connection)?,
        skipped: skipped(connection)?,
    })
}

fn mean_ms(sum_us: i64, samples: i64) -> Option<f64> {
    (samples > 0).then(|| sum_us as f64 / samples as f64 / 1000.0)
}

fn keys(connection: &Connection, from_date: Option<&str>) -> Result<Vec<KeyRow>, ProjectorError> {
    let mut statement = connection.prepare_cached(
        "SELECT layout, code, SUM(presses), SUM(samples), SUM(sum_us), SUM(errors)
         FROM key_stats
         WHERE ?1 IS NULL OR date >= ?1
         GROUP BY layout, code
         ORDER BY layout, code",
    )?;
    let rows = statement.query_map(params![from_date], |row| {
        let samples = row.get(3)?;
        Ok(KeyRow {
            layout: row.get(0)?,
            code: row.get(1)?,
            presses: row.get(2)?,
            samples,
            mean_ms: mean_ms(row.get(4)?, samples),
            errors: row.get(5)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn bigrams(
    connection: &Connection,
    from_date: Option<&str>,
) -> Result<Vec<BigramRow>, ProjectorError> {
    let mut statement = connection.prepare_cached(
        "SELECT layout, first, second, SUM(presses), SUM(samples), SUM(sum_us), SUM(errors)
         FROM bigram_stats
         WHERE ?1 IS NULL OR date >= ?1
         GROUP BY layout, first, second
         ORDER BY layout, first, second",
    )?;
    let rows = statement.query_map(params![from_date], |row| {
        let samples = row.get(4)?;
        Ok(BigramRow {
            layout: row.get(0)?,
            first: row.get(1)?,
            second: row.get(2)?,
            presses: row.get(3)?,
            samples,
            mean_ms: mean_ms(row.get(5)?, samples),
            errors: row.get(6)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn days(connection: &Connection, from_date: Option<&str>) -> Result<Vec<DayRow>, ProjectorError> {
    let mut statement = connection.prepare_cached(
        "SELECT date, sessions, duration_ms, typed_ms, correct, judged, judged_correct,
             rhythm_weighted, rhythm_chars
         FROM daily_stats
         WHERE ?1 IS NULL OR date >= ?1
         ORDER BY date",
    )?;
    let rows = statement.query_map(params![from_date], |row| {
        let typed_ms: f64 = row.get(3)?;
        let correct: i64 = row.get(4)?;
        let judged: i64 = row.get(5)?;
        let judged_correct: i64 = row.get(6)?;
        let rhythm_weighted: f64 = row.get(7)?;
        let rhythm_chars: i64 = row.get(8)?;
        Ok(DayRow {
            date: row.get(0)?,
            sessions: row.get(1)?,
            duration_ms: row.get(2)?,
            wpm: (typed_ms > 0.0).then(|| correct as f64 / (typed_ms / 60_000.0) / 5.0),
            accuracy: (judged > 0).then(|| 100.0 * judged_correct as f64 / judged as f64),
            rhythm: (rhythm_chars > 0).then(|| rhythm_weighted / rhythm_chars as f64),
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// `column` is one of two fixed names, never user input.
fn record(connection: &Connection, column: &str) -> Result<Option<Record>, ProjectorError> {
    let sql = format!(
        "SELECT {column}, sid, date FROM sessions
         WHERE mode <> 'zen' AND reason = 'completed' AND correct >= ?1 AND {column} IS NOT NULL
         ORDER BY {column} DESC, started_ms DESC
         LIMIT 1"
    );
    let found = connection
        .prepare_cached(&sql)?
        .query_row([RECORD_MIN_CORRECT], |row| {
            Ok(Record {
                value: row.get(0)?,
                sid: row.get(1)?,
                date: row.get(2)?,
            })
        })
        .optional()?;
    Ok(found)
}

fn session_row(row: &Row<'_>) -> rusqlite::Result<SessionRow> {
    Ok(SessionRow {
        sid: row.get(0)?,
        ts: row.get(1)?,
        mode: row.get(2)?,
        reason: row.get(3)?,
        duration_ms: row.get(4)?,
        chars: row.get(5)?,
        correct: row.get(6)?,
        backspaces: row.get(7)?,
        cpm: row.get(8)?,
        wpm: row.get(9)?,
        accuracy: row.get(10)?,
        rhythm: row.get(11)?,
    })
}

fn recent(connection: &Connection) -> Result<Vec<SessionRow>, ProjectorError> {
    let mut statement = connection.prepare_cached(
        "SELECT sid, ts, mode, reason, duration_ms, chars, correct, backspaces, cpm, wpm, accuracy,
             rhythm
         FROM sessions
         WHERE chars > 0
         ORDER BY started_ms DESC, sid DESC
         LIMIT ?1",
    )?;
    let rows = statement.query_map([RECENT_SESSIONS], session_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn skipped(connection: &Connection) -> Result<Skipped, ProjectorError> {
    let found = connection
        .prepare_cached(
            "SELECT COALESCE(SUM(bad_lines), 0), COALESCE(SUM(unknown), 0),
                 COALESCE(SUM(duplicates), 0), COALESCE(SUM(orphans), 0)
             FROM projected_files",
        )?
        .query_row([], |row| {
            Ok(Skipped {
                bad_lines: row.get(0)?,
                unknown: row.get(1)?,
                duplicates: row.get(2)?,
                orphans: row.get(3)?,
            })
        })?;
    Ok(found)
}

/// The last setup of each mode. `device` is this computer's journal folder.
pub fn last_setups(
    connection: &Connection,
    device: &str,
) -> Result<Vec<LastSetup>, ProjectorError> {
    let mut statement = connection
        .prepare_cached("SELECT mode, sid, ts, source, device FROM last_setups ORDER BY mode")?;
    let rows = statement.query_map([], |row| {
        let source: String = row.get(3)?;
        let owner: String = row.get(4)?;
        Ok(LastSetup {
            mode: row.get(0)?,
            sid: row.get(1)?,
            ts: row.get(2)?,
            // Written by the projector, so this only fails on a damaged database.
            source: serde_json::from_str(&source).unwrap_or(Value::Null),
            this_device: owner == device,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Every table and view as text, with a fixed order, so two databases can be compared exactly.
#[cfg(test)]
pub fn dump(connection: &Connection) -> String {
    use std::fmt::Write;

    use rusqlite::types::ValueRef;

    let mut out = String::new();
    for (table, order) in [
        ("projected_files", "1, 2"),
        ("session_state", "1"),
        ("sessions", "1"),
        ("key_stats", "1, 2, 3"),
        ("bigram_stats", "1, 2, 3, 4"),
        ("daily_stats", "1"),
        ("last_setups", "1"),
    ] {
        writeln!(out, "# {table}").unwrap();
        let mut statement = connection
            .prepare(&format!("SELECT * FROM {table} ORDER BY {order}"))
            .unwrap();
        let names: Vec<String> = statement.column_names().map(ToString::to_string).collect();
        writeln!(out, "{}", names.join(" | ")).unwrap();
        let mut rows = statement.query([]).unwrap();
        while let Some(row) = rows.next().unwrap() {
            let cells: Vec<String> = (0..names.len())
                .map(|index| match row.get_ref(index).unwrap() {
                    ValueRef::Null => "NULL".to_owned(),
                    ValueRef::Integer(value) => value.to_string(),
                    ValueRef::Real(value) => format!("{value:?}"),
                    // Zen journals Enter as a character, and a dump keeps one row per line.
                    ValueRef::Text(value) => String::from_utf8_lossy(value).replace('\n', "\\n"),
                    ValueRef::Blob(_) => "BLOB".to_owned(),
                })
                .collect();
            writeln!(out, "{}", cells.join(" | ")).unwrap();
        }
    }
    out
}
