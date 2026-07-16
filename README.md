# Roster

**Run multiple Claude Desktop accounts side by side on Windows.**

Claude Desktop has no account switcher — if you use a personal and a work account, you're stuck signing in and out. Roster runs each account in its own isolated window so you can use them at the same time.

> ⚠️ **Unofficial.** Roster is an independent tool and is **not affiliated with, endorsed by, or supported by Anthropic.** "Claude" is a trademark of Anthropic.

## Features

- 🪟 **Side by side** — run any number of Claude accounts at once, each in its own window
- 🎨 **Color-coded** — every account gets an accent color so you never mix them up
- 👤 **Know who's who** — see the signed-in account's name, email, and (manually tagged) plan on each card
- ⚡ **Import existing logins** — adopt the Claude accounts you're already signed into, no re-login
- 🚀 **One-click launch** — open one profile, or all of them

## Install

1. Download the latest `Roster_x.y.z_x64-setup.exe` from the [Releases](../../releases) page.
2. Run it. Because it isn't code-signed yet, Windows SmartScreen may say *"Windows protected your PC"* — click **More info → Run anyway**.

Requires [Claude Desktop](https://claude.ai/download).

## How it works

Claude Desktop is an Electron app, and Electron accepts a `--user-data-dir` flag that points an instance at its own data folder — a separate login, history, and settings. Roster manages a set of these per-account folders and launches an isolated Claude instance for each, so your logins live in their own directories and are never shared between accounts.

## Build from source

Prerequisites: [Node.js](https://nodejs.org) and the [Rust toolchain](https://rustup.rs), plus the MSVC build tools + WebView2 (see the [Tauri prerequisites](https://tauri.app/start/prerequisites/)).

```bash
npm install
npm run tauri dev      # run in development
npm run tauri build    # produce an installer
```

Built with [Tauri](https://tauri.app) (Rust) · React · TypeScript.

## License

[MIT](LICENSE)
