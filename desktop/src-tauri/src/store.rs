//! Session tokens in the Windows Credential Manager (per user, encrypted by Windows). They never
//! go to JavaScript, local storage or a file.

use serde::{Deserialize, Serialize};

use crate::error::{CmdError, CmdResult};

const SERVICE: &str = "app.hingelab.desktop";
#[cfg(not(feature = "e2e"))]
const ACCOUNT: &str = "session";
#[cfg(feature = "e2e")]
const ACCOUNT: &str = "session-e2e";

#[derive(Clone, Serialize, Deserialize, PartialEq, Debug)]
pub struct Tokens {
    pub access: String,
    pub refresh: String,
    /// Unix seconds.
    pub access_exp: u64,
}

fn entry() -> CmdResult<keyring::Entry> {
    keyring::Entry::new(SERVICE, ACCOUNT).map_err(|_| CmdError::new("storage", "Windows Credential Manager is not available."))
}

pub fn load() -> Option<Tokens> {
    let secret = entry().ok()?.get_password().ok()?;
    let t: Tokens = serde_json::from_str(&secret).ok()?;
    valid_token(&t.access).then_some(())?;
    valid_token(&t.refresh).then_some(t)
}

pub fn save(t: &Tokens) -> CmdResult<()> {
    let json = serde_json::to_string(t).map_err(|_| CmdError::new("storage", "Could not store the session."))?;
    entry()?.set_password(&json).map_err(|_| CmdError::new("storage", "Could not save your session in Windows Credential Manager."))
}

pub fn clear() {
    if let Ok(e) = entry() {
        let _ = e.delete_credential();
    }
}

/// Server tokens are 43 base64url characters.
pub fn valid_token(s: &str) -> bool {
    s.len() == 43 && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_shape() {
        assert!(valid_token(&"a".repeat(43)));
        assert!(!valid_token(&"a".repeat(42)));
        assert!(!valid_token(&format!("{}+", "a".repeat(42))));
    }
}
