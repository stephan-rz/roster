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

/// The signed-in account identity for a profile, read from Claude's cache.
#[derive(Debug, Clone, serde::Serialize)]
pub struct Account {
    pub email: Option<String>,
    pub name: Option<String>,
    pub org: Option<String>,
}

/// Best-effort read of the signed-in account from a profile's IndexedDB.
///
/// Claude caches the account bootstrap (email, name, organization) under the
/// https://claude.ai origin. There's no official schema, so we locate the
/// `email_address` field and scrape the nearby values heuristically. If the
/// format ever changes this simply returns `None` and the UI falls back to a
/// plain "Signed in" badge — nothing breaks.
pub fn read_account(data_dir: &str) -> Option<Account> {
    let idb = Path::new(data_dir).join("IndexedDB");
    if !idb.exists() {
        return None;
    }
    let mut stack = vec![idb];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            match entry.metadata() {
                Ok(m) if m.len() <= 64 * 1024 * 1024 => {}
                _ => continue,
            }
            let Ok(raw) = fs::read(&path) else { continue };
            if let Some(pos) = find_sub(&raw, b"email_address") {
                let start = pos.saturating_sub(64);
                let end = (pos + 8192).min(raw.len());
                // Keep one byte per element (drop NULs so UTF-16 ASCII reads cleanly).
                let data: Vec<u8> = raw[start..end].iter().copied().filter(|&b| b != 0).collect();
                if let Some(acc) = parse_account(&data) {
                    return Some(acc);
                }
            }
        }
    }
    None
}

fn find_sub(hay: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || hay.len() < needle.len() {
        return None;
    }
    hay.windows(needle.len()).position(|w| w == needle)
}

fn parse_account(data: &[u8]) -> Option<Account> {
    let email = extract_value(data, b"email_address", |b| {
        b.is_ascii_alphanumeric() || b"@._%+-".contains(&b)
    }, 128)
    .filter(|s| s.contains('@'));
    email.as_ref()?;
    let printable = |b: u8| b >= 0x20 && b != b'"';
    let name = extract_value(data, b"full_name", printable, 80);
    let org = extract_org(data, name.as_deref());
    Some(Account { email, name, org })
}

/// After `key`, skip a few serialization tag/length bytes, then collect the
/// value until a control byte or string delimiter.
fn extract_value(data: &[u8], key: &[u8], valid: impl Fn(u8) -> bool, max: usize) -> Option<String> {
    let start = find_sub(data, key)? + key.len();
    let mut i = start;
    let mut skipped = 0;
    while i < data.len() && skipped < 8 && !valid(data[i]) {
        i += 1;
        skipped += 1;
    }
    let vstart = i;
    while i < data.len() && (i - vstart) < max && valid(data[i]) {
        i += 1;
    }
    let out = String::from_utf8_lossy(&data[vstart..i]).trim().to_string();
    if out.is_empty() {
        None
    } else {
        Some(out)
    }
}

/// The org name is a bare `name` field (not `full_name` / `display_name`), so
/// match a `name` not preceded by a letter or underscore, with a value that
/// differs from the person's own name.
fn extract_org(data: &[u8], person: Option<&str>) -> Option<String> {
    let printable = |b: u8| b >= 0x20 && b != b'"';
    let mut search = 0;
    while let Some(rel) = find_sub(&data[search..], b"name") {
        let idx = search + rel;
        let prev = if idx == 0 { 0 } else { data[idx - 1] };
        if !prev.is_ascii_alphabetic() && prev != b'_' {
            if let Some(v) = extract_value(&data[idx..], b"name", printable, 80) {
                if person != Some(v.as_str()) {
                    return Some(v);
                }
            }
        }
        search = idx + 4;
        if search >= data.len() {
            break;
        }
    }
    None
}
