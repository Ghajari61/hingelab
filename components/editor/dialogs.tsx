"use client";

import { useEffect, useRef } from "react";

export type ModalState =
  | null
  | { type: "rename"; name: string }
  | { type: "preset"; name: string }
  | { type: "guide" }
  | { type: "keys" }
  | { type: "code"; name: string; data: string };

export function Dialogs({
  modal, onClose, onRename, onSavePreset, noun = "box",
}: {
  modal: ModalState;
  onClose: () => void;
  onRename: (name: string) => void;
  onSavePreset?: (name: string) => void;
  /** What the project is called in the rename title. */
  noun?: string;
}) {
  if (!modal) return null;
  const title = modal.type === "rename" ? `Rename ${noun}`
    : modal.type === "preset" ? "Save as my preset"
    : modal.type === "guide" ? "Living hinge guide"
    : modal.type === "keys" ? "Keyboard shortcuts"
    : "Copy your file";
  return (
    <div className="modal-back" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header>{title}<button type="button" aria-label="Close" onClick={onClose}>×</button></header>
        <div className="mb">
          {modal.type === "rename" && <Rename name={modal.name} onRename={onRename} />}
          {modal.type === "preset" && <><p>Keep these settings to start from later. They appear under My presets on the start page, and in your account when you are signed in.</p><Rename name={modal.name} onRename={(n) => onSavePreset?.(n)} action="Save preset" /></>}
          {modal.type === "code" && <Code name={modal.name} data={modal.data} />}
          {modal.type === "guide" && <Guide />}
          {modal.type === "keys" && <Keys />}
        </div>
      </div>
    </div>
  );
}

function Rename({ name, onRename, action = "Rename" }: { name: string; onRename: (name: string) => void; action?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <>
      <input ref={ref} className="sel" defaultValue={name} maxLength={60} onKeyDown={(e) => { if (e.key === "Enter") onRename((e.target as HTMLInputElement).value); }} />
      <div className="rename-row"><button type="button" className="btn-export" onClick={() => onRename(ref.current?.value ?? "")}>{action}</button></div>
    </>
  );
}

function Code({ name, data }: { name: string; data: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <>
      <p>This view can&apos;t start a download. Copy the code below, paste it into a text editor and save it as <b>{name}</b>.</p>
      <textarea ref={ref} readOnly value={data} />
    </>
  );
}

function Guide() {
  return (
    <>
      <p>A living hinge is a field of parallel slits that lets a stiff sheet bend. Each bridge between slits twists a little, and hundreds of small twists add up to a curve.</p>
      <h3>What each setting does</h3>
      <ul>
        <li><b>Slit</b>: longer slits make longer torsion bars and a softer, tighter bend.</li>
        <li><b>Bridge</b>: the uncut material between slits. Smaller bridges bend more easily but are more fragile.</li>
        <li><b>Spacing</b>: distance between slit columns. Tighter spacing bends further but leaves thinner bars that can char.</li>
        <li><b>Overrun</b>: extends the hinge a few millimeters past each corner so the curve blends into the flat sides.</li>
        <li><b>Stretch</b>: shortens each hinge zone by this percentage, because the cuts open slightly as the wall bends. Leave it at 0 and raise it only if your test wall comes out too long.</li>
      </ul>
      <h3>Patterns</h3>
      <ul>
        <li><b>Straight</b>: the classic lattice. Strong and predictable; the best default.</li>
        <li><b>Wave</b>: every cut is a parallel copy of the same wave, so bars keep one width. A little softer than Straight and hides the slits visually.</li>
        <li><b>Relief</b>: Straight with a small round hole at every cut end, which spreads stress and resists cracking in brittle sheet such as MDF.</li>
        <li><b>Serpentine</b>: cuts run in from alternate edges, turning the wall into a spring. Bends very tightly but stretches, so glue the wall.</li>
      </ul>
      <h3>Auto-fit</h3>
      <ul>
        <li>Auto-fit picks the stiffest pattern that still reaches your corner radius with a 30% safety margin. Stiffer means fewer cuts, less charring and a stronger wall.</li>
      </ul>
      <h3>Cutting tips</h3>
      <ul>
        <li>Cut the green slots first, then the blue hinge, then the red outline, so parts don&apos;t shift before they&apos;re finished.</li>
        <li>Run the hinge layer slightly faster or with less power than the outline to reduce charring.</li>
        <li>Bend with the grain of the face veneer running across the slits, and pre-flex the strip gently before assembly.</li>
        <li>Measure your sheet with calipers. Plywood sold as 3 mm is often 2.7 to 3.2 mm.</li>
      </ul>
    </>
  );
}

function Keys() {
  return (
    <ul>
      <li><kbd>H</kbd> Hand tool · <kbd>Z</kbd> Zoom tool · hold <kbd>Space</kbd> to pan</li>
      <li><kbd>Ctrl/⌘ + 0</kbd> Fit sheet · <kbd>Ctrl/⌘ + 1</kbd> Actual size · <kbd>Ctrl/⌘ + / −</kbd> Zoom</li>
      <li><kbd>Ctrl/⌘ + Z</kbd> Undo · <kbd>Ctrl/⌘ + Shift + Z</kbd> Redo</li>
      <li><kbd>Ctrl/⌘ + S</kbd> Save project · <kbd>Ctrl/⌘ + O</kbd> Open · <kbd>Ctrl/⌘ + E</kbd> Export SVG</li>
      <li>In a field: <kbd>↑</kbd> <kbd>↓</kbd> to step, with <kbd>Shift</kbd> for ×10. Drag a field label to scrub.</li>
    </ul>
  );
}
