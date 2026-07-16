mod claude;
mod profiles;

use profiles::{load_config, save_config, Config, Profile};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

pub struct AppState {
    config: Mutex<Config>,
    /// Cache of resolved account identities, keyed by data dir. Populated by
    /// `refresh_accounts` (which does the IO) so the frequent status poll stays
    /// cheap.
    accounts: Mutex<HashMap<String, claude::Account>>,
}

/// A profile plus its live status and (if known) signed-in account, for the UI.
#[derive(serde::Serialize)]
pub struct ProfileView {
    id: String,
    name: String,
    color: String,
    plan: Option<String>,
    data_dir: String,
    running: bool,
    signed_in: bool,
    account: Option<claude::Account>,
}

#[derive(serde::Serialize)]
struct ClaudeStatus {
    found: bool,
    path: Option<String>,
}

#[derive(serde::Serialize)]
struct LaunchCheck {
    first_run: bool,
    others_running: bool,
}

#[derive(serde::Serialize)]
struct ImportCandidate {
    data_dir: String,
    suggested_name: String,
    signed_in: bool,
    account: Option<claude::Account>,
}

fn build_views(config: &Config, accounts: &HashMap<String, claude::Account>) -> Vec<ProfileView> {
    let running: Vec<String> = claude::running_data_dirs()
        .iter()
        .map(|d| claude::norm(d))
        .collect();
    config
        .profiles
        .iter()
        .map(|p| {
            let signed_in = claude::is_signed_in(&p.data_dir);
            ProfileView {
                id: p.id.clone(),
                name: p.name.clone(),
                color: p.color.clone(),
                plan: p.plan.clone(),
                data_dir: p.data_dir.clone(),
                running: running.contains(&claude::norm(&p.data_dir)),
                signed_in,
                account: if signed_in {
                    accounts.get(&p.data_dir).cloned()
                } else {
                    None
                },
            }
        })
        .collect()
}

/// Lock config + accounts and render the current views (no IO).
fn views(state: &State<AppState>) -> Vec<ProfileView> {
    let config = state.config.lock().unwrap();
    let accounts = state.accounts.lock().unwrap();
    build_views(&config, &accounts)
}

fn new_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("p{}", nanos)
}

/// Demo mode (set ROSTER_DEMO=1) shows fake accounts — used for screenshots and
/// trying the UI without touching real Claude data. Off by default.
fn is_demo() -> bool {
    std::env::var("ROSTER_DEMO").is_ok()
}

fn demo_views() -> Vec<ProfileView> {
    let acc = |name: &str, email: &str, org: Option<&str>| {
        Some(claude::Account {
            email: Some(email.to_string()),
            name: Some(name.to_string()),
            org: org.map(|s| s.to_string()),
        })
    };
    let v = |id: &str,
             name: &str,
             color: &str,
             plan: &str,
             running: bool,
             signed_in: bool,
             account: Option<claude::Account>| ProfileView {
        id: id.to_string(),
        name: name.to_string(),
        color: color.to_string(),
        plan: (!plan.is_empty()).then(|| plan.to_string()),
        data_dir: String::new(),
        running,
        signed_in,
        account,
    };
    vec![
        v("1", "Personal", "#3B82F6", "Max", true, true, acc("Alex Rivers", "alex.rivers@gmail.com", None)),
        v("2", "Work", "#EF4444", "Team", false, true, acc("Alex Rivers", "alex@acme.co", Some("Acme Inc"))),
        v("3", "Client — Nova", "#8B5CF6", "Pro", false, true, acc("Jordan Lee", "jordan@novalabs.io", Some("Nova Labs"))),
        v("4", "Sandbox", "#F59E0B", "Free", false, false, None),
    ]
}

#[tauri::command]
fn list_profiles(state: State<AppState>) -> Vec<ProfileView> {
    if is_demo() {
        return demo_views();
    }
    views(&state)
}

#[tauri::command]
fn add_profile(
    state: State<AppState>,
    name: String,
    color: String,
    plan: Option<String>,
) -> Result<Vec<ProfileView>, String> {
    {
        let mut config = state.config.lock().unwrap();
        let id = new_id();
        let data_dir = profiles::profiles_root()
            .join(&id)
            .to_string_lossy()
            .to_string();
        config.profiles.push(Profile {
            id,
            name: name.trim().to_string(),
            color,
            data_dir,
            plan,
        });
        save_config(&config).map_err(|e| e.to_string())?;
    }
    Ok(views(&state))
}

#[tauri::command]
fn update_profile(
    state: State<AppState>,
    id: String,
    name: String,
    color: String,
    plan: Option<String>,
) -> Result<Vec<ProfileView>, String> {
    {
        let mut config = state.config.lock().unwrap();
        if let Some(p) = config.profiles.iter_mut().find(|p| p.id == id) {
            p.name = name.trim().to_string();
            p.color = color;
            p.plan = plan;
        }
        save_config(&config).map_err(|e| e.to_string())?;
    }
    Ok(views(&state))
}

/// Removing a profile forgets it but never deletes its data folder.
#[tauri::command]
fn remove_profile(state: State<AppState>, id: String) -> Result<Vec<ProfileView>, String> {
    {
        let mut config = state.config.lock().unwrap();
        config.profiles.retain(|p| p.id != id);
        save_config(&config).map_err(|e| e.to_string())?;
    }
    Ok(views(&state))
}

#[tauri::command]
fn pre_launch_check(state: State<AppState>, id: String) -> LaunchCheck {
    let config = state.config.lock().unwrap();
    let first_run = config
        .profiles
        .iter()
        .find(|p| p.id == id)
        .map(|p| claude::dir_is_empty_or_missing(&p.data_dir))
        .unwrap_or(false);
    LaunchCheck {
        first_run,
        others_running: claude::any_claude_running(),
    }
}

#[tauri::command]
fn launch_profile(state: State<AppState>, id: String) -> Result<(), String> {
    let (data_dir, override_path) = {
        let config = state.config.lock().unwrap();
        let p = config
            .profiles
            .iter()
            .find(|p| p.id == id)
            .ok_or("Profile not found")?;
        (p.data_dir.clone(), config.claude_path.clone())
    };
    let exe = claude::detect_claude(&override_path)
        .ok_or("Could not find Claude.exe. Set its location in Settings.")?;
    claude::launch(&exe, &data_dir).map_err(|e| e.to_string())?;
    Ok(())
}

/// Re-read the signed-in account for each profile from disk and refresh the
/// cache. Called by the UI on load and after a launch — not on every poll.
#[tauri::command]
fn refresh_accounts(state: State<AppState>) -> Vec<ProfileView> {
    if is_demo() {
        return demo_views();
    }
    let dirs: Vec<String> = {
        let config = state.config.lock().unwrap();
        config
            .profiles
            .iter()
            .filter(|p| claude::is_signed_in(&p.data_dir))
            .map(|p| p.data_dir.clone())
            .collect()
    };
    // Do the (potentially slow) IndexedDB reads without holding any lock.
    let found: Vec<(String, Option<claude::Account>)> = dirs
        .into_iter()
        .map(|d| {
            let a = claude::read_account(&d);
            (d, a)
        })
        .collect();
    {
        let mut accounts = state.accounts.lock().unwrap();
        for (d, a) in found {
            match a {
                Some(acc) => {
                    accounts.insert(d, acc);
                }
                None => {
                    accounts.remove(&d);
                }
            }
        }
    }
    views(&state)
}

#[tauri::command]
fn claude_status(state: State<AppState>) -> ClaudeStatus {
    if is_demo() {
        return ClaudeStatus {
            found: true,
            path: Some("Claude.exe".to_string()),
        };
    }
    let config = state.config.lock().unwrap();
    let detected = claude::detect_claude(&config.claude_path);
    ClaudeStatus {
        found: detected.is_some(),
        path: detected.map(|p| p.to_string_lossy().to_string()),
    }
}

#[tauri::command]
fn set_claude_path(state: State<AppState>, path: Option<String>) -> Result<ClaudeStatus, String> {
    let mut config = state.config.lock().unwrap();
    config.claude_path = path.filter(|s| !s.trim().is_empty());
    save_config(&config).map_err(|e| e.to_string())?;
    let detected = claude::detect_claude(&config.claude_path);
    Ok(ClaudeStatus {
        found: detected.is_some(),
        path: detected.map(|p| p.to_string_lossy().to_string()),
    })
}

#[tauri::command]
fn open_data_dir(state: State<AppState>, id: String) -> Result<(), String> {
    let dir = {
        let config = state.config.lock().unwrap();
        config
            .profiles
            .iter()
            .find(|p| p.id == id)
            .map(|p| p.data_dir.clone())
            .ok_or("Profile not found")?
    };
    std::fs::create_dir_all(&dir).ok();
    claude::open_in_explorer(&dir).map_err(|e| e.to_string())
}

/// Find existing Claude data folders that aren't already Roster profiles.
#[tauri::command]
fn discover_importable(state: State<AppState>) -> Vec<ImportCandidate> {
    let existing: Vec<String> = {
        let config = state.config.lock().unwrap();
        config
            .profiles
            .iter()
            .map(|p| claude::norm(&p.data_dir))
            .collect()
    };
    claude::candidate_data_dirs()
        .into_iter()
        .filter_map(|p| {
            let ds = p.to_string_lossy().to_string();
            if existing.contains(&claude::norm(&ds)) {
                return None;
            }
            // Every "default" location ends in \Claude; old-launcher profiles
            // end in the profile name (\Work, …).
            let base = p
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            let suggested_name = if base.eq_ignore_ascii_case("Claude") {
                "Personal".to_string()
            } else if base.is_empty() {
                "Imported".to_string()
            } else {
                base
            };
            Some(ImportCandidate {
                signed_in: claude::is_signed_in(&ds),
                account: claude::read_account(&ds),
                suggested_name,
                data_dir: ds,
            })
        })
        .collect()
}

/// Adopt an existing data folder as a profile (keeps its login in place).
#[tauri::command]
fn import_profile(
    state: State<AppState>,
    name: String,
    color: String,
    data_dir: String,
) -> Result<Vec<ProfileView>, String> {
    {
        let mut config = state.config.lock().unwrap();
        if config
            .profiles
            .iter()
            .any(|p| claude::norm(&p.data_dir) == claude::norm(&data_dir))
        {
            return Err("That folder is already in Roster.".into());
        }
        config.profiles.push(Profile {
            id: new_id(),
            name: name.trim().to_string(),
            color,
            data_dir: data_dir.clone(),
            plan: None,
        });
        save_config(&config).map_err(|e| e.to_string())?;
    }
    if let Some(acc) = claude::read_account(&data_dir) {
        state.accounts.lock().unwrap().insert(data_dir, acc);
    }
    Ok(views(&state))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config = load_config();
    tauri::Builder::default()
        // Must be the first plugin: if Roster is already running, focus the
        // existing window instead of starting a second, divergent instance.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            use tauri::Manager;
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            config: Mutex::new(config),
            accounts: Mutex::new(HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![
            list_profiles,
            add_profile,
            update_profile,
            remove_profile,
            pre_launch_check,
            launch_profile,
            refresh_accounts,
            claude_status,
            set_claude_path,
            open_data_dir,
            discover_importable,
            import_profile
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
