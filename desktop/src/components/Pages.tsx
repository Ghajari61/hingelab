import { useLayoutEffect, useRef, useState, type KeyboardEvent, type WheelEvent } from "react";
import { ArrowRight, Box, Cake, ChevronLeft, ChevronRight, Clock, Clock3, Crown, ExternalLink, FolderOpen, Globe, Hash, History, KeyRound, Keyboard, LayoutGrid, LifeBuoy, Lock, Plus, Puzzle, QrCode, RotateCcw, Shapes, Signpost, SquareStack, Star, Trash2, Trophy, Type, Wand2 } from "lucide-react";
import type { DCatalog, DProduct } from "../../../lib/desktop/types";
import { onlineArt, presetArt, productArt, showcase } from "../art";
import type { WebRoute } from "./Web";
import type { DesktopAccount, Prefs, RecentProject, WebPage } from "../ipc";
import { DEFAULT_PREFS, UI_ZOOMS, type Favorite, type LocalPrefs, type SavedDesign, type SheetTone } from "../local";
import type { UpdateStatus } from "../updater";
import { formatBytes } from "../updater";

export const ICONS = { box: Box, clock: Clock, puzzle: Puzzle, qr: QrCode, cake: Cake, key: KeyRound, sign: Signpost, hash: Hash, trophy: Trophy, layers: SquareStack, wand: Wand2, type: Type, shapes: Shapes } as const;

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

const folderOf = (path: string) => path.replace(/[\\/][^\\/]*$/, "");

const planName = (a: DesktopAccount | null) => (a?.plan === "pro" ? "Pro" : "Free");

// ---------------------------------------------------------------- Dashboard

const HERO_PRODUCTS = ["clock", "hinge", "boxes"];

const PRO_PERKS = ["Pill, polygon and cylinder boxes", "Wave, relief and serpentine hinges", "Large puzzles and every generator design", "Exports without the HingeLab mark"];

/** Website sections that open inside the window, signed in. */
const ONLINE_TILES: { id: string; name: string; blurb: string; art: [string, string]; section: WebRoute; path: string }[] = [
  { id: "studio", name: "Studio", blurb: "Lay out designs, text and images on one sheet, plus trays, lamps and finger-joint boxes.", art: ["boxes", "organiser"], section: "web-studio", path: "/home" },
  { id: "ai-studio", name: "AI Studio", blurb: "Pictures from words, photo clean-up, engraving, vectorizing with cut checks and an assistant, in a new Studio project.", art: ["sign", "layered-name"], section: "web-ai", path: "/home?new=ai" },
  { id: "projects", name: "Cloud projects", blurb: "Designs saved to your account on the website, from any computer.", art: ["hinge", "card-box"], section: "web-projects", path: "/app" },
];

export function Dashboard({ account, catalog, recent, files, defaultProduct, onNew, onPreset, onBrowse, onOpenRecent, onOpenFile, onUpgrade, onOnline }: {
  account: DesktopAccount | null; catalog: DCatalog | null; recent: SavedDesign[]; files: RecentProject[]; defaultProduct: string;
  /** Opens a project file: one from the list, or (null) one picked in the Open dialog. */
  onOpenFile: (path: string | null) => void;
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
          <button type="button" className="btn big ghost" title="Open a HingeLab project file (.oclc) (Ctrl+O)" onClick={() => onOpenFile(null)}><FolderOpen size={16} aria-hidden />Open project</button>
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
              <h2 id="dash-online" className="sub">From the website</h2>
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
          <section className="dash-card dash-files" aria-labelledby="dash-files">
            <div className="sec-head">
              <h2 id="dash-files" className="sub">Project files</h2>
              <button type="button" className="link-btn" onClick={() => onOpenFile(null)}>Open<FolderOpen size={13} aria-hidden /></button>
            </div>
            {files.length ? (
              <ul className="flist">
                {files.slice(0, 6).map((f) => (
                  <li key={f.path}>
                    <button type="button" className="frow" disabled={!f.exists} title={f.exists ? f.path : `${f.path} (moved or deleted)`} onClick={() => onOpenFile(f.path)}>
                      <FolderOpen size={14} aria-hidden />
                      <span className="frow-text"><b>{f.name}</b><small>{f.exists ? folderOf(f.path) : "Moved or deleted"}</small></span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">Ctrl+S saves the open design as a project file (.oclc) you can open again here or on the website.</p>
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
  const ids = catalog.products.map((p) => p.id);
  const onTabKey = (e: KeyboardEvent) => {
    const i = ids.indexOf(product.id);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: ids.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const id = ids[(next + ids.length) % ids.length];
    setTab(id);
    document.getElementById(`gen-tab-${id}`)?.focus();
  };
  return (
    <div className="page gen">
      <header className="gen-head">
        <div className="gen-title">
          <h1>Generators</h1>
          <p>{product.blurb}</p>
        </div>
        <button type="button" className="btn primary" onClick={() => onNew(product.id)}><Plus size={15} aria-hidden />New {product.name}</button>
      </header>
      <div className="gen-tabs" role="tablist" aria-label="Generators" onKeyDown={onTabKey}>
        {catalog.products.map((p) => {
          const on = p.id === product.id;
          return (
            <button key={p.id} id={`gen-tab-${p.id}`} type="button" role="tab" aria-selected={on} aria-controls="gen-panel" tabIndex={on ? 0 : -1} title={p.name} onClick={() => setTab(p.id)}>
              <ProductIcon product={p} size={15} /><span className="gen-tab-label">{p.name}</span>
            </button>
          );
        })}
      </div>
      <PresetPager key={product.id} product={product} plan={plan} favorites={favorites} onPreset={onPreset} onFavorite={onFavorite} />
    </div>
  );
}

const CARD_MIN_W = 200;
const CARD_MIN_H = 168;
const CARD_GAP = 12;

/** Shows as many presets as fit the space and pages through the rest, so the page never scrolls. */
function PresetPager({ product, plan, favorites, onPreset, onFavorite }: {
  product: DProduct; plan: "free" | "pro"; favorites: Favorite[];
  onPreset: (product: string, preset: string) => void; onFavorite: (product: DProduct, preset: { id: string; name: string; note: string }) => void;
}) {
  const ref = useRef<HTMLUListElement>(null);
  const [fit, setFit] = useState({ cols: 4, rows: 3 });
  const [page, setPage] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      const cols = Math.min(6, Math.max(1, Math.floor((width + CARD_GAP) / (CARD_MIN_W + CARD_GAP))));
      const rows = Math.max(1, Math.floor((height + CARD_GAP) / (CARD_MIN_H + CARD_GAP)));
      setFit((f) => (f.cols === cols && f.rows === rows ? f : { cols, rows }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const per = fit.cols * fit.rows;
  const pages = Math.max(1, Math.ceil(product.presets.length / per));
  const at = Math.min(page, pages - 1);
  const shown = product.presets.slice(at * per, at * per + per);
  const wheelAt = useRef(-Infinity);
  const onWheel = (e: WheelEvent) => {
    if (pages < 2 || Math.abs(e.deltaY) < 20 || e.timeStamp - wheelAt.current < 450) return;
    const next = at + Math.sign(e.deltaY);
    if (next < 0 || next >= pages) return;
    wheelAt.current = e.timeStamp;
    setPage(next);
  };
  return (
    <>
      <ul ref={ref} id="gen-panel" role="tabpanel" onWheel={onWheel} aria-labelledby={`gen-tab-${product.id}`} className="presets" style={{ gridTemplateColumns: `repeat(${fit.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${fit.rows}, minmax(0, 1fr))` }}>
        {shown.map((pr) => {
          const fav = favorites.some((f) => f.product === product.id && f.preset === pr.id);
          const src = presetArt(product.id, pr.id);
          return (
            <li key={pr.id} className="preset">
              <button type="button" className="preset-open" title={pr.note} onClick={() => onPreset(product.id, pr.id)}>
                <span className="preset-media">{src ? <img src={src} alt="" /> : <ProductIcon product={product} size={32} />}</span>
                <span className="preset-text"><b>{pr.name}</b><small>{pr.note}</small></span>
              </button>
              {pr.pro && plan !== "pro" && <span className="badge preset-pro"><Lock size={10} aria-hidden />Pro</span>}
              <button type="button" className="icon-btn star" aria-pressed={fav} aria-label={`${fav ? "Remove" : "Add"} ${pr.name} ${fav ? "from" : "to"} favorites`} title={fav ? "Remove from favorites" : "Add to favorites"} onClick={() => onFavorite(product, pr)}>
                <Star size={14} fill={fav ? "currentColor" : "none"} aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
      <nav className="gen-foot" aria-label="Preset pages">
        <span className="gen-count">{product.presets.length} designs</span>
        {pages > 1 && (
          <span className="pager">
            <button type="button" className="icon-btn" aria-label="Previous page" disabled={at === 0} onClick={() => setPage(at - 1)}><ChevronLeft size={16} aria-hidden /></button>
            {Array.from({ length: pages }, (_, i) => (
              <button key={i} type="button" className="pg-dot" aria-label={`Page ${i + 1} of ${pages}`} aria-current={i === at ? "page" : undefined} onClick={() => setPage(i)} />
            ))}
            <button type="button" className="icon-btn" aria-label="Next page" disabled={at === pages - 1} onClick={() => setPage(at + 1)}><ChevronRight size={16} aria-hidden /></button>
          </span>
        )}
      </nav>
    </>
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

const SHEET_TONE_NAMES: [SheetTone, string][] = [["plywood", "Plywood"], ["grey", "Soft grey"], ["white", "White"], ["dark", "Dark"]];

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
  account: DesktopAccount | null; local: LocalPrefs; setLocal: (p: LocalPrefs) => void; prefs: Prefs | null; catalog: DCatalog | null;
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
        <h2 id="s-units">Measurements</h2>
        <Choice label="Units" value={local.units} onChange={(units) => set({ units })} options={[["mm", "Millimetres"], ["in", "Inches"]]} />
        <p className="fine">Files are always saved in millimetres; this only changes how lengths are shown and typed.</p>
        <Choice label="Decimals in 3D dimensions" value={local.decimals} onChange={(decimals) => set({ decimals })} options={[[0, "0"], [1, "0.0"], [2, "0.00"]]} />
      </section>

      <section className="card" aria-labelledby="s-ws">
        <h2 id="s-ws">Workspace</h2>
        <Choice label="Open designs in" value={local.openIn} onChange={(openIn) => set({ openIn })} options={[["last", "As last time"], ["2d", "2D sheet"], ["3d", "3D"]]} />
        <label className="field-row">
          <span>Sheet colour</span>
          <select value={local.sheetTone} onChange={(e) => set({ sheetTone: e.target.value as SheetTone })}>
            {SHEET_TONE_NAMES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </select>
        </label>
        <label className="field-row">
          <span>10 mm grid on the sheet</span>
          <input type="checkbox" checked={local.sheetGrid} onChange={(e) => set({ sheetGrid: e.target.checked })} />
        </label>
        <Choice label="3D layout" value={local.view3dQuad ? "quad" : "one"} onChange={(v) => set({ view3dQuad: v === "quad" })} options={[["one", "One view"], ["quad", "Four views"]]} />
        <Choice label="3D display" value={local.view3dShade} onChange={(view3dShade) => set({ view3dShade })} options={[["shaded", "Shaded"], ["edges", "Shaded with edges"]]} />
        <label className="field-row">
          <span>Overall dimensions in 3D</span>
          <input type="checkbox" checked={local.view3dDims} onChange={(e) => set({ view3dDims: e.target.checked })} />
        </label>
        <label className="field-row">
          <span>Ask before Reset all settings</span>
          <input type="checkbox" checked={local.confirmReset} onChange={(e) => set({ confirmReset: e.target.checked })} />
        </label>
      </section>

      <section className="card" aria-labelledby="s-files">
        <h2 id="s-files">Project files</h2>
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
        <Choice label="Interface size" value={local.uiZoom} onChange={(uiZoom) => set({ uiZoom })} options={UI_ZOOMS.map((z) => [z, `${z}%`] as const)} />
        <label className="field-row">
          <span>Reduce motion</span>
          <input type="checkbox" checked={local.reduceMotion} onChange={(e) => set({ reduceMotion: e.target.checked })} />
        </label>
        <div className="row">
          <button type="button" className="btn" onClick={() => setLocal({ ...DEFAULT_PREFS, sidebarCollapsed: local.sidebarCollapsed, defaultProduct: local.defaultProduct })}><RotateCcw size={14} aria-hidden />Reset these settings</button>
        </div>
      </section>

      <section className="card" aria-labelledby="s-export">
        <h2 id="s-export">Export</h2>
        <p className="path">{prefs?.exportDir ? <><FolderOpen size={14} aria-hidden /> {prefs.exportDir}</> : "No export folder: Export asks where to save each SVG."}</p>
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
  ["Ctrl + S", "Save the project (.oclc)"],
  ["Ctrl + Shift + S", "Save the project as a new file"],
  ["Ctrl + O", "Open a project file"],
  ["Ctrl + E", "Export the SVG (to the export folder, if one is set)"],
  ["Ctrl + Shift + E", "Export the SVG and choose where"],
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
        <p>Save keeps the design as a HingeLab project file (.oclc): the first Save asks where, later saves update the same file. Project files open in the app (double-click one, drop it on the window or press Ctrl+O) and on the website, in the section that made them.</p>
        <p>Export writes the cut file (SVG) straight into the folder chosen in Settings, or asks where when no folder is set. Files are in millimetres at true size: import them into LightBurn, xTool Creative Space or Inkscape at 100%.</p>
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
