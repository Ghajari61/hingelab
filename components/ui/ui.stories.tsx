import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Circle, Hand, MousePointer2, PenTool, Square, Star, Type, ZoomIn } from "lucide-react";
import {
  Badge, ColorSwatch, CommandPalette, ContextMenu, Dialog, Dock, EmptyState, IconButton, MenuBar, NumberInput, PanelSection,
  PresetPicker, ProgressBar, SegmentedControl, Select, Slider, Tabs, Toolbar, Combobox, useToast, type MenuItem, type PresetEntry,
} from "./index";
import { LAYER_COLORS, layerCode } from "@/lib/studio/cutLayers";

const meta: Meta = { title: "UI/Library" };
export default meta;
type Story = StoryObj;

export const Buttons: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <button type="button" className="ui-btn primary">Primary</button>
      <button type="button" className="ui-btn">Secondary</button>
      <button type="button" className="ui-btn ghost">Ghost</button>
      <button type="button" className="ui-btn danger">Delete</button>
      <button type="button" className="ui-btn" disabled>Disabled</button>
      <IconButton label="Selection" shortcut="V" description="Select and move objects" icon={<MousePointer2 size={16} />} pressed />
      <IconButton label="Pen" shortcut="P" icon={<PenTool size={16} />} />
      <Badge kind="pro" /> <Badge kind="free" /> <Badge kind="new" />
    </div>
  ),
};

function NumberDemo() {
  const [w, setW] = useState(140);
  const [n, setN] = useState(6);
  const [locked, setLocked] = useState(false);
  const toast = useToast();
  return (
    <div style={{ display: "grid", gap: 10, width: 260 }}>
      <NumberInput label="Width" value={w} length units="mm" min={10} max={600} defaultValue={140} onChange={(v) => setW(v)} locked={locked} onLockChange={setLocked} onResetToast={(m) => toast({ message: m, action: { label: "Undo", run: () => {} } })} />
      <NumberInput label="Width (in)" value={w} length units="in" min={10} max={600} defaultValue={140} onChange={(v) => setW(v)} />
      <NumberInput label="Sides" value={n} integer min={3} max={64} defaultValue={6} onChange={setN} />
      <p style={{ color: "var(--text-secondary)", margin: 0 }}>Try 25.4*2, 3in, +10, 50%; arrows with Shift/Alt; drag the label; right-click.</p>
    </div>
  );
}
export const NumberFields: Story = { render: () => <NumberDemo /> };

function ControlsDemo() {
  const [seg, setSeg] = useState<"cut" | "score" | "fill">("cut");
  const [s, setS] = useState(40);
  const [sel, setSel] = useState("birch3");
  const [tab, setTab] = useState<"a" | "b">("a");
  const [font, setFont] = useState("vazir");
  const [layer, setLayer] = useState(2);
  return (
    <div style={{ display: "grid", gap: 16, width: 360 }}>
      <SegmentedControl label="Mode" value={seg} onChange={setSeg} options={[{ value: "cut", label: "Cut" }, { value: "score", label: "Score" }, { value: "fill", label: "Fill" }]} />
      <Slider label="Power" min={0} max={100} value={s} onChange={setS} format={(v) => `${v}%`} />
      <Select label="Material" value={sel} onChange={setSel} options={[{ value: "birch3", label: "Birch 3 mm" }, { value: "mdf3", label: "MDF 3 mm" }]} />
      <Combobox label="Font" value={font} onChange={setFont} options={[{ value: "vazir", label: "Vazirmatn" }, { value: "fredoka", label: "Fredoka" }, { value: "source", label: "Source Sans 3" }]} />
      <Tabs label="Demo tabs" value={tab} onChange={setTab} tabs={[{ id: "a", label: "Properties" }, { id: "b", label: "Layers" }]} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {LAYER_COLORS.map((c, i) => <ColorSwatch key={c} color={c} label={layerCode(i)} selected={layer === i} onClick={() => setLayer(i)} />)}
      </div>
      <ProgressBar label="Exporting" value={0.6} />
      <ProgressBar label="Slicing" />
    </div>
  );
}
export const Controls: Story = { render: () => <ControlsDemo /> };

const MENU: MenuItem[] = [
  { id: "undo", label: "Undo", shortcut: "Ctrl+Z", run: () => {} },
  { id: "redo", label: "Redo", shortcut: "Ctrl+Shift+Z", disabled: true, reason: "Nothing to redo" },
  "-",
  { id: "reset", label: "Reset", items: [{ id: "r1", label: "Selected Field", run: () => {} }, { id: "r2", label: "Generator", run: () => {} }] },
  { id: "grid", label: "Grid", shortcut: "Ctrl+'", checked: true, run: () => {} },
];

function MenusDemo() {
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);
  return (
    <div style={{ display: "grid", gap: 24 }}>
      <MenuBar menus={[{ id: "file", label: "File", items: MENU }, { id: "edit", label: "Edit", items: MENU }]} />
      <div onContextMenu={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }); }} style={{ height: 120, border: "1px dashed var(--line)", display: "grid", placeItems: "center", color: "var(--text-secondary)" }}>
        Right-click here
      </div>
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={MENU} label="Demo" onClose={() => setCtx(null)} />}
    </div>
  );
}
export const Menus: Story = { render: () => <MenusDemo /> };

function DialogDemo() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" className="ui-btn" onClick={() => setOpen(true)}>Open dialog</button>
      <Dialog open={open} title="Document setup" onClose={() => setOpen(false)} footer={<button type="button" className="ui-btn primary" onClick={() => setOpen(false)}>Done</button>}>
        <p style={{ margin: 0 }}>Dialogs trap focus, close on Esc, and return focus when they close.</p>
      </Dialog>
    </>
  );
}
export const Dialogs: Story = { render: () => <DialogDemo /> };

function ShellDemo() {
  const [tool, setTool] = useState("select");
  const [tab, setTab] = useState("props");
  const [order, setOrder] = useState(["props", "layers", "cut"]);
  const content: Record<string, { label: string; content: React.ReactNode }> = {
    props: { label: "Properties", content: <PanelSection title="Transform" meta="140 × 90" onReset={() => {}}><NumberInput label="X" value={0} length onChange={() => {}} /></PanelSection> },
    layers: { label: "Layers", content: <EmptyState title="No objects">Draw something to see it here.</EmptyState> },
    cut: { label: "Cut Layers", content: <PanelSection title="C02 Cut">Speed 12 mm/s · Power 65%</PanelSection> },
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 300px", height: 420, border: "1px solid var(--line)" }}>
      <Toolbar active={tool} onSelect={setTool} slots={[
        { id: "select", label: "Selection", shortcut: "V", icon: <MousePointer2 size={16} /> },
        { id: "pen", label: "Pen", shortcut: "P", icon: <PenTool size={16} /> },
        { group: "Shapes", tools: [
          { id: "rect", label: "Rectangle", shortcut: "M", icon: <Square size={16} /> },
          { id: "ellipse", label: "Ellipse", shortcut: "L", icon: <Circle size={16} /> },
          { id: "star", label: "Star", icon: <Star size={16} /> },
        ] },
        { id: "type", label: "Type", shortcut: "T", icon: <Type size={16} /> },
        "-",
        { id: "hand", label: "Hand", shortcut: "H", icon: <Hand size={16} /> },
        { id: "zoom", label: "Zoom", shortcut: "Z", icon: <ZoomIn size={16} /> },
      ]} />
      <div style={{ background: "var(--surface-pasteboard)" }} />
      <Dock active={tab} onActive={setTab} onReorder={setOrder} tabs={order.map((id) => ({ id, ...content[id] }))} />
    </div>
  );
}
export const ToolbarAndDock: Story = { render: () => <ShellDemo /> };

function PresetDemo() {
  const [v, setV] = useState<string | null>("a");
  const [fav, setFav] = useState<string[]>(["b"]);
  const thumb = <svg viewBox="0 0 40 24" width="60"><rect x="2" y="2" width="36" height="20" rx="3" fill="none" stroke="#FF5252" /></svg>;
  return (
    <div style={{ width: 300 }}>
      <PresetPicker
        presets={([
          { id: "a", name: "Jewellery box 3 mm birch", source: "built-in", thumbnail: thumb },
          { id: "b", name: "Pencil cup Ø80", source: "built-in", thumbnail: thumb },
          { id: "c", name: "My tea box", source: "mine", thumbnail: thumb, touches: ["Width", "Depth"] },
        ] as PresetEntry[]).map((p) => ({ ...p, favourite: fav.includes(p.id) }))}
        value={v} modified onApply={setV} onSaveNew={() => {}} onUpdate={() => {}} onFavourite={(id, f) => setFav(f ? [...fav, id] : fav.filter((x) => x !== id))}
      />
    </div>
  );
}
export const Presets: Story = { render: () => <PresetDemo /> };

function PaletteDemo() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" className="ui-btn" onClick={() => setOpen(true)}>Open palette (Ctrl+/)</button>
      <CommandPalette open={open} onClose={() => setOpen(false)} recent={["edit.undo"]} items={[
        { id: "edit.undo", label: "Undo", category: "Edit", shortcut: "Ctrl+Z", run: () => {} },
        { id: "file.save", label: "Save", category: "File", shortcut: "Ctrl+S", run: () => {} },
        { id: "gen.hinge-box", label: "Hinge Box", category: "Generator", run: () => {} },
        { id: "panel.layers", label: "Layers & Objects", category: "Panel", run: () => {} },
      ]} />
    </>
  );
}
export const Palette: Story = { render: () => <PaletteDemo /> };
