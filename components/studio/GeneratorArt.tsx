/**
 * Looping 3-second previews for the start-screen cards (spec §3.2): inline SVG animated with CSS,
 * a few hundred bytes each instead of WebM/Lottie files, and still when reduced motion is on.
 */
const slits = (x0: number, y0: number, n: number, dx: number, h: number, cls = "") =>
  Array.from({ length: n }, (_, i) => <line key={i} className={cls} x1={x0 + i * dx} y1={y0 + (i % 2 ? 6 : 0)} x2={x0 + i * dx} y2={y0 + h - (i % 2 ? 0 : 6)} />);

/** The 3D-shaded picture of a ready-made design for each generator; the blank canvas keeps its line drawing. */
const PICTURE: Record<string, string> = {
  popup: "/presets/popup/nut-snack-bowl.svg",
  "hinge-box": "/presets/hinge/gift-box.svg",
  "hinged-cover": "/templates/thumbs/hinge-notebook-cover.svg",
  letters: "/presets/letters/hello-sign.svg",
  parametric: "/presets/parametric/head-stack.svg",
  "finger-box": "/presets/boxes/small-box.svg",
  tray: "/presets/boxes/organiser.svg",
  "hinge-fill": "/templates/thumbs/hinge-bracelet.svg",
  lamp: "/presets/boxes/honeycomb-lantern.svg",
  jigsaw: "/presets/puzzle/kids-12.svg",
  keychain: "/presets/keychain/name-rounded.svg",
  calibration: "/presets/calibration/plywood-3.svg",
  "shadow-box": "/presets/shadowbox/star-tunnel.svg",
  "paper-box": "/presets/paperbox/jewelry-6x6x3.svg",
};

export const generatorPicture = (id: string): string | undefined => PICTURE[id];

export function GeneratorArt({ id }: { id: string }) {
  const pic = PICTURE[id];
  if (pic) return <img className={`gen-pic gen-${id}`} src={pic} alt="" aria-hidden="true" loading="lazy" decoding="async" width={300} height={200} />;
  return (
    <svg className={`gen-art gen-${id}`} viewBox="0 0 160 96" aria-hidden="true">
      {ART[id] ?? ART.blank}
    </svg>
  );
}

const ART: Record<string, React.ReactNode> = {
  blank: (
    <g>
      <rect className="sheet" x="22" y="14" width="116" height="68" rx="2" />
      <path className="draw cut" d="M38 66 C 52 22, 78 22, 86 48 S 116 76, 124 30" />
      <circle className="node pop" cx="38" cy="66" r="2.6" />
      <circle className="node pop d2" cx="86" cy="48" r="2.6" />
      <circle className="node pop d3" cx="124" cy="30" r="2.6" />
    </g>
  ),
  "hinge-box": (
    <g>
      <rect className="cut" x="18" y="22" width="124" height="52" rx="3" />
      <g className="flex">{slits(56, 26, 13, 4, 44, "hinge")}</g>
      <rect className="cut faint" x="24" y="30" width="22" height="36" rx="10" />
    </g>
  ),
  "hinged-cover": (
    <g>
      <g className="fold-l"><rect className="cut" x="20" y="16" width="52" height="64" rx="3" /><rect className="engrave" x="30" y="30" width="32" height="20" rx="2" /></g>
      <g className="flex">{slits(76, 18, 4, 3, 60, "hinge")}</g>
      <rect className="cut" x="88" y="16" width="52" height="64" rx="3" />
    </g>
  ),
  letters: (
    <g>
      <path className="draw cut" d="M38 78 L62 18 L74 18 L98 78 L86 78 L80 62 L56 62 L50 78 Z M60 52 L76 52 L68 30 Z" />
      <path className="draw cut d2" d="M106 78 L106 18 L122 18 C 140 18, 140 46, 124 47 C 144 48, 144 78, 122 78 Z" />
    </g>
  ),
  parametric: (
    <g className="fins">
      {Array.from({ length: 11 }, (_, i) => {
        const h = 18 + Math.round(30 * Math.sin((i / 10) * Math.PI) ** 0.8);
        return <rect key={i} className={`cut fin f${i}`} x={30 + i * 9.5} y={78 - h} width="5" height={h} rx="2" />;
      })}
      <line className="cut" x1="24" y1="80" x2="136" y2="80" />
    </g>
  ),
  "finger-box": (
    <g>
      <path className="cut slide-l" d="M24 24 h40 v8 h8 v8 h-8 v8 h8 v8 h-8 v8 h8 v8 h-8 v4 h-40 z" />
      <path className="cut slide-r" d="M136 24 h-44 v8 h-8 v8 h8 v8 h-8 v8 h8 v8 h-8 v8 h8 v4 h44 z" />
    </g>
  ),
  tray: (
    <g>
      <rect className="cut" x="24" y="16" width="112" height="64" rx="3" />
      <line className="cut grow" x1="61" y1="16" x2="61" y2="80" />
      <line className="cut grow d2" x1="98" y1="16" x2="98" y2="80" />
      <line className="cut grow d3" x1="24" y1="48" x2="136" y2="48" />
      <rect className="engrave pop d3" x="72" y="22" width="16" height="6" rx="3" />
    </g>
  ),
  "hinge-fill": (
    <g>
      <path className="cut" d="M80 14 C 118 14, 140 34, 140 52 C 140 72, 114 84, 80 84 C 46 84, 20 72, 20 52 C 20 34, 42 14, 80 14 Z" />
      <g className="wipe">{slits(38, 26, 22, 4, 46, "hinge")}</g>
    </g>
  ),
  lamp: (
    <g>
      <path className="cut" d="M52 18 h56 l10 62 h-76 z" />
      {[[64, 32], [80, 30], [96, 32], [60, 48], [80, 46], [100, 48], [58, 64], [80, 62], [102, 64]].map(([x, y], i) => (
        <path key={i} className={`cut twinkle t${i % 3}`} d={`M${x} ${y - 5} l4 5 l-4 5 l-4 -5 z`} />
      ))}
      <line className="cut faint" x1="80" y1="6" x2="80" y2="18" />
    </g>
  ),
  jigsaw: (
    <g>
      <path className="cut" d="M24 20 h36 c0 -8 14 -8 14 0 h36 v26 c8 0 8 14 0 14 v20 h-86 z" />
      <path className="cut snap" d="M112 46 c8 0 8 14 0 14 v20 h26 v-60 h-26 z" />
    </g>
  ),
  "shadow-box": (
    <g>
      <rect className="cut" x="44" y="12" width="72" height="72" rx="4" />
      {[30, 24, 18, 12, 6].map((r, i) => (
        <rect key={r} className={`cut pop${i % 3 ? ` d${i % 3 + 1}` : ""}`} x={80 - r} y={48 - r} width={2 * r} height={2 * r} rx="1.5" transform={`rotate(${i * 9} 80 48)`} />
      ))}
    </g>
  ),
  calibration: (
    <g>
      {Array.from({ length: 20 }, (_, i) => (
        <rect key={i} className={`cell c${i % 5}`} x={28 + (i % 5) * 22} y={14 + Math.floor(i / 5) * 18} width="18" height="14" rx="1.5" style={{ opacity: 0.18 + 0.16 * (i % 5) }} />
      ))}
    </g>
  ),
};
