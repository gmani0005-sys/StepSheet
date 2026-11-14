# StepSheet Desktop

Native Windows and macOS desktop builds of StepSheet, using [Tauri](https://tauri.app/)
as a thin native shell around the self-contained `StepSheet.html` single-file
build. No backend process and no network connection are required at
runtime — the single-file build already runs the full no-code workbench
client-side.

## Getting the installers

The easiest way is **GitHub Actions** — it builds natively on a real Windows
runner and a real macOS runner (cross-compiling a Windows `.exe` or a macOS
`.app`/`.dmg` from Linux isn't reliably possible, so CI does the platform
-specific work):

1. Go to the repo's **Actions** tab → **Desktop Build (Windows & macOS)** →
   **Run workflow**.
2. Wait for both the `windows` and `macos` jobs to finish (a few minutes).
3. Open the finished run and download the `stepsheet-desktop-windows` and
   `stepsheet-desktop-macos` artifacts from the **Artifacts** section.
   - Windows artifact contains an `.exe` (NSIS installer) and `.msi`.
   - macOS artifact contains a `.dmg` (drag-to-Applications installer).

Pushing a tag like `desktop-v1.0.0` additionally attaches these files to a
(draft) GitHub Release instead of only a workflow artifact.

## Building locally

Requires [Node.js](https://nodejs.org/) and [Rust](https://rustup.rs/), plus
the platform's native webview toolchain (already present on Windows 10/11
and macOS; on Linux you'd need `webkit2gtk` dev packages, but Linux isn't a
target here).

```bash
cd desktop
npm install
npm run build     # copies ../StepSheet.html -> dist/index.html, then builds
```

The installer is written under `src-tauri/target/release/bundle/`.

`npm run dev` launches the app in a live window without building an
installer, for quick checks.

## How it's wired

- `scripts/copy-html.mjs` copies the repo-root `StepSheet.html` into
  `dist/index.html` before each build (building it first via
  `apps/web`'s `build:singlefile` script if it doesn't exist yet).
- `src-tauri/tauri.conf.json` points Tauri's `frontendDist` at that `dist/`
  folder and configures the app window, icon and bundle targets.
- `src-tauri/src/main.rs` is a minimal Tauri entry point — it just opens the
  window on the bundled page; StepSheet needs no custom native (Rust) code.
