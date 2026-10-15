//! HingeLab for Windows: a client of the HingeLab website. Designs are built on the server; this
//! app signs in, sends settings, shows the SVG it gets back and saves it.

mod api;
mod auth;
mod config;
mod error;
mod files;
mod projects;
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
use files::{Design, Files, Prefs};

/// Settings for one design are a few kB; generator text fields can be larger.
const MAX_REQUEST: usize = 256 * 1024;

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
    let mut f = state.files.lock().unwrap();
    f.last = None;
    Ok(())
}

#[tauri::command]
async fn me(state: State<'_, AppState>) -> CmdResult<Value> {
    Ok(state.api.call(Method::GET, "/api/desktop/me", None, &[]).await?.1)
}

#[tauri::command]
async fn catalog(state: State<'_, AppState>) -> CmdResult<Value> {
    Ok(state.api.call(Method::GET, "/api/desktop/catalog", None, &[]).await?.1)
}

#[derive(Serialize)]
struct Generated {
    status: u16,
    body: Value,
}

/// Builds a design on the server. A buildable design comes back with an id that Save and Export use.
#[tauri::command]
async fn generate(request: Value, state: State<'_, AppState>) -> CmdResult<Generated> {
    if !request.is_object() || serde_json::to_vec(&request).map(|v| v.len()).unwrap_or(usize::MAX) > MAX_REQUEST {
        return Err(CmdError::new("invalid", "These settings are too large."));
    }
    let (status, mut body) = state.api.call(Method::POST, "/api/desktop/generate", Some(&request), &[400, 403, 422]).await?;
    if !body.get("product").is_some_and(|p| p.is_string()) {
        let msg = body.get("message").and_then(|m| m.as_str()).unwrap_or("The request was not accepted.").to_string();
        return Err(CmdError::new("invalid", msg).with_status(status));
    }
    let mut files = state.files.lock().unwrap();
    files.last = None;
    let svg = body.get("svg").and_then(|s| s.as_str()).filter(|s| status == 200 && files::looks_like_svg(s)).map(str::to_owned);
    if let Some(svg) = svg {
        files.next_id += 1;
        let id = files.next_id;
        let file_name = files::safe_file_name(body.get("fileName").and_then(|s| s.as_str()).unwrap_or("design"));
        files.last = Some(Design { id, svg, file_name });
        body["designId"] = json!(id);
    }
    Ok(Generated { status, body })
}

/// The AI designer's request: a description and a photo the UI shrank to 1024 px.
const MAX_AI_REQUEST: usize = 1536 * 1024;

/// A drawn design is drawn, checked and redrawn on the server, which may take up to 180 s.
const AI_WAIT: std::time::Duration = std::time::Duration::from_secs(190);

/// Asks the AI designer for a design. A product design comes back as settings (and the cut file's
/// preview) that the workspace then opens and builds like any other design; a drawn design comes
/// back as its finished cut file.
#[tauri::command]
async fn ai_design(request: Value, state: State<'_, AppState>) -> CmdResult<Value> {
    if !request.is_object() || serde_json::to_vec(&request).map(|v| v.len()).unwrap_or(usize::MAX) > MAX_AI_REQUEST {
        return Err(CmdError::new("invalid", "This photo is too large."));
    }
    let (status, body) = state.api.call_within(Method::POST, "/api/desktop/ai", Some(&request), &[400, 413, 429, 502, 503], Some(AI_WAIT)).await?;
    if status != 200 || !body.get("product").is_some_and(|p| p.is_string()) {
        let msg: String = body.get("message").and_then(|m| m.as_str()).unwrap_or("The design could not be made. Try again.").chars().take(300).collect();
        let kind = match status {
            429 => "rate_limited",
            502 | 503 => "server",
            _ => "invalid",
        };
        return Err(CmdError::new(kind, msg).with_status(status));
    }
    Ok(body)
}

/// Largest drawn design the AI page hands over for saving, bytes.
const MAX_KEPT_SVG: usize = 8 * 1024 * 1024;

/// Makes a drawn AI design (which has no workspace product to rebuild it) the one Save and Export
/// write, and returns its id.
#[tauri::command]
fn keep_svg(svg: String, file_name: String, state: State<'_, AppState>) -> CmdResult<u64> {
    if svg.len() > MAX_KEPT_SVG || !files::looks_like_svg(&svg) {
        return Err(CmdError::new("invalid", "This design cannot be saved."));
    }
    let mut files = state.files.lock().unwrap();
    files.next_id += 1;
    let id = files.next_id;
    files.last = Some(Design { id, svg, file_name: files::safe_file_name(&file_name) });
    Ok(id)
}

fn design(state: &AppState, id: u64) -> CmdResult<Design> {
    let files = state.files.lock().unwrap();
    files.last.clone().filter(|d| d.id == id).ok_or_else(|| CmdError::new("not_found", "This design changed. Wait for the preview to update, then save again."))
}

async fn save_dialog(app: &AppHandle, file_name: &str, dir: Option<String>) -> Option<PathBuf> {
    let (tx, rx) = oneshot::channel();
    let mut b = app.dialog().file().set_title("Save SVG").set_file_name(file_name).add_filter("SVG drawing", &["svg"]);
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Saved {
    path: Option<String>,
}

/// Save As: the user picks the place in the Windows dialog.
#[tauri::command]
async fn save_design(design_id: u64, app: AppHandle, state: State<'_, AppState>) -> CmdResult<Saved> {
    let d = design(&state, design_id)?;
    let last_dir = state.prefs.lock().unwrap().last_dir.clone();
    let Some(path) = save_dialog(&app, &d.file_name, last_dir).await else { return Ok(Saved { path: None }) };
    let path = files::with_svg_extension(path);
    files::write_svg(&path, &d.svg)?;
    remember_saved(&state, &path);
    Ok(Saved { path: Some(path.to_string_lossy().into_owned()) })
}

/// Export: straight into the export folder from Settings (or Save As when none is set).
#[tauri::command]
async fn export_design(design_id: u64, app: AppHandle, state: State<'_, AppState>) -> CmdResult<Saved> {
    let d = design(&state, design_id)?;
    let (dir, open_after) = {
        let p = state.prefs.lock().unwrap();
        (p.export_dir.clone().map(PathBuf::from).filter(|d| d.is_dir()), p.open_after_export)
    };
    let path = match dir {
        Some(dir) => files::unique_in(&dir, &d.file_name),
        None => {
            let last_dir = state.prefs.lock().unwrap().last_dir.clone();
            match save_dialog(&app, &d.file_name, last_dir).await {
                Some(p) => files::with_svg_extension(p),
                None => return Ok(Saved { path: None }),
            }
        }
    };
    files::write_svg(&path, &d.svg)?;
    remember_saved(&state, &path);
    if open_after {
        let _ = app.opener().reveal_item_in_dir(&path);
    }
    Ok(Saved { path: Some(path.to_string_lossy().into_owned()) })
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
struct ProjectSaved {
    path: Option<String>,
    name: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenedProject {
    path: String,
    name: String,
    /// The file as text when it is a JSON project; None for a Studio (ZIP) project.
    text: Option<String>,
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
    p.project_dir.clone().or_else(|| p.last_dir.clone()).filter(|d| PathBuf::from(d).is_dir())
}

async fn project_save_dialog(app: &AppHandle, file_name: &str, dir: Option<String>) -> Option<PathBuf> {
    let (tx, rx) = oneshot::channel();
    let mut b = app.dialog().file().set_title("Save project").set_file_name(file_name).add_filter("HingeLab project", &["oclc"]);
    if let Some(w) = app.get_webview_window("main") {
        b = b.set_parent(&w);
    }
    if let Some(d) = dir {
        b = b.set_directory(d);
    }
    b.save_file(move |p| {
        let _ = tx.send(p.and_then(|p| p.into_path().ok()));
    });
    rx.await.ok().flatten().map(projects::with_oclc_extension)
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
    projects::push_recent(&mut prefs.recent_files, path);
    let _ = files::save_prefs(&state.prefs_dir, &prefs);
}

async fn write_project_to(target: Option<PathBuf>, content: &str, name: &str, app: &AppHandle, state: &AppState) -> CmdResult<ProjectSaved> {
    let target = match target {
        Some(p) => p,
        None => match project_save_dialog(app, &projects::project_file_name(name), project_dir(state)).await {
            Some(p) => p,
            None => return Ok(ProjectSaved { path: None, name: None }),
        },
    };
    projects::write_project(&target, content)?;
    remember_project(state, &target);
    Ok(ProjectSaved { name: Some(file_name_of(&target)), path: Some(target.to_string_lossy().into_owned()) })
}

/// Save: writes over the design's project file when it was opened or saved in this session,
/// otherwise asks where (like Save As).
#[tauri::command]
async fn save_project(content: String, name: String, path: Option<String>, app: AppHandle, state: State<'_, AppState>) -> CmdResult<ProjectSaved> {
    let known = path.map(PathBuf::from).filter(|p| state.files.lock().unwrap().projects.contains(p));
    write_project_to(known, &content, &name, &app, &state).await
}

/// Save As: always asks where.
#[tauri::command]
async fn save_project_as(content: String, name: String, app: AppHandle, state: State<'_, AppState>) -> CmdResult<ProjectSaved> {
    write_project_to(None, &content, &name, &app, &state).await
}

/// Opens a project file: one from the Recent list or this session, or one picked in the dialog.
#[tauri::command]
async fn open_project(path: Option<String>, app: AppHandle, state: State<'_, AppState>) -> CmdResult<Option<OpenedProject>> {
    let path = match path {
        Some(p) => {
            let p = PathBuf::from(p);
            let known = state.files.lock().unwrap().projects.contains(&p) || state.prefs.lock().unwrap().recent_files.iter().any(|r| Path::new(r) == p);
            if !known {
                return Err(CmdError::new("not_found", "Open that file with File > Open."));
            }
            p
        }
        None => match project_open_dialog(&app, project_dir(&state)).await {
            Some(p) => p,
            None => return Ok(None),
        },
    };
    let bytes = projects::read_project(&path)?;
    remember_project(&state, &path);
    let text = (!bytes.starts_with(b"PK")).then(|| String::from_utf8_lossy(bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(&bytes)).into_owned());
    Ok(Some(OpenedProject { name: file_name_of(&path), path: path.to_string_lossy().into_owned(), text }))
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
            catalog,
            generate,
            ai_design,
            keep_svg,
            save_design,
            export_design,
            reveal_file,
            open_web,
            get_prefs,
            choose_export_folder,
            set_export_prefs,
            save_project,
            save_project_as,
            open_project,
            web_open_file,
            recent_projects,
            forget_recent,
            take_open_request,
            web::web_open,
            web::web_bounds,
            web::web_hide,
            web::web_action
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
