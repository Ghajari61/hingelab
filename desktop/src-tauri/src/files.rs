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

/// A Windows-safe file name ending in .svg (the server sends one already; this is the second check).
pub fn safe_file_name(name: &str) -> String {
    let mut stem = clean_name(name);
    if stem.to_ascii_lowercase().ends_with(".svg") {
        stem.truncate(stem.len() - 4);
    }
    format!("{}.svg", usable_stem(&stem, 100, "design"))
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

/// Only SVG text as the server makes it: an XML prolog or <svg> root, nothing else.
pub fn looks_like_svg(s: &str) -> bool {
    let t = s.trim_start();
    (t.starts_with("<?xml") || t.starts_with("<svg")) && t.contains("<svg") && t.trim_end().ends_with("</svg>")
}

/// A picture file's type from its extension, for the generators' picture settings.
pub fn picture_type(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_string_lossy().to_ascii_lowercase();
    Some(match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        _ => return None,
    })
}

/// The other cut-file formats the server converts a design to: extension and Save dialog filter.
pub fn export_format(format: &str) -> Option<(&'static str, &'static str)> {
    match format {
        "dxf" => Some(("dxf", "DXF drawing")),
        "pdf" => Some(("pdf", "PDF document")),
        "lbrn2" => Some(("lbrn2", "LightBurn project")),
        _ => None,
    }
}

/// Only a file of that format as the server's export writers make it.
pub fn looks_like(format: &str, b: &[u8]) -> bool {
    match format {
        "dxf" => std::str::from_utf8(b).is_ok_and(|t| t.starts_with("0\nSECTION\n") && t.trim_end().ends_with("\nEOF")),
        "pdf" => b.starts_with(b"%PDF-") && b.len() > 16 && b[b.len().saturating_sub(16)..].windows(5).any(|w| w == b"%%EOF"),
        "lbrn2" => std::str::from_utf8(b).is_ok_and(|t| t.starts_with("<?xml") && t.contains("<LightBurnProject") && t.trim_end().ends_with("</LightBurnProject>")),
        _ => false,
    }
}

/// `name.ext` for a design's `name.svg`.
pub fn renamed(file_name: &str, ext: &str) -> String {
    let stem = file_name.strip_suffix(".svg").or_else(|| file_name.strip_suffix(".SVG")).unwrap_or(file_name);
    format!("{stem}.{ext}")
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

pub fn write_svg(path: &Path, svg: &str) -> CmdResult<()> {
    write_bytes(path, svg.as_bytes())
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
    fn old_prefs_keep_their_values() {
        let p: Prefs = serde_json::from_str("{\"exportDir\":\"C:/out\",\"lastDir\":null,\"openAfterExport\":true}").unwrap();
        assert_eq!(p.export_dir.as_deref(), Some("C:/out"));
        assert!(p.open_after_export);
        assert!(p.recent_files.is_empty());
    }

    #[test]
    fn svg_check() {
        assert!(looks_like_svg("<?xml version=\"1.0\"?>\n<svg></svg>\n"));
        assert!(!looks_like_svg("MZ\u{90}binary"));
        assert!(!looks_like_svg("<html><svg></svg></html>"));
    }

    #[test]
    fn other_formats() {
        assert!(looks_like("dxf", b"0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nEOF\n"));
        assert!(!looks_like("dxf", b"MZ\x90\x00"));
        assert!(looks_like("pdf", b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\nstartxref\n9\n%%EOF\n"));
        assert!(!looks_like("pdf", b"%PDF-1.4 but cut short"));
        assert!(looks_like("lbrn2", b"<?xml version=\"1.0\"?>\n<LightBurnProject AppVersion=\"1\">\n</LightBurnProject>\n"));
        assert!(!looks_like("lbrn2", b"<?xml version=\"1.0\"?>\n<svg></svg>"));
        assert!(!looks_like("exe", b"MZ"));
        assert_eq!(export_format("pdf"), Some(("pdf", "PDF document")));
        assert_eq!(export_format("exe"), None);
        assert_eq!(renamed("Gift box.svg", "dxf"), "Gift box.dxf");
        assert_eq!(with_extension_of(PathBuf::from("C:/x/a"), "pdf"), PathBuf::from("C:/x/a.pdf"));
        assert_eq!(picture_type(Path::new("C:/x/Cat.JPG")), Some("image/jpeg"));
        assert_eq!(picture_type(Path::new("C:/x/logo.svg")), Some("image/svg+xml"));
        assert_eq!(picture_type(Path::new("C:/x/run.exe")), None);
        assert_eq!(picture_type(Path::new("C:/x/noext")), None);
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
