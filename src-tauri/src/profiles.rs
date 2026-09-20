//! Profile model + on-disk config.
//!
//! Roster stores its config at %APPDATA%\Roster\config.json and keeps each
//! profile's isolated app data under %APPDATA%\Roster\profiles\<id>.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::apps::AppKind;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    /// Stable, name-independent id. Used as the data-dir folder name so a
    /// profile can be renamed without orphaning its signed-in session.
    pub id: String,
    pub name: String,
    /// Accent color as a hex string, e.g. "#3B82F6".
    pub color: String,
    /// Absolute path passed to the app as --user-data-dir.
    pub data_dir: String,
    /// User-set subscription plan label (e.g. "Pro", "Max"); None if unset.
    #[serde(default)]
    pub plan: Option<String>,
    /// Which app this profile launches. Defaults to Claude so configs written
    /// before ChatGPT support load unchanged.
    #[serde(default)]
    pub app: AppKind,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Config {
    #[serde(default)]
    pub profiles: Vec<Profile>,
    /// Optional manual override for the Claude.exe path.
    #[serde(default)]
    pub claude_path: Option<String>,
    /// Optional manual override for the ChatGPT.exe path.
    #[serde(default)]
    pub chatgpt_path: Option<String>,
}

impl Config {
    pub fn path_for(&self, app: AppKind) -> &Option<String> {
        match app {
            AppKind::Claude => &self.claude_path,
            AppKind::ChatGpt => &self.chatgpt_path,
        }
    }

    pub fn set_path_for(&mut self, app: AppKind, path: Option<String>) {
        let slot = match app {
            AppKind::Claude => &mut self.claude_path,
            AppKind::ChatGpt => &mut self.chatgpt_path,
        };
        *slot = path.filter(|s| !s.trim().is_empty());
    }
}

pub fn config_dir() -> PathBuf {
    let base = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(base).join("Roster")
}

pub fn profiles_root() -> PathBuf {
    config_dir().join("profiles")
}

fn config_path() -> PathBuf {
    config_dir().join("config.json")
}

pub fn load_config() -> Config {
    match fs::read_to_string(config_path()) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => Config::default(),
    }
}

pub fn save_config(config: &Config) -> std::io::Result<()> {
    fs::create_dir_all(config_dir())?;
    let json = serde_json::to_string_pretty(config).unwrap_or_else(|_| "{}".to_string());
    fs::write(config_path(), json)
}
