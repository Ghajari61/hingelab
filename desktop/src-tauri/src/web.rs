//! The website inside the app window: a second webview (label "web") over the app's content area
//! showing the HingeLab website's editors and pages, signed in as the app's account.
//!
//! It has no IPC (capabilities grant commands to the "main" webview only, and no remote URLs). It
//! only shows the website: links elsewhere open in the default browser, everything else is blocked.
//! Downloads are limited to drawing/project file types and land in the export folder or Downloads.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::webview::{DownloadEvent, NewWindowResponse, PageLoadEvent};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Rect, Runtime, State, Webview, WebviewBuilder, WebviewUrl};
use tauri_plugin_opener::OpenerExt;
use url::Url;

use crate::api::Api;
use crate::error::{CmdError, CmdResult};
use crate::{files, AppState};

pub const LABEL: &str = "web";
/// A page that lands on the website's sign-in screen is signed in again at most this often.
const RESIGN_EVERY: Duration = Duration::from_secs(60);
const MAX_PATH: usize = 512;

#[derive(Clone, Copy, Default, Deserialize)]
pub struct Bounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

impl Bounds {
    fn rect(self) -> Rect {
        Rect { position: LogicalPosition::new(self.x.max(0.0), self.y.max(0.0)).into(), size: LogicalSize::new(self.width.max(1.0), self.height.max(1.0)).into() }
    }
}

#[derive(Default)]
pub struct WebState {
    /// One open at a time, so a slow sign-in does not create the view twice.
    open: tokio::sync::Mutex<()>,
    visible: AtomicBool,
    bounds: Mutex<Bounds>,
    last_sign_in: Mutex<Option<Instant>>,
    /// Downloads in progress by URL: where each goes, or None for one that was refused.
    downloads: Mutex<HashMap<String, Option<PathBuf>>>,
    /// A project file for a section the app has no editor for: (base64 content, file name), handed
    /// to the website page `OPEN_FILE_PAGE` when it has loaded.
    pending_file: Mutex<Option<(String, String)>>,
}

/// The page that receives a project file from the app.
pub const OPEN_FILE_PAGE: &str = "/app/editor/local?desktop-open=1";

/// The script that hands a project file to the page once its editor is ready (it waits up to 10 s).
fn hand_over_script(b64: &str, name: &str) -> String {
    let d = serde_json::to_string(b64).unwrap_or_else(|_| "\"\"".into());
    let n = serde_json::to_string(name).unwrap_or_else(|_| "\"project.oclc\"".into());
    format!("(function(){{var d={d},n={n},t=0;(function go(){{if(typeof window.hingelabDesktopOpen==='function'){{window.hingelabDesktopOpen(d,n)}}else if(t++<100){{setTimeout(go,100)}}}})()}})()")
}

fn is_open_file_page(url: &Url) -> bool {
    url.path() == "/app/editor/local" && url.query_pairs().any(|(k, v)| k == "desktop-open" && v == "1")
}

/// The website's origin as the view uses it. Next.js names the host "localhost" in redirects when a
/// request came to 127.0.0.1, so test builds use that name and the session cookie survives them.
pub fn base(api: &Url) -> Url {
    let mut u = api.clone();
    if u.host_str() == Some("127.0.0.1") {
        let _ = u.set_host(Some("localhost"));
    }
    u.set_path("/");
    u.set_query(None);
    u.set_fragment(None);
    u
}

fn same_site(base: &Url, url: &Url) -> bool {
    url.scheme() == base.scheme() && url.host_str() == base.host_str() && url.port_or_known_default() == base.port_or_known_default()
}

/// A page of the website from a path the UI sends ("/app/editor/local?p=letters").
pub fn page_url(base: &Url, path: &str) -> Option<Url> {
    if !path.starts_with('/') || path.starts_with("//") || path.len() > MAX_PATH || path.contains('\\') || path.chars().any(char::is_control) {
        return None;
    }
    if path.starts_with("/api/") {
        return None;
    }
    let u = base.join(path).ok()?;
    same_site(base, &u).then_some(u)
}

#[derive(Debug, PartialEq)]
pub enum Nav {
    /// The website itself (and its own blob downloads).
    Inside,
    /// Another web site or a mail link: the default browser.
    Browser,
    Block,
}

pub fn classify(base: &Url, url: &Url) -> Nav {
    match url.scheme() {
        _ if same_site(base, url) => Nav::Inside,
        "about" if url.as_str() == "about:blank" => Nav::Inside,
        "blob" => match Url::parse(url.path()) {
            Ok(inner) if same_site(base, &inner) => Nav::Inside,
            _ => Nav::Block,
        },
        "https" | "mailto" => Nav::Browser,
        "http" if url.host_str().is_some() => Nav::Browser,
        _ => Nav::Block,
    }
}

/// The website's own sign-out (its account menu posts here).
fn is_sign_out(url: &Url) -> bool {
    url.path() == "/auth/signout"
}

/// Asks the app's UI to sign the app out (as its own Sign out does): the session here and on the
/// server, and the website view.
fn sign_out_from_web<R: Runtime>(app: &AppHandle<R>) {
    tell_main(app, "web-sign-out", ());
}

fn is_sign_in_page(url: &Url) -> bool {
    matches!(url.path(), "/login" | "/signup")
}

/// Path and query of a website URL, for `next`.
fn local_part(url: &Url) -> String {
    match url.query() {
        Some(q) => format!("{}?{q}", url.path()),
        None => url.path().to_string(),
    }
}

/// Where the sign-in link continues to: path, query and fragment (an AI design rides in the fragment).
fn next_of(url: &Url) -> String {
    match url.fragment() {
        Some(f) => format!("{}#{f}", local_part(url)),
        None => local_part(url),
    }
}

/// The one-time sign-in link for `next`, or None when the app is signed out or the server says no.
async fn sign_in_url(api: &Api, base: &Url, next: &str) -> Option<Url> {
    if !api.signed_in().await {
        return None;
    }
    let (_, body) = api.call(Method::POST, "/api/desktop/web-session", Some(&json!({ "next": next })), &[]).await.ok()?;
    let path = body.get("path")?.as_str()?;
    page_url(base, path).filter(|u| u.path() == "/auth/callback")
}

fn mark_sign_in(state: &AppState) -> bool {
    let mut last = state.web.last_sign_in.lock().unwrap();
    if last.is_some_and(|t| t.elapsed() < RESIGN_EVERY) {
        return false;
    }
    *last = Some(Instant::now());
    true
}

/// The website sent the view to its sign-in page (its session ended): sign it in again and go on
/// to the page it asked for. Without an app session the sign-in page is shown as it is.
fn resign<R: Runtime>(app: &AppHandle<R>, login: Url) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppState>();
        let base = base(state.api.base());
        let next = login.query_pairs().find(|(k, _)| k == "next").map(|(_, v)| v.into_owned()).filter(|n| page_url(&base, n).is_some()).unwrap_or_else(|| "/home".into());
        let target = sign_in_url(&state.api, &base, &next).await.unwrap_or(login);
        if let Some(w) = app.get_webview(LABEL) {
            let _ = w.navigate(target);
        }
    });
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PageEvent {
    path: String,
    title: Option<String>,
    loading: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadDone {
    ok: bool,
    path: Option<String>,
    name: Option<String>,
    blocked: bool,
}

/// Only the app's own UI can listen: the website view has no event permission.
fn tell_main<R: Runtime, S: Serialize + Clone>(app: &AppHandle<R>, event: &str, payload: S) {
    let _ = app.emit(event, payload);
}

#[cfg(not(feature = "e2e"))]
fn open_in_browser<R: Runtime>(app: &AppHandle<R>, url: &Url) {
    let _ = app.opener().open_url(url.as_str(), None::<&str>);
}

/// Test builds list the pages they would open in the browser for the test driver.
#[cfg(feature = "e2e")]
fn open_in_browser<R: Runtime>(_app: &AppHandle<R>, url: &Url) {
    use std::io::Write;
    if let Some(path) = std::env::var_os("HINGELAB_E2E_BROWSER_FILE") {
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(f, "{url}");
        }
    }
}

fn download_dir(state: &AppState, suggested: &PathBuf) -> Option<PathBuf> {
    let export = state.prefs.lock().unwrap().export_dir.clone().map(PathBuf::from).filter(|d| d.is_dir());
    export.or_else(|| suggested.parent().map(PathBuf::from).filter(|d| d.is_dir()))
}

fn builder(app: &AppHandle, start: Url, base: Url) -> WebviewBuilder<tauri::Wry> {
    let nav_app = app.clone();
    let nav_base = base.clone();
    let popup_app = app.clone();
    let popup_base = base.clone();
    let load_app = app.clone();
    let load_base = base.clone();
    let title_app = app.clone();
    let title_base = base.clone();
    let dl_app = app.clone();
    WebviewBuilder::new(LABEL, WebviewUrl::External(start))
        .on_navigation(move |url| match classify(&nav_base, url) {
            // Sign out in the website's menu signs the app out: otherwise the view, landing on the
            // sign-in page, would be signed straight back in with the app's session.
            Nav::Inside if is_sign_out(url) => {
                sign_out_from_web(&nav_app);
                false
            }
            Nav::Inside if is_sign_in_page(url) && nav_app.try_state::<AppState>().is_some_and(|s| mark_sign_in(&s)) => {
                resign(&nav_app, url.clone());
                false
            }
            Nav::Inside => true,
            Nav::Browser => {
                open_in_browser(&nav_app, url);
                false
            }
            Nav::Block => false,
        })
        .on_new_window(move |url, _| {
            match classify(&popup_base, &url) {
                Nav::Inside if url.scheme() != "blob" && url.scheme() != "about" => {
                    if let Some(w) = popup_app.get_webview(LABEL) {
                        let _ = w.navigate(url);
                    }
                }
                Nav::Browser => open_in_browser(&popup_app, &url),
                _ => {}
            }
            NewWindowResponse::Deny
        })
        .on_page_load(move |w, p| {
            if p.event() == PageLoadEvent::Finished && same_site(&load_base, p.url()) && is_open_file_page(p.url()) {
                let file = load_app.try_state::<AppState>().and_then(|s| s.web.pending_file.lock().unwrap().take());
                if let Some((b64, name)) = file {
                    let _ = w.eval(hand_over_script(&b64, &name));
                }
            }
            tell_main(&load_app, "web-page", PageEvent { path: local_part(p.url()), title: None, loading: p.event() == PageLoadEvent::Started });
        })
        .on_document_title_changed(move |w, title| {
            let Ok(url) = w.url() else { return };
            if same_site(&title_base, &url) && is_sign_in_page(&url) && title_app.try_state::<AppState>().is_some_and(|s| mark_sign_in(&s)) {
                resign(&title_app, url.clone());
            }
            tell_main(&title_app, "web-page", PageEvent { path: local_part(&url), title: Some(title.chars().take(200).collect()), loading: false });
        })
        .on_download(move |_w: Webview, event| {
            let state = dl_app.state::<AppState>();
            match event {
                DownloadEvent::Requested { url, destination } => {
                    let suggested = destination.clone();
                    let name = suggested.file_name().and_then(|n| n.to_str()).and_then(files::safe_download_name);
                    let allowed = matches!(classify(&base, &url), Nav::Inside);
                    let mut downloads = state.web.downloads.lock().unwrap();
                    match (name, allowed, download_dir(&state, &suggested)) {
                        (Some(name), true, Some(dir)) => {
                            *destination = files::unique_in(&dir, &name);
                            downloads.insert(url.to_string(), Some(destination.clone()));
                            true
                        }
                        _ => {
                            downloads.insert(url.to_string(), None);
                            tell_main(&dl_app, "web-download", DownloadDone { ok: false, path: None, name: None, blocked: true });
                            false
                        }
                    }
                }
                DownloadEvent::Finished { url, path, success, .. } => {
                    let Some(chosen) = state.web.downloads.lock().unwrap().remove(url.as_str()) else { return true };
                    let Some(chosen) = chosen else { return true };
                    let saved = success.then(|| path.unwrap_or(chosen));
                    if let Some(p) = &saved {
                        state.files.lock().unwrap().saved.insert(p.clone());
                        if state.prefs.lock().unwrap().open_after_export {
                            let _ = dl_app.opener().reveal_item_in_dir(p);
                        }
                    }
                    let name = saved.as_ref().and_then(|p| p.file_name()).map(|n| n.to_string_lossy().into_owned());
                    tell_main(&dl_app, "web-download", DownloadDone { ok: saved.is_some(), path: saved.map(|p| p.to_string_lossy().into_owned()), name, blocked: false });
                    true
                }
                _ => true,
            }
        })
}

/// Shows the website view over the given part of the window, opening `path` when one is given.
/// The first open of a run signs the view in as the app's account.
#[tauri::command]
pub async fn web_open(path: Option<String>, bounds: Bounds, app: AppHandle, state: State<'_, AppState>) -> CmdResult<()> {
    let base = base(state.api.base());
    let target = match path {
        Some(p) => Some(page_url(&base, &p).ok_or_else(|| CmdError::new("invalid", "Unknown page."))?),
        None => None,
    };
    state.web.visible.store(true, Ordering::SeqCst);
    *state.web.bounds.lock().unwrap() = bounds;
    let _one = state.web.open.lock().await;
    if let Some(w) = app.get_webview(LABEL) {
        if let Some(u) = target {
            w.navigate(u).map_err(|_| CmdError::new("io", "Could not open the page."))?;
        }
        if state.web.visible.load(Ordering::SeqCst) {
            let _ = w.set_bounds(state.web.bounds.lock().unwrap().rect());
            let _ = w.show();
        }
        return Ok(());
    }
    let first = target.unwrap_or_else(|| base.join("/home").expect("static path"));
    *state.web.last_sign_in.lock().unwrap() = Some(Instant::now());
    let start = sign_in_url(&state.api, &base, &next_of(&first)).await.unwrap_or(first);
    let window = app.get_window("main").ok_or_else(|| CmdError::new("io", "The app window is not ready."))?;
    let rect = state.web.bounds.lock().unwrap().rect();
    let w = window.add_child(builder(&app, start, base), rect.position, rect.size).map_err(|_| CmdError::new("io", "Could not open the website view."))?;
    if !state.web.visible.load(Ordering::SeqCst) {
        let _ = w.hide();
    }
    Ok(())
}

#[tauri::command]
pub fn web_bounds(bounds: Bounds, app: AppHandle, state: State<'_, AppState>) {
    *state.web.bounds.lock().unwrap() = bounds;
    if let Some(w) = app.get_webview(LABEL) {
        let _ = w.set_bounds(bounds.rect());
    }
}

#[tauri::command]
pub fn web_hide(app: AppHandle, state: State<'_, AppState>) {
    state.web.visible.store(false, Ordering::SeqCst);
    if let Some(w) = app.get_webview(LABEL) {
        let _ = w.hide();
    }
}

/// Toolbar buttons: back, forward, reload, or open the current page in the default browser.
#[tauri::command]
pub fn web_action(action: String, app: AppHandle, state: State<'_, AppState>) -> CmdResult<()> {
    let w = app.get_webview(LABEL).ok_or_else(|| CmdError::new("not_found", "The website view is not open."))?;
    let done = match action.as_str() {
        "back" => w.eval("history.back()"),
        "forward" => w.eval("history.forward()"),
        "reload" => w.reload(),
        "browser" => {
            let url = w.url().map_err(|_| CmdError::new("io", "Could not read the page address."))?;
            if !same_site(&base(state.api.base()), &url) {
                return Err(CmdError::new("invalid", "This page cannot be opened in the browser."));
            }
            open_in_browser(&app, &url);
            Ok(())
        }
        _ => return Err(CmdError::new("invalid", "Unknown action.")),
    };
    done.map_err(|_| CmdError::new("io", "The website view did not respond."))
}

/// Keeps a project file for the website page that opens next at `OPEN_FILE_PAGE`.
pub fn hold_file(state: &AppState, b64: String, name: String) {
    *state.web.pending_file.lock().unwrap() = Some((b64, name));
}

/// App sign-out: ends the website session in the view too, then closes it.
pub fn sign_out<R: Runtime>(app: &AppHandle<R>, state: &AppState) {
    *state.web.last_sign_in.lock().unwrap() = None;
    state.web.visible.store(false, Ordering::SeqCst);
    let Some(w) = app.get_webview(LABEL) else { return };
    let _ = w.hide();
    let _ = w.eval("fetch('/auth/signout',{method:'POST',credentials:'same-origin',redirect:'manual'}).catch(()=>{})");
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(1500)).await;
        let _ = w.close();
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn u(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn base_and_pages() {
        let b = base(&u("https://hingelab.vercel.app"));
        assert_eq!(b.as_str(), "https://hingelab.vercel.app/");
        assert_eq!(base(&u("http://127.0.0.1:3457")).as_str(), "http://localhost:3457/");
        assert_eq!(page_url(&b, "/app/editor/local?p=letters").unwrap().as_str(), "https://hingelab.vercel.app/app/editor/local?p=letters");
        for bad in ["https://evil.example/", "//evil.example/x", "/\\evil", "app", "/api/desktop/me", "/x\n", ""] {
            assert!(page_url(&b, bad).is_none(), "{bad}");
        }
        assert!(page_url(&b, &format!("/{}", "a".repeat(600))).is_none());
    }

    #[test]
    fn navigation_policy() {
        let b = base(&u("https://hingelab.vercel.app"));
        assert_eq!(classify(&b, &u("https://hingelab.vercel.app/home")), Nav::Inside);
        assert_eq!(classify(&b, &u("blob:https://hingelab.vercel.app/1f0e")), Nav::Inside);
        assert_eq!(classify(&b, &u("about:blank")), Nav::Inside);
        assert_eq!(classify(&b, &u("https://checkout.stripe.com/c/pay")), Nav::Browser);
        assert_eq!(classify(&b, &u("mailto:help@hingelab.app")), Nav::Browser);
        assert_eq!(classify(&b, &u("http://hingelab.vercel.app/home")), Nav::Browser);
        assert_eq!(classify(&b, &u("blob:https://evil.example/1f0e")), Nav::Block);
        assert_eq!(classify(&b, &u("file:///C:/Windows/")), Nav::Block);
        assert_eq!(classify(&b, &u("javascript:alert(1)")), Nav::Block);
        assert_eq!(classify(&b, &u("tauri://localhost/")), Nav::Block);
        assert!(is_sign_in_page(&u("https://hingelab.vercel.app/login?next=%2Fapp")));
        assert!(is_sign_out(&u("https://hingelab.vercel.app/auth/signout")));
        assert!(!is_sign_out(&u("https://hingelab.vercel.app/auth/callback?code=x")));
        assert_eq!(local_part(&u("https://hingelab.vercel.app/app?x=1")), "/app?x=1");
        assert_eq!(next_of(&u("https://hingelab.vercel.app/app/ai#open=eyJw")), "/app/ai#open=eyJw");
        assert_eq!(next_of(&u("https://hingelab.vercel.app/app?x=1")), "/app?x=1");
    }

    #[test]
    fn file_hand_over() {
        let b = base(&u("https://hingelab.vercel.app"));
        assert!(is_open_file_page(&page_url(&b, OPEN_FILE_PAGE).unwrap()));
        assert!(!is_open_file_page(&u("https://hingelab.vercel.app/app/editor/local?p=letters")));
        assert!(!is_open_file_page(&u("https://hingelab.vercel.app/home?desktop-open=1")));
        let s = hand_over_script("eyJhIjoxfQ==", "a\"</script>.oclc");
        assert!(s.contains("var d=\"eyJhIjoxfQ==\",n=\"a\\\"</script>.oclc\""));
    }
}
