import { ArrowDownCircle, BookOpen, Box, CreditCard, ExternalLink, FileDown, FolderOpen, Info, Keyboard, LifeBuoy, LogOut, Palette, RotateCcw, UserRound, Wrench } from "lucide-react";
import type { DesktopAccount, Prefs, WebPage } from "../ipc";
import { DEFAULT_PREFS, UI_ZOOMS, type LocalPrefs } from "../local";
import type { UpdateStatus } from "../updater";
import { formatBytes } from "../updater";

const planName = (a: DesktopAccount | null) => a?.tier === "business" ? "Business" : a?.tier === "lifetime" ? "Founder" : a?.plan === "pro" ? "Pro" : "Free";

// ---------------------------------------------------------------- Subscription

export function Subscription({ account, onWeb, onRefresh, refreshing }: { account: DesktopAccount | null; onWeb: (p: WebPage) => void; onRefresh: () => void; refreshing: boolean }) {
  const pro = account?.plan === "pro";
  const end = account?.periodEnd ? new Date(account.periodEnd).toLocaleDateString(undefined, { dateStyle: "long" }) : null;
  const status: Record<string, string> = { active: "Active", trialing: "Trial", past_due: "Payment due: update your card", canceled: "Cancelled", unpaid: "Unpaid", incomplete: "Incomplete" };
  return (
    <div className="page narrow">
      <header className="page-head">
        <h1>Subscription</h1>
        <p>Your plan is checked by HingeLab&apos;s servers each time you export a cut file.</p>
      </header>
      <section className="card">
        <CardTitle icon={CreditCard}>Your plan</CardTitle>
        <div className="row-between">
          <div>
            <p className="plan-name">{planName(account)}</p>
            {account?.status && <p>Status: {status[account.status] ?? account.status}</p>}
            {pro && end && <p>{account?.status === "canceled" ? "Pro until" : "Renews"} {end}</p>}
          </div>
          <button type="button" className="btn" onClick={onRefresh} disabled={refreshing}>{refreshing ? "Checking…" : "Refresh"}</button>
        </div>
        <ul className="features">
          <li className={pro ? "on" : ""}>Pill, polygon and cylinder boxes</li>
          <li className={pro ? "on" : ""}>Wave, relief and serpentine hinges</li>
          <li className={pro ? "on" : ""}>Large puzzles and every generator design</li>
          <li className={pro ? "on" : ""}>Save projects and export cut files</li>
        </ul>
        <div className="row">
          {pro
            ? <button type="button" className="btn" onClick={() => onWeb("manage")}><ExternalLink size={14} aria-hidden />Manage subscription</button>
            : <button type="button" className="btn primary" onClick={() => onWeb("upgrade")}><ExternalLink size={14} aria-hidden />Upgrade to Pro</button>}
        </div>
        <p className="fine">Payments and invoices are handled on hingelab.vercel.app in your browser. After you upgrade, choose Refresh.</p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- Settings

/** A card heading with its icon. */
function CardTitle({ id, icon: I, danger, children }: { id?: string; icon: typeof Box; danger?: boolean; children: React.ReactNode }) {
  return <h2 id={id}><span className={`h-icon${danger ? " danger" : ""}`} aria-hidden><I size={16} /></span>{children}</h2>;
}

/** A labelled row of choices (a radio group). */
function Choice<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <div className="field-row choice">
      <span>{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map(([v, n]) => <button key={String(v)} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}>{n}</button>)}
      </div>
    </div>
  );
}

export function Settings(props: {
  account: DesktopAccount | null; local: LocalPrefs; setLocal: (p: LocalPrefs) => void; prefs: Prefs | null;
  version: string; server: string; update: UpdateStatus;
  onCheck: () => void; onInstall: () => void; onChooseFolder: () => void; onExportPrefs: (clear: boolean, openAfter: boolean) => void;
  onChooseProjectFolder: () => void; onProjectPrefs: (clear: boolean, recentMax: number) => void;
  onWeb: (p: WebPage) => void; onSignOut: () => void; onRefreshPlan: () => void;
}) {
  const { local, setLocal, prefs, update: u } = props;
  const set = (patch: Partial<LocalPrefs>) => setLocal({ ...local, ...patch });
  const updateText =
    u.phase === "checking" ? "Checking for updates…"
    : u.phase === "none" ? `HingeLab is up to date (checked ${new Date(u.checkedAt).toLocaleTimeString()}).`
    : u.phase === "available" ? `Version ${u.info.version} is available${u.info.size ? ` (${formatBytes(u.info.size)})` : ""}.`
    : u.phase === "downloading" ? "Downloading the update…"
    : u.phase === "installing" ? "Installing the update…"
    : u.phase === "restarting" ? "Restarting…"
    : u.phase === "error" ? u.message
    : "Updates are signed by HingeLab and checked before they are installed.";
  return (
    <div className="page settings-page">
      <header className="page-head"><h1>Settings</h1></header>
      <div className="settings-col">

      <section className="card" aria-labelledby="s-account">
        <CardTitle id="s-account" icon={UserRound}>Account</CardTitle>
        <p>{props.account?.user.email ?? "Signed in"}</p>
        <div className="row">
          <button type="button" className="btn" onClick={() => props.onWeb("account")}><ExternalLink size={14} aria-hidden />Account on the website</button>
          <button type="button" className="btn danger" onClick={props.onSignOut}>Sign out</button>
        </div>
      </section>

      <section className="card" aria-labelledby="s-sub">
        <CardTitle id="s-sub" icon={CreditCard}>Subscription</CardTitle>
        <p>{planName(props.account)} plan</p>
        <div className="row">
          <button type="button" className="btn" onClick={() => props.onWeb(props.account?.plan === "pro" ? "manage" : "upgrade")}><ExternalLink size={14} aria-hidden />{props.account?.plan === "pro" ? "Manage subscription" : "Upgrade to Pro"}</button>
          <button type="button" className="btn" onClick={props.onRefreshPlan}>Refresh plan</button>
        </div>
      </section>

      <section className="card" aria-labelledby="s-files">
        <CardTitle id="s-files" icon={FolderOpen}>Project files</CardTitle>
        <p className="path">{prefs?.homeDir ? <><FolderOpen size={14} aria-hidden /> {prefs.homeDir}</> : "No project folder: Save and Open start where the last project was."}</p>
        <div className="row">
          <button type="button" className="btn" onClick={props.onChooseProjectFolder}>Choose folder…</button>
          {prefs?.homeDir && <button type="button" className="btn" onClick={() => props.onProjectPrefs(true, prefs.recentMax)}>Clear</button>}
        </div>
        <label className="field-row">
          <span>Recent files to list</span>
          <select value={prefs?.recentMax || 12} onChange={(e) => props.onProjectPrefs(false, Number(e.target.value))} disabled={!prefs}>
            {[5, 8, 12, 20, 30].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="field-row">
          <span>Open the last project when HingeLab starts</span>
          <input type="checkbox" checked={local.openLast} onChange={(e) => set({ openLast: e.target.checked })} />
        </label>
      </section>

      </div>
      <div className="settings-col">

      <section className="card" aria-labelledby="s-look">
        <CardTitle id="s-look" icon={Palette}>Appearance</CardTitle>
        <div className="segmented" role="radiogroup" aria-labelledby="s-look">
          {(["system", "light", "dark"] as const).map((v) => <button key={v} type="button" role="radio" aria-checked={local.theme === v} onClick={() => set({ theme: v })}>{v === "system" ? "Use Windows setting" : v === "light" ? "Light" : "Dark"}</button>)}
        </div>
        <Choice label="Interface size" value={local.uiZoom} onChange={(uiZoom) => set({ uiZoom })} options={UI_ZOOMS.map((z) => [z, `${z}%`] as const)} />
        <label className="field-row">
          <span>Reduce motion</span>
          <input type="checkbox" checked={local.reduceMotion} onChange={(e) => set({ reduceMotion: e.target.checked })} />
        </label>
        <div className="row">
          <button type="button" className="btn" onClick={() => setLocal({ ...DEFAULT_PREFS, sidebarCollapsed: local.sidebarCollapsed, openLast: local.openLast })}><RotateCcw size={14} aria-hidden />Reset these settings</button>
        </div>
      </section>

      <section className="card" aria-labelledby="s-export">
        <CardTitle id="s-export" icon={FileDown}>Export</CardTitle>
        <p className="path">{prefs?.exportDir ? <><FolderOpen size={14} aria-hidden /> {prefs.exportDir}</> : "No export folder: Export asks where to save each file."}</p>
        <div className="row">
          <button type="button" className="btn" onClick={props.onChooseFolder}>Choose folder…</button>
          {prefs?.exportDir && <button type="button" className="btn" onClick={() => props.onExportPrefs(true, prefs.openAfterExport)}>Clear</button>}
        </div>
        <label className="field-row">
          <span>Show the file in Explorer after exporting</span>
          <input type="checkbox" checked={!!prefs?.openAfterExport} onChange={(e) => props.onExportPrefs(false, e.target.checked)} />
        </label>
      </section>

      <section className="card" aria-labelledby="s-upd">
        <CardTitle id="s-upd" icon={ArrowDownCircle}>Application updates</CardTitle>
        <p role="status">{updateText}</p>
        <div className="row">
          {u.phase === "available"
            ? <button type="button" className="btn primary" onClick={props.onInstall}>Update now</button>
            : <button type="button" className="btn" onClick={props.onCheck} disabled={u.phase === "checking" || u.phase === "downloading" || u.phase === "installing"}>Check for updates</button>}
        </div>
        <label className="field-row">
          <span>Check for updates when HingeLab starts</span>
          <input type="checkbox" checked={local.autoCheckUpdates} onChange={(e) => set({ autoCheckUpdates: e.target.checked })} />
        </label>
      </section>

      <section className="card" aria-labelledby="s-ver">
        <CardTitle id="s-ver" icon={Info}>About</CardTitle>
        <p>HingeLab for Windows {props.version}</p>
        <p className="fine">Connected to {props.server}. Designs are made on this computer; HingeLab&apos;s servers check your plan when you export.</p>
        <div className="row">
          <button type="button" className="btn" onClick={() => props.onWeb("help")}><LifeBuoy size={14} aria-hidden />Help centre</button>
          <button type="button" className="btn" onClick={() => props.onWeb("privacy")}>Privacy</button>
          <button type="button" className="btn" onClick={() => props.onWeb("terms")}>Terms</button>
        </div>
      </section>

      <section className="card" aria-labelledby="s-out">
        <CardTitle id="s-out" icon={LogOut} danger>Sign out</CardTitle>
        <p>Signs this computer out and ends the session on the server.</p>
        <button type="button" className="btn danger" onClick={props.onSignOut}>Sign out</button>
      </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Help

const SHORTCUTS: [string, string][] = [
  ["Ctrl + Z / Ctrl + Shift + Z", "Undo / redo in the editor"],
  ["Ctrl + = / Ctrl + -", "Zoom in / out"],
  ["Ctrl + 0", "Fit to window"],
  ["Ctrl + wheel", "Zoom at the pointer"],
  ["Ctrl + O", "Open a project file (from Project files)"],
  ["Ctrl + ,", "Settings"],
  ["Ctrl + Shift + B", "Collapse or expand the sidebar"],
  ["F1", "Help"],
];

export function Help({ onWeb, version, onHelpCentre }: { onWeb: (p: WebPage) => void; version: string; onHelpCentre: () => void }) {
  return (
    <div className="page narrow">
      <header className="page-head">
        <h1>Help</h1>
        <p>The same editors as the website, on this computer: designs update as you type, also offline. Exporting a cut file checks your plan with HingeLab&apos;s servers, so it needs a connection.</p>
      </header>
      <section className="card">
        <CardTitle icon={Keyboard}>Keyboard shortcuts</CardTitle>
        <dl className="keys">{SHORTCUTS.map(([k, v]) => <div key={k}><dt><kbd>{k}</kbd></dt><dd>{v}</dd></div>)}</dl>
      </section>
      <section className="card">
        <CardTitle icon={FileDown}>Saving and cutting</CardTitle>
        <p>File › Save project keeps the design as a HingeLab project file (.oclc). Project files open in the app (double-click one, drop it on the window, or use Project files) and on the website, in the section that made them.</p>
        <p>Export writes the cut file (SVG, DXF, PDF or LightBurn) straight into the folder chosen in Settings, or asks where when no folder is set. Files are in millimetres at true size: import them into LightBurn, xTool Creative Space or Inkscape at 100%.</p>
        <p>The Free plan is for trying the designers. Saving projects and downloading cut files need Pro.</p>
      </section>
      <section className="card">
        <CardTitle icon={Wrench}>Troubleshooting</CardTitle>
        <p><b>Offline.</b> Keep designing; export again when you are back online.</p>
        <p><b>Signed out.</b> Sessions end after 30 days without use, or when you sign out on another device. Sign in again from the start screen.</p>
        <p><b>Windows SmartScreen.</b> If Windows warns about the installer, check that it came from hingelab.vercel.app, then choose More info and Run anyway.</p>
        <div className="row">
          <button type="button" className="btn primary" onClick={onHelpCentre}><BookOpen size={14} aria-hidden />Full help centre</button>
          <button type="button" className="btn ghost" onClick={() => onWeb("help")}><ExternalLink size={14} aria-hidden />Help centre in the browser</button>
        </div>
      </section>
      <p className="fine">HingeLab for Windows {version}</p>
    </div>
  );
}
