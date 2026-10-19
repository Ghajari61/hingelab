//! Files the editor makes: only the kinds HingeLab writes (drawings, projects, archives, pictures),
//! with Windows-safe names, to a place the user picked in a Windows dialog or their export folder.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{CmdError, CmdResult};

#[derive(Default)]
pub struct Files {
    /// Files saved in this session; only these can be shown in Explorer.
    pub saved: HashSet<PathBuf>,
    /// Project files opened or saved in this session; Save writes over these without asking.
    pub projects: HashSet<PathBuf>,
    /// A project file waiting to be opened (double-clicked, dropped or passed to a second launch).
    pub pending_open: Option<PathBuf>,
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Prefs {
    pub export_dir: Option<String>,
    pub last_dir: Option<String>,
    pub open_after_export: bool,
    /// Where project files were last saved or opened.
    pub project_dir: Option<String>,
    /// Most recent first.
    pub recent_files: Vec<String>,
    /// Settings › Project folder: Save and Open start here (otherwise where the last project was).
    pub home_dir: Option<String>,
    /// Settings › Recent files to keep (0: the default, see `projects::recent_limit`).
    pub recent_max: usize,
}

pub fn load_prefs(dir: &Path) -> Prefs {
    std::fs::read_to_string(dir.join("prefs.json")).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}

pub fn save_prefs(dir: &Path, p: &Prefs) -> CmdResult<()> {
    std::fs::create_dir_all(dir).map_err(|_| CmdError::new("io", "Could not save settings."))?;
    let json = serde_json::to_string_pretty(p).map_err(|_| CmdError::new("io", "Could not save settings."))?;
    std::fs::write(dir.join("prefs.json"), json).map_err(|_| CmdError::new("io", "Could not save settings."))
}

fn clean_name(name: &str) -> String {
    let mut s: String = name
        .chars()
        .map(|c| if c.is_control() || "<>:\"/\\|?*".contains(c) { ' ' } else { c })
        .collect();
    while s.contains("..") {
        s = s.replace("..", ".");
    }
    s.trim().trim_matches(|c| c == '.' || c == ' ').to_string()
}

fn usable_stem(stem: &str, max: usize, fallback: &str) -> String {
    let stem: String = stem.trim().trim_matches(|c| c == '.' || c == ' ').chars().take(max).collect();
    let stem = stem.trim().to_string();
    let reserved = ["con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9"];
    let first = stem.split('.').next().unwrap_or_default().trim().to_ascii_lowercase();
    if stem.is_empty() {
        fallback.to_string()
    } else if reserved.contains(&first.as_str()) {
        format!("{stem}-{fallback}")
    } else {
        stem
    }
}

/// Kinds of files the website offers for download: drawings, projects, archives and images.
const DOWNLOAD_TYPES: &[&str] = &["svg", "dxf", "zip", "json", "hingelab", "oclc", "png", "jpg", "jpeg", "pdf", "lbrn2", "csv", "txt"];

/// A Windows-safe name for a file the website view downloads, or None for a kind HingeLab does not
/// save (programs, scripts, shortcuts, anything without a known extension).
pub fn safe_download_name(name: &str) -> Option<String> {
    let clean = clean_name(name);
    let (stem, ext) = clean.rsplit_once('.')?;
    let ext = ext.trim().to_ascii_lowercase();
    if !DOWNLOAD_TYPES.contains(&ext.as_str()) {
        return None;
    }
    Some(format!("{}.{ext}", usable_stem(stem, 120, "download")))
}

/// `name.svg`, or `name (2).svg` ... when it exists.
pub fn unique_in(dir: &Path, file_name: &str) -> PathBuf {
    let first = dir.join(file_name);
    if !first.exists() {
        return first;
    }
    let (stem, ext) = match file_name.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() => (s, format!(".{e}")),
        _ => (file_name, String::new()),
    };
    for i in 2..1000 {
        let p = dir.join(format!("{stem} ({i}){ext}"));
        if !p.exists() {
            return p;
        }
    }
    dir.join(format!("{stem} ({}){ext}", crate::api::now()))
}

/// The path with the given extension (a user may type a name without one, or another one).
pub fn with_extension_of(p: PathBuf, ext: &str) -> PathBuf {
    match p.extension().and_then(|e| e.to_str()) {
        Some(e) if e.eq_ignore_ascii_case(ext) => p,
        _ => {
            let mut s = p.into_os_string();
            s.push(".");
            s.push(ext);
            PathBuf::from(s)
        }
    }
}

pub fn write_bytes(path: &Path, bytes: &[u8]) -> CmdResult<()> {
    std::fs::write(path, bytes).map_err(|e| {
        let msg = if e.kind() == std::io::ErrorKind::PermissionDenied { "Windows did not allow saving there. Pick another folder." } else { "The file could not be saved." };
        CmdError::new("io", msg)
    })
}

#[cfg(test)]
mod tests {
    use super::*;



    #[test]
    fn old_prefs_keep_their_values() {
        let p: Prefs = serde_json::from_str("{\"exportDir\":\"C:/out\",\"lastDir\":null,\"openAfterExport\":true}").unwrap();
        assert_eq!(p.export_dir.as_deref(), Some("C:/out"));
        assert!(p.open_after_export);
        assert!(p.recent_files.is_empty());
    }


    #[test]
    fn extensions() {
        assert_eq!(with_extension_of(PathBuf::from("C:/x/a"), "pdf"), PathBuf::from("C:/x/a.pdf"));
        assert_eq!(with_extension_of(PathBuf::from("C:/x/a.PDF"), "pdf"), PathBuf::from("C:/x/a.PDF"));
        assert_eq!(with_extension_of(PathBuf::from("C:/x/a.exe"), "dxf"), PathBuf::from("C:/x/a.exe.dxf"));
    }

    #[test]
    fn unique_names() {
        let dir = std::env::temp_dir().join(format!("hingelab-test-{}", crate::api::now()));
        std::fs::create_dir_all(&dir).unwrap();
        let a = unique_in(&dir, "x.svg");
        std::fs::write(&a, "1").unwrap();
        assert_eq!(unique_in(&dir, "x.svg"), dir.join("x (2).svg"));
        std::fs::write(dir.join("b.hingelab.json"), "1").unwrap();
        assert_eq!(unique_in(&dir, "b.hingelab.json"), dir.join("b.hingelab (2).json"));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn download_names() {
        assert_eq!(safe_download_name("Gift box.dxf").as_deref(), Some("Gift box.dxf"));
        assert_eq!(safe_download_name("Box.hingelab.json").as_deref(), Some("Box.hingelab.json"));
        assert_eq!(safe_download_name("sheets.ZIP").as_deref(), Some("sheets.zip"));
        assert_eq!(safe_download_name("Gift box.oclc").as_deref(), Some("Gift box.oclc"));
        assert_eq!(safe_download_name("..\\..\\x.svg").as_deref(), Some("x.svg"));
        assert_eq!(safe_download_name("con.svg").as_deref(), Some("con-download.svg"));
        assert_eq!(safe_download_name(".svg"), None);
        assert_eq!(safe_download_name("setup.exe"), None);
        assert_eq!(safe_download_name("x.svg.exe"), None);
        assert_eq!(safe_download_name("run.ps1"), None);
        assert_eq!(safe_download_name("noext"), None);
    }
}
