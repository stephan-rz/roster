# Releasing

Releases are automated. Pushing a version tag builds Roster on GitHub's runners,
signs the update payload, publishes the release, and writes the `latest.json`
manifest that installed copies poll — so everyone auto-updates.

## One-time setup

Add these repository secrets (**Settings → Secrets and variables → Actions → New repository secret**):

| Secret | Value |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | The full contents of the updater private key file |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | The key's password (leave empty if it has none) |

The matching **public** key is committed in `src-tauri/tauri.conf.json` under
`plugins.updater.pubkey`.

> ⚠️ Keep the private key safe and backed up. The app only accepts updates signed
> with it — lose it and existing installs can never be updated again.

## Cutting a release

1. Bump the version in **all three** places so they match:
   - `src-tauri/tauri.conf.json` → `version`
   - `src-tauri/Cargo.toml` → `[package] version`
   - `package.json` → `version`
2. Commit the bump.
3. Tag and push:

   ```bash
   git tag v0.2.0
   git push --tags
   ```

GitHub Actions builds and publishes it. Installed copies pick it up on their next
launch and offer **Install & restart**.

## Notes

- The installer is **not code-signed**, so Windows SmartScreen warns on install.
  Adding an Authenticode certificate to the same workflow would remove that.
- `ROSTER_DEMO=1` runs the app with fake accounts — handy for screenshots.
