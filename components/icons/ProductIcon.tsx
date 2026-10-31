/**
 * HingeLab's product icons: one small two-tone drawing per product (wood-coloured faces, a dark
 * outline and a purple accent), so every product is told apart at a glance in menus, panel titles
 * and the start page. Drawn on a 24 × 24 grid; colours come from CSS variables so they follow the
 * theme (see .pi in globals.css).
 */
import type { ReactNode } from "react";

export type ProductIconId =
  | "hinge" | "letters" | "parametric" | "clock" | "puzzle" | "qr" | "boxes" | "topper" | "keyrack" | "sign"
  | "tablenum" | "trophy" | "shadowbox" | "keychain" | "popup" | "charm" | "family" | "miniature" | "leather" | "paperbox";

const W = "var(--pi-wood, #efcf9b)", D = "var(--pi-wood-dark, #d9a85f)", L = "var(--pi-line, #6b4420)", A = "var(--pi-accent, #7357f6)", P = "var(--pi-paper, #fff8ec)";
const line = { fill: "none", stroke: L, strokeWidth: 1.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const face = (fill: string) => ({ fill, stroke: L, strokeWidth: 1.4, strokeLinejoin: "round" as const });

const ART: Record<ProductIconId, ReactNode> = {
  // a rounded box whose side bends on living-hinge cuts
  hinge: <>
    <path d="M4 9.5c0-1.4 1.1-2.5 2.5-2.5h11c1.4 0 2.5 1.1 2.5 2.5V18c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2z" {...face(D)} />
    <path d="M3.5 7.2C3.5 5.4 5 4 6.8 4h10.4c1.8 0 3.3 1.4 3.3 3.2v.6H3.5z" {...face(W)} />
    {[7, 9.5, 12, 14.5, 17].map((x) => <path key={x} d={`M${x} 10.2v${x % 5 === 2 ? 3 : 5}m0 2.6v1.8`} stroke={A} strokeWidth={1.1} strokeLinecap="round" />)}
  </>,
  // a chunky letter A standing on its base
  letters: <>
    <path d="M9.6 3.5h4.8l5.6 16.5h-4.3l-1-3.3H9.3l-1 3.3H4z" {...face(W)} />
    <path d="M10.3 13.6h3.4L12 8.2z" {...face(P)} />
    <path d="M3 20.5h18" stroke={A} strokeWidth={1.6} strokeLinecap="round" />
  </>,
  // a sculpture sliced into stacked layers
  parametric: <>
    {[[6, 6.5], [4.5, 9.5], [4, 12.5], [4.5, 15.5], [6.5, 18.5]].map(([x, y], i) => <rect key={i} x={x} y={y} width={24 - 2 * x} height={2.4} rx={1.2} {...face(i % 2 ? D : W)} />)}
    <path d="M12 3.2v2.6" stroke={A} strokeWidth={1.6} strokeLinecap="round" />
  </>,
  clock: <>
    <circle cx={12} cy={12} r={8.6} {...face(W)} />
    {[0, 90, 180, 270].map((a) => <path key={a} d="M12 4.9v1.7" transform={`rotate(${a} 12 12)`} {...line} />)}
    <path d="M12 12V7.6" {...line} strokeWidth={1.6} />
    <path d="M12 12l3.4 2" stroke={A} strokeWidth={1.6} strokeLinecap="round" />
    <circle cx={12} cy={12} r={1.1} fill={L} />
  </>,
  // two interlocking jigsaw pieces
  puzzle: <>
    <path d="M3.5 4.5h6.2c-.6-2.2 3.4-2.2 2.8 0h0v5.8c2.2-.6 2.2 3.4 0 2.8V19.5H3.5v-5.8c2.2.6 2.2-3.4 0-2.8z" {...face(W)} />
    <path d="M12.5 4.5h8v15h-8v-6.4c2.2.6 2.2-3.4 0-2.8z" {...face(D)} />
    <circle cx={16.6} cy={8.4} r={1.1} fill={A} />
  </>,
  // a QR tag: three eyes and a few modules on a wooden plate
  qr: <>
    <rect x={3} y={3} width={18} height={18} rx={3.2} {...face(W)} />
    {[[5.5, 5.5], [13.5, 5.5], [5.5, 13.5]].map(([x, y], i) => <g key={i}><rect x={x} y={y} width={5} height={5} rx={1.2} fill="none" stroke={L} strokeWidth={1.4} /><rect x={x + 1.6} y={y + 1.6} width={1.8} height={1.8} rx={0.4} fill={L} /></g>)}
    <rect x={13.6} y={13.6} width={2.2} height={2.2} rx={0.5} fill={A} /><rect x={16.4} y={16.4} width={2.2} height={2.2} rx={0.5} fill={A} /><rect x={13.6} y={16.6} width={1.6} height={1.6} rx={0.4} fill={L} /><rect x={17} y={13.8} width={1.6} height={1.6} rx={0.4} fill={L} />
  </>,
  // a finger-jointed box with its lid ajar
  boxes: <>
    <path d="M3.5 10.5h17V20H3.5z" {...face(D)} />
    <path d="M3.5 12.5h1.6v2H3.5m0 2h1.6v2H3.5M20.5 12.5h-1.6v2h1.6m0 2h-1.6v2h1.6" {...line} strokeWidth={1.1} />
    <path d="M3 9.6 4.6 5h15.2L21 9.6z" {...face(W)} />
    <path d="M9.5 15.2h5" stroke={A} strokeWidth={1.6} strokeLinecap="round" />
  </>,
  // a cake topper: a heart on two sticks over a cake
  topper: <>
    <path d="M12 12.4c-3.3-2-5.4-3.9-5.4-6.1 0-1.6 1.2-2.8 2.7-2.8 1.2 0 2.1.7 2.7 1.7.6-1 1.5-1.7 2.7-1.7 1.5 0 2.7 1.2 2.7 2.8 0 2.2-2.1 4.1-5.4 6.1z" fill={A} stroke={L} strokeWidth={1.2} strokeLinejoin="round" />
    <path d="M9.6 11.2V16m4.8-4.8V16" {...line} />
    <path d="M4 16h16v2.6c0 1-.8 1.9-1.9 1.9H5.9c-1 0-1.9-.8-1.9-1.9z" {...face(W)} />
    <path d="M4.5 17.6c1.4.9 2.4.9 3.8 0s2.4-.9 3.7 0 2.4.9 3.8 0 2.4-.9 3.7 0" {...line} strokeWidth={1.1} />
  </>,
  // a board on the wall with pegs and a key hanging on one
  keyrack: <>
    <rect x={2.5} y={4} width={19} height={8} rx={2} {...face(W)} />
    {[6.5, 12, 17.5].map((x) => <path key={x} d={`M${x} 12v${x === 12 ? 2.6 : 2.2}${x === 12 ? "" : "c0 .8.6 1.4 1.4 1.4"}`} {...line} strokeWidth={1.6} />)}
    <circle cx={12} cy={16.4} r={1.8} fill="none" stroke={A} strokeWidth={1.5} />
    <path d="M12 18.2v3.3m0-1h1.4m-1.4-1.2h1" stroke={A} strokeWidth={1.4} strokeLinecap="round" />
    <circle cx={5} cy={6.4} r={0.6} fill={L} /><circle cx={19} cy={6.4} r={0.6} fill={L} />
  </>,
  // a hanging sign on two chains
  sign: <>
    <path d="M12 2.8 6.2 9M12 2.8 17.8 9" {...line} strokeWidth={1.2} />
    <circle cx={12} cy={2.8} r={1} fill={A} />
    <rect x={2.8} y={9} width={18.4} height={10.5} rx={2.6} {...face(W)} />
    <path d="M7 13.2h10M8.5 15.8h7" {...line} strokeWidth={1.5} />
  </>,
  // a table number standing in its base
  tablenum: <>
    <path d="M6 3.5h12a1 1 0 0 1 1 1V18H5V4.5a1 1 0 0 1 1-1z" {...face(W)} />
    <path d="M9.4 7.4h5.4l-3.6 8" stroke={A} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <rect x={3} y={18} width={18} height={3} rx={1} {...face(D)} />
  </>,
  trophy: <>
    <path d="M7 3.5h10v4.6a5 5 0 0 1-10 0z" {...face(W)} />
    <path d="M7 5.2H4.6c0 3 1.2 4.6 3.3 4.9M17 5.2h2.4c0 3-1.2 4.6-3.3 4.9" {...line} />
    <path d="M10.6 13h2.8v3h-2.8z" {...face(D)} />
    <rect x={6.5} y={16} width={11} height={4.5} rx={1} {...face(D)} />
    <path d="M12 5.6l.7 1.4 1.5.2-1.1 1 .3 1.5-1.4-.7-1.4.7.3-1.5-1.1-1 1.5-.2z" fill={A} />
  </>,
  // layered paper-cut frame: hills one behind another, a moon above
  shadowbox: <>
    <rect x={3} y={3} width={18} height={18} rx={2.4} fill={P} stroke={L} strokeWidth={1.4} />
    <circle cx={16.4} cy={7.6} r={1.6} fill={A} />
    <path d="M3.7 14.5c2.4-2.6 4.4-2.6 6.4-.6 2-2.4 4.4-2.6 7-.4 1.4-1 2.6-1.2 3.2-1V18H3.7z" fill={D} />
    <path d="M3.7 17.4c2.6-2 5-2 7.4-.2 2.4-1.8 5.4-1.8 9.2.3v2.2c0 .3-.2.6-.6.6H4.3c-.3 0-.6-.3-.6-.6z" fill={W} stroke={L} strokeWidth={1.1} strokeLinejoin="round" />
  </>,
  // a name tag with a split ring
  keychain: <>
    <circle cx={7} cy={7} r={3.6} fill="none" stroke={A} strokeWidth={1.6} />
    <path d="M10.4 8.6h8.1a2 2 0 0 1 2 2v6.9a2 2 0 0 1-2 2H9.7a2 2 0 0 1-2-2v-6z" {...face(W)} />
    <circle cx={10.4} cy={11.3} r={0.9} fill={P} stroke={L} strokeWidth={1} />
    <path d="M12.6 15.4h5" {...line} strokeWidth={1.5} />
  </>,
  // a pop-up spiral bowl: rings lifting from one flat piece
  popup: <>
    <ellipse cx={12} cy={17.4} rx={9} ry={3.2} {...face(D)} />
    <ellipse cx={12} cy={13.4} rx={7.2} ry={2.6} {...face(W)} />
    <ellipse cx={12} cy={9.6} rx={5.2} ry={2} {...face(W)} />
    <ellipse cx={12} cy={6.2} rx={3} ry={1.3} fill={A} stroke={L} strokeWidth={1.2} />
  </>,
  // a round name ornament on a ribbon
  charm: <>
    <path d="M12 2.6v3.2" stroke={A} strokeWidth={1.6} strokeLinecap="round" />
    <rect x={10.2} y={5.4} width={3.6} height={2.4} rx={0.8} {...face(D)} />
    <circle cx={12} cy={14.2} r={7} {...face(W)} />
    <path d="M8.2 14.6c1-1.6 1.8-1.6 2.4 0 .6 1.6 1.4 1.6 2.4 0s1.8-1.6 2.8 0" {...line} strokeWidth={1.4} />
  </>,
  // name tiles crossing like a crossword
  family: <>
    {[[3, 9.5], [7.5, 9.5], [12, 9.5], [16.5, 9.5], [12, 5], [12, 14]].map(([x, y], i) => <rect key={i} x={x} y={y} width={4.5} height={4.5} rx={0.8} {...face(i === 2 ? A : i % 2 ? D : W)} />)}
    <rect x={12} y={18.5} width={4.5} height={2.8} rx={0.8} {...face(W)} />
  </>,
  // a little house with a pitched roof and a lit window
  miniature: <>
    <path d="M5 11h14v9.5H5z" {...face(W)} />
    <path d="M3 11.4 12 3.5l9 7.9" {...face(D)} />
    <rect x={10} y={14.5} width={4} height={6} rx={0.6} {...face(D)} />
    <rect x={6.6} y={13} width={2.4} height={2.4} rx={0.4} fill={A} />
    <rect x={15} y={13} width={2.4} height={2.4} rx={0.4} fill={A} />
  </>,
  // a leather bag with stitching and a flap
  leather: <>
    <path d="M8.5 8V6.6a3.5 3.5 0 0 1 7 0V8" {...line} strokeWidth={1.6} />
    <path d="M4 9.5c0-.8.7-1.5 1.5-1.5h13c.8 0 1.5.7 1.5 1.5L19 19a1.6 1.6 0 0 1-1.6 1.5H6.6A1.6 1.6 0 0 1 5 19z" {...face(D)} />
    <path d="M4 9.5c0-.8.7-1.5 1.5-1.5h13c.8 0 1.5.7 1.5 1.5L12 14z" {...face(W)} />
    <path d="M6.2 17.8h11.6" stroke={L} strokeWidth={1} strokeDasharray="1.2 1.2" strokeLinecap="round" />
    <circle cx={12} cy={13.4} r={1.1} fill={A} />
  </>,
  // a folded card box with its tuck flap open
  paperbox: <>
    <path d="M4 9h11v11.5H4z" fill={P} stroke={L} strokeWidth={1.4} strokeLinejoin="round" />
    <path d="M15 9l5-2.5v11.5l-5 2.5z" {...face(W)} />
    <path d="M4 9l5-2.5h11L15 9z" {...face(W)} />
    <path d="M9 6.5 7.4 2.8h9.8L20 6.5" fill="none" stroke={A} strokeWidth={1.4} strokeLinejoin="round" strokeDasharray="1.6 1.2" />
  </>,
};

/** A product's icon. `size` in px (16 in panel titles, 20–28 on cards). */
export function ProductIcon({ id, size = 16, title }: { id: ProductIconId; size?: number; title?: string }) {
  return (
    <svg className="pi" width={size} height={size} viewBox="0 0 24 24" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
      {ART[id]}
    </svg>
  );
}

export const PRODUCT_ICON_IDS = Object.keys(ART) as ProductIconId[];
