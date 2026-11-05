//! The projector thread. The window never waits for it: a request only wakes the thread, and the
//! typing screen does not touch the database at all.

use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::{Arc, Mutex, RwLock};
use std::thread;
use std::time::{Duration, Instant};

use rusqlite::Connection;
use serde::Serialize;

use super::{Progress, Projector, ProjectorError, schema};

/// Often enough for a progress bar, and rare enough to cost nothing.
const PROGRESS_INTERVAL: Duration = Duration::from_millis(250);

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum ProjectorStatus {
    /// Adding new lines to tables that are already correct. The screen can keep showing them.
    Working {
        done_bytes: u64,
        total_bytes: u64,
    },
    /// The tables start from nothing, so the screen shows Loading instead of partial numbers.
    Rebuilding {
        done_bytes: u64,
        total_bytes: u64,
    },
    Idle,
    /// Typing still works. The screen shows this message and offers a rebuild.
    Failed {
        message: String,
    },
}

enum Request {
    CatchUp,
    Rebuild,
}

type Notify = dyn Fn(&ProjectorStatus) + Send + Sync;

struct Shared {
    database: PathBuf,
    journal_root: PathBuf,
    /// Readers hold it shared while a connection is open. Replacing the file takes it exclusively,
    /// because Windows cannot delete a file that is open.
    gate: RwLock<()>,
    status: Mutex<ProjectorStatus>,
    notify: Box<Notify>,
}

impl Shared {
    fn set_status(&self, next: ProjectorStatus) {
        let Ok(mut status) = self.status.lock() else {
            return;
        };
        if *status != next {
            status.clone_from(&next);
            drop(status);
            (self.notify)(&next);
        }
    }
}

/// A cheap handle to the thread.
#[derive(Clone)]
pub struct ProjectorService {
    sender: mpsc::Sender<Request>,
    shared: Arc<Shared>,
}

impl ProjectorService {
    /// Starts the thread and the first catch-up. `notify` is told about every status change, and
    /// runs on the projector thread, so it must not block.
    pub fn start(
        database: &Path,
        journal_root: &Path,
        notify: impl Fn(&ProjectorStatus) + Send + Sync + 'static,
    ) -> std::io::Result<Self> {
        let (sender, receiver) = mpsc::channel();
        let shared = Arc::new(Shared {
            database: database.to_path_buf(),
            journal_root: journal_root.to_path_buf(),
            gate: RwLock::new(()),
            status: Mutex::new(ProjectorStatus::Working {
                done_bytes: 0,
                total_bytes: 0,
            }),
            notify: Box::new(notify),
        });
        let thread_shared = shared.clone();
        thread::Builder::new()
            .name("projector".to_owned())
            .spawn(move || run(&thread_shared, &receiver))?;
        let service = Self { sender, shared };
        service.request_catch_up();
        Ok(service)
    }

    /// Asks for new journal lines to be projected. Returns at once, and requests made while the
    /// thread is busy merge into one.
    pub fn request_catch_up(&self) {
        // A stopped thread is reported by the status and by reads.
        let _ = self.sender.send(Request::CatchUp);
    }

    /// Asks for the tables to be rebuilt from nothing. Returns at once.
    pub fn request_rebuild(&self) {
        let _ = self.sender.send(Request::Rebuild);
    }

    pub fn status(&self) -> Result<ProjectorStatus, ProjectorError> {
        self.shared
            .status
            .lock()
            .map(|status| status.clone())
            .map_err(|_| ProjectorError::Stopped)
    }

    /// Runs `query` on a short read-only connection, which a rebuild does not block. If it finds
    /// the file damaged, a rebuild starts and the caller sees the error once.
    pub fn read<T>(
        &self,
        query: impl FnOnce(&Connection) -> Result<T, ProjectorError>,
    ) -> Result<T, ProjectorError> {
        let result = {
            let _gate = self
                .shared
                .gate
                .read()
                .map_err(|_| ProjectorError::Stopped)?;
            schema::open_reader(&self.shared.database).and_then(|connection| query(&connection))
        };
        if result.as_ref().is_err_and(ProjectorError::is_damage) {
            self.request_rebuild();
        }
        result
    }
}

fn run(shared: &Shared, receiver: &mpsc::Receiver<Request>) {
    let mut projector = None;
    while let Ok(first) = receiver.recv() {
        let mut rebuild = matches!(first, Request::Rebuild);
        while let Ok(next) = receiver.try_recv() {
            rebuild |= matches!(next, Request::Rebuild);
        }
        match project(shared, &mut projector, rebuild) {
            Ok(()) => shared.set_status(ProjectorStatus::Idle),
            Err(cause) => {
                // The next request starts clean, so a full disk can recover on its own.
                projector = None;
                shared.set_status(ProjectorStatus::Failed {
                    message: cause.to_string(),
                });
            }
        }
    }
}

fn project(
    shared: &Shared,
    slot: &mut Option<Projector>,
    rebuild: bool,
) -> Result<(), ProjectorError> {
    let mut from_nothing = false;
    if rebuild || slot.is_none() {
        from_nothing = reopen(shared, slot, rebuild)?;
    }
    match catch_up(shared, slot, from_nothing) {
        Err(cause) if cause.calls_for_rebuild() => {
            reopen(shared, slot, true)?;
            catch_up(shared, slot, true)
        }
        other => other,
    }
}

/// Closes the old connection first, then swaps the file while no reader has it open.
fn reopen(
    shared: &Shared,
    slot: &mut Option<Projector>,
    force_new: bool,
) -> Result<bool, ProjectorError> {
    *slot = None;
    let _gate = shared.gate.write().map_err(|_| ProjectorError::Stopped)?;
    let (projector, created) = Projector::open(&shared.database, &shared.journal_root, force_new)?;
    *slot = Some(projector);
    Ok(created)
}

fn catch_up(
    shared: &Shared,
    slot: &mut Option<Projector>,
    from_nothing: bool,
) -> Result<(), ProjectorError> {
    let Some(projector) = slot.as_mut() else {
        return Err(ProjectorError::Stopped);
    };
    let working = |progress: Progress| {
        if from_nothing {
            ProjectorStatus::Rebuilding {
                done_bytes: progress.done,
                total_bytes: progress.total,
            }
        } else {
            ProjectorStatus::Working {
                done_bytes: progress.done,
                total_bytes: progress.total,
            }
        }
    };
    if from_nothing || projector.has_work()? {
        shared.set_status(working(Progress { done: 0, total: 0 }));
    }
    let mut last_report = Instant::now();
    projector.catch_up(&mut |progress| {
        if last_report.elapsed() >= PROGRESS_INTERVAL {
            last_report = Instant::now();
            shared.set_status(working(progress));
        }
    })
}
