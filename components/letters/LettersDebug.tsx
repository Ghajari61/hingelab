"use client";

import { useEffect, useMemo, useState } from "react";
import { layoutParts, polyD, r3, type BBox } from "@/lib/hinge";
import {
  BUNDLED_FONTS, computeLetterModel, LETTER_DEFAULTS, letterLayerContent, zoneOverlay,
  type Contour, type HarfBuzz, type LetterParams, type LetterPart, type LoadedFont, type Shape,
} from "@/lib/letters";
import { getLoadedFont, loadHarfBuzz } from "./runtime";

const COLORS = ["#C9A36A", "#4DA6FF", "#3DDC6E", "#E58A1F", "#B07CF0", "#EC5157"];
const d = (cs: Contour[]) => cs.map((c) => polyD(c, 0, 0)).join(" ");
const shapeD = (s: { outer: Contour; holes: Contour[] }) => d([s.outer, ...s.holes]);

function Panel({ title, box, children }: { title: string; box: BBox; children: React.ReactNode }) {
  const m = 8;
  const vb = `${r3(box.x0 - m)} ${r3(box.y0 - m)} ${r3(box.x1 - box.x0 + 2 * m)} ${r3(box.y1 - box.y0 + 2 * m)}`;
  return (
    <section className="dbg-card">
      <h2>{title}</h2>
      <svg viewBox={vb} xmlns="http://www.w3.org/2000/svg">{children}</svg>
    </section>
  );
}

/** Pipeline steps for one text: raw outline, welded shapes, islands, bridges, final parts. */
export default function LettersDebug() {
  const [hb, setHb] = useState<HarfBuzz | null>(null);
  const [font, setFont] = useState<LoadedFont | null>(null);
  const [p, setP] = useState<LetterParams>({ ...LETTER_DEFAULTS, text: "سام", fontId: "vazirmatn" });
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { loadHarfBuzz().then(setHb, (e: Error) => setErr(e.message)); }, []);
  useEffect(() => {
    if (!hb) return;
    getLoadedFont(hb, p.fontId).then(setFont, (e: Error) => setErr(e.message));
  }, [hb, p.fontId]);

  const run = useMemo(() => {
    if (!hb || !font || font.id !== p.fontId) return null;
    const t0 = performance.now();
    const r = computeLetterModel(p, font, hb);
    return { r, ms: performance.now() - t0 };
  }, [hb, font, p]);

  const set = (patch: Partial<LetterParams>) => setP((q) => ({ ...q, ...patch }));
  const model = run && !("error" in run.r) ? run.r : null;
  const box = model?.bbox;
  const stroke = { fill: "none", vectorEffect: "non-scaling-stroke" as const, strokeWidth: 1 };
  const isIsland = (s: Shape) => model?.islands.includes(s);
  const flatParts = model?.parts.filter((pt): pt is Extract<LetterPart, { outer: Contour }> => pt.kind === "solid" || pt.kind === "plate") ?? [];
  const wallLay = useMemo(() => {
    if (!model?.box) return null;
    const walls = model.parts.filter((pt) => pt.kind === "strip" || pt.kind === "panel");
    const lay = layoutParts(walls, Math.max(300, ...walls.map((w) => w.bbox.x1 - w.bbox.x0 + 20)), 4, true);
    return { lay, content: letterLayerContent(lay, p) };
  }, [model, p]);

  return (
    <div className="dbg">
      <div className="dbg-bar">
        <strong>Letters debug</strong>
        <input type="text" dir="auto" value={p.text} onChange={(e) => set({ text: e.target.value })} aria-label="Text" />
        <select value={p.fontId} onChange={(e) => set({ fontId: e.target.value })} aria-label="Font">
          {BUNDLED_FONTS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <select value={p.weld} onChange={(e) => set({ weld: e.target.value as LetterParams["weld"] })} aria-label="Weld">
          <option value="word">Weld: word</option>
          <option value="letters">Weld: letters</option>
        </select>
        <select value={p.mode} onChange={(e) => set({ mode: e.target.value as LetterParams["mode"] })} aria-label="Mode">
          <option value="solid">Solid</option>
          <option value="stencil">Stencil</option>
          <option value="box">Letter Box</option>
        </select>
        {p.mode === "box" && (
          <>
            <select value={p.wallStyle} onChange={(e) => set({ wallStyle: e.target.value as LetterParams["wallStyle"] })} aria-label="Walls">
              <option value="hinge">Living hinge</option>
              <option value="faceted">Flat panels</option>
            </select>
            <select value={p.lid} onChange={(e) => set({ lid: e.target.value as LetterParams["lid"] })} aria-label="Lid">
              <option value="open">Open tray</option>
              <option value="fixed">Fixed lid</option>
              <option value="removable">Removable lid</option>
            </select>
          </>
        )}
        <label className="chk"><input type="checkbox" checked={p.weldDots} onChange={(e) => set({ weldDots: e.target.checked })} /> Weld dots</label>
        <label className="chk">Size <input type="text" size={4} value={p.size} onChange={(e) => set({ size: +e.target.value || 0 })} /></label>
        <label className="chk">Spacing <input type="text" size={3} value={p.letterSpacing} onChange={(e) => set({ letterSpacing: +e.target.value || 0 })} /></label>
        <label className="chk">Thicken <input type="text" size={3} value={p.thicken} onChange={(e) => set({ thicken: +e.target.value || 0 })} /></label>
        {run && <span className="note">{run.ms.toFixed(0)} ms</span>}
      </div>
      {err && <div className="verdict err"><span className="dot" />{err}</div>}
      {run && "error" in run.r && <div className="verdict err"><span className="dot" />{run.r.error}</div>}
      {model && box && (
        <>
          <div className="dbg-grid">
            <Panel title="1 · Raw outline (HarfBuzz + opentype.js)" box={box}>
              <line x1={box.x0 - 8} x2={box.x1 + 8} y1={0} y2={0} stroke="#555" {...{ vectorEffect: "non-scaling-stroke" }} strokeDasharray="4 3" />
              {model.groups.map((g, i) => <path key={i} d={d(g.contours)} stroke={COLORS[i % COLORS.length]} {...stroke} />)}
              {model.shaped.glyphs.map((g, i) => (
                <g key={i}>
                  <line x1={g.x} x2={g.x} y1={4} y2={-4} stroke="#EC5157" {...{ vectorEffect: "non-scaling-stroke" }} />
                  <text x={g.x + 1} y={8} fontSize={5} fill="#A3A3A3">{`${g.gid}@${g.cluster}`}</text>
                </g>
              ))}
            </Panel>
            <Panel title="2 · Welded shapes (nonzero union + thicken)" box={box}>
              {model.shapes.map((s, i) => <path key={i} d={shapeD(s)} fill={COLORS[s.group % COLORS.length]} fillOpacity={0.35} fillRule="evenodd" stroke={COLORS[s.group % COLORS.length]} vectorEffect="non-scaling-stroke" />)}
            </Panel>
            <Panel title={`3 · Islands below ${model.islands.length ? "" : "(none) "}${p.islandArea} mm²`} box={box}>
              {model.shapes.map((s, i) => <path key={i} d={shapeD(s)} fill={isIsland(s) ? "#E58A1F" : "#6E6E6E"} fillOpacity={isIsland(s) ? 0.8 : 0.3} fillRule="evenodd" stroke="none" />)}
            </Panel>
            <Panel title={`4 · Weld bridges (${model.bridges.length})`} box={box}>
              {model.shapes.map((s, i) => <path key={i} d={shapeD(s)} fill="#6E6E6E" fillOpacity={0.3} fillRule="evenodd" stroke="none" />)}
              {model.bridges.map((b, i) => (
                <g key={i}>
                  <path d={polyD(b.poly, 0, 0)} fill="#4DA6FF" fillOpacity={0.7} stroke="none" />
                  <line x1={b.a[0]} y1={b.a[1]} x2={b.b[0]} y2={b.b[1]} stroke="#fff" {...{ vectorEffect: "non-scaling-stroke" }} />
                </g>
              ))}
            </Panel>
            <Panel title={`5 · Thinner than min feature (${model.thin.length})`} box={box}>
              {model.shapes.map((s, i) => <path key={i} d={shapeD(s)} fill="#6E6E6E" fillOpacity={0.3} fillRule="evenodd" stroke="none" />)}
              {model.thin.map((s, i) => <path key={i} d={shapeD(s)} fill="#EC5157" stroke="#EC5157" strokeWidth={2} vectorEffect="non-scaling-stroke" fillRule="evenodd" />)}
            </Panel>
            <Panel title={`6 · ${model.box ? "Base, lid and flat pieces" : "Final parts"} with kerf (${flatParts.length})`} box={box}>
              {flatParts.map((pt, i) => (
                <g key={i}>
                  <path d={shapeD(pt)} fill="#C9A36A" fillOpacity={0.13} fillRule="evenodd" stroke="none" />
                  <path d={polyD(pt.outer, 0, 0)} stroke="#FF5252" {...stroke} />
                  {pt.holes.length > 0 && <path d={d(pt.holes)} stroke="#3DDC6E" {...stroke} />}
                  {pt.kind === "plate" && pt.slots.length > 0 && <path d={d(pt.slots)} stroke="#4DA6FF" {...stroke} />}
                  <text x={pt.label.x} y={pt.label.y} fontSize={pt.label.size} fill="#D8D8D8" textAnchor="middle" dominantBaseline="middle">{pt.name}</text>
                </g>
              ))}
            </Panel>
            {model.box && (
              <>
                <Panel title={model.box.style === "hinge" ? `7 · Rounded outline (R ${model.box.rCorner.toFixed(1)} mm)` : "7 · Flat-panel outline"} box={box}>
                  {model.shapes.map((s, i) => <path key={i} d={shapeD(s)} fill="#6E6E6E" fillOpacity={0.3} fillRule="evenodd" stroke="none" />)}
                  {model.box.filleted.map((s, i) => <path key={i} d={shapeD(s)} stroke="#C9A36A" {...stroke} />)}
                </Panel>
                <Panel title={`8 · Wall centerlines and ${model.box.style === "hinge" ? "bend zones" : "panel corners"} (${model.box.walls.length} walls)`} box={box}>
                  {model.box.filleted.map((s, i) => <path key={i} d={shapeD(s)} fill="#6E6E6E" fillOpacity={0.2} fillRule="evenodd" stroke="none" />)}
                  {zoneOverlay(model.box).map((o, i) => <path key={i} d={o.d} stroke={o.color} fill="none" strokeWidth={o.width} vectorEffect="non-scaling-stroke" />)}
                </Panel>
              </>
            )}
          </div>
          {wallLay && (
            <section className="dbg-card dbg-wide">
              <h2>{`9 · Unrolled walls (${wallLay.lay.items.length} ${model.box?.style === "hinge" ? "strips" : "panels"})`}</h2>
              <svg viewBox={`0 0 ${r3(wallLay.lay.width)} ${r3(wallLay.lay.height)}`} xmlns="http://www.w3.org/2000/svg">
                <path d={wallLay.content.hinge.join(" ")} stroke="#E58A1F" {...stroke} />
                <path d={wallLay.content.outline.join(" ")} stroke="#FF5252" {...stroke} />
                {wallLay.content.labels.map((lb, i) => (
                  <text key={i} x={lb.x} y={lb.y} fontSize={lb.size} fill="#D8D8D8" textAnchor="middle" dominantBaseline="middle" transform={lb.rot ? `rotate(${lb.rot} ${lb.x} ${lb.y})` : undefined}>{lb.text}</text>
                ))}
              </svg>
            </section>
          )}
          <pre>{[
            `direction ${model.shaped.direction}, scale ${model.shaped.scale.toFixed(5)} mm/unit, ${font?.name}`,
            `glyphs (visual order): ${model.shaped.glyphs.map((g) => `${g.gid}@c${g.cluster} x=${g.x.toFixed(2)}`).join("  ")}`,
            `groups: ${model.groups.map((g) => `“${g.text}”`).join(" ")}`,
            `shapes ${model.shapes.length} (areas ${model.shapes.map((s) => s.area.toFixed(0)).join(", ")} mm²), islands ${model.islands.length}, parts ${model.parts.length}`,
            ...model.issues.map((i) => `${i.lvl}: ${i.msg}`),
          ].join("\n")}</pre>
        </>
      )}
    </div>
  );
}
