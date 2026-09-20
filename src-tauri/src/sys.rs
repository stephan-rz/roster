//! Windows glue shared by every app Roster can launch.
//!
//! Path normalization, MSIX app-activation, shelling out to the shell, and the
//! byte-scraping helpers the per-app account readers build on.

use std::os::windows::process::CommandExt;
use std::process::Command;

/// Don't flash a console window when we shell out to PowerShell.
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Normalize a path for case-insensitive comparison on Windows.
pub fn norm(path: &str) -> String {
    path.replace('/', "\\").trim_end_matches('\\').to_lowercase()
}

/// Activate an MSIX app by AppUserModelID, passing command-line arguments.
///
/// Store builds can't be launched by their .exe path — Windows denies direct
/// execution — and the path is version-stamped anyway, so it moves on every
/// update. The AUMID is stable, so this is the launch route for both Claude
/// and ChatGPT.
///
/// Runs on a dedicated STA thread so it never conflicts with the app's own COM
/// apartment.
pub fn launch_via_aumid(aumid: &str, args: &str) -> Result<u32, String> {
    use windows::core::PCWSTR;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::{
        ApplicationActivationManager, IApplicationActivationManager, AO_NONE,
    };

    let aumid = aumid.to_string();
    let args = args.to_string();
    std::thread::spawn(move || -> Result<u32, String> {
        let aumid_w: Vec<u16> = aumid.encode_utf16().chain(std::iter::once(0)).collect();
        let args_w: Vec<u16> = args.encode_utf16().chain(std::iter::once(0)).collect();
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let result = (|| {
                let manager: IApplicationActivationManager =
                    CoCreateInstance(&ApplicationActivationManager, None, CLSCTX_ALL)
                        .map_err(|e| e.to_string())?;
                manager
                    .ActivateApplication(PCWSTR(aumid_w.as_ptr()), PCWSTR(args_w.as_ptr()), AO_NONE)
                    .map_err(|e| e.to_string())
            })();
            CoUninitialize();
            result
        }
    })
    .join()
    .map_err(|_| "activation thread panicked".to_string())?
}

/// Run a PowerShell one-liner and return its trimmed stdout.
pub fn powershell(script: &str) -> Option<String> {
    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
    (!s.is_empty()).then_some(s)
}

pub fn open_in_explorer(path: &str) -> std::io::Result<()> {
    Command::new("explorer").arg(path).spawn().map(|_| ())
}

/// Open a URL (or file) with the OS default handler — e.g. a link in the browser.
pub fn open_external(target: &str) -> std::io::Result<()> {
    Command::new("cmd")
        .args(["/c", "start", "", target])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map(|_| ())
}

/* ----------------------------- byte scraping ----------------------------- */

pub fn find_sub(hay: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || hay.len() < needle.len() {
        return None;
    }
    hay.windows(needle.len()).position(|w| w == needle)
}

/// After `key`, skip a few serialization tag/length bytes, then collect the
/// value until a control byte or string delimiter.
pub fn extract_value(
    data: &[u8],
    key: &[u8],
    valid: impl Fn(u8) -> bool,
    max: usize,
) -> Option<String> {
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
    (!out.is_empty()).then_some(out)
}
