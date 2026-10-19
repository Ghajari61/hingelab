//! HingeLab for Windows: a client of the HingeLab website. Designs are built on the server; this
//! app signs in, sends settings, shows the SVG it gets back and saves it.

mod api;
mod auth;
mod config;
mod error;
mod files;
mod projects;
mod shared;
mod store;
mod web;

use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::sync::Mutex;

use reqwest::Method;
use serde::Serialize;
use serde_json::{json, Value};
use base64::Engine;
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, DragDropEvent, Emitter, Manager, State, WebviewEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use tokio::sync::oneshot;
use url::Url;

use api::Api;
use error::{CmdError, CmdResult};
use files::{Files, Prefs};

struct AppState {
    api: Api,
    version: String,
    files: Mutex<Files>,
    prefs: Mutex<Prefs>,
    prefs_dir: PathBuf,
    web: web::WebState,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    version: String,
    server: String,
    signed_in: bool,
}

#[tauri::command]
async fn app_info(state: State<'_, AppState>) -> CmdResult<AppInfo> {
    Ok(AppInfo { version: state.version.clone(), server: state.api.base().host_str().unwrap_or_default().to_string(), signed_in: state.api.signed_in().await })
}

#[tauri::command]
async fn sign_in(app: AppHandle, state: State<'_, AppState>) -> CmdResult<Value> {
    let generation = auth::SIGN_IN_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let pending = auth::begin(&state.api).await?;
    open_authorize(&app, &pending.authorize_url)?;
    let code = match auth::wait_for_callback(&pending, generation).await? {
        auth::Callback::Code(c) => c,
        auth::Callback::Denied => return Err(CmdError::new("cancelled", "Sign-in was cancelled in the browser.")),
    };
    let body = json!({
        "grant_type": "authorization_code",
        "code": code,
        "code_verifier": pending.verifier,
        "redirect_uri": pending.redirect_uri,
        "device": format!("Windows · HingeLab {}", state.version),
    });
    let tokens = state.api.token_request(body).await?.map_err(|_| CmdError::new("invalid", "Sign-in was not accepted. Try again."))?;
    state.api.set_tokens(tokens).await?;
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
    Ok(state.api.call(Method::GET, "/api/desktop/me", None, &[]).await?.1)
}

#[cfg(not(feature = "e2e"))]
fn open_authorize(app: &AppHandle, url: &Url) -> CmdResult<()> {
    app.opener().open_url(url.as_str(), None::<&str>).map_err(|_| CmdError::new("io", "Could not open your web browser."))
}

/// Test builds hand the sign-in page to the test driver instead of the default browser.
#[cfg(feature = "e2e")]
fn open_authorize(_app: &AppHandle, url: &Url) -> CmdResult<()> {
    let path = std::env::var("HINGELAB_E2E_AUTH_URL_FILE").map_err(|_| CmdError::new("io", "HINGELAB_E2E_AUTH_URL_FILE is not set"))?;
    std::fs::write(path, url.as_str()).map_err(|_| CmdError::new("io", "could not write the sign-in URL"))
}

#[tauri::command]
fn cancel_sign_in() {
    auth::SIGN_IN_GENERATION.fetch_add(1, Ordering::SeqCst);
}

#[tauri::command]
async fn sign_out(app: AppHandle, state: State<'_, AppState>) -> CmdResult<()> {
    state.api.sign_out().await;
    web::sign_out(&app, &state);
    Ok(())
}

#[tauri::command]
async fn me(state: State<'_, AppState>) -> CmdResult<Value> {
    Ok(state.api.call(Method::GET, "/api/desktop/me", None, &[]).await?.1)
}

async fn save_dialog_for(app: &AppHandle, file_name: &str, dir: Option<String>, title: &str, filter: &str, ext: &str) -> Option<PathBuf> {
    let (tx, rx) = oneshot::channel();
    let mut b = app.dialog().file().set_title(title).set_file_name(file_name).add_filter(filter, &[ext]);
    if let Some(w) = app.get_webview_window("main") {
        b = b.set_parent(&w);
    }
    if let Some(d) = dir.filter(|d| PathBuf::from(d).is_dir()) {
        b = b.set_directory(d);
    }
    b.save_file(move |p| {
        let _ = tx.send(p.and_then(|p| p.into_path().ok()));
    });
    rx.await.ok().flatten()
}

fn remember_saved(state: &AppState, path: &PathBuf) {
    state.files.lock().unwrap().saved.insert(path.clone());
    let mut prefs = state.prefs.lock().unwrap();
    prefs.last_dir = path.parent().map(|p| p.to_string_lossy().into_owned());
    let _ = files::save_prefs(&state.prefs_dir, &prefs);
}

/// Shows a file saved in this session in Explorer (no other paths).
#[tauri::command]
fn reveal_file(path: String, app: AppHandle, state: State<'_, AppState>) -> CmdResult<()> {
    let p = PathBuf::from(&path);
    if !state.files.lock().unwrap().saved.contains(&p) {
        return Err(CmdError::new("not_found", "That file was not saved by HingeLab in this session."));
    }
    app.opener().reveal_item_in_dir(&p).map_err(|_| CmdError::new("io", "Could not open the folder."))
}

/// Opens an allowlisted page of the website in the default browser.
#[tauri::command]
fn open_web(page: String, app: AppHandle, state: State<'_, AppState>) -> CmdResult<()> {
    let path = config::web_page(&page).ok_or_else(|| CmdError::new("invalid", "Unknown page."))?;
    app.opener().open_url(state.api.url(path).as_str(), None::<&str>).map_err(|_| CmdError::new("io", "Could not open your web browser."))
}

#[tauri::command]
fn get_prefs(state: State<'_, AppState>) -> Prefs {
    state.prefs.lock().unwrap().clone()
}

#[tauri::command]
async fn choose_export_folder(app: AppHandle, state: State<'_, AppState>) -> CmdResult<Prefs> {
    let (tx, rx) = oneshot::channel();
    let mut b = app.dialog().file().set_title("Choose the export folder");
    if let Some(w) = app.get_webview_window("main") {
        b = b.set_parent(&w);
    }
    b.pick_folder(move |p| {
        let _ = tx.send(p.and_then(|p| p.into_path().ok()));
    });
    let picked = rx.await.ok().flatten();
    let mut prefs = state.prefs.lock().unwrap();
    if let Some(dir) = picked.filter(|d| d.is_dir()) {
        prefs.export_dir = Some(dir.to_string_lossy().into_owned());
        files::save_prefs(&state.prefs_dir, &prefs)?;
    }
    Ok(prefs.clone())
}

#[tauri::command]
fn set_export_prefs(clear_folder: bool, open_after_export: bool, state: State<'_, AppState>) -> CmdResult<Prefs> {
    let mut prefs = state.prefs.lock().unwrap();
    if clear_folder {
        prefs.export_dir = None;
    }
    prefs.open_after_export = open_after_export;
    files::save_prefs(&state.prefs_dir, &prefs)?;
    Ok(prefs.clone())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RecentProject {
    path: String,
    name: String,
    exists: bool,
}

fn file_name_of(p: &Path) -> String {
    p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
}

fn project_dir(state: &AppState) -> Option<String> {
    let p = state.prefs.lock().unwrap();
    let is_dir = |d: &String| PathBuf::from(d).is_dir();
    p.home_dir.clone().filter(is_dir).or_else(|| p.project_dir.clone().filter(is_dir)).or_else(|| p.last_dir.clone().filter(is_dir))
}

#[tauri::command]
async fn choose_project_folder(app: AppHandle, state: State<'_, AppState>) -> CmdResult<Prefs> {
    let (tx, rx) = oneshot::channel();
    let mut b = app.dialog().file().set_title("Choose the folder for project files");
    if let Some(w) = app.get_webview_window("main") {
        b = b.set_parent(&w);
    }
    if let Some(d) = project_dir(&state) {
        b = b.set_directory(d);
    }
    b.pick_folder(move |p| {
        let _ = tx.send(p.and_then(|p| p.into_path().ok()));
    });
    let picked = rx.await.ok().flatten();
    let mut prefs = state.prefs.lock().unwrap();
    if let Some(dir) = picked.filter(|d| d.is_dir()) {
        prefs.home_dir = Some(dir.to_string_lossy().into_owned());
        files::save_prefs(&state.prefs_dir, &prefs)?;
    }
    Ok(prefs.clone())
}

/// Settings › Project files: forget the chosen folder, and how many files Recent keeps.
#[tauri::command]
fn set_project_prefs(clear_folder: bool, recent_max: usize, state: State<'_, AppState>) -> CmdResult<Prefs> {
    let mut prefs = state.prefs.lock().unwrap();
    if clear_folder {
        prefs.home_dir = None;
    }
    prefs.recent_max = projects::recent_limit(recent_max);
    let keep = prefs.recent_max;
    prefs.recent_files.truncate(keep);
    files::save_prefs(&state.prefs_dir, &prefs)?;
    Ok(prefs.clone())
}

async fn project_open_dialog(app: &AppHandle, dir: Option<String>) -> Option<PathBuf> {
    let (tx, rx) = oneshot::channel();
    let mut b = app.dialog().file().set_title("Open project").add_filter("HingeLab project", projects::OPEN_EXTS);
    if let Some(w) = app.get_webview_window("main") {
        b = b.set_parent(&w);
    }
    if let Some(d) = dir {
        b = b.set_directory(d);
    }
    b.pick_file(move |p| {
        let _ = tx.send(p.and_then(|p| p.into_path().ok()));
    });
    rx.await.ok().flatten()
}

/// A project file the user saved or opened: Save writes over it, Recent lists it.
fn remember_project(state: &AppState, path: &Path) {
    state.files.lock().unwrap().projects.insert(path.to_path_buf());
    let mut prefs = state.prefs.lock().unwrap();
    prefs.project_dir = path.parent().map(|p| p.to_string_lossy().into_owned());
    let max = prefs.recent_max;
    projects::push_recent(&mut prefs.recent_files, path, max);
    let _ = files::save_prefs(&state.prefs_dir, &prefs);
}

/// Hands a project the app has no editor for (Letters, Parametric, Studio) to the website view,
/// which opens it at `web::OPEN_FILE_PAGE` (the UI opens that page next).
#[tauri::command]
fn web_open_file(path: String, state: State<'_, AppState>) -> CmdResult<String> {
    let p = PathBuf::from(&path);
    if !state.files.lock().unwrap().projects.contains(&p) {
        return Err(CmdError::new("not_found", "Open that file with File > Open."));
    }
    let bytes = projects::read_project(&p)?;
    web::hold_file(&state, base64::engine::general_purpose::STANDARD.encode(&bytes), file_name_of(&p));
    Ok(web::OPEN_FILE_PAGE.to_string())
}

#[tauri::command]
fn recent_projects(state: State<'_, AppState>) -> Vec<RecentProject> {
    let list = state.prefs.lock().unwrap().recent_files.clone();
    list.into_iter()
        .map(|p| {
            let path = PathBuf::from(&p);
            RecentProject { name: file_name_of(&path), exists: path.is_file(), path: p }
        })
        .collect()
}

/// Removes one file from Recent, or all of them when no path is given.
#[tauri::command]
fn forget_recent(path: Option<String>, state: State<'_, AppState>) -> CmdResult<()> {
    let mut prefs = state.prefs.lock().unwrap();
    match path {
        Some(p) => prefs.recent_files.retain(|r| r != &p),
        None => prefs.recent_files.clear(),
    }
    files::save_prefs(&state.prefs_dir, &prefs)
}

/// The project file Windows asked the app to open (a double-click, a drop or a second launch), once.
#[tauri::command]
fn take_open_request(state: State<'_, AppState>) -> Option<String> {
    let mut files = state.files.lock().unwrap();
    let p = files.pending_open.take()?;
    files.projects.insert(p.clone());
    Some(p.to_string_lossy().into_owned())
}

/// Queues a project file for the UI and tells it (the UI asks with `take_open_request`).
fn request_open(app: &AppHandle, path: PathBuf) {
    let Some(state) = app.try_state::<AppState>() else { return };
    {
        let mut files = state.files.lock().unwrap();
        if files.pending_open.as_ref() == Some(&path) {
            return;
        }
        files.pending_open = Some(path);
    }
    let _ = app.emit_to("main", "open-file-request", ());
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn dropped_project(event: &DragDropEvent) -> Option<PathBuf> {
    match event {
        DragDropEvent::Drop { paths, .. } => paths.iter().find(|p| projects::is_project_path(p) && p.is_file()).cloned(),
        _ => None,
    }
}

/// The app's own pages only: anything else (a link, a redirect) is blocked inside the window.
fn navigation_allowed(url: &Url) -> bool {
    match url.scheme() {
        "tauri" => url.host_str() == Some("localhost"),
        "http" | "https" => url.host_str() == Some("tauri.localhost") || (cfg!(debug_assertions) && url.host_str() == Some("localhost") && url.port() == Some(5174)),
        _ => false,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            if let Some(p) = projects::project_arg(args, Path::new(&cwd)) {
                request_open(app, p);
            }
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(tauri_plugin_window_state::StateFlags::all() & !tauri_plugin_window_state::StateFlags::VISIBLE)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let prefs_dir = app.path().app_config_dir()?;
            let version = app.package_info().version.to_string();
            let cwd = std::env::current_dir().unwrap_or_default();
            let launch = Files { pending_open: projects::project_arg(std::env::args(), &cwd), ..Files::default() };
            app.manage(AppState { api: Api::new(&version), version, files: Mutex::new(launch), prefs: Mutex::new(files::load_prefs(&prefs_dir)), prefs_dir, web: web::WebState::default() });
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("HingeLab")
                .inner_size(1360.0, 860.0)
                .min_inner_size(960.0, 620.0)
                .center()
                .visible(false)
                .on_navigation(navigation_allowed)
                .on_page_load(|w, p| {
                    if p.event() == PageLoadEvent::Finished {
                        let _ = w.show();
                    }
                })
                .build()?;
            Ok(())
        })
        .on_window_event(|w, e| {
            if let WindowEvent::DragDrop(d) = e {
                if let Some(p) = dropped_project(d) {
                    request_open(w.app_handle(), p);
                }
            }
        })
        .on_webview_event(|w, e| {
            let WebviewEvent::DragDrop(d) = e else { return };
            if let Some(p) = dropped_project(d) {
                request_open(w.app_handle(), p);
            }
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            sign_in,
            cancel_sign_in,
            sign_out,
            me,
            reveal_file,
            open_web,
            get_prefs,
            choose_export_folder,
            set_export_prefs,
            choose_project_folder,
            set_project_prefs,
            web_open_file,
            recent_projects,
            forget_recent,
            take_open_request,
            web::web_open,
            web::web_bounds,
            web::web_hide,
            web::web_action,
            shared::api_request,
            shared::save_file,
            shared::open_file,
            shared::open_external
        ])
        .run(tauri::generate_context!())
        .expect("error while running HingeLab");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn navigation_is_restricted() {
        assert!(navigation_allowed(&Url::parse("http://tauri.localhost/index.html").unwrap()));
        assert!(navigation_allowed(&Url::parse("tauri://localhost/").unwrap()));
        assert!(!navigation_allowed(&Url::parse("https://evil.example/").unwrap()));
        assert!(!navigation_allowed(&Url::parse("https://hingelab.vercel.app/").unwrap()));
        assert!(!navigation_allowed(&Url::parse("file:///C:/Windows/System32/").unwrap()));
        assert!(!navigation_allowed(&Url::parse("javascript:alert(1)").unwrap()));
    }
}
