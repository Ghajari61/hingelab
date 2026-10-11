//! Build-time configuration. Nothing here is secret: the app is a public client.

use url::Url;

/// The HingeLab website. Set HINGELAB_API_BASE at build time to point a test build elsewhere.
const DEFAULT_BASE: &str = "https://hingelab.vercel.app";

pub fn api_base() -> Url {
    let raw = option_env!("HINGELAB_API_BASE").unwrap_or(DEFAULT_BASE);
    let url = Url::parse(raw).expect("HINGELAB_API_BASE must be a URL");
    assert!(base_allowed(&url), "HINGELAB_API_BASE must be https (http only to 127.0.0.1 in test builds)");
    url
}

/// Release builds talk to the website over HTTPS only; plain HTTP is allowed to the loopback
/// address in debug and end-to-end test builds.
pub fn base_allowed(url: &Url) -> bool {
    match url.scheme() {
        "https" => url.host_str().is_some() && url.username().is_empty() && url.password().is_none(),
        "http" => allow_insecure_loopback() && url.host_str() == Some("127.0.0.1"),
        _ => false,
    }
}

pub const fn allow_insecure_loopback() -> bool {
    cfg!(debug_assertions) || cfg!(feature = "e2e")
}

/// Website pages the app may open in the browser, by name.
pub fn web_page(name: &str) -> Option<&'static str> {
    Some(match name {
        "upgrade" | "manage" => "/billing",
        "account" => "/account",
        "help" => "/help",
        "signup" => "/signup",
        "home" => "/",
        "privacy" => "/privacy",
        "terms" => "/terms",
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base_rules() {
        assert!(base_allowed(&Url::parse("https://hingelab.vercel.app").unwrap()));
        assert!(!base_allowed(&Url::parse("ftp://hingelab.vercel.app").unwrap()));
        assert!(!base_allowed(&Url::parse("https://user:pw@hingelab.vercel.app").unwrap()));
        assert!(!base_allowed(&Url::parse("http://evil.example").unwrap()));
        assert_eq!(base_allowed(&Url::parse("http://127.0.0.1:3457").unwrap()), allow_insecure_loopback());
    }

    #[test]
    fn pages_are_allowlisted() {
        assert_eq!(web_page("upgrade"), Some("/billing"));
        assert_eq!(web_page("https://evil.example"), None);
        assert_eq!(web_page("../admin"), None);
    }
}
