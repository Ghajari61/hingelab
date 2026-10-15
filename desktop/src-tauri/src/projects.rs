//! Project files (.oclc): the same JSON (or Studio ZIP) the website saves, so a file moves freely
//! between the website and the app. The app writes only JSON projects, only with an .oclc extension,
//! only where the user picked in a Windows dialog or to a file they opened or saved before.

use std::path::{Path, PathBuf};

use crate::error::{CmdError, CmdResult};

/// Larger files are refused before they are read.
pub const MAX_PROJECT: u64 = 20 * 1024 * 1024;
/// Files listed under Recent projects.
pub const MAX_RECENT: usize = 12;
/// Extensions Open accepts: the new one and the website's older ones.
pub const OPEN_EXTS: &[&str] = &["oclc", "hingelab", "json"];

/// A JSON object (after an optional byte-order mark and white space) or a ZIP archive.
pub fn looks_like_project(bytes: &[u8]) -> bool {
    if bytes.starts_with(b"PK\x03\x04") {
        return true;
    }
    let b = bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(bytes);
    let t = b.iter().position(|c| !c.is_ascii_whitespace()).map(|i| &b[i..]).unwrap_or_default();
    t.first() == Some(&b'{') && b.iter().rev().find(|c| !c.is_ascii_whitespace()) == Some(&b'}')
}

pub fn is_project_path(p: &Path) -> bool {
    p.extension().and_then(|e| e.to_str()).is_some_and(|e| OPEN_EXTS.iter().any(|x| x.eq_ignore_ascii_case(e)))
}

/// The path with an .oclc extension (a user may type a name without one, or another one).
pub fn with_oclc_extension(p: PathBuf) -> PathBuf {
    match p.extension().and_then(|e| e.to_str()) {
        Some(e) if e.eq_ignore_ascii_case("oclc") => p,
        _ => {
            let mut s = p.into_os_string();
            s.push(".oclc");
            PathBuf::from(s)
        }
    }
}

/// "Gift box" → "Gift box.oclc", Windows-safe.
pub fn project_file_name(name: &str) -> String {
    let svg = crate::files::safe_file_name(name.trim_end_matches(".oclc"));
    format!("{}.oclc", svg.trim_end_matches(".svg"))
}

/// Moves `path` to the top of the list, without duplicates, keeping at most `MAX_RECENT`.
pub fn push_recent(list: &mut Vec<String>, path: &Path) {
    let p = path.to_string_lossy().into_owned();
    list.retain(|x| !x.eq_ignore_ascii_case(&p));
    list.insert(0, p);
    list.truncate(MAX_RECENT);
}

pub fn read_project(path: &Path) -> CmdResult<Vec<u8>> {
    if !is_project_path(path) {
        return Err(CmdError::new("invalid", "HingeLab opens project files (.oclc) only."));
    }
    let meta = std::fs::metadata(path).map_err(|_| CmdError::new("not_found", "That file is no longer there."))?;
    if !meta.is_file() {
        return Err(CmdError::new("not_found", "That file is no longer there."));
    }
    if meta.len() > MAX_PROJECT {
        return Err(CmdError::new("invalid", "That file is too large to be a HingeLab project (over 20 MB)."));
    }
    let bytes = std::fs::read(path).map_err(|_| CmdError::new("io", "The file could not be read."))?;
    if !looks_like_project(&bytes) {
        return Err(CmdError::new("invalid", "That file is not a HingeLab project."));
    }
    Ok(bytes)
}

pub fn write_project(path: &Path, text: &str) -> CmdResult<()> {
    if text.len() as u64 > MAX_PROJECT || !looks_like_project(text.as_bytes()) {
        return Err(CmdError::new("invalid", "This design cannot be saved as a project."));
    }
    // Write next to the file, then replace it, so a failed save never leaves half a project.
    let tmp = path.with_extension("oclc.saving");
    let fail = |e: std::io::Error| {
        let msg = if e.kind() == std::io::ErrorKind::PermissionDenied { "Windows did not allow saving there. Pick another folder." } else { "The project could not be saved." };
        CmdError::new("io", msg)
    };
    std::fs::write(&tmp, text.as_bytes()).map_err(fail)?;
    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        fail(e)
    })
}

/// The project file among a launch's arguments (a double-clicked file), made absolute.
pub fn project_arg<I: IntoIterator<Item = String>>(args: I, cwd: &Path) -> Option<PathBuf> {
    args.into_iter().skip(1).map(PathBuf::from).filter(|p| is_project_path(p)).map(|p| if p.is_absolute() { p } else { cwd.join(p) }).find(|p| p.is_file())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn contents() {
        assert!(looks_like_project(b"{\"params\":{}}"));
        assert!(looks_like_project(b"\xEF\xBB\xBF  {\"a\":1}\n"));
        assert!(looks_like_project(b"PK\x03\x04rest"));
        assert!(!looks_like_project(b"MZ\x90\x00"));
        assert!(!looks_like_project(b"[1,2]"));
        assert!(!looks_like_project(b"{ unterminated"));
        assert!(!looks_like_project(b""));
    }

    #[test]
    fn names_and_paths() {
        assert_eq!(project_file_name("Gift box"), "Gift box.oclc");
        assert_eq!(project_file_name("Gift box.oclc"), "Gift box.oclc");
        assert_eq!(project_file_name("a/b:c"), "a b c.oclc");
        assert_eq!(project_file_name(""), "design.oclc");
        assert_eq!(with_oclc_extension(PathBuf::from("C:/x/a")), PathBuf::from("C:/x/a.oclc"));
        assert_eq!(with_oclc_extension(PathBuf::from("C:/x/a.OCLC")), PathBuf::from("C:/x/a.OCLC"));
        assert_eq!(with_oclc_extension(PathBuf::from("C:/x/a.exe")), PathBuf::from("C:/x/a.exe.oclc"));
        assert!(is_project_path(Path::new("C:/x/a.oclc")));
        assert!(is_project_path(Path::new("C:/x/a.hingelab.json")));
        assert!(!is_project_path(Path::new("C:/x/a.svg")));
    }

    #[test]
    fn recent_list() {
        let mut l = vec![];
        for i in 0..20 {
            push_recent(&mut l, Path::new(&format!("C:/p/{i}.oclc")));
        }
        assert_eq!(l.len(), MAX_RECENT);
        assert_eq!(l[0], "C:/p/19.oclc");
        push_recent(&mut l, Path::new("C:/p/15.oclc"));
        assert_eq!(l[0], "C:/p/15.oclc");
        assert_eq!(l.iter().filter(|x| x.as_str() == "C:/p/15.oclc").count(), 1);
    }

    #[test]
    fn read_and_write() {
        let dir = std::env::temp_dir().join(format!("hingelab-proj-{}", crate::api::now()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("a.oclc");
        write_project(&p, "{\"app\":\"HingeLab\",\"params\":{}}").unwrap();
        assert_eq!(read_project(&p).unwrap(), b"{\"app\":\"HingeLab\",\"params\":{}}");
        assert!(write_project(&p, "not json").is_err());
        std::fs::write(dir.join("b.oclc"), "MZ").unwrap();
        assert!(read_project(&dir.join("b.oclc")).is_err());
        assert!(read_project(&dir.join("missing.oclc")).is_err());
        let args = vec!["HingeLab.exe".to_string(), "--flag".to_string(), p.to_string_lossy().into_owned()];
        assert_eq!(project_arg(args, &dir), Some(p.clone()));
        assert_eq!(project_arg(vec!["HingeLab.exe".to_string(), "a.oclc".to_string()], &dir), Some(dir.join("a.oclc")));
        assert_eq!(project_arg(vec!["HingeLab.exe".to_string()], &dir), None);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
