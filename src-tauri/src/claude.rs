//! Locating, launching, and inspecting Claude Desktop instances.
//!
//! Claude ships as an MSIX package, so its executable lives in a
//! version-stamped folder that changes on every update. We therefore
//! re-detect the path on demand rather than storing it, trying the
//! version-stable execution alias first and falling back to the packaged
//! install location.

use std::fs;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use sysinfo::System;

/// Don't flash a console window when we shell out to PowerShell.
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Normalize a path for case-insensitive comparison on Windows.
pub fn norm(path: &str) -> String {
    path.replace('/', "\\").trim_end_matches('\\').to_lowercase()
}

/// Best-effort discovery of Claude.exe. Order: manual override, the
/// version-stable WindowsApps execution alias, a currently-running Claude
/// process, then the packaged install location via Get-AppxPackage.
pub fn detect_claude(override_path: &Option<String>) -> Option<PathBuf> {
    if let Some(p) = override_path {
        let pb = PathBuf::from(p);
        if pb.exists() {
            return Some(pb);
        }
    }
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let alias = Path::new(&local)
            .join("Microsoft")
            .join("WindowsApps")
            .join("Claude.exe");
        if alias.exists() {
            return Some(alias);
        }
    }
    if let Some(p) = running_claude_exe() {
        return Some(p);
    }
    appx_install_claude()
}

fn running_claude_exe() -> Option<PathBuf> {
    let sys = System::new_all();
    for proc_ in sys.processes().values() {
        if proc_.name().to_string_lossy().to_lowercase().starts_with("claude") {
            if let Some(exe) = proc_.exe() {
                if exe.to_string_lossy().to_lowercase().ends_with("claude.exe") {
                    return Some(exe.to_path_buf());
                }
            }
        }
    }
    None
}

fn appx_install_claude() -> Option<PathBuf> {
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "$p = Get-AppxPackage -Name '*Claude*' | Sort-Object Version -Descending | Select-Object -First 1; if ($p) { Join-Path $p.InstallLocation 'Claude.exe' }",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if s.is_empty() {
        return None;
    }
    let pb = PathBuf::from(s);
    if pb.exists() {
        Some(pb)
    } else {
        None
    }
}

/// A profile is "signed in" once its data dir has a persisted session.
pub fn is_signed_in(data_dir: &str) -> bool {
    let base = Path::new(data_dir);
    base.join("Local Storage").exists() || base.join("Network").join("Cookies").exists()
}

/// True when the profile has never been launched (empty or missing folder).
pub fn dir_is_empty_or_missing(data_dir: &str) -> bool {
    match fs::read_dir(data_dir) {
        Ok(mut rd) => rd.next().is_none(),
        Err(_) => true,
    }
}

/// Any Claude process at all — used to warn about sign-in deep-link collisions.
pub fn any_claude_running() -> bool {
    let sys = System::new_all();
    sys.processes()
        .values()
        .any(|p| p.name().to_string_lossy().to_lowercase().starts_with("claude"))
}

/// The set of --user-data-dir values currently in use by running Claude
/// processes, so the UI can show which profiles are live.
pub fn running_data_dirs() -> Vec<String> {
    let sys = System::new_all();
    let mut dirs = Vec::new();
    for proc_ in sys.processes().values() {
        if !proc_.name().to_string_lossy().to_lowercase().starts_with("claude") {
            continue;
        }
        for a in proc_.cmd() {
            if let Some(rest) = a.to_string_lossy().strip_prefix("--user-data-dir=") {
                dirs.push(rest.trim_matches('"').to_string());
            }
        }
    }
    dirs
}

/// Launch Claude with an isolated data directory. Returns the child pid.
pub fn launch(exe: &Path, data_dir: &str) -> std::io::Result<u32> {
    fs::create_dir_all(data_dir).ok();
    let child = Command::new(exe)
        .arg(format!("--user-data-dir={}", data_dir))
        .spawn()?;
    Ok(child.id())
}

pub fn open_in_explorer(path: &str) -> std::io::Result<()> {
    Command::new("explorer").arg(path).spawn().map(|_| ())
}
