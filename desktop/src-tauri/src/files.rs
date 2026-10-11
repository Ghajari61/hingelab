//! Saving designs. Only an SVG the server returned can be written (the UI names it by id), always
//! with an .svg extension, to a place the user picked in a Windows dialog or their export folder.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{CmdError, CmdResult};

#[derive(Clone)]
pub struct Design {
    pub id: u64,
    pub svg: String,
    pub file_name: String,
}

#[derive(Default)]
pub struct Files {
    pub last: Option<Design>,
    pub next_id: u64,
    /// Files saved in this session; only these can be shown in Explorer.
    pub saved: HashSet<PathBuf>,
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Prefs {
    pub export_dir: Option<String>,
    pub last_dir: Option<String>,
    pub open_after_export: bool,
}

pub fn load_prefs(dir: &Path) -> Prefs {
    std::fs::read_to_string(dir.join("prefs.json")).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}

pub fn save_prefs(dir: &Path, p: &Prefs) -> CmdResult<()> {
    std::fs::create_dir_all(dir).map_err(|_| CmdError::new("io", "Could not save settings."))?;
    let json = serde_json::to_string_pretty(p).map_err(|_| CmdError::new("io", "Could not save settings."))?;
    std::fs::write(dir.join("prefs.json"), json).map_err(|_| CmdError::new("io", "Could not save settings."))
}

/// A Windows-safe file name ending in .svg (the server sends one already; this is the second check).
pub fn safe_file_name(name: &str) -> String {
    let mut s: String = name
        .chars()
        .map(|c| if c.is_control() || "<>:\"/\\|?*".contains(c) { ' ' } else { c })
        .collect();
    while s.contains("..") {
        s = s.replace("..", ".");
    }
    let mut stem = s.trim().trim_matches(|c| c == '.' || c == ' ').to_string();
    if stem.to_ascii_lowercase().ends_with(".svg") {
        stem.truncate(stem.len() - 4);
    }
    let stem: String = stem.trim().chars().take(100).collect();
    let reserved = ["con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9"];
    let stem = if stem.is_empty() {
        "design".to_string()
    } else if reserved.contains(&stem.to_ascii_lowercase().as_str()) {
        format!("{stem}-design")
    } else {
        stem
    };
    format!("{stem}.svg")
}

/// The path with an .svg extension (a user may type a name without one, or another one).
pub fn with_svg_extension(p: PathBuf) -> PathBuf {
    match p.extension().and_then(|e| e.to_str()) {
        Some(e) if e.eq_ignore_ascii_case("svg") => p,
        _ => {
            let mut s = p.into_os_string();
            s.push(".svg");
            PathBuf::from(s)
        }
    }
}

/// `name.svg`, or `name (2).svg` ... when it exists.
pub fn unique_in(dir: &Path, file_name: &str) -> PathBuf {
    let first = dir.join(file_name);
    if !first.exists() {
        return first;
    }
    let stem = file_name.strip_suffix(".svg").unwrap_or(file_name);
    for i in 2..1000 {
        let p = dir.join(format!("{stem} ({i}).svg"));
        if !p.exists() {
            return p;
        }
    }
    dir.join(format!("{stem} ({}).svg", crate::api::now()))
}

/// Only SVG text as the server makes it: an XML prolog or <svg> root, nothing else.
pub fn looks_like_svg(s: &str) -> bool {
    let t = s.trim_start();
    (t.starts_with("<?xml") || t.starts_with("<svg")) && t.contains("<svg") && t.trim_end().ends_with("</svg>")
}

pub fn write_svg(path: &Path, svg: &str) -> CmdResult<()> {
    std::fs::write(path, svg.as_bytes()).map_err(|e| {
        let msg = if e.kind() == std::io::ErrorKind::PermissionDenied { "Windows did not allow saving there. Pick another folder." } else { "The file could not be saved." };
        CmdError::new("io", msg)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_names() {
        assert_eq!(safe_file_name("Gift box.svg"), "Gift box.svg");
        assert_eq!(safe_file_name("..\\..\\Windows\\evil"), "Windows evil.svg");
        assert_eq!(safe_file_name("a/b:c*?.svg"), "a b c.svg");
        assert_eq!(safe_file_name("CON"), "CON-design.svg");
        assert_eq!(safe_file_name(""), "design.svg");
        assert_eq!(safe_file_name("..."), "design.svg");
    }

    #[test]
    fn extensions() {
        assert_eq!(with_svg_extension(PathBuf::from("C:/x/a")), PathBuf::from("C:/x/a.svg"));
        assert_eq!(with_svg_extension(PathBuf::from("C:/x/a.SVG")), PathBuf::from("C:/x/a.SVG"));
        assert_eq!(with_svg_extension(PathBuf::from("C:/x/a.exe")), PathBuf::from("C:/x/a.exe.svg"));
    }

    #[test]
    fn svg_check() {
        assert!(looks_like_svg("<?xml version=\"1.0\"?>\n<svg></svg>\n"));
        assert!(!looks_like_svg("MZ\u{90}binary"));
        assert!(!looks_like_svg("<html><svg></svg></html>"));
    }

    #[test]
    fn unique_names() {
        let dir = std::env::temp_dir().join(format!("hingelab-test-{}", crate::api::now()));
        std::fs::create_dir_all(&dir).unwrap();
        let a = unique_in(&dir, "x.svg");
        std::fs::write(&a, "1").unwrap();
        assert_eq!(unique_in(&dir, "x.svg"), dir.join("x (2).svg"));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
