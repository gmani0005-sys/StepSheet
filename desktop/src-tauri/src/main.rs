// StepSheet desktop shell — loads the self-contained StepSheet.html build
// (copied into ../dist/index.html at build time) in a native OS webview.
// No backend process, no network dependency: the single-file build already
// bundles the full no-code workbench to run entirely client-side.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running StepSheet desktop application");
}
