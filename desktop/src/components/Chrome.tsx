import { useEffect, useRef } from "react";
import { ArrowDownCircle, Clock3, CreditCard, FolderOpen, Globe, HelpCircle, LayoutDashboard, Loader2, PanelLeftClose, PanelLeftOpen, Settings as Cog, Shapes, ShieldCheck, Star, X } from "lucide-react";
import type { DesktopAccount } from "../ipc";
import type { UpdateStatus } from "../updater";
import { formatBytes } from "../updater";

export type Route = "dashboard" | "generators" | "workspace" | "recent" | "favorites" | "subscription" | "settings" | "help";

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="14" fill="#3B8FF0" />
      <path d="M15 16v32M23.5 16v12.5M23.5 35.5V48M32 16v32M40.5 16v12.5M40.5 35.5V48M49 16v32" fill="none" stroke="#fff" strokeWidth="4.4" strokeLinecap="round" />
    </svg>
  );
}

const NAV: { id: Route; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "generators", label: "Generators", icon: Shapes },
  { id: "recent", label: "Recent designs", icon: Clock3 },
  { id: "favorites", label: "Favorites", icon: Star },
  { id: "subscription", label: "Subscription", icon: CreditCard },
  { id: "settings", label: "Settings", icon: Cog },
  { id: "help", label: "Help", icon: HelpCircle },
];

export function Sidebar({ route, onRoute, account, hasDesign, update, onUpdate, collapsed, onToggle }: {
  route: Route; onRoute: (r: Route) => void; account: DesktopAccount | null; hasDesign: boolean; update: UpdateStatus; onUpdate: () => void;
  collapsed: boolean; onToggle: () => void;
}) {
  const updateText = update.phase === "available" ? `Update to ${update.info.version}` : "Updating…";
  const who = account ? account.user.name || account.user.email || "" : "";
  return (
    <nav className="sidebar" aria-label="Main">
      <div className="brand">
        <Logo size={26} /><span>HingeLab</span>
        <button type="button" className="side-toggle" aria-expanded={!collapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={`${collapsed ? "Expand" : "Collapse"} sidebar (Ctrl+B)`} onClick={onToggle}>
          {collapsed ? <PanelLeftOpen size={16} aria-hidden /> : <PanelLeftClose size={16} aria-hidden />}
        </button>
      </div>
      <ul>
        {NAV.map((n) => {
          const active = route === n.id || (n.id === "generators" && route === "workspace");
          return (
            <li key={n.id}>
              <button type="button" aria-current={active ? "page" : undefined} aria-label={collapsed ? n.label : undefined} title={collapsed ? n.label : undefined} onClick={() => onRoute(n.id === "generators" && hasDesign && route !== "workspace" ? "workspace" : n.id)}>
                <n.icon size={17} aria-hidden />
                <span>{n.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="side-foot">
        {(update.phase === "available" || update.phase === "downloading" || update.phase === "installing") && (
          <button type="button" className="update-pill" onClick={onUpdate} aria-label={collapsed ? updateText : undefined} title={collapsed ? updateText : undefined}>
            <ArrowDownCircle size={15} aria-hidden />
            <span>{updateText}</span>
          </button>
        )}
        {account && (
          <button type="button" className="me" onClick={() => onRoute("settings")} aria-label={collapsed ? `${who}, ${account.plan === "pro" ? "Pro" : "Free"} plan` : undefined} title={account.user.email ?? ""}>
            <span className="avatar" aria-hidden>{(who || "?").slice(0, 1).toUpperCase()}</span>
            <span className="me-text"><b>{who}</b><small>{account.plan === "pro" ? "Pro plan" : "Free plan"}</small></span>
          </button>
        )}
      </div>
    </nav>
  );
}

export function SignIn({ busy, error, version, onSignIn, onCancel, onSignUp }: { busy: boolean; error: string | null; version: string; onSignIn: () => void; onCancel: () => void; onSignUp: () => void }) {
  return (
    <div className="signin">
      <div className="signin-card">
        <Logo size={44} />
        <h1>Sign in to HingeLab</h1>
        <p>Your browser opens HingeLab's sign-in page. Use Google or your email, then choose Allow, and come back here.</p>
        {error && <p className="msg err" role="alert">{error}</p>}
        {busy ? (
          <div className="waiting" role="status">
            <Loader2 size={18} className="spin" aria-hidden />
            <span>Waiting for your browser…</span>
            <button type="button" className="link-btn" onClick={onCancel}>Cancel</button>
          </div>
        ) : (
          <button type="button" className="btn primary big" onClick={onSignIn} autoFocus><Globe size={16} aria-hidden />Sign in with your browser</button>
        )}
        <p className="fine">No account? <button type="button" className="link-btn" onClick={onSignUp}>Create one on the website</button></p>
        <p className="fine trust"><ShieldCheck size={13} aria-hidden /> Your password never goes through this app.</p>
      </div>
      <p className="ver">Version {version}</p>
    </div>
  );
}

/** A dialog with focus kept inside and Escape to close. */
function Modal({ title, onClose, children, labelledBy }: { title: string; onClose?: () => void; children: React.ReactNode; labelledBy: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    (ref.current?.querySelector<HTMLElement>("button.primary") ?? ref.current?.querySelector<HTMLElement>("button"))?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && close.current) close.current();
      if (e.key === "Tab" && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>("button:not([disabled]), a, input, select")];
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("keydown", key, true);
      prev?.focus?.();
    };
  }, []);
  return (
    <div className="modal-bg">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy} ref={ref}>
        {onClose && <button type="button" className="icon-btn close" aria-label="Close" onClick={onClose}><X size={16} aria-hidden /></button>}
        <h2 id={labelledBy}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function UpdateDialog({ status, onInstall, onLater, onRetry }: { status: UpdateStatus; onInstall: () => void; onLater: () => void; onRetry: () => void }) {
  if (status.phase === "available") {
    const i = status.info;
    return (
      <Modal title="An update is available" labelledBy="upd-title" onClose={onLater}>
        <dl className="upd-facts">
          <div><dt>Installed</dt><dd>{i.current}</dd></div>
          <div><dt>New version</dt><dd>{i.version}</dd></div>
          {i.size && <div><dt>Download</dt><dd>{formatBytes(i.size)}</dd></div>}
          {i.date && <div><dt>Released</dt><dd>{new Date(i.date).toLocaleDateString()}</dd></div>}
        </dl>
        {i.notes && <div className="notes"><h3>What's new</h3><p>{i.notes}</p></div>}
        <p className="fine">HingeLab closes while the update installs and opens again when it's done.</p>
        <div className="row end">
          <button type="button" className="btn" onClick={onLater}>Later</button>
          <button type="button" className="btn primary" onClick={onInstall}>Update now</button>
        </div>
      </Modal>
    );
  }
  if (status.phase === "downloading" || status.phase === "installing" || status.phase === "restarting") {
    const pct = status.phase === "downloading" && status.total ? Math.min(100, Math.round((status.done / status.total) * 100)) : null;
    return (
      <Modal title={status.phase === "downloading" ? `Downloading ${status.info.version}` : status.phase === "installing" ? "Installing the update" : "Restarting HingeLab"} labelledBy="upd-title">
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined} aria-label="Update progress">
          <span style={{ width: pct === null ? "100%" : `${pct}%` }} className={pct === null ? "indeterminate" : undefined} />
        </div>
        <p className="fine">{status.phase === "downloading" ? (pct !== null ? `${pct}% of ${formatBytes(status.total)}` : `${formatBytes(status.done)} downloaded`) : "Checking the signature and installing. Don't turn off your computer."}</p>
      </Modal>
    );
  }
  if (status.phase === "error" && status.info) {
    return (
      <Modal title="The update didn't finish" labelledBy="upd-title" onClose={onLater}>
        <p>{status.message}</p>
        <div className="row end">
          <button type="button" className="btn" onClick={onLater}>Close</button>
          <button type="button" className="btn primary" onClick={onRetry}>Try again</button>
        </div>
      </Modal>
    );
  }
  return null;
}

/** The server no longer accepts this version: update, or get the installer from the website. */
export function UpdateRequired({ minimum, status, onUpdate, onWebsite }: { minimum: string | null; status: UpdateStatus; onUpdate: () => void; onWebsite: () => void }) {
  const busy = status.phase === "checking" || status.phase === "downloading" || status.phase === "installing" || status.phase === "restarting";
  const nothing = status.phase === "none";
  return (
    <div className="signin">
      <div className="signin-card">
        <Logo size={44} />
        <h1>Update HingeLab to continue</h1>
        <p>This version is no longer supported{minimum ? `; version ${minimum} or later is needed` : ""}. The update keeps your settings and designs.</p>
        {status.phase === "error" && <p className="msg err" role="alert">{status.message}</p>}
        {nothing && <p className="msg" role="status">No update was offered to this computer yet. Download the latest installer from the website.</p>}
        {status.phase === "downloading" && <p role="status">Downloading… {status.total ? `${Math.round((status.done / status.total) * 100)}%` : formatBytes(status.done)}</p>}
        {status.phase === "installing" && <p role="status">Installing…</p>}
        <div className="row center">
          <button type="button" className="btn primary big" onClick={onUpdate} disabled={busy}>{busy ? <Loader2 size={16} className="spin" aria-hidden /> : <ArrowDownCircle size={16} aria-hidden />}Update now</button>
          <button type="button" className="btn big" onClick={onWebsite}><Globe size={16} aria-hidden />Website</button>
        </div>
      </div>
    </div>
  );
}

export interface Toast {
  id: number;
  text: string;
  kind?: "ok" | "err";
  path?: string;
}

export function Toasts({ items, onReveal, onClose }: { items: Toast[]; onReveal: (path: string) => void; onClose: (id: number) => void }) {
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind ?? ""}`}>
          <span>{t.text}</span>
          {t.path && <button type="button" className="link-btn" onClick={() => onReveal(t.path!)}><FolderOpen size={13} aria-hidden />Show in folder</button>}
          <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => onClose(t.id)}><X size={13} aria-hidden /></button>
        </div>
      ))}
    </div>
  );
}
