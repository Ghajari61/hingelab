//! Commands for the shared editors (the same React app as the website, bundled with the window):
//! their few API calls, their downloads and the project files they open.

use std::path::PathBuf;

use base64::Engine;
use reqwest::Method;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;
use url::Url;

use crate::error::{CmdError, CmdResult};
use crate::{files, projects, AppState};

/// The API calls the page may make, by method and exact path. Everything else is refused here.
const API_ALLOW: &[(&str, &str)] = &[
    ("POST", "/api/export"),
    ("POST", "/api/desktop/photoproduct"),
];

/// Largest request body the page may send (the export route's own limit is 4.4 MB).
const MAX_API_BODY: usize = 5 * 1024 * 1024;
/// Largest file the page may save (a Parametric export with every layer).
const MAX_SAVE: usize = 64 * 1024 * 1024;

pub(crate) fn api_allowed(method: &str, path: &str) -> bool {
    API_ALLOW.iter().any(|(m, p)| *m == method && *p == path)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ApiRequest {
    method: String,
    path: String,
    content_type: Option<String>,
    body: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ApiReply {
    status: u16,
    content_type: Option<String>,
    body: String,
    base64: bool,
}

#[tauri::command]
pub(crate) async fn api_request(request: ApiRequest, state: State<'_, AppState>) -> CmdResult<ApiReply> {
    if !api_allowed(&request.method, &request.path) {
        return Err(CmdError::new("forbidden", "HingeLab does not send that request."));
    }
    if request.body.as_ref().is_some_and(|b| b.len() > MAX_API_BODY) {
        return Err(CmdError::new("invalid", "This design is too large to send."));
    }
    let content_type = request.content_type.filter(|c| c.starts_with("application/json"));
    let method = Method::from_bytes(request.method.as_bytes()).map_err(|_| CmdError::new("invalid", "Unknown request."))?;
    let (status, content_type, bytes) = state.api.raw(method, &request.path, content_type.as_deref(), request.body.as_deref()).await?;
    Ok(ApiReply { status, content_type, body: base64::engine::general_purpose::STANDARD.encode(bytes), base64: true })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveRequest {
    name: String,
    data: String,
    /// Export: straight into the export folder from Settings when one is set.
    to_export_folder: bool,
}

#[derive(Serialize)]
pub(crate) struct SaveReply {
    path: Option<String>,
}

/// A file the editor made (drawing, project, archive or picture): to the export folder, or where
/// the user picks. Only the kinds of files HingeLab makes are written.
#[tauri::command]
pub(crate) async fn save_file(request: SaveRequest, app: AppHandle, state: State<'_, AppState>) -> CmdResult<SaveReply> {
    let Some(name) = files::safe_download_name(&request.name) else { return Err(CmdError::new("invalid", "HingeLab saves drawings and project files only.")) };
    if request.data.len() > MAX_SAVE * 4 / 3 + 4 {
        return Err(CmdError::new("invalid", "This file is too large."));
    }
    let bytes = base64::engine::general_purpose::STANDARD.decode(request.data.as_bytes()).map_err(|_| CmdError::new("invalid", "This file could not be saved."))?;
    let ext = name.rsplit_once('.').map(|(_, e)| e.to_owned()).unwrap_or_default();
    let (dir, open_after, last_dir) = {
        let p = state.prefs.lock().unwrap();
        (p.export_dir.clone().map(PathBuf::from).filter(|d| d.is_dir()), p.open_after_export, p.last_dir.clone())
    };
    let path = match dir.filter(|_| request.to_export_folder) {
        Some(dir) => files::unique_in(&dir, &name),
        None => match crate::save_dialog_for(&app, &name, last_dir, "Save", &format!("{} file", ext.to_ascii_uppercase()), &ext).await {
            Some(p) => files::with_extension_of(p, &ext),
            None => return Ok(SaveReply { path: None }),
        },
    };
    files::write_bytes(&path, &bytes)?;
    crate::remember_saved(&state, &path);
    if request.to_export_folder && open_after {
        let _ = app.opener().reveal_item_in_dir(&path);
    }
    Ok(SaveReply { path: Some(path.to_string_lossy().into_owned()) })
}

#[derive(Serialize)]
pub(crate) struct OpenedFile {
    path: String,
    name: String,
    /// The file, base64.
    data: String,
}

/// A project file for the shared editors: one from Recent or this session, or one picked now.
#[tauri::command]
pub(crate) async fn open_file(path: Option<String>, app: AppHandle, state: State<'_, AppState>) -> CmdResult<Option<OpenedFile>> {
    let path = match path {
        Some(p) => {
            let p = PathBuf::from(p);
            let known = state.files.lock().unwrap().projects.contains(&p) || state.prefs.lock().unwrap().recent_files.iter().any(|r| std::path::Path::new(r) == p);
            if !known {
                return Err(CmdError::new("not_found", "Open that file with File > Open."));
            }
            p
        }
        None => match crate::project_open_dialog(&app, crate::project_dir(&state)).await {
            Some(p) => p,
            None => return Ok(None),
        },
    };
    let bytes = projects::read_project(&path)?;
    crate::remember_project(&state, &path);
    Ok(Some(OpenedFile { name: crate::file_name_of(&path), path: path.to_string_lossy().into_owned(), data: base64::engine::general_purpose::STANDARD.encode(bytes) }))
}

/// A HingeLab page in the default browser (pricing, account, help). Other sites are refused.
pub(crate) fn external_allowed(base: &Url, url: &Url) -> bool {
    url.scheme() == base.scheme() && url.host_str() == base.host_str() && url.port_or_known_default() == base.port_or_known_default() && !url.path().starts_with("/api/")
}

#[tauri::command]
pub(crate) fn open_external(url: String, app: AppHandle, state: State<'_, AppState>) -> CmdResult<()> {
    let target = state.api.base().join(&url).map_err(|_| CmdError::new("invalid", "Unknown page."))?;
    if !external_allowed(state.api.base(), &target) {
        return Err(CmdError::new("invalid", "HingeLab opens its own pages only."));
    }
    app.opener().open_url(target.as_str(), None::<&str>).map_err(|_| CmdError::new("io", "Could not open your web browser."))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_listed_api_calls_pass() {
        assert!(api_allowed("POST", "/api/export"));
        assert!(api_allowed("POST", "/api/desktop/photoproduct"));
        assert!(!api_allowed("GET", "/api/desktop/photoproduct"));
        for (m, p) in [("GET", "/api/export"), ("POST", "/api/export/"), ("POST", "/api/export?x=1"), ("POST", "/api/desktop/token"), ("POST", "/api/stripe/checkout"), ("DELETE", "/api/projects")] {
            assert!(!api_allowed(m, p), "{m} {p}");
        }
    }

    #[test]
    fn external_pages_stay_on_the_site() {
        let base = Url::parse("https://hingelab.vercel.app").unwrap();
        assert!(external_allowed(&base, &base.join("/pricing").unwrap()));
        assert!(external_allowed(&base, &base.join("/billing?plan=pro").unwrap()));
        assert!(!external_allowed(&base, &base.join("//evil.test/x").unwrap()));
        assert!(!external_allowed(&base, &Url::parse("https://evil.test/pricing").unwrap()));
        assert!(!external_allowed(&base, &Url::parse("http://hingelab.vercel.app/pricing").unwrap()));
        assert!(!external_allowed(&base, &base.join("/api/desktop/me").unwrap()));
    }
}
