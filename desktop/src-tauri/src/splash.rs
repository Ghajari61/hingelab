//! The start-up splash: a small transparent, undecorated window ("splash") that plays the 3D
//! reveal while the main window loads hidden. The main window's UI calls `app_ready` once its first
//! screen is drawn; the splash finishes its reveal (faster if the app was quick), calls
//! `splash_done` as it starts to fade, and the main window appears under it. Safety nets: the main
//! window shows on its own if the splash window could not be made, if the splash never answers, or
//! if the UI never says it is ready (a start-up error must still show the window).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

pub const LABEL: &str = "splash";
/// Longest the main window stays hidden if the UI never reports ready.
const MAIN_TIMEOUT: Duration = Duration::from_secs(25);
/// Longest the splash may take to finish once the UI is ready.
const FINISH_TIMEOUT: Duration = Duration::from_secs(4);
/// The splash's fade-out, after which its window closes.
const FADE: Duration = Duration::from_millis(450);

#[derive(Default)]
pub struct SplashState {
    ready: AtomicBool,
    shown: AtomicBool,
    status: Mutex<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SplashInfo {
    ready: bool,
    status: String,
}

/// Opens the splash window; false when it could not be made (the main window then shows as before).
pub fn open(app: &AppHandle, allowed: fn(&url::Url) -> bool) -> bool {
    let built = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("splash.html".into()))
        .title("HingeLab")
        .inner_size(820.0, 480.0)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .center()
        .on_navigation(move |u| allowed(u))
        .build();
    if built.is_err() {
        return false;
    }
    // If the UI never reports ready (a start-up error), show the main window anyway.
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(MAIN_TIMEOUT);
        show_main(&handle);
    });
    true
}

pub fn exists(app: &AppHandle) -> bool {
    app.get_webview_window(LABEL).is_some()
}

/// Shows and focuses the main window once, and closes the splash after its fade.
pub fn show_main(app: &AppHandle) {
    let Some(state) = app.try_state::<SplashState>() else { return };
    if state.shown.swap(true, Ordering::SeqCst) {
        return;
    }
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(FADE);
        if let Some(s) = handle.get_webview_window(LABEL) {
            let _ = s.close();
        }
    });
}

/// The main window's UI has drawn its first screen.
#[tauri::command]
pub fn app_ready(app: AppHandle, state: State<'_, SplashState>) {
    state.ready.store(true, Ordering::SeqCst);
    if !exists(&app) {
        show_main(&app);
        return;
    }
    let _ = app.emit_to(LABEL, "app-ready", ());
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(FINISH_TIMEOUT);
        show_main(&handle);
    });
}

/// A real start-up step from the main UI ("Checking your sign-in"), shown by the splash if it waits.
#[tauri::command]
pub fn splash_progress(app: AppHandle, state: State<'_, SplashState>, text: String) {
    let text: String = text.chars().take(60).collect();
    *state.status.lock().unwrap() = text.clone();
    let _ = app.emit_to(LABEL, "splash-progress", text);
}

/// What the splash missed before it was listening.
#[tauri::command]
pub fn splash_state(state: State<'_, SplashState>) -> SplashInfo {
    SplashInfo { ready: state.ready.load(Ordering::SeqCst), status: state.status.lock().unwrap().clone() }
}

/// The splash starts to fade: show the app under it.
#[tauri::command]
pub fn splash_done(app: AppHandle) {
    show_main(&app);
}
