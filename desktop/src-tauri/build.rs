// Declaring the app's commands makes each one need an explicit permission in capabilities/.
const COMMANDS: &[&str] = &[
    "app_info",
    "sign_in",
    "cancel_sign_in",
    "sign_out",
    "me",
    "reveal_file",
    "open_web",
    "get_prefs",
    "choose_export_folder",
    "set_export_prefs",
    "choose_project_folder",
    "set_project_prefs",
    "web_open_file",
    "recent_projects",
    "forget_recent",
    "take_open_request",
    "web_open",
    "web_bounds",
    "web_hide",
    "web_action",
    "api_request",
    "save_file",
    "open_file",
    "open_external",
];

fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(COMMANDS))).expect("tauri build");
}
