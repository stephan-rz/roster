//! The desktop apps Roster can run side by side.
//!
//! Claude and ChatGPT are both Electron apps shipped as MSIX packages, so the
//! same trick isolates accounts in either one: activate the package by its
//! AppUserModelID and pass `--user-data-dir`, giving each profile its own
//! login, history and settings.
//!
//! What differs per app is the activation id, the process and executable name,
//! where a default install keeps its data, and how a profile folder is laid
//! out — Claude writes an Electron profile at the root of the data dir, while
//! ChatGPT uses Chromium's multi-profile layout with everything under
//! `Default\`.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use sysinfo::System;

use crate::sys;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AppKind {
    /// Default so profiles written before ChatGPT support load unchanged.
    #[default]
    Claude,
    #[serde(rename = "chatgpt")]
    ChatGpt,
}

impl AppKind {
    pub const ALL: [AppKind; 2] = [AppKind::Claude, AppKind::ChatGpt];

    pub fn label(&self) -> &'static str {
        match self {
            AppKind::Claude => "Claude",
            AppKind::ChatGpt => "ChatGPT",
        }
    }

    /// The app-activation id. The publisher hash is fixed per vendor, so these
    /// stay constant across app updates — unlike the version-stamped .exe path.
    pub fn aumid(&self) -> &'static str {
        match self {
            AppKind::Claude => "Claude_pzs8sxrjxfjjc!Claude",
            AppKind::ChatGpt => "OpenAI.Codex_2p2nqsd0c76g0!App",
        }
    }

    /// Package family name, derived from the AUMID (`<PFN>!<AppId>`).
    fn package_family(&self) -> &'static str {
        match self {
            AppKind::Claude => "Claude_pzs8sxrjxfjjc",
            AppKind::ChatGpt => "OpenAI.Codex_2p2nqsd0c76g0",
        }
    }

    /// The URL scheme the app registers with Windows, which its third-party
    /// sign-in callbacks come back on. Note ChatGPT's is `codex`, not
    /// `chatgpt` — it ships inside the OpenAI.Codex package.
    pub fn url_scheme(&self) -> &'static str {
        match self {
            AppKind::Claude => "claude",
            AppKind::ChatGpt => "codex",
        }
    }

    pub fn exe_name(&self) -> &'static str {
        match self {
            AppKind::Claude => "Claude.exe",
            AppKind::ChatGpt => "ChatGPT.exe",
        }
    }

    /// Subfolder of the package install root holding the executable.
    fn exe_subdir(&self) -> Option<&'static str> {
        match self {
            AppKind::Claude => None,
            // ChatGPT ships inside the OpenAI.Codex package, under app\.
            AppKind::ChatGpt => Some("app"),
        }
    }

    fn appx_name_filter(&self) -> &'static str {
        match self {
            AppKind::Claude => "*Claude*",
            AppKind::ChatGpt => "OpenAI.Codex",
        }
    }

    /// Process-name prefix used to spot running instances.
    fn proc_prefix(&self) -> &'static str {
        match self {
            AppKind::Claude => "claude",
            AppKind::ChatGpt => "chatgpt",
        }
    }

    /// Relative paths that mark a folder as this app's user-data directory.
    fn data_markers(&self) -> &'static [&'static str] {
        match self {
            AppKind::Claude => &["Local Storage", "IndexedDB", "Network\\Cookies"],
            AppKind::ChatGpt => &[
                "Default\\Local Storage",
                "Default\\Network\\Cookies",
                "Local State",
            ],
        }
    }


    /// Where a default (non-Roster) install keeps its data, in priority order.
    fn default_data_dirs(&self) -> Vec<PathBuf> {
        let appdata = std::env::var("APPDATA").ok().map(PathBuf::from);
        let local = std::env::var("LOCALAPPDATA").ok().map(PathBuf::from);
        let mut dirs = Vec::new();
        match self {
            AppKind::Claude => {
                if let Some(a) = &appdata {
                    dirs.push(a.join("Claude"));
                }
                if let Some(l) = &local {
                    for base in packaged_roaming(l, "claude") {
                        dirs.push(base.join("Claude"));
                    }
                    for base in packaged_roaming(l, "anthropic") {
                        dirs.push(base.join("Claude"));
                    }
                    dirs.push(l.join("AnthropicClaude"));
                }
            }
            AppKind::ChatGpt => {
                // ChatGPT nests its profile as <productName>\web\<productName>.
                if let Some(a) = &appdata {
                    dirs.push(a.join("Codex").join("web").join("Codex"));
                    dirs.push(a.join("ChatGPT").join("web").join("ChatGPT"));
                }
                if let Some(l) = &local {
                    for base in packaged_roaming(l, "openai") {
                        dirs.push(base.join("Codex").join("web").join("Codex"));
                        dirs.push(base.join("ChatGPT").join("web").join("ChatGPT"));
                    }
                }
            }
        }
        dirs
    }

    /// Folders left behind by the old PowerShell launcher, adoptable as profiles.
    fn legacy_profile_roots(&self) -> Vec<PathBuf> {
        let Ok(appdata) = std::env::var("APPDATA") else {
            return Vec::new();
        };
        let base = PathBuf::from(appdata);
        match self {
            AppKind::Claude => vec![base.join("Claude-Profiles")],
            AppKind::ChatGpt => vec![base.join("ChatGPT-Profiles")],
        }
    }

    /* ------------------------------ queries ------------------------------ */

    /// Does this folder look like one of this app's user-data directories?
    pub fn is_data_dir(&self, dir: &Path) -> bool {
        self.data_markers().iter().any(|m| dir.join(m).exists())
    }

    /// A profile is "signed in" once its data dir has a persisted session.
    pub fn is_signed_in(&self, data_dir: &str) -> bool {
        let base = Path::new(data_dir);
        match self {
            AppKind::Claude => ["Local Storage", "Network\\Cookies"]
                .iter()
                .any(|m| base.join(m).exists()),
            // Chromium creates `Default\Local Storage` and `Default\Network\
            // Cookies` on first run, so their mere presence proves nothing —
            // measured on a fresh profile, both exist before any sign-in. What
            // separates the two is how much is in there: an untouched profile
            // holds well under a kilobyte of local storage, a signed-in one
            // holds megabytes.
            AppKind::ChatGpt => dir_bytes_at_least(
                &base.join("Default").join("Local Storage").join("leveldb"),
                SIGNED_IN_MIN_BYTES,
            ),
        }
    }

    /// Best-effort discovery of the app's executable. Order: manual override,
    /// the version-stable execution alias, a running process, then the packaged
    /// install location via Get-AppxPackage.
    pub fn detect_exe(&self, override_path: &Option<String>) -> Option<PathBuf> {
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
                .join(self.exe_name());
            if alias.exists() {
                return Some(alias);
            }
        }
        if let Some(p) = self.running_exe() {
            return Some(p);
        }
        self.appx_exe()
    }

    fn running_exe(&self) -> Option<PathBuf> {
        let want = self.exe_name().to_lowercase();
        let sys = System::new_all();
        for proc_ in sys.processes().values() {
            if !self.proc_matches(proc_.name().to_string_lossy().as_ref()) {
                continue;
            }
            if let Some(exe) = proc_.exe() {
                if exe.to_string_lossy().to_lowercase().ends_with(&want) {
                    return Some(exe.to_path_buf());
                }
            }
        }
        None
    }

    fn appx_exe(&self) -> Option<PathBuf> {
        let rel = match self.exe_subdir() {
            Some(sub) => format!("{}\\{}", sub, self.exe_name()),
            None => self.exe_name().to_string(),
        };
        let script = format!(
            "$p = Get-AppxPackage -Name '{}' | Sort-Object Version -Descending | Select-Object -First 1; if ($p) {{ Join-Path $p.InstallLocation '{}' }}",
            self.appx_name_filter(),
            rel
        );
        let pb = PathBuf::from(sys::powershell(&script)?);
        pb.exists().then_some(pb)
    }

    fn proc_matches(&self, name: &str) -> bool {
        name.to_lowercase().starts_with(self.proc_prefix())
    }

    /// Any instance of this app at all — used to warn about sign-in collisions.
    pub fn any_running(&self) -> bool {
        let sys = System::new_all();
        sys.processes()
            .values()
            .any(|p| self.proc_matches(p.name().to_string_lossy().as_ref()))
    }

    /// Map a path as the packaged app sees it to where it actually lands on
    /// disk. MSIX redirects the app's `%APPDATA%` and `%LOCALAPPDATA%` writes
    /// into its own `LocalCache`, so the path in a process command line is not
    /// the path Explorer (or Roster) would find.
    fn devirtualize(&self, path: &str) -> Option<String> {
        let local = std::env::var("LOCALAPPDATA").ok()?;
        let container = Path::new(&local)
            .join("Packages")
            .join(self.package_family())
            .join("LocalCache");
        let n = sys::norm(path);
        // Already inside the container — nothing to rewrite. Checked first,
        // since the container itself lives under %LOCALAPPDATA%.
        if n.starts_with(&sys::norm(&container.to_string_lossy())) {
            return None;
        }
        for (var, cache_sub) in [("APPDATA", "Roaming"), ("LOCALAPPDATA", "Local")] {
            let Ok(base) = std::env::var(var) else { continue };
            let base_n = sys::norm(&base);
            if let Some(rest) = n.strip_prefix(&format!("{}\\", base_n)) {
                return Some(
                    container
                        .join(cache_sub)
                        .join(rest)
                        .to_string_lossy()
                        .to_string(),
                );
            }
        }
        None
    }

    /// Launch the app with an isolated data directory.
    ///
    /// The Store (MSIX) build can't be launched by its .exe path — Windows
    /// denies direct execution — so we activate it by AUMID, which also
    /// survives the app's frequent self-updates. Falls back to spawning the exe
    /// directly for non-Store installs.
    pub fn launch(&self, data_dir: &str, override_path: &Option<String>) -> Result<u32, String> {
        self.launch_with(data_dir, None, override_path)
    }

    /// Hand a sign-in callback URL to the instance that owns `data_dir`.
    ///
    /// Both apps register their URL scheme on the *package*, so a callback
    /// coming back from the browser carries no profile and Windows always
    /// delivers it to whichever instance holds the default data dir. Passing
    /// the URL alongside `--user-data-dir` instead routes it by profile: the
    /// activated process resolves to that profile's single-instance lock, and
    /// the instance holding it receives the URL.
    pub fn deliver_link(
        &self,
        data_dir: &str,
        url: &str,
        override_path: &Option<String>,
    ) -> Result<u32, String> {
        self.validate_link(url)?;
        self.launch_with(data_dir, Some(url), override_path)
    }

    /// Reject anything that isn't a plain callback URL for this app.
    ///
    /// The URL is pasted by hand and ends up in a command line, so beyond
    /// checking the scheme we refuse whitespace and quotes — which no real
    /// callback contains but which would let a stray string be read as extra
    /// command-line switches.
    fn validate_link(&self, url: &str) -> Result<(), String> {
        let prefix = format!("{}://", self.url_scheme());
        if !url.starts_with(&prefix) {
            return Err(format!(
                "That doesn't look like a {} sign-in link — it should start with {}",
                self.label(),
                prefix
            ));
        }
        if url.len() > 4096 {
            return Err("That link is too long to be a sign-in callback.".into());
        }
        if url.chars().any(|c| c.is_whitespace() || c.is_control() || c == '"') {
            return Err("That link contains spaces or quotes, so it isn't a valid callback URL.".into());
        }
        Ok(())
    }

    fn launch_with(
        &self,
        data_dir: &str,
        url: Option<&str>,
        override_path: &Option<String>,
    ) -> Result<u32, String> {
        fs::create_dir_all(data_dir).ok();
        let mut args = format!("--user-data-dir=\"{}\"", data_dir);
        if let Some(u) = url {
            args.push_str(&format!(" \"{}\"", u));
        }
        if let Ok(pid) = sys::launch_via_aumid(self.aumid(), &args) {
            return Ok(pid);
        }
        let exe = self.detect_exe(override_path).ok_or_else(|| {
            format!(
                "Could not find or launch {}. Set its location in Settings.",
                self.label()
            )
        })?;
        let mut cmd = std::process::Command::new(&exe);
        cmd.arg(format!("--user-data-dir={}", data_dir));
        if let Some(u) = url {
            cmd.arg(u);
        }
        let child = cmd
            .spawn()
            .map_err(|e| format!("Couldn't launch {}: {}", exe.display(), e))?;
        Ok(child.id())
    }

    /// Existing data folders that could be adopted as profiles: the default
    /// install (wherever it lives) plus anything left by the old launcher.
    pub fn candidate_data_dirs(&self) -> Vec<PathBuf> {
        let mut out = Vec::new();
        // Exactly one "default" account — the first location that actually
        // exists, so machines with data in more than one place don't duplicate.
        for def in self.default_data_dirs() {
            if self.is_data_dir(&def) {
                out.push(def);
                break;
            }
        }
        for root in self.legacy_profile_roots() {
            let Ok(entries) = fs::read_dir(&root) else { continue };
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() && self.is_data_dir(&p) {
                    out.push(p);
                }
            }
        }
        out
    }

    /// Name to suggest when importing a folder found at `dir`.
    pub fn suggested_name(&self, dir: &Path) -> String {
        let base = dir
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        // Every default location bottoms out in the product name; old-launcher
        // folders are named after the profile ("Work", …).
        let is_default = matches!(
            base.to_lowercase().as_str(),
            "claude" | "chatgpt" | "codex"
        );
        if is_default {
            "Personal".to_string()
        } else if base.is_empty() {
            "Imported".to_string()
        } else {
            base
        }
    }

    /// Best-effort read of the signed-in account from a profile's storage.
    pub fn read_account(&self, data_dir: &str) -> Option<Account> {
        match self {
            AppKind::Claude => crate::claude::read_account(data_dir),
            // ChatGPT keeps no plainly readable account record in its profile —
            // identity is fetched at runtime — so the UI falls back to a plain
            // "Signed in" badge.
            AppKind::ChatGpt => None,
        }
    }
}

/// The `--user-data-dir` values currently in use, bucketed by app, so the UI
/// can show which profiles are live. Paths come back normalized for
/// case-insensitive comparison.
///
/// One process scan covers every app: the status poll runs every few seconds,
/// so walking the process table once per app would be wasteful.
///
/// A default install's *main* process carries no such flag, but its child
/// processes do — and the value they report is the path the app sees from
/// inside its MSIX container. We record both that path and its real on-disk
/// location so an imported default profile still matches.
pub fn running_data_dirs() -> HashMap<AppKind, Vec<String>> {
    let info = System::new_all();
    let mut out: HashMap<AppKind, Vec<String>> = HashMap::new();
    for proc_ in info.processes().values() {
        let name = proc_.name().to_string_lossy().to_lowercase();
        let Some(app) = AppKind::ALL.into_iter().find(|a| name.starts_with(a.proc_prefix()))
        else {
            continue;
        };
        for a in proc_.cmd() {
            let Some(dir) = a
                .to_string_lossy()
                .strip_prefix("--user-data-dir=")
                .map(|s| s.trim_matches('"').to_string())
            else {
                continue;
            };
            let bucket = out.entry(app).or_default();
            if let Some(real) = app.devirtualize(&dir) {
                bucket.push(sys::norm(&real));
            }
            bucket.push(sys::norm(&dir));
        }
    }
    out
}

/// Work out which app a data folder belongs to from the way it's laid out.
///
/// Claude keeps an Electron profile at the folder root; ChatGPT uses Chromium's
/// multi-profile layout under `Default\`. Only the markers unique to one of
/// them are consulted — `Local State` sits at the root of both, so it can't
/// tell them apart. Anything ambiguous or empty falls back to Claude, which was
/// the only supported app before this existed.
pub fn sniff_data_dir(dir: &Path) -> AppKind {
    let chatgpt = dir.join("Default").join("Local Storage").exists()
        || dir.join("Default").join("Network").join("Cookies").exists();
    let claude = dir.join("Local Storage").exists() || dir.join("IndexedDB").exists();
    if chatgpt && !claude {
        AppKind::ChatGpt
    } else {
        AppKind::Claude
    }
}

/// Sits far above a fresh profile's noise floor (~60 bytes, measured) and far
/// below a real signed-in session (megabytes).
const SIGNED_IN_MIN_BYTES: u64 = 64 * 1024;

/// Do the files directly under `dir` add up to at least `min` bytes? Stops as
/// soon as the threshold is met, so it stays cheap on large profiles.
fn dir_bytes_at_least(dir: &Path, min: u64) -> bool {
    let Ok(entries) = fs::read_dir(dir) else {
        return false;
    };
    let mut total = 0u64;
    for entry in entries.flatten() {
        if let Ok(m) = entry.metadata() {
            total = total.saturating_add(m.len());
            if total >= min {
                return true;
            }
        }
    }
    false
}

/// True when the profile has never been launched (empty or missing folder).
pub fn dir_is_empty_or_missing(data_dir: &str) -> bool {
    match fs::read_dir(data_dir) {
        Ok(mut rd) => rd.next().is_none(),
        Err(_) => true,
    }
}

/// `%LOCALAPPDATA%\Packages\<pkg>\LocalCache\Roaming` for every installed
/// package whose name contains `needle`.
fn packaged_roaming(local: &Path, needle: &str) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let Ok(entries) = fs::read_dir(local.join("Packages")) else {
        return out;
    };
    for entry in entries.flatten() {
        if entry
            .file_name()
            .to_string_lossy()
            .to_lowercase()
            .contains(needle)
        {
            out.push(entry.path().join("LocalCache").join("Roaming"));
        }
    }
    out
}

/// The signed-in account identity for a profile.
#[derive(Debug, Clone, serde::Serialize)]
pub struct Account {
    pub email: Option<String>,
    pub name: Option<String>,
    pub org: Option<String>,
}
