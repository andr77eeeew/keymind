//! The derived tables, and opening the database file. See ADR-0008.
//!
//! There are no migrations. The journal holds everything, so a file of another schema version is
//! simply deleted and rebuilt. Any change to these tables, or to the meaning of a number in them,
//! must raise `SCHEMA_VERSION`.

use std::fs;
use std::io;
use std::path::Path;
use std::time::Duration;

use rusqlite::{Connection, OpenFlags};

use super::ProjectorError;

pub const SCHEMA_VERSION: i64 = 3;

const BUSY_TIMEOUT: Duration = Duration::from_secs(5);

const TABLES: &str = "
CREATE TABLE projected_files (
    device     TEXT NOT NULL,
    file       TEXT NOT NULL,
    bytes      INTEGER NOT NULL,
    events     INTEGER NOT NULL,
    bad_lines  INTEGER NOT NULL,
    unknown    INTEGER NOT NULL,
    duplicates INTEGER NOT NULL,
    orphans    INTEGER NOT NULL,
    PRIMARY KEY (device, file)
) WITHOUT ROWID;

CREATE TABLE session_state (
    sid      TEXT PRIMARY KEY,
    last_seq INTEGER NOT NULL,
    state    TEXT
) WITHOUT ROWID;

CREATE TABLE sessions (
    sid            TEXT PRIMARY KEY,
    device         TEXT NOT NULL,
    ts             TEXT NOT NULL,
    started_ms     INTEGER NOT NULL,
    date           TEXT NOT NULL,
    mode           TEXT NOT NULL,
    layout         TEXT NOT NULL,
    source         TEXT NOT NULL,
    reason         TEXT,
    duration_ms    REAL NOT NULL,
    chars          INTEGER NOT NULL,
    correct        INTEGER NOT NULL,
    judged         INTEGER NOT NULL,
    judged_correct INTEGER NOT NULL,
    backspaces     INTEGER NOT NULL,
    cpm            REAL NOT NULL,
    wpm            REAL NOT NULL,
    accuracy       REAL,
    rhythm         REAL
) WITHOUT ROWID;
CREATE INDEX sessions_by_date ON sessions (date);
CREATE INDEX sessions_by_start ON sessions (started_ms);

CREATE TABLE key_stats (
    date      TEXT NOT NULL,
    layout    TEXT NOT NULL,
    code      TEXT NOT NULL,
    presses   INTEGER NOT NULL,
    samples   INTEGER NOT NULL,
    sum_us    INTEGER NOT NULL,
    sum_sq_us INTEGER NOT NULL,
    errors    INTEGER NOT NULL,
    PRIMARY KEY (date, layout, code)
) WITHOUT ROWID;

CREATE TABLE bigram_stats (
    date      TEXT NOT NULL,
    layout    TEXT NOT NULL,
    first     TEXT NOT NULL,
    second    TEXT NOT NULL,
    presses   INTEGER NOT NULL,
    samples   INTEGER NOT NULL,
    sum_us    INTEGER NOT NULL,
    sum_sq_us INTEGER NOT NULL,
    errors    INTEGER NOT NULL,
    PRIMARY KEY (date, layout, first, second)
) WITHOUT ROWID;

-- The student model, folded from the two tables above (ADR-0010). A gram is a letter or two.
-- Sums are decayed to last_date, so the table does not depend on when it was computed.
CREATE TABLE model_state (
    layout        TEXT NOT NULL,
    gram          TEXT NOT NULL,
    half_life     REAL NOT NULL,
    last_date     TEXT NOT NULL,
    samples       REAL NOT NULL,
    sum_ms        REAL NOT NULL,
    sum_sq_ms     REAL NOT NULL,
    presses       REAL NOT NULL,
    errors        REAL NOT NULL,
    mastered      INTEGER NOT NULL,
    total_samples INTEGER NOT NULL,
    PRIMARY KEY (layout, gram)
) WITHOUT ROWID;

-- The targets of each adaptive session: the brain's estimate at the start, and what the session
-- measured with the definitions of key_stats and bigram_stats (ADR-0010). before_ms is NULL for a
-- target the brain knew too little about.
CREATE TABLE session_targets (
    sid       TEXT NOT NULL,
    gram      TEXT NOT NULL,
    before_ms REAL,
    presses   INTEGER NOT NULL,
    samples   INTEGER NOT NULL,
    sum_us    INTEGER NOT NULL,
    errors    INTEGER NOT NULL,
    PRIMARY KEY (sid, gram)
) WITHOUT ROWID;

-- Views, because a second stored copy of the same numbers could drift from the first.
-- Zen has no text to measure against, so speed, accuracy and rhythm leave it out.
CREATE VIEW daily_stats AS
SELECT
    date,
    COUNT(*) AS sessions,
    SUM(duration_ms) AS duration_ms,
    SUM(CASE WHEN mode <> 'zen' THEN duration_ms ELSE 0 END) AS typed_ms,
    SUM(CASE WHEN mode <> 'zen' THEN correct ELSE 0 END) AS correct,
    SUM(judged) AS judged,
    SUM(judged_correct) AS judged_correct,
    SUM(CASE WHEN mode <> 'zen' AND rhythm IS NOT NULL THEN rhythm * chars ELSE 0 END)
        AS rhythm_weighted,
    SUM(CASE WHEN mode <> 'zen' AND rhythm IS NOT NULL THEN chars ELSE 0 END) AS rhythm_chars
FROM sessions
WHERE chars > 0
GROUP BY date;

CREATE VIEW last_setups AS
SELECT mode, sid, device, ts, source
FROM (
    SELECT
        mode, sid, device, ts, source,
        ROW_NUMBER() OVER (PARTITION BY mode ORDER BY started_ms DESC, sid DESC) AS position
    FROM sessions
)
WHERE position = 1;
";

/// Opens the database for writing. Returns the connection and whether it is new, which means every
/// journal has to be read again. A damaged file or one of another version is replaced.
///
/// The caller must make sure no other connection is open, because Windows cannot delete an open
/// file.
pub fn open_writer(path: &Path, force_new: bool) -> Result<(Connection, bool), ProjectorError> {
    if !force_new {
        match open_existing(path) {
            Ok(Some(connection)) => return Ok((connection, false)),
            Ok(None) => {}
            Err(cause) if cause.is_damage() => {}
            Err(cause) => return Err(cause),
        }
    }
    remove_database(path)?;
    Ok((create(path)?, true))
}

/// `Ok(None)` when the file is not of the current version, which covers an absent file too.
fn open_existing(path: &Path) -> Result<Option<Connection>, ProjectorError> {
    let connection = Connection::open(path)?;
    let version: i64 = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if version != SCHEMA_VERSION {
        return Ok(None);
    }
    configure(&connection)?;
    Ok(Some(connection))
}

fn create(path: &Path) -> Result<Connection, ProjectorError> {
    let mut connection = Connection::open(path)?;
    configure(&connection)?;
    let transaction = connection.transaction()?;
    transaction.execute_batch(TABLES)?;
    transaction.pragma_update(None, "user_version", SCHEMA_VERSION)?;
    transaction.commit()?;
    Ok(connection)
}

/// WAL lets readers work during a long rebuild. `synchronous = NORMAL` can lose the last commits on
/// a power cut but never breaks the file, and a lost commit took its file offset with it, so the
/// next run simply reads those lines again.
fn configure(connection: &Connection) -> Result<(), ProjectorError> {
    connection.busy_timeout(BUSY_TIMEOUT)?;
    connection.pragma_update_and_check(None, "journal_mode", "WAL", |_| Ok(()))?;
    connection.pragma_update(None, "synchronous", "NORMAL")?;
    Ok(())
}

fn remove_database(path: &Path) -> Result<(), ProjectorError> {
    let name = path.as_os_str();
    for suffix in ["", "-wal", "-shm"] {
        let mut file = name.to_os_string();
        file.push(suffix);
        match fs::remove_file(&file) {
            Ok(()) => {}
            Err(cause) if cause.kind() == io::ErrorKind::NotFound => {}
            Err(cause) => {
                return Err(ProjectorError::Remove {
                    path: file.into(),
                    source: cause,
                });
            }
        }
    }
    Ok(())
}

/// A short read-only connection. Fails with `NotReady` until the database has the current schema.
pub fn open_reader(path: &Path) -> Result<Connection, ProjectorError> {
    if !path.exists() {
        return Err(ProjectorError::NotReady);
    }
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    connection.busy_timeout(BUSY_TIMEOUT)?;
    let version: i64 = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if version != SCHEMA_VERSION {
        return Err(ProjectorError::NotReady);
    }
    Ok(connection)
}
