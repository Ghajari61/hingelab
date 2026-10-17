/**
 * Small preview pictures of AI Studio's styles, drawn as SVG (64 × 64) so they stay sharp, cost
 * nothing to load and follow the theme: ink is `currentColor`, the few coloured styles use soft
 * fixed colours. Pure strings, safe on the server and in the browser.
 */
import type { StyleId } from "./styles";

const r = (n: number) => Math.round(n * 100) / 100;

/** Points of a regular star or polygon around (cx, cy). */
function star(cx: number, cy: number, ro: number, ri: number, n: number, turn = -Math.PI / 2): string {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = turn + (i * Math.PI) / n, rad = i % 2 ? ri : ro;
    pts.push(`${r(cx + rad * Math.cos(a))},${r(cy + rad * Math.sin(a))}`);
  }
  return pts.join(" ");
}

function petals(n: number, len: number, w: number, fill: boolean): string {
  let s = "";
  for (let i = 0; i < n; i++) {
    const a = (i * 360) / n;
    s += `<ellipse cx="32" cy="${32 - len / 2}" rx="${w}" ry="${len / 2}" transform="rotate(${a} 32 32)" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="1.6"'}/>`;
  }
  return s;
}

const LEAF = "M32 54 C20 44 16 30 32 10 C48 30 44 44 32 54Z";
const BIRD = "M10 40 C18 26 30 24 36 30 C40 22 50 18 56 20 C50 24 48 30 46 34 C42 46 26 50 10 40Z";
const CAT = "M20 54 C14 44 16 30 22 24 L20 12 L28 20 C31 19 35 19 38 20 L46 12 L44 24 C50 30 52 44 46 54Z";

const ART: Record<StyleId, () => string> = {
  "line-art": () => `<path d="${CAT}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="27" cy="32" r="1.6" fill="currentColor"/><circle cx="39" cy="32" r="1.6" fill="currentColor"/>`,
  "one-line": () => `<path d="M8 44 C14 20 22 52 28 30 C32 14 40 14 40 28 C40 40 30 40 32 30 C34 20 48 22 50 34 C52 44 56 46 58 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  hatch: () => {
    let s = `<circle cx="32" cy="32" r="20" fill="none" stroke="currentColor" stroke-width="1.6"/><clipPath id="hc"><circle cx="32" cy="32" r="20"/></clipPath><g clip-path="url(#hc)" stroke="currentColor" stroke-width="1">`;
    for (let i = -24; i <= 64; i += 4) s += `<line x1="${i}" y1="12" x2="${i + 20}" y2="52"/>`;
    for (let i = 20; i <= 64; i += 5) s += `<line x1="${i}" y1="52" x2="${i + 18}" y2="20"/>`;
    return s + "</g>";
  },
  blueprint: () => {
    let s = '<g stroke="currentColor" stroke-width="0.6" opacity="0.45">';
    for (let i = 8; i <= 56; i += 8) s += `<line x1="${i}" y1="6" x2="${i}" y2="58"/><line x1="6" y1="${i}" x2="58" y2="${i}"/>`;
    return s + `</g><rect x="16" y="20" width="32" height="24" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="32" cy="32" r="7" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16 50 H48 M16 48 V52 M48 48 V52" stroke="currentColor" stroke-width="1"/>`;
  },
  botanical: () => `<path d="M32 58 V20" stroke="currentColor" stroke-width="1.6"/><path d="M32 40 C22 38 16 30 16 22 C24 24 30 30 32 40Z M32 32 C42 30 48 22 48 14 C40 16 34 22 32 32Z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M32 40 L22 28 M32 32 L42 20" stroke="currentColor" stroke-width="0.9"/><circle cx="32" cy="16" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
  topographic: () => {
    let s = "";
    for (let i = 0; i < 6; i++) s += `<ellipse cx="${30 + i}" cy="${33 - i * 0.6}" rx="${26 - i * 4}" ry="${18 - i * 2.8}" fill="none" stroke="currentColor" stroke-width="1.3" transform="rotate(${-12 + i * 3} 32 32)"/>`;
    return s;
  },
  flat: () => `<circle cx="32" cy="34" r="20" fill="#f2b84b"/><path d="M14 46 L28 28 L36 38 L42 32 L52 46Z" fill="#3e8e7e"/><circle cx="42" cy="22" r="5" fill="#e46a4f"/>`,
  silhouette: () => `<path d="${BIRD}" fill="currentColor"/>`,
  stencil: () => `<path d="M14 18 H50 V46 H14Z M20 24 V40 H30 V24Z M34 24 V40 H44 V24Z" fill="currentColor" fill-rule="evenodd"/><rect x="24" y="30" width="2" height="4" fill="currentColor"/><rect x="38" y="30" width="2" height="4" fill="currentColor"/>`,
  woodcut: () => `<rect x="8" y="8" width="48" height="48" rx="3" fill="currentColor"/><path d="M14 48 C20 30 26 26 32 20 C38 26 44 30 50 48Z" fill="var(--sa-bg, #fff)"/><path d="M20 46 L28 30 M26 46 L32 28 M32 46 L36 30 M38 46 L40 34" stroke="currentColor" stroke-width="2"/>`,
  sticker: () => `<path d="M14 40 C10 24 22 12 34 14 C48 16 56 30 50 42 C44 54 20 54 14 40Z" fill="#ffd7e4" stroke="currentColor" stroke-width="3.2"/><circle cx="27" cy="32" r="2.4" fill="currentColor"/><circle cx="40" cy="32" r="2.4" fill="currentColor"/><path d="M28 40 Q33 44 38 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  tattoo: () => `<path d="M32 54 C14 40 10 26 20 18 C26 14 31 18 32 22 C33 18 38 14 44 18 C54 26 50 40 32 54Z" fill="none" stroke="currentColor" stroke-width="3.2"/><path d="M32 46 C24 38 22 30 26 26" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="40" cy="26" r="1.2" fill="currentColor"/><circle cx="43" cy="30" r="1" fill="currentColor"/><circle cx="41" cy="34" r="0.8" fill="currentColor"/>`,
  comic: () => {
    let s = `<path d="M32 6 L38 24 L58 22 L42 34 L52 54 L32 42 L12 54 L22 34 L6 22 L26 24Z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>`;
    for (let y = 26; y < 42; y += 4) for (let x = 24; x < 42; x += 4) s += `<circle cx="${x}" cy="${y}" r="${0.6 + (y - 26) / 16}" fill="currentColor"/>`;
    return s;
  },
  "low-poly": () => `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M32 8 L52 22 L46 50 L18 50 L12 22Z"/><path d="M32 8 L32 30 L52 22 M32 30 L46 50 M32 30 L18 50 M32 30 L12 22"/></g><path d="M32 8 L32 30 L12 22Z" fill="currentColor" opacity="0.3"/><path d="M32 30 L46 50 L18 50Z" fill="currentColor" opacity="0.6"/>`,
  kirigami: () => {
    let s = `<circle cx="32" cy="32" r="24" fill="currentColor"/>`;
    for (let i = 0; i < 8; i++) s += `<ellipse cx="32" cy="16" rx="3" ry="6" fill="var(--sa-bg, #fff)" transform="rotate(${i * 45} 32 32)"/><circle cx="32" cy="25" r="1.6" fill="var(--sa-bg, #fff)" transform="rotate(${i * 45 + 22.5} 32 32)"/>`;
    return s + `<circle cx="32" cy="32" r="4" fill="var(--sa-bg, #fff)"/>`;
  },
  layered: () => `<path d="M4 44 C16 30 26 36 34 28 C44 18 54 26 60 22 V60 H4Z" fill="currentColor" opacity="0.25"/><path d="M4 50 C18 40 30 46 40 38 C48 32 56 38 60 36 V60 H4Z" fill="currentColor" opacity="0.5"/><path d="M4 56 C20 50 34 54 60 48 V60 H4Z" fill="currentColor" opacity="0.85"/><circle cx="46" cy="16" r="6" fill="currentColor" opacity="0.4"/>`,
  photo: () => `<defs><linearGradient id="pg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity="0.1"/><stop offset="1" stop-color="currentColor" stop-opacity="0.9"/></linearGradient></defs><rect x="8" y="12" width="48" height="40" rx="4" fill="url(#pg)"/><circle cx="24" cy="26" r="6" fill="var(--sa-bg, #fff)" opacity="0.7"/>`,
  "stained-glass": () => `<g stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="M12 56 V26 C12 12 52 12 52 26 V56Z" fill="#cfe3f5"/><path d="M12 36 L32 22 L52 36 M32 22 V56 M12 46 L32 36 L52 46" fill="none"/><path d="M32 22 L12 36 V26 C12 18 22 15 32 14Z" fill="#f6c86b"/><path d="M32 36 L52 46 V56 H32Z" fill="#e88b8b"/></g>`,
  mandala: () => `${petals(12, 22, 4, false)}${petals(8, 12, 3, true)}<circle cx="32" cy="32" r="3" fill="currentColor"/>`,
  girih: () => `<polygon points="${star(32, 32, 24, 11, 10)}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><polygon points="${star(32, 32, 10, 5, 5)}" fill="currentColor"/>`,
  eslimi: () => `<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M32 54 C32 40 20 38 20 28 C20 20 30 18 32 26"/><path d="M32 54 C32 40 44 38 44 28 C44 20 34 18 32 26"/><path d="M20 28 C12 28 10 18 16 14 M44 28 C52 28 54 18 48 14"/></g><path d="M32 26 C28 16 32 10 32 6 C32 10 36 16 32 26Z" fill="currentColor"/>`,
  "calligraphy-panel": () => `<rect x="8" y="14" width="48" height="36" rx="18" fill="none" stroke="currentColor" stroke-width="2"/><rect x="13" y="19" width="38" height="26" rx="13" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2 2"/><path d="M8 32 C2 28 2 36 8 32 M56 32 C62 28 62 36 56 32" fill="currentColor"/>`,
  "art-nouveau": () => `<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 56 C10 30 24 26 30 34 C36 42 22 48 20 40 C18 30 38 20 46 10"/><path d="M54 56 C54 36 44 30 38 36"/></g><path d="M46 10 C40 12 36 18 40 22 C46 20 48 14 46 10Z" fill="currentColor"/>`,
  celtic: () => `<g fill="none" stroke="currentColor" stroke-width="3.2"><circle cx="24" cy="26" r="11"/><circle cx="40" cy="26" r="11"/><circle cx="32" cy="40" r="11"/></g><g fill="none" stroke="var(--sa-bg, #fff)" stroke-width="1.4"><circle cx="24" cy="26" r="11"/><circle cx="40" cy="26" r="11"/><circle cx="32" cy="40" r="11"/></g>`,
  zentangle: () => {
    let s = `<path d="${LEAF}" fill="none" stroke="currentColor" stroke-width="2"/><clipPath id="zc"><path d="${LEAF}"/></clipPath><g clip-path="url(#zc)" stroke="currentColor" stroke-width="0.9" fill="none">`;
    for (let y = 14; y < 30; y += 3) s += `<path d="M14 ${y} Q20 ${y - 2} 26 ${y} T38 ${y} T50 ${y}"/>`;
    for (let x = 18; x < 50; x += 5) for (let y = 34; y < 54; y += 5) s += `<circle cx="${x}" cy="${y}" r="1.6"/>`;
    return s + `</g><line x1="14" y1="31" x2="50" y2="31" stroke="currentColor" stroke-width="1.4"/>`;
  },
};

/** The preview of a style as a complete SVG document. */
export function styleArt(id: StyleId): string {
  const body = (ART[id] ?? ART["line-art"])();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">${body}</svg>`;
}

export const styleArtIds = Object.keys(ART) as StyleId[];
