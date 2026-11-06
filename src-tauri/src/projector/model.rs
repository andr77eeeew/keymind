//! `model_state`: the student model folded from the daily tables. See ADR-0010.
//!
//! It is computed again from `key_stats` and `bigram_stats` after every catch-up, so it can never
//! drift from them, and it does not depend on the time it was computed, so a rebuild gives the same
//! bytes. Only letters a to z take part: the adaptive mode types nothing else yet.

use std::collections::BTreeMap;

use rusqlite::{Connection, Transaction, params};

use super::ProjectorError;
use crate::brain::heuristic::{Knowledge, opened_letters};
use crate::brain::model::{Day, Trace, date_text, day_number, fold};
use crate::brain::{letter_of, letter_of_code};

/// Days of each layout and key or transition, in date order.
type Days = BTreeMap<(String, String), Vec<Day>>;

fn day_from(row: &rusqlite::Row<'_>, first: usize) -> rusqlite::Result<Option<Day>> {
    let date: String = row.get(first)?;
    Ok(day_number(&date).map(|day| Day {
        day,
        presses: row.get(first + 1).unwrap_or(0),
        samples: row.get(first + 2).unwrap_or(0),
        sum_us: row.get(first + 3).unwrap_or(0),
        sum_sq_us: row.get(first + 4).unwrap_or(0),
        errors: row.get(first + 5).unwrap_or(0),
    }))
}

fn read_days(connection: &Connection) -> Result<Days, ProjectorError> {
    let mut days: Days = BTreeMap::new();
    let mut keys = connection.prepare_cached(
        "SELECT layout, code, date, presses, samples, sum_us, sum_sq_us, errors
         FROM key_stats ORDER BY layout, code, date",
    )?;
    let mut rows = keys.query([])?;
    while let Some(row) = rows.next()? {
        let code: String = row.get(1)?;
        if let (Some(letter), Some(day)) = (letter_of_code(&code), day_from(row, 2)?) {
            days.entry((row.get(0)?, letter.to_string()))
                .or_default()
                .push(day);
        }
    }

    let mut pairs = connection.prepare_cached(
        "SELECT layout, first, second, date, presses, samples, sum_us, sum_sq_us, errors
         FROM bigram_stats ORDER BY layout, first, second, date",
    )?;
    let mut rows = pairs.query([])?;
    while let Some(row) = rows.next()? {
        let first: String = row.get(1)?;
        let second: String = row.get(2)?;
        if let (Some(a), Some(b), Some(day)) =
            (letter_of(&first), letter_of(&second), day_from(row, 3)?)
        {
            days.entry((row.get(0)?, format!("{a}{b}")))
                .or_default()
                .push(day);
        }
    }
    Ok(days)
}

/// Replaces `model_state` with the fold of the daily tables.
pub fn refresh(transaction: &Transaction<'_>) -> Result<(), ProjectorError> {
    let days = read_days(transaction)?;
    transaction.execute("DELETE FROM model_state", [])?;
    let mut insert = transaction.prepare_cached(
        "INSERT INTO model_state (layout, gram, half_life, last_date, samples, sum_ms, sum_sq_ms,
             presses, errors, mastered, total_samples)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
    )?;
    for ((layout, gram), list) in &days {
        let Some(t) = fold(list) else { continue };
        let Some(last_date) = date_text(t.last_day) else {
            continue;
        };
        insert.execute(params![
            layout,
            gram,
            t.half_life,
            last_date,
            t.samples,
            t.sum_ms,
            t.sum_sq_ms,
            t.presses,
            t.errors,
            t.mastered,
            t.total_samples,
        ])?;
    }
    Ok(())
}

/// What the brain knows on `layout`: every trace, and the letters of every adaptive session.
pub fn knowledge(connection: &Connection, layout: &str) -> Result<Knowledge, ProjectorError> {
    let mut knowledge = Knowledge::default();
    let mut statement = connection.prepare_cached(
        "SELECT gram, half_life, last_date, samples, sum_ms, sum_sq_ms, presses, errors, mastered,
             total_samples
         FROM model_state WHERE layout = ?1",
    )?;
    let mut rows = statement.query([layout])?;
    while let Some(row) = rows.next()? {
        let gram: String = row.get(0)?;
        let last_date: String = row.get(2)?;
        let Some(last_day) = day_number(&last_date) else {
            continue;
        };
        let trace = Trace {
            half_life: row.get(1)?,
            last_day,
            samples: row.get(3)?,
            sum_ms: row.get(4)?,
            sum_sq_ms: row.get(5)?,
            presses: row.get(6)?,
            errors: row.get(7)?,
            mastered: row.get(8)?,
            total_samples: row.get(9)?,
        };
        let mut letters = gram.chars();
        match (letters.next(), letters.next(), letters.next()) {
            (Some(a), None, None) => {
                knowledge.keys.insert(a, trace);
            }
            (Some(a), Some(b), None) => {
                knowledge.pairs.insert((a, b), trace);
            }
            _ => {}
        }
    }

    let mut recipes = connection.prepare_cached(
        "SELECT json_extract(source, '$.recipe.letters') FROM sessions
         WHERE mode = 'adaptive' AND layout = ?1",
    )?;
    let letters: Vec<String> = recipes
        .query_map([layout], |row| row.get::<_, Option<String>>(0))?
        .filter_map(Result::ok)
        .flatten()
        .collect();
    knowledge.opened = opened_letters(letters.iter().map(String::as_str));
    Ok(knowledge)
}
