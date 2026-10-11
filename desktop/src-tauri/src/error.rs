//! Errors the UI can act on, sent to JavaScript as `{ kind, message, ... }`.

use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CmdError {
    /// unauthorized | update_required | rate_limited | network | server | invalid | cancelled | timeout | storage | io | not_found
    pub kind: &'static str,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry_after: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub minimum_version: Option<String>,
}

impl CmdError {
    pub fn new(kind: &'static str, message: impl Into<String>) -> Self {
        Self { kind, message: message.into(), status: None, retry_after: None, minimum_version: None }
    }
    pub fn with_status(mut self, status: u16) -> Self {
        self.status = Some(status);
        self
    }
    pub fn unauthorized() -> Self {
        Self::new("unauthorized", "Your session has ended. Sign in again.").with_status(401)
    }
    pub fn network(e: &reqwest::Error) -> Self {
        if e.is_timeout() {
            Self::new("network", "The server took too long to answer. Check your connection and try again.")
        } else {
            Self::new("network", "Can't reach HingeLab. Check your internet connection.")
        }
    }
}

pub type CmdResult<T> = Result<T, CmdError>;
