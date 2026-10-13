import { useState } from "react";
import { ArrowRight, Box, Cake, Clock, Clock3, Crown, ExternalLink, FolderOpen, Globe, Hash, History, KeyRound, Keyboard, LayoutGrid, LifeBuoy, Lock, Plus, Puzzle, QrCode, Signpost, Star, Trash2, Trophy, Wand2 } from "lucide-react";
import type { DCatalog, DProduct } from "../../../lib/desktop/types";
import { onlineArt, presetArt, productArt, showcase } from "../art";
import type { WebRoute } from "./Web";
import type { DesktopAccount, Prefs, WebPage } from "../ipc";
import type { Favorite, LocalPrefs, SavedDesign } from "../local";
import type { UpdateStatus } from "../updater";
import { formatBytes } from "../updater";

export const ICONS = { box: Box, clock: Clock, puzzle: Puzzle, qr: QrCode, cake: Cake, key: KeyRound, sign: Signpost, hash: Hash, trophy: Trophy, wand: Wand2 } as const;

export function ProductIcon({ product, size = 18 }: { product: DProduct; size?: number }) {
  const I = ICONS[product.icon] ?? Box;
  return <I size={size} aria-hidden />;
}

const ago = (t: number) => {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
};

const planName = (a: DesktopAccount | null) => (a?.plan === "pro" ? "Pro" : "Free");

// ---------------------------------------------------------------- Dashboard

const HERO_PRODUCTS = ["clock", "hinge", "boxes"];

const PRO_PERKS = ["Pill, polygon and cylinder boxes", "Wave, relief and serpentine hinges", "Large puzzles and every generator design", "Exports without the HingeLab mark"];

/** Editors that run on the website; they open inside the window, signed in. */
const ONLINE_TILES: { id: string; name: string; blurb: string; art: [string, string]; section: WebRoute; path: string }[] = [
  { id: "letters", name: "Letters", blurb: "Letter boxes, solid and stencil letters in any script.", art: ["letters", "hello-sign"], section: "web-editors", path: "/app/editor/local?p=letters" },
  { id: "parametric", name: "Parametric Slicer", blurb: "Sliced sculptures from 3D files, photos or formulas.", art: ["parametric", "head-stack"], section: "web-editors", path: "/app/editor/local?p=parametric" },
  { id: "studio", name: "Studio", blurb: "Lay out designs, text and images on one sheet, plus trays, lamps, finger-joint boxes and test cards.", art: ["boxes", "organiser"], section: "web-studio", path: "/home" },
  { id: "ai-studio", name: "AI Studio", blurb: "Pictures from words, photo clean-up, engraving, vectorizing with cut checks and an assistant, in a new Studio project.", art: ["sign", "layered-name"], section: "web-studio", path: "/home?new=ai" },
];

export function Dashboard({ account, catalog, recent, defaultProduct, onNew, onPreset, onBrowse, onOpenRecent, onUpgrade, onOnline }: {
  account: DesktopAccount | null; catalog: DCatalog | null; recent: SavedDesign[]; defaultProduct: string;
  onNew: (product: string) => void; onPreset: (product: string, preset: string) => void; onBrowse: () => void;
  onOpenRecent: (d: SavedDesign) => void; onUpgrade: () => void; onOnline: (section: WebRoute, path: string) => void;
}) {
  const first = (account?.user.name || account?.user.email || "").split(/[\s@]/)[0];
  const pro = account?.plan === "pro";
  const products = catalog?.products ?? [];
  const start = products.find((p) => p.id === defaultProduct) ?? products[0];
  const heroArt = HERO_PRODUCTS.flatMap((id) => {
    const p = products.find((x) => x.id === id);
    const src = p && productArt(p);
    return src ? [src] : [];
  });
  const ideas = showcase(products, 6);
  const last = recent[0];
  return (
    <div className="page dash">
      <section className="hero" aria-labelledby="dash-title">
        <div className="hero-text">
          <h1 id="dash-title">{first ? `Welcome back, ${first}` : "Welcome to HingeLab"}</h1>
          <p>Boxes, clocks, puzzles and QR signs as clean SVG files at true size, ready for LightBurn, xTool Creative Space or Inkscape.</p>
        </div>
        <div className="hero-actions">
          {last
            ? <button type="button" className="btn primary big" onClick={() => onOpenRecent(last)}><History size={16} aria-hidden /><span className="clip">Continue “{last.name}”</span></button>
            : start && <button type="button" className="btn primary big" onClick={() => onNew(start.id)}><Plus size={16} aria-hidden />New {start.name}</button>}
          <button type="button" className="btn big ghost" onClick={onBrowse}><LayoutGrid size={16} aria-hidden />Browse presets</button>
        </div>
        <div className="hero-art" aria-hidden>
          {heroArt.map((src, i) => <span key={src} className={`hero-card c${i}`}><img src={src} alt="" /></span>)}
        </div>
      </section>

      <div className="dash-grid">
        <div className="dash-main">
          <section className="dash-card dash-new" aria-labelledby="dash-new">
            <div className="sec-head">
              <h2 id="dash-new" className="sub">Start a new design</h2>
              <button type="button" className="link-btn" onClick={onBrowse}>All presets<ArrowRight size={13} aria-hidden /></button>
            </div>
            <div className="tiles">
              {catalog ? products.map((p) => {
                const src = productArt(p);
                return (
                  <button key={p.id} type="button" className="tile" title={p.blurb} onClick={() => onNew(p.id)}>
                    <span className="tile-media">{src ? <img src={src} alt="" /> : <ProductIcon product={p} size={36} />}</span>
                    <span className="tile-body">
                      <span className="tile-icon"><ProductIcon product={p} size={14} /></span>
                      <span className="tile-name"><b>{p.name}</b><small>{p.presets.length} presets</small></span>
                    </span>
                  </button>
                );
              }) : <div className="sk tall" />}
            </div>
          </section>

          {ideas.length > 0 && (
            <section className="dash-card dash-ideas" aria-labelledby="dash-ideas">
              <div className="sec-head">
                <h2 id="dash-ideas" className="sub">Ready-made designs</h2>
                <button type="button" className="link-btn" onClick={onBrowse}>See all<ArrowRight size={13} aria-hidden /></button>
              </div>
              <ul className="ideas">
                {ideas.map(({ product, preset, src }) => (
                  <li key={`${product.id}/${preset.id}`}>
                    <button type="button" className="idea" onClick={() => onPreset(product.id, preset.id)}>
                      <span className="idea-media">
                        <img src={src} alt="" />
                        {preset.pro && !pro && <span className="badge"><Lock size={10} aria-hidden />Pro</span>}
                      </span>
                      <span className="idea-text">
                        <b>{preset.name}</b>
                        <small>{product.name}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="dash-card dash-online" aria-labelledby="dash-online">
            <div className="sec-head">
              <h2 id="dash-online" className="sub">More editors, online</h2>
              <button type="button" className="link-btn" onClick={() => onOnline("web-editors", "/app/editor/local")}>All editors<ArrowRight size={13} aria-hidden /></button>
            </div>
            <div className="online">
              {ONLINE_TILES.map((t) => {
                const src = onlineArt(...t.art);
                return (
                  <button key={t.id} type="button" className="tile" title={t.blurb} onClick={() => onOnline(t.section, t.path)}>
                    <span className="tile-media">{src ? <img src={src} alt="" /> : <Globe size={22} aria-hidden />}</span>
                    <span className="tile-name"><b>{t.name}</b><small><Globe size={11} aria-hidden />Opens here</small></span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="dash-side" aria-label="Your work">
          <section className="dash-card dash-recent" aria-labelledby="dash-recent">
            <div className="sec-head">
              <h2 id="dash-recent" className="sub">Recent designs</h2>
            </div>
            {recent.length
              ? (
                <ul className="rlist">
                  {recent.slice(0, 8).map((d) => {
                    const p = catalog?.products.find((x) => x.id === d.product);
                    const src = d.thumb ?? (p && productArt(p));
                    return (
                      <li key={d.id}>
                        <button type="button" className="rrow" onClick={() => onOpenRecent(d)}>
                          <span className={`rcard-media${d.thumb ? " drawn" : ""}`}>{src ? <img src={src} alt="" loading="lazy" /> : p && <ProductIcon product={p} size={20} />}</span>
                          <span className="rrow-text">
                            <b>{d.name}</b>
                            <small>{p?.name ?? d.summary} · {ago(d.at)}</small>
                          </span>
                          <ArrowRight size={14} aria-hidden className="rrow-go" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )
              : (
                <div className="rempty">
                  {heroArt[1] && <img src={heroArt[1]} alt="" />}
                  <b>No designs yet</b>
                  <p>Designs you work on appear here, so you can pick up where you left off.</p>
                </div>
              )}
          </section>
          <section className={`dash-card plan-card${pro ? " is-pro" : " upsell"}`} aria-labelledby="dash-plan">
            <div className="plan-top">
              <span className="plan-icon"><Crown size={18} aria-hidden /></span>
              <div>
                <h2 id="dash-plan" className="plan-label">Your plan</h2>
                <p className="plan-name">{planName(account)}</p>
              </div>
            </div>
            <p title={PRO_PERKS.join(" · ")}>{pro ? "Every shape, pattern and generator, with clean exports." : "Unlock every shape and generator, and export without the HingeLab mark."}</p>
            {!pro && <button type="button" className="btn primary" onClick={onUpgrade}><Crown size={15} aria-hidden />Upgrade to Pro</button>}
          </section>
        </aside>
      </div>
    </div>
  );
}

function RecentGrid({ items, catalog, onOpen, onRemove }: { items: SavedDesign[]; catalog: DCatalog | null; onOpen: (d: SavedDesign) => void; onRemove?: (d: SavedDesign) => void }) {
  return (
    <ul className="rgrid">
      {items.map((d) => {
        const p = catalog?.products.find((x) => x.id === d.product);
        const src = d.thumb ?? (p && productArt(p));
        return (
          <li key={d.id} className="rcard">
            <button type="button" className="rcard-open" onClick={() => onOpen(d)}>
              <span className={`rcard-media${d.thumb ? " drawn" : ""}`}>{src ? <img src={src} alt="" loading="lazy" /> : p && <ProductIcon product={p} size={28} />}</span>
              <span className="rcard-text">
                <b>{d.name}</b>
                <small>{p?.name ?? d.summary}</small>
                <small className="rcard-meta"><Clock3 size={11} aria-hidden />{ago(d.at)}</small>
              </span>
            </button>
            {onRemove && <button type="button" className="icon-btn rcard-del" title="Remove from this list" aria-label={`Remove ${d.name} from this list`} onClick={() => onRemove(d)}><Trash2 size={14} aria-hidden /></button>}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------- Generators

export function Generators({ catalog, plan, initial, favorites, onPreset, onNew, onFavorite }: {
  catalog: DCatalog | null; plan: "free" | "pro"; initial: string; favorites: Favorite[];
  onPreset: (product: string, preset: string) => void; onNew: (product: string) => void; onFavorite: (product: DProduct, preset: { id: string; name: string; note: string }) => void;
}) {
  const [tab, setTab] = useState(initial);
  const product = catalog?.products.find((p) => p.id === tab) ?? catalog?.products[0];
  if (!catalog || !product) return <div className="page"><div className="sk tall" /></div>;
  return (
    <div className="page">
      <header className="page-head">
        <h1>Generators</h1>
        <p>Start from a ready-made design and adjust it, or from the defaults.</p>
      </header>
      <div className="tabs" role="tablist" aria-label="Generators">
        {catalog.products.map((p) => (
          <button key={p.id} type="button" role="tab" aria-selected={p.id === product.id} onClick={() => setTab(p.id)}>
            <ProductIcon product={p} size={15} />{p.name}
          </button>
        ))}
      </div>
      <div className="tab-intro">
        <p>{product.blurb}</p>
        <button type="button" className="btn primary" onClick={() => onNew(product.id)}>New {product.name}</button>
      </div>
      <div className="presets" role="list">
        {product.presets.map((pr) => {
          const fav = favorites.some((f) => f.product === product.id && f.preset === pr.id);
          const src = presetArt(product.id, pr.id);
          return (
            <div key={pr.id} className="preset" role="listitem">
              <button type="button" className="preset-open" onClick={() => onPreset(product.id, pr.id)}>
                {src && <span className="preset-media"><img src={src} alt="" loading="lazy" /></span>}
                <b>{pr.name}{pr.pro && plan !== "pro" && <span className="badge"><Lock size={10} aria-hidden />Pro</span>}</b>
                <small>{pr.note}</small>
              </button>
              <button type="button" className="icon-btn star" aria-pressed={fav} title={fav ? "Remove from favorites" : "Add to favorites"} onClick={() => onFavorite(product, pr)}>
                <Star size={14} fill={fav ? "currentColor" : "none"} aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Recent and favorites

export function Recent({ recent, catalog, onOpen, onRemove, onClear }: { recent: SavedDesign[]; catalog: DCatalog | null; onOpen: (d: SavedDesign) => void; onRemove: (d: SavedDesign) => void; onClear: () => void }) {
  return (
    <div className="page">
      <header className="page-head row-between">
        <div>
          <h1>Recent designs</h1>
          <p>The last {recent.length || ""} designs you worked on, kept on this computer.</p>
        </div>
        {recent.length > 0 && <button type="button" className="btn" onClick={onClear}>Clear list</button>}
      </header>
      {recent.length ? <RecentGrid items={recent} catalog={catalog} onOpen={onOpen} onRemove={onRemove} /> : <p className="empty">Nothing here yet. Open a generator and your designs will be listed here.</p>}
    </div>
  );
}

export function Favorites({ favorites, catalog, onOpen, onRemove }: { favorites: Favorite[]; catalog: DCatalog | null; onOpen: (f: Favorite) => void; onRemove: (f: Favorite) => void }) {
  return (
    <div className="page">
      <header className="page-head">
        <h1>Favorites</h1>
        <p>Designs and presets you starred. Star one from a design's title bar or a preset card.</p>
      </header>
      {favorites.length ? (
        <ul className="list">
          {favorites.map((f) => {
            const p = catalog?.products.find((x) => x.id === f.product);
            const src = (f.preset && presetArt(f.product, f.preset)) || (p && productArt(p));
            return (
              <li key={f.id}>
                <button type="button" className="list-item" onClick={() => onOpen(f)}>
                  {src ? <span className="li-thumb"><img src={src} alt="" loading="lazy" /></span> : p && <span className="li-icon"><ProductIcon product={p} size={16} /></span>}
                  <span className="li-text"><b>{f.name}</b><small>{f.note || p?.name}</small></span>
                  <span className="li-meta">{f.preset ? "Preset" : "Design"}</span>
                </button>
                <button type="button" className="icon-btn" title="Remove from favorites" onClick={() => onRemove(f)}><Trash2 size={14} aria-hidden /></button>
              </li>
            );
          })}
        </ul>
      ) : <p className="empty">No favorites yet.</p>}
    </div>
  );
}

// ---------------------------------------------------------------- Subscription

export function Subscription({ account, onWeb, onRefresh, refreshing }: { account: DesktopAccount | null; onWeb: (p: WebPage) => void; onRefresh: () => void; refreshing: boolean }) {
  const pro = account?.plan === "pro";
  const end = account?.periodEnd ? new Date(account.periodEnd).toLocaleDateString(undefined, { dateStyle: "long" }) : null;
  const status: Record<string, string> = { active: "Active", trialing: "Trial", past_due: "Payment due: update your card", canceled: "Cancelled", unpaid: "Unpaid", incomplete: "Incomplete" };
  return (
    <div className="page narrow">
      <header className="page-head">
        <h1>Subscription</h1>
        <p>Your plan is checked by HingeLab's servers every time a design is built.</p>
      </header>
      <section className="card">
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
          <li className={pro ? "on" : ""}>Exports without the HingeLab mark</li>
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

export function Settings(props: {
  account: DesktopAccount | null; local: LocalPrefs; setLocal: (p: LocalPrefs) => void; prefs: Prefs | null; catalog: DCatalog | null;
  version: string; server: string; update: UpdateStatus;
  onCheck: () => void; onInstall: () => void; onChooseFolder: () => void; onExportPrefs: (clear: boolean, openAfter: boolean) => void;
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
    <div className="page narrow settings-page">
      <header className="page-head"><h1>Settings</h1></header>

      <section className="card" aria-labelledby="s-account">
        <h2 id="s-account">Account</h2>
        <p>{props.account?.user.email ?? "Signed in"}</p>
        <div className="row">
          <button type="button" className="btn" onClick={() => props.onWeb("account")}><ExternalLink size={14} aria-hidden />Account on the website</button>
          <button type="button" className="btn danger" onClick={props.onSignOut}>Sign out</button>
        </div>
      </section>

      <section className="card" aria-labelledby="s-sub">
        <h2 id="s-sub">Subscription</h2>
        <p>{planName(props.account)} plan</p>
        <div className="row">
          <button type="button" className="btn" onClick={() => props.onWeb(props.account?.plan === "pro" ? "manage" : "upgrade")}><ExternalLink size={14} aria-hidden />{props.account?.plan === "pro" ? "Manage subscription" : "Upgrade to Pro"}</button>
          <button type="button" className="btn" onClick={props.onRefreshPlan}>Refresh plan</button>
        </div>
      </section>

      <section className="card" aria-labelledby="s-units">
        <h2 id="s-units">Default units</h2>
        <div className="segmented" role="radiogroup" aria-labelledby="s-units">
          {(["mm", "in"] as const).map((v) => <button key={v} type="button" role="radio" aria-checked={local.units === v} onClick={() => set({ units: v })}>{v === "mm" ? "Millimetres" : "Inches"}</button>)}
        </div>
        <p className="fine">Files are always saved in millimetres; this only changes how lengths are shown and typed.</p>
      </section>

      <section className="card" aria-labelledby="s-gen">
        <h2 id="s-gen">Generator defaults</h2>
        <label className="field-row">
          <span>Open first</span>
          <select value={local.defaultProduct} onChange={(e) => set({ defaultProduct: e.target.value })}>
            {props.catalog?.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="field-row">
          <span>New designs start from the last settings I used</span>
          <input type="checkbox" checked={local.reuseLastSettings} onChange={(e) => set({ reuseLastSettings: e.target.checked })} />
        </label>
      </section>

      <section className="card" aria-labelledby="s-look">
        <h2 id="s-look">Appearance</h2>
        <div className="segmented" role="radiogroup" aria-labelledby="s-look">
          {(["system", "light", "dark"] as const).map((v) => <button key={v} type="button" role="radio" aria-checked={local.theme === v} onClick={() => set({ theme: v })}>{v === "system" ? "Use Windows setting" : v === "light" ? "Light" : "Dark"}</button>)}
        </div>
      </section>

      <section className="card" aria-labelledby="s-export">
        <h2 id="s-export">Export</h2>
        <p className="path">{prefs?.exportDir ? <><FolderOpen size={14} aria-hidden /> {prefs.exportDir}</> : "No export folder: Export asks where to save, like Save SVG."}</p>
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
        <h2 id="s-upd">Application updates</h2>
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
        <h2 id="s-ver">About</h2>
        <p>HingeLab for Windows {props.version}</p>
        <p className="fine">Connected to {props.server}. Designs are built on HingeLab's servers.</p>
        <div className="row">
          <button type="button" className="btn" onClick={() => props.onWeb("help")}><LifeBuoy size={14} aria-hidden />Help centre</button>
          <button type="button" className="btn" onClick={() => props.onWeb("privacy")}>Privacy</button>
          <button type="button" className="btn" onClick={() => props.onWeb("terms")}>Terms</button>
        </div>
      </section>

      <section className="card" aria-labelledby="s-out">
        <h2 id="s-out">Sign out</h2>
        <p>Signs this computer out and ends the session on the server.</p>
        <button type="button" className="btn danger" onClick={props.onSignOut}>Sign out</button>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- Help

const SHORTCUTS: [string, string][] = [
  ["Ctrl + S", "Save SVG"],
  ["Ctrl + E", "Export to the export folder"],
  ["Ctrl + Enter", "Update the design"],
  ["Ctrl + Z / Ctrl + Y", "Undo / redo"],
  ["Ctrl + = / Ctrl + -", "Zoom in / out"],
  ["Ctrl + 0", "Fit to window"],
  ["Ctrl + 1", "Actual size (100%)"],
  ["Ctrl + wheel", "Zoom at the pointer"],
  ["Ctrl + ,", "Settings"],
  ["Ctrl + B", "Collapse or expand the sidebar"],
  ["F1", "Help"],
];

export function Help({ onWeb, version, onHelpCentre }: { onWeb: (p: WebPage) => void; version: string; onHelpCentre: () => void }) {
  return (
    <div className="page narrow">
      <header className="page-head">
        <h1>Help</h1>
        <p>HingeLab builds every design on its servers and sends back an SVG for your laser cutter. You need an internet connection to change a design; a preview you already have can always be saved.</p>
      </header>
      <section className="card">
        <h2><Keyboard size={16} aria-hidden /> Keyboard shortcuts</h2>
        <dl className="keys">{SHORTCUTS.map(([k, v]) => <div key={k}><dt><kbd>{k}</kbd></dt><dd>{v}</dd></div>)}</dl>
      </section>
      <section className="card">
        <h2>Saving and cutting</h2>
        <p>Save SVG asks where to save. Export saves straight into the folder chosen in Settings. Files are in millimetres at true size: import them into LightBurn, xTool Creative Space or Inkscape at 100%.</p>
        <p>Free-plan exports include a small "Made with HingeLab" line below the parts on its own engrave layer.</p>
      </section>
      <section className="card">
        <h2>Troubleshooting</h2>
        <p><b>Offline.</b> Check your connection; HingeLab tries again when you change a setting or choose Update.</p>
        <p><b>Signed out.</b> Sessions end after 30 days without use, or when you sign out on another device. Sign in again from the start screen.</p>
        <p><b>Windows SmartScreen.</b> If Windows warns about the installer, check that it came from hingelab.vercel.app, then choose More info and Run anyway.</p>
        <div className="row">
          <button type="button" className="btn" onClick={onHelpCentre}><LifeBuoy size={14} aria-hidden />Full help centre</button>
          <button type="button" className="btn ghost" onClick={() => onWeb("help")}><ExternalLink size={14} aria-hidden />Help centre in the browser</button>
        </div>
      </section>
      <p className="fine">HingeLab for Windows {version}</p>
    </div>
  );
}
