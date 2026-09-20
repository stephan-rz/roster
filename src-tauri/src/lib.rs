mod apps;
mod claude;
mod profiles;
mod sys;

use apps::{Account, AppKind};
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
    accounts: Mutex<HashMap<String, Account>>,
}

/// A profile plus its live status and (if known) signed-in account, for the UI.
#[derive(serde::Serialize)]
pub struct ProfileView {
    id: String,
    name: String,
    color: String,
    plan: Option<String>,
    app: AppKind,
    data_dir: String,
    running: bool,
    signed_in: bool,
    account: Option<Account>,
}

/// Whether one app was found on this machine, and where.
#[derive(serde::Serialize)]
struct AppStatus {
    app: AppKind,
    label: String,
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
    app: AppKind,
    signed_in: bool,
    account: Option<Account>,
}

fn build_views(config: &Config, accounts: &HashMap<String, Account>) -> Vec<ProfileView> {
    let running = apps::running_data_dirs();
    let empty: Vec<String> = Vec::new();
    config
        .profiles
        .iter()
        .map(|p| {
            let signed_in = p.app.is_signed_in(&p.data_dir);
            let live = running.get(&p.app).unwrap_or(&empty);
            ProfileView {
                id: p.id.clone(),
                name: p.name.clone(),
                color: p.color.clone(),
                plan: p.plan.clone(),
                app: p.app,
                data_dir: p.data_dir.clone(),
                running: live.contains(&sys::norm(&p.data_dir)),
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
/// trying the UI without touching real app data. Off by default.
fn is_demo() -> bool {
    std::env::var("ROSTER_DEMO").is_ok()
}

fn demo_views() -> Vec<ProfileView> {
    let acc = |name: &str, email: &str, org: Option<&str>| {
        Some(Account {
            email: Some(email.to_string()),
            name: Some(name.to_string()),
            org: org.map(|s| s.to_string()),
        })
    };
    #[allow(clippy::too_many_arguments)]
    let v = |id: &str,
             name: &str,
             color: &str,
             plan: &str,
             app: AppKind,
             running: bool,
             signed_in: bool,
             account: Option<Account>| ProfileView {
        id: id.to_string(),
        name: name.to_string(),
        color: color.to_string(),
        plan: (!plan.is_empty()).then(|| plan.to_string()),
        app,
        data_dir: String::new(),
        running,
        signed_in,
        account,
    };
    vec![
        v("1", "Personal", "#3B82F6", "Max", AppKind::Claude, true, true,
          acc("Alex Rivers", "alex.rivers@gmail.com", None)),
        v("2", "Work", "#EF4444", "Team", AppKind::Claude, false, true,
          acc("Alex Rivers", "alex@acme.co", Some("Acme Inc"))),
        v("3", "Personal", "#10B981", "Plus", AppKind::ChatGpt, true, true, None),
        v("4", "Client — Nova", "#8B5CF6", "Business", AppKind::ChatGpt, false, false, None),
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
    app: AppKind,
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
            app,
        });
        save_config(&config).map_err(|e| e.to_string())?;
    }
    Ok(views(&state))
}

/// The app a profile launches is fixed at creation — its data folder is laid
/// out for that app — so only the cosmetic fields are editable.
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
    let profile = config.profiles.iter().find(|p| p.id == id);
    LaunchCheck {
        first_run: profile
            .map(|p| apps::dir_is_empty_or_missing(&p.data_dir))
            .unwrap_or(false),
        // Only the same app's windows can steal a sign-in.
        others_running: profile.map(|p| p.app.any_running()).unwrap_or(false),
    }
}

#[tauri::command]
fn launch_profile(state: State<AppState>, id: String) -> Result<(), String> {
    let (app, data_dir, override_path) = {
        let config = state.config.lock().unwrap();
        let p = config
            .profiles
            .iter()
            .find(|p| p.id == id)
            .ok_or("Profile not found")?;
        (p.app, p.data_dir.clone(), config.path_for(p.app).clone())
    };
    app.launch(&data_dir, &override_path)?;
    Ok(())
}

/// Re-read the signed-in account for each profile from disk and refresh the
/// cache. Called by the UI on load and after a launch — not on every poll.
#[tauri::command]
fn refresh_accounts(state: State<AppState>) -> Vec<ProfileView> {
    if is_demo() {
        return demo_views();
    }
    let targets: Vec<(AppKind, String)> = {
        let config = state.config.lock().unwrap();
        config
            .profiles
            .iter()
            .filter(|p| p.app.is_signed_in(&p.data_dir))
            .map(|p| (p.app, p.data_dir.clone()))
            .collect()
    };
    // Do the (potentially slow) storage reads without holding any lock.
    let found: Vec<(String, Option<Account>)> = targets
        .into_iter()
        .map(|(app, dir)| {
            let a = app.read_account(&dir);
            (dir, a)
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
fn app_statuses(state: State<AppState>) -> Vec<AppStatus> {
    if is_demo() {
        return AppKind::ALL
            .into_iter()
            .map(|app| AppStatus {
                app,
                label: app.label().to_string(),
                found: true,
                path: Some(app.exe_name().to_string()),
            })
            .collect();
    }
    let config = state.config.lock().unwrap();
    AppKind::ALL
        .into_iter()
        .map(|app| {
            let detected = app.detect_exe(config.path_for(app));
            AppStatus {
                app,
                label: app.label().to_string(),
                found: detected.is_some(),
                path: detected.map(|p| p.to_string_lossy().to_string()),
            }
        })
        .collect()
}

#[tauri::command]
fn set_app_path(
    state: State<AppState>,
    app: AppKind,
    path: Option<String>,
) -> Result<Vec<AppStatus>, String> {
    {
        let mut config = state.config.lock().unwrap();
        config.set_path_for(app, path);
        save_config(&config).map_err(|e| e.to_string())?;
    }
    Ok(app_statuses(state))
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
    sys::open_in_explorer(&dir).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    sys::open_external(&url).map_err(|e| e.to_string())
}

#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Find existing data folders — for any supported app — that aren't already
/// Roster profiles.
#[tauri::command]
fn discover_importable(state: State<AppState>) -> Vec<ImportCandidate> {
    let existing: Vec<String> = {
        let config = state.config.lock().unwrap();
        config
            .profiles
            .iter()
            .map(|p| sys::norm(&p.data_dir))
            .collect()
    };
    AppKind::ALL
        .into_iter()
        .flat_map(|app| {
            app.candidate_data_dirs()
                .into_iter()
                .map(move |p| (app, p))
        })
        .filter_map(|(app, p)| {
            let ds = p.to_string_lossy().to_string();
            if existing.contains(&sys::norm(&ds)) {
                return None;
            }
            Some(ImportCandidate {
                suggested_name: app.suggested_name(&p),
                signed_in: app.is_signed_in(&ds),
                account: app.read_account(&ds),
                app,
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
    app: AppKind,
) -> Result<Vec<ProfileView>, String> {
    {
        let mut config = state.config.lock().unwrap();
        if config
            .profiles
            .iter()
            .any(|p| sys::norm(&p.data_dir) == sys::norm(&data_dir))
        {
            return Err("That folder is already in Roster.".into());
        }
        config.profiles.push(Profile {
            id: new_id(),
            name: name.trim().to_string(),
            color,
            data_dir: data_dir.clone(),
            plan: None,
            app,
        });
        save_config(&config).map_err(|e| e.to_string())?;
    }
    if let Some(acc) = app.read_account(&data_dir) {
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
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
            app_statuses,
            set_app_path,
            open_data_dir,
            open_url,
            app_version,
            discover_importable,
            import_profile
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
