import type { ReactNode } from "react";

/** Drawings for the gallery cards (64 × 44, stroke in currentColor, fills from the card's tint). */
function Art({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 64 44" width="64" height="44" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const W = "var(--card-fill)";
const W2 = "var(--card-fill-2)";

function box(lift: number, open: boolean) {
  return (
    <>
      <path d="M14 20h26v16H14z" fill={W} />
      <path d="M40 20l10-7v16l-10 7z" fill={W2} />
      {open ? (
        <>
          <path d="M14 20l10-7h26l-10 7z" fill={W2} />
          <path d="M17 19.2l8-5.4h21.4l-7.8 5.4z" fill="var(--card-ink-soft)" stroke="none" />
        </>
      ) : (
        <>
          <path d={`M14 ${20 - lift}l10-7h26l-10 7z`} fill={W} />
          {lift > 0 && <path d={`M14 ${20 - lift}v3h26v-3M40 ${23 - lift}l10-7v-3`} fill={W2} />}
        </>
      )}
    </>
  );
}

const slits = (d: string) => <path d={d} strokeWidth="1.2" />;
const slots = (d: string) => <path d={d} strokeWidth="2.2" strokeLinecap="round" />;

export const ART: Record<string, ReactNode> = {
  "shape:rect": <Art><rect x="10" y="7" width="44" height="30" rx="9" fill={W} />{slits("M12 13v3M12 28v3M52 13v3M52 28v3")}</Art>,
  "shape:pill": <Art><rect x="8" y="8" width="48" height="28" rx="14" fill={W} /></Art>,
  "shape:poly": <Art><path d="M32 5l15 8.5v17L32 39l-15-8.5v-17z" fill={W} /></Art>,
  "shape:cyl": <Art><circle cx="32" cy="22" r="16" fill={W} /></Art>,

  "lid:open": <Art>{box(0, true)}</Art>,
  "lid:fixed": <Art>{box(0, false)}</Art>,
  "lid:removable": <Art>{box(7, false)}</Art>,

  "pattern:straight": <Art><rect x="6" y="6" width="52" height="32" rx="3" fill={W} />{slits("M14 9v11M14 24v11M22 9v26M30 9v11M30 24v11M38 9v26M46 9v11M46 24v11M54 9v26")}</Art>,
  "pattern:wave": <Art><rect x="6" y="6" width="52" height="32" rx="3" fill={W} />{slits("M15 9c-4 4 4 8 0 13s4 9 0 13M27 9c-4 4 4 8 0 13s4 9 0 13M39 9c-4 4 4 8 0 13s4 9 0 13M51 9c-4 4 4 8 0 13s4 9 0 13")}</Art>,
  "pattern:relief": <Art><rect x="6" y="6" width="52" height="32" rx="3" fill={W} />{slits("M18 12v20M30 6v10M30 28v10M42 12v20")}<circle cx="18" cy="11" r="1.6" /><circle cx="18" cy="33" r="1.6" /><circle cx="30" cy="17" r="1.6" /><circle cx="30" cy="27" r="1.6" /><circle cx="42" cy="11" r="1.6" /><circle cx="42" cy="33" r="1.6" /></Art>,
  "variant:standard": <Art><rect x="6" y="6" width="52" height="32" rx="3" fill={W} />{slots("M18 9v12M18 25v10M26 9v4M26 17v12M26 33v2M34 9v12M34 25v10M42 9v4M42 17v12M42 33v2")}</Art>,
  "variant:fine": <Art><rect x="6" y="6" width="52" height="32" rx="3" fill={W} />{slots("M14 9v8M14 21v8M14 33v2M19 9v2M19 15v8M19 27v8M24 9v8M24 21v8M24 33v2M29 9v2M29 15v8M29 27v8M34 9v8M34 21v8M34 33v2M39 9v2M39 15v8M39 27v8M44 9v8M44 21v8M44 33v2M49 9v2M49 15v8M49 27v8")}</Art>,
  "variant:flexible": <Art><rect x="6" y="6" width="52" height="32" rx="3" fill={W} />{slots("M18 9v17M18 29v6M26 9v3M26 15v17M34 9v17M34 29v6M42 9v3M42 15v17M50 9v17M50 29v6")}</Art>,
  "variant:stiff": <Art><rect x="6" y="6" width="52" height="32" rx="3" fill={W} />{slots("M20 9v9M20 25v10M36 9v2M36 16v13M52 9v9M52 25v10")}</Art>,
  "variant:line": <Art><rect x="6" y="6" width="52" height="32" rx="3" fill={W} /><path d="M18 9v12M18 25v10M26 9v4M26 17v12M26 33v2M34 9v12M34 25v10M42 9v4M42 17v12M42 33v2" strokeWidth=".8" /></Art>,
  "pattern:honeycomb": <Art><rect x="6" y="6" width="52" height="32" rx="3" fill={W} />{slits("M14 9l2 2v6l-2 2-2-2v-6zM14 25l2 2v6l-2 2-2-2v-6zM24 6v5l2 2v6l-2 2-2-2v-6l2-2M24 21v6l2 2v6l-2 2M24 27l-2 2v6l2 2M34 9l2 2v6l-2 2-2-2v-6zM34 25l2 2v6l-2 2-2-2v-6zM44 6v5l2 2v6l-2 2-2-2v-6l2-2M44 21v6l2 2v6l-2 2M44 27l-2 2v6l2 2M54 9l2 2v6l-2 2-2-2v-6zM54 25l2 2v6l-2 2-2-2v-6z")}</Art>,
  "pattern:serpentine": <Art><rect x="6" y="6" width="52" height="32" rx="3" fill={W} />{slits("M14 6v24M22 14v24M30 6v24M38 14v24M46 6v24M54 14v24")}</Art>,

  "mode:box": <Art><path d="M20 36l10-27h6l10 27h-6l-2.5-7h-9l-2.5 7z" fill={W2} transform="translate(4 -3)" /><path d="M20 36l10-27h6l10 27h-6l-2.5-7h-9l-2.5 7zM28.5 23.5l4.5-12.5 4.5 12.5z" fill={W} /></Art>,
  "mode:solid": <Art><path d="M20 38l10-30h6l10 30h-6l-2.5-7.5h-9L26 38zM29.8 25h6.4L33 15z" fill="var(--card-ink)" stroke="none" /></Art>,
  "mode:stencil": <Art><rect x="10" y="5" width="44" height="34" rx="3" fill={W} /><path d="M22 34l8-24h4l8 24h-4.5l-1.8-5.5h-7.4L26.5 34zM29.8 24.5h4.4L32 17.5z" fill="var(--card-bg)" /></Art>,

  "wall:hinge": <Art><path d="M8 30c8 0 10-16 24-16s16 16 24 16" fill="none" strokeWidth="7" stroke={W} /><path d="M8 30c8 0 10-16 24-16s16 16 24 16" strokeWidth="1.2" />{slits("M20 20v6M26 15v6M32 13v6M38 15v6M44 20v6")}</Art>,
  "wall:faceted": <Art><path d="M8 32l10-12 14-6 14 6 10 12" fill="none" strokeWidth="7" stroke={W} /><path d="M8 32l10-12 14-6 14 6 10 12" strokeWidth="1.2" /><path d="M18 20v.1M32 14v.1M46 20v.1" strokeWidth="3" /></Art>,

  "method:parallel": <Art><path d="M8 38h48" />{[12, 20, 28, 36, 44, 52].map((x, i) => <path key={x} d={`M${x} 38V${[24, 14, 9, 10, 16, 26][i]}`} strokeWidth="3" stroke="var(--card-ink-soft)" />)}<path d="M10 24c4-14 30-18 44 2" /></Art>,
  "method:stacked": <Art>{[0, 1, 2, 3, 4].map((i) => <rect key={i} x={20 - i * 3} y={8 + i * 6} width={24 + i * 6} height="5" rx="1.5" fill={i % 2 ? W2 : W} />)}</Art>,
  "method:waffle": <Art><path d="M8 32l24 8 24-8-24-8z" fill={W} /><path d="M16 15v13M24 12v15M32 10v14M40 12v15M48 15v13M10 22l22-8 22 8" strokeWidth="1.3" /></Art>,
  "method:radial": <Art><circle cx="32" cy="22" r="4" fill={W2} />{[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <path key={a} d={`M${32 + 6 * Math.cos(a * Math.PI / 180)} ${22 + 6 * Math.sin(a * Math.PI / 180)}L${32 + 17 * Math.cos(a * Math.PI / 180)} ${22 + 17 * Math.sin(a * Math.PI / 180)}`} strokeWidth="2.5" stroke="var(--card-ink-soft)" />)}</Art>,
  "method:curveNormal": <Art><ellipse cx="32" cy="22" rx="16" ry="10" />{[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((a) => { const c = Math.cos(a * Math.PI / 180), s = Math.sin(a * Math.PI / 180); return <path key={a} d={`M${32 + 16 * c} ${22 + 10 * s}L${32 + 24 * c} ${22 + 16 * s}`} strokeWidth="2.2" stroke="var(--card-ink-soft)" />; })}</Art>,
  "method:folded": <Art><path d="M10 30l11-18 11 18 11-18 11 18z" fill={W} /><path d="M21 12l11 18M43 12L32 30" strokeDasharray="2.5 2" strokeWidth="1.2" /><path d="M10 30l-3 5h17l-3-5M54 30l3 5H40l3-5" fill={W2} strokeWidth="1" /></Art>,
};
