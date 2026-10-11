// Declaring the app's commands makes each one need an explicit permission in capabilities/.
const COMMANDS: &[&str] = &[
    "app_info",
    "sign_in",
    "cancel_sign_in",
    "sign_out",
    "me",
    "catalog",
    "generate",
    "save_design",
    "export_design",
    "reveal_file",
    "open_web",
    "get_prefs",
    "choose_export_folder",
    "set_export_prefs",
    "web_open",
    "web_bounds",
    "web_hide",
    "web_action",
];

fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(COMMANDS))).expect("tauri build");
}
