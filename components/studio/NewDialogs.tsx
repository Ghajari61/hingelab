"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Dialog, NumberInput, SegmentedControl, Select, TextField } from "@/components/ui";
import { generatorMeta } from "@/lib/generators/catalog";
import { MACHINE_PROFILES, MATERIAL_PRESETS, SHEET_PRESETS, machineById, type LaserType } from "@/lib/studio/library";
import { defaultProjectName } from "@/lib/studio/naming";
import { UNIT_LIST } from "@/lib/studio/units";
import { ONBOARDING_STEPS, SHORTCUT_SET_NAMES, type Preferences, type ShortcutSet } from "@/lib/studio/prefs";
import type { Units } from "@/lib/studio/types";
import { GeneratorArt } from "./GeneratorArt";

const materialOptions = MATERIAL_PRESETS.map((m) => ({ value: m.id, label: m.name }));
const machineOptions = MACHINE_PROFILES.map((m) => ({ value: m.id, label: m.name, group: m.laser === "co2" ? "CO₂" : m.laser === "diode" ? "Diode" : "Fiber" }));
const unitOptions = UNIT_LIST.map((u) => ({ value: u, label: u }));

export interface NewProjectResult { name: string; materialId: string; machineId: string; units: Units; sheet: { w: number; h: number; name: string }; orientation?: "portrait" | "landscape" }

/** New project from a generator (spec §3.2): name, material, machine, units; Enter creates it. */
export function NewProjectDialog({ generatorId, prefs, names, onCancel, onCreate }: {
  generatorId: string | null; prefs: Preferences; names: string[]; onCancel: () => void; onCreate: (r: NewProjectResult) => void;
}) {
  const g = generatorId ? generatorMeta(generatorId) : null;
  const [name, setName] = useState("");
  const [materialId, setMaterial] = useState(prefs.materialId);
  const [machineId, setMachine] = useState(prefs.machineId);
  const [units, setUnits] = useState<Units>(prefs.units);
  useEffect(() => {
    if (!g) return;
    setName(defaultProjectName(g.name, names));
    setMaterial(prefs.materialId); setMachine(prefs.machineId); setUnits(prefs.units);
  }, [g, names, prefs.materialId, prefs.machineId, prefs.units]);
  if (!g) return null;
  const machine = machineById(machineId);
  const create = () => onCreate({ name: name.trim() || defaultProjectName(g.name, names), materialId, machineId, units, sheet: { w: machine?.bedW ?? 600, h: machine?.bedH ?? 400, name: "Sheet 1" } });
  return (
    <Dialog
      open title={`New ${g.name} project`} onClose={onCancel} testId="new-project-dialog"
      footer={<><button type="button" className="ui-btn ghost" onClick={onCancel}>Cancel</button><button type="button" className="ui-btn primary" onClick={create} data-testid="create-project">Create project</button></>}
    >
      <div className="dlg-gen">
        <GeneratorArt id={g.id} />
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600 }}>{g.name} {g.plan === "pro" ? <Badge kind="pro" /> : <Badge kind="free" />}</div>
          <p>{g.blurb}</p>
          {g.plan === "pro" && <p>Free plan: preview and edit freely; exporting needs Pro.</p>}
          {g.freeLimit && <p>{g.freeLimit}.</p>}
        </div>
      </div>
      <TextField label="Project name" value={name} onChange={setName} onEnter={create} autoFocus testId="project-name" />
      <div className="form-grid">
        <Select label="Material" value={materialId} options={materialOptions} onChange={setMaterial} />
        <Select label="Machine" value={machineId} options={machineOptions} onChange={setMachine} />
        <Select label="Units" value={units} options={unitOptions} onChange={setUnits} />
      </div>
    </Dialog>
  );
}

/** New blank document (spec §3.3): name, sheet preset or custom size, orientation, units, material, machine. */
export function NewDocumentDialog({ open, prefs, names, onCancel, onCreate }: {
  open: boolean; prefs: Preferences; names: string[]; onCancel: () => void; onCreate: (r: NewProjectResult) => void;
}) {
  const [name, setName] = useState("");
  const [preset, setPreset] = useState("bed");
  const [w, setW] = useState(300);
  const [h, setH] = useState(200);
  const [orientation, setOrientation] = useState<"landscape" | "portrait">("landscape");
  const [units, setUnits] = useState<Units>(prefs.units);
  const [materialId, setMaterial] = useState(prefs.materialId);
  const [machineId, setMachine] = useState(prefs.machineId);
  useEffect(() => {
    if (!open) return;
    setName(defaultProjectName("Design", names));
    setUnits(prefs.units); setMaterial(prefs.materialId); setMachine(prefs.machineId); setPreset("bed");
  }, [open, names, prefs.units, prefs.materialId, prefs.machineId]);
  const machine = machineById(machineId);
  const presetOptions = useMemo(() => [
    { value: "bed", label: `My machine bed (${machine ? `${machine.bedW} × ${machine.bedH}` : "—"})`, group: "Machine bed" },
    ...SHEET_PRESETS.map((s) => ({ value: s.id, label: `${s.name}${s.group === "Machine bed" ? ` (${s.w} × ${s.h})` : ""}`, group: s.group })),
    { value: "custom", label: "Custom size", group: "Common" },
  ], [machine]);
  useEffect(() => {
    if (preset === "custom") return;
    const s = preset === "bed" ? (machine ? { w: machine.bedW, h: machine.bedH } : null) : SHEET_PRESETS.find((x) => x.id === preset);
    if (s) { setW(s.w); setH(s.h); setOrientation(s.w >= s.h ? "landscape" : "portrait"); }
  }, [preset, machine]);
  const create = () => {
    const sheetName = preset === "custom" ? "Sheet 1" : preset === "bed" ? machine?.name ?? "Sheet 1" : SHEET_PRESETS.find((x) => x.id === preset)?.name ?? "Sheet 1";
    onCreate({ name: name.trim() || defaultProjectName("Design", names), materialId, machineId, units, sheet: { w, h, name: sheetName }, orientation });
  };
  return (
    <Dialog
      open={open} title="New document" onClose={onCancel} testId="new-document-dialog"
      footer={<><button type="button" className="ui-btn ghost" onClick={onCancel}>Cancel</button><button type="button" className="ui-btn primary" onClick={create} data-testid="create-document">Create</button></>}
    >
      <TextField label="Name" value={name} onChange={setName} onEnter={create} autoFocus testId="document-name" />
      <Select label="Sheet" value={preset} options={presetOptions} onChange={setPreset} testId="sheet-preset" />
      <div className="form-grid">
        <NumberInput label="Width" value={w} length units={units} min={10} max={3000} onChange={(v) => { setW(v); setPreset("custom"); }} testId="sheet-w" />
        <NumberInput label="Height" value={h} length units={units} min={10} max={3000} onChange={(v) => { setH(v); setPreset("custom"); }} testId="sheet-h" />
        <SegmentedControl label="Orientation" value={orientation} full options={[{ value: "landscape", label: "Landscape" }, { value: "portrait", label: "Portrait" }]}
          onChange={(o) => { setOrientation(o); if ((o === "landscape") !== (w >= h)) { setW(h); setH(w); } }} />
        <Select label="Units" value={units} options={unitOptions} onChange={setUnits} />
        <Select label="Material" value={materialId} options={materialOptions} onChange={setMaterial} />
        <Select label="Machine" value={machineId} options={machineOptions} onChange={setMachine} />
      </div>
    </Dialog>
  );
}

const LASERS: { value: LaserType; label: string; hint: string }[] = [
  { value: "co2", label: "CO₂", hint: "Cuts wood, acrylic, leather" },
  { value: "diode", label: "Diode", hint: "Engraves; cuts thin wood" },
  { value: "fiber", label: "Fiber", hint: "Marks metal" },
];

/** First-run setup (spec §15): laser & machine → units → shortcut set → favourite material. */
export function OnboardingDialog({ open, prefs, onDone }: { open: boolean; prefs: Preferences; onDone: (p: Partial<Preferences>) => void }) {
  const [step, setStep] = useState(0);
  const [laser, setLaser] = useState<LaserType>(prefs.laser);
  const [machineId, setMachine] = useState(prefs.machineId);
  const [units, setUnits] = useState<Units>(prefs.units);
  const [shortcutSet, setSet] = useState<ShortcutSet>(prefs.shortcutSet);
  const [materialId, setMaterial] = useState(prefs.materialId);
  const machines = MACHINE_PROFILES.filter((m) => m.laser === laser);
  const kind = ONBOARDING_STEPS[step];
  const finish = (skipped: boolean) => onDone(skipped ? { onboarded: true } : { onboarded: true, laser, machineId, units, shortcutSet, materialId });
  return (
    <Dialog
      open={open} title="Set up HingeLab" onClose={() => finish(true)} testId="onboarding" closeLabel="Skip setup"
      footer={<>
        <button type="button" className="ui-btn ghost left" onClick={() => finish(true)}>Skip</button>
        {step > 0 && <button type="button" className="ui-btn" onClick={() => setStep(step - 1)}>Back</button>}
        {step < ONBOARDING_STEPS.length - 1
          ? <button type="button" className="ui-btn primary" onClick={() => setStep(step + 1)} data-testid="onboarding-next">Next</button>
          : <button type="button" className="ui-btn primary" onClick={() => finish(false)} data-testid="onboarding-done">Start making</button>}
      </>}
    >
      <div className="steps" aria-label={`Step ${step + 1} of ${ONBOARDING_STEPS.length}`}>{ONBOARDING_STEPS.map((s, i) => <span key={s} className={i <= step ? "on" : ""} />)}</div>
      {kind === "machine" && <>
        <p className="dlg-note">Which laser do you use? Cut settings and sheet sizes start from it.</p>
        <div className="choice-grid" role="radiogroup" aria-label="Laser type">
          {LASERS.map((l) => (
            <button key={l.value} type="button" role="radio" className="choice" aria-checked={laser === l.value}
              onClick={() => { setLaser(l.value); setMachine(MACHINE_PROFILES.find((m) => m.laser === l.value)!.id); }}>
              <b>{l.label}</b><small>{l.hint}</small>
            </button>
          ))}
        </div>
        <Select label="Machine" value={machineId} options={machines.map((m) => ({ value: m.id, label: m.name }))} onChange={setMachine} />
      </>}
      {kind === "units" && <>
        <p className="dlg-note">Units for new documents. You can type any unit in a field (3in, 12mm) whatever you pick.</p>
        <SegmentedControl label="Units" value={units} full options={UNIT_LIST.map((u) => ({ value: u, label: u }))} onChange={setUnits} />
      </>}
      {kind === "shortcuts" && <>
        <p className="dlg-note">Keyboard shortcuts you already know. Change them any time in Edit → Keyboard Shortcuts.</p>
        <div className="choice-grid" role="radiogroup" aria-label="Shortcut set">
          {(Object.keys(SHORTCUT_SET_NAMES) as ShortcutSet[]).map((s) => (
            <button key={s} type="button" role="radio" className="choice" aria-checked={shortcutSet === s} onClick={() => setSet(s)}><b>{SHORTCUT_SET_NAMES[s]}</b></button>
          ))}
        </div>
      </>}
      {kind === "material" && <>
        <p className="dlg-note">Your usual material. New projects start with its thickness, kerf and hinge settings.</p>
        <Select label="Favourite material" value={materialId} options={materialOptions} onChange={setMaterial} />
      </>}
    </Dialog>
  );
}
