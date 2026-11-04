//! Thin Tauri commands. They translate between the UI bridge and pure logic and
//! hold no logic of their own.

use serde::Serialize;

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_info_reports_the_package_metadata() {
        let info = current_app_info();

        assert_eq!(info.name, "keymind");
        assert_eq!(info.version, env!("CARGO_PKG_VERSION"));
    }
}
