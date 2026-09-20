//! Reading the signed-in Claude account out of a profile's data directory.
//!
//! Locating and launching Claude lives in [`crate::apps`] — this module is only
//! the identity scrape, which is specific to how Claude caches its account.

use std::fs;
use std::path::Path;

use crate::apps::Account;
use crate::sys::{extract_value, find_sub};

/// Best-effort read of the signed-in account from a profile's IndexedDB.
///
/// Claude caches the account bootstrap (email, name, organization) under the
/// https://claude.ai origin. There's no official schema, so we locate the
/// `email_address` field and scrape the nearby values heuristically. If the
/// format ever changes this simply returns `None` and the UI falls back to a
/// plain "Signed in" badge — nothing breaks.
///
/// Note: while that profile's Claude is running it may hold the live leveldb
/// `.log` exclusively locked, in which case the read yields `None` until Claude
/// flushes or closes.
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

fn parse_account(data: &[u8]) -> Option<Account> {
    let email = extract_value(
        data,
        b"email_address",
        |b| b.is_ascii_alphanumeric() || b"@._%+-".contains(&b),
        128,
    )
    .filter(|s| s.contains('@'));
    email.as_ref()?;
    let printable = |b: u8| b >= 0x20 && b != b'"';
    let name = extract_value(data, b"full_name", printable, 80);
    let org = extract_org(data, name.as_deref());
    Some(Account { email, name, org })
}

/// Drop a leading serialization artifact (a tag/length byte that rendered as
/// printable ASCII, e.g. "c0Stephan") from a scraped value.
fn clean_org(v: &str) -> Option<String> {
    let b = v.as_bytes();
    let start = if b.len() >= 2 && b[0].is_ascii_lowercase() && b[1].is_ascii_digit() {
        2
    } else {
        0
    };
    let c = v[start..].trim().to_string();
    (c.len() >= 2).then_some(c)
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
                if let Some(c) = clean_org(&v) {
                    if person != Some(c.as_str()) {
                        return Some(c);
                    }
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
