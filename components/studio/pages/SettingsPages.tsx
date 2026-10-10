"use client";

import { Layers } from "lucide-react";
import { EmptyState, SegmentedControl, Select } from "@/components/ui";
import { useAccount } from "@/components/auth/useAccount";
import { MACHINE_PROFILES, MATERIAL_PRESETS, STARTING_POINT_NOTE } from "@/lib/studio/library";
import { SHORTCUT_SET_NAMES, type Accent, type ShortcutSet, type Theme } from "@/lib/studio/prefs";
import { UNIT_LIST } from "@/lib/studio/units";
import type { Units } from "@/lib/studio/types";
import { StudioHeader } from "../StudioHeader";
import { usePrefs } from "../usePrefs";

const laserName = { co2: "CO₂", diode: "Diode", fiber: "Fiber" } as const;

export function PresetsPage() {
  return (
    <div className="studio-page">
      <StudioHeader />
      <main className="studio-main">
        <h1>Presets</h1>
        <section aria-labelledby="mats">
          <h2 id="mats">Materials</h2>
          <p className="dlg-note">{STARTING_POINT_NOTE}.</p>
          <div className="info-card" style={{ overflowX: "auto" }}>
            <table className="st-table">
              <thead><tr><th>Material</th><th>Thickness</th><th>Kerf</th><th>Hinge spacing</th><th>CO₂ cut</th><th>Diode cut</th></tr></thead>
              <tbody>
                {MATERIAL_PRESETS.map((m) => (
                  <tr key={m.id}>
                    <td>{m.name}</td><td>{m.thickness} mm</td><td>{m.kerf} mm</td><td>{m.hinge.pitch ? `${m.hinge.pitch} mm` : "—"}</td>
                    <td>{m.cut.co2 ? `${m.cut.co2.speed} mm/s · ${m.cut.co2.power}%` : "—"}</td>
                    <td>{m.cut.diode ? `${m.cut.diode.speed} mm/s · ${m.cut.diode.power}% × ${m.cut.diode.passes}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section aria-labelledby="machs">
          <h2 id="machs">Machines</h2>
          <div className="info-card" style={{ overflowX: "auto" }}>
            <table className="st-table">
              <thead><tr><th>Machine</th><th>Laser</th><th>Power</th><th>Bed</th><th>Export</th></tr></thead>
              <tbody>
                {MACHINE_PROFILES.map((m) => (
                  <tr key={m.id}><td>{m.name}</td><td>{laserName[m.laser]}</td><td>{m.watts} W</td><td>{m.bedW} × {m.bedH} mm</td><td>{m.exportFormat.toUpperCase()}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section aria-labelledby="mine">
          <h2 id="mine">My presets</h2>
          <EmptyState icon={<Layers size={30} />} title="No presets of your own yet">
            Save generator settings, materials and machines from the editor with “Save as preset”. They appear here and sync to your account.
          </EmptyState>
        </section>
      </main>
    </div>
  );
}

export function AccountPage() {
  const { user, profile } = useAccount();
  const [prefs, setPrefs] = usePrefs();
  return (
    <div className="studio-page">
      <StudioHeader />
      <main className="studio-main" style={{ maxWidth: 760 }}>
        <h1>Account</h1>
        <section className="info-card" aria-labelledby="profile">
          <h3 id="profile">Profile</h3>
          {user ? <p>{(user.user_metadata as { full_name?: string })?.full_name || user.email} · {profile?.plan === "pro" ? "Pro plan" : "Free plan"}</p> : <p>You are using HingeLab without an account. Projects stay on this device.</p>}
        </section>
        <section className="info-card" aria-labelledby="prefs">
          <h3 id="prefs">Preferences</h3>
          <div className="form-grid">
            <SegmentedControl label="Theme" value={prefs.theme} onChange={(theme: Theme) => setPrefs({ theme })} options={[{ value: "dark", label: "Dark" }, { value: "darker", label: "Darker" }, { value: "light", label: "Light" }, { value: "system", label: "System" }]} />
            <SegmentedControl label="Accent" value={prefs.accent} onChange={(accent: Accent) => setPrefs({ accent })} options={[{ value: "blue", label: "Blue" }, { value: "violet", label: "Violet" }, { value: "teal", label: "Teal" }, { value: "orange", label: "Orange" }]} />
            <Select label="Units for new documents" value={prefs.units} options={UNIT_LIST.map((u) => ({ value: u, label: u }))} onChange={(units: Units) => setPrefs({ units })} />
            <Select label="Shortcut set" value={prefs.shortcutSet} options={(Object.keys(SHORTCUT_SET_NAMES) as ShortcutSet[]).map((s) => ({ value: s, label: SHORTCUT_SET_NAMES[s] }))} onChange={(shortcutSet) => setPrefs({ shortcutSet })} />
            <Select label="Default machine" value={prefs.machineId} options={MACHINE_PROFILES.map((m) => ({ value: m.id, label: m.name }))} onChange={(machineId) => setPrefs({ machineId })} />
            <Select label="Favourite material" value={prefs.materialId} options={MATERIAL_PRESETS.map((m) => ({ value: m.id, label: m.name }))} onChange={(materialId) => setPrefs({ materialId })} />
            <SegmentedControl label="Reset ↺ goes to" value={prefs.resetTo} onChange={(resetTo) => setPrefs({ resetTo })} options={[{ value: "default", label: "Default value" }, { value: "preset", label: "Preset value" }]} />
            <label style={{ display: "flex", gap: 8, alignItems: "center", alignSelf: "end" }}>
              <input type="checkbox" checked={prefs.showStartScreen} onChange={(e) => setPrefs({ showStartScreen: e.target.checked })} /> Show start screen on launch
            </label>
          </div>
        </section>
      </main>
    </div>
  );
}

export function TemplatesPage() {
  return (
    <div className="studio-page">
      <StudioHeader />
      <main className="studio-main">
        <h1>Templates</h1>
        <EmptyState icon={<Layers size={30} />} title="Templates are on their way">
          Curated starter projects (gift sets, name signs, menu covers, desk organizer kits) will appear here.
        </EmptyState>
      </main>
    </div>
  );
}

export function HelpPage() {
  return (
    <div className="studio-page">
      <StudioHeader />
      <main className="studio-main" style={{ maxWidth: 860 }}>
        <h1>Help</h1>
        <section className="info-card" id="first-cut">
          <h3>Make your first cut</h3>
          <ul>
            <li>Pick a generator on the start screen (Finger-Joint Box is free), choose your material and machine, and create the project.</li>
            <li>Adjust the size and options in the generator panel; the analysis box warns about anything that will not cut well.</li>
            <li>Export SVG and open it in your laser software (LightBurn, xTool Creative Space, Glowforge, RDWorks, LaserGRBL or Inkscape). Colours map to LightBurn layers C00–C29.</li>
            <li>Cut a test card first with the Test & Calibration generator: the settings shipped with each material are a starting point only.</li>
          </ul>
        </section>
        <section className="info-card" id="kerf">
          <h3>Measure your kerf</h3>
          <p>The laser burns away a thin line of material, the kerf. Cut the kerf gauge from Test & Calibration, find the finger that fits snugly, and enter its value: HingeLab saves it in your material preset and uses it for every joint.</p>
        </section>
        <section className="info-card" id="shortcuts">
          <h3>Keyboard shortcuts</h3>
          <p>Every menu item shows its shortcut, and the command palette (Ctrl+/) finds every command. On macOS, Ctrl is ⌘ and Alt is ⌥. Some browsers keep Ctrl+N, Ctrl+W and Ctrl+T for themselves; use the File menu or the command palette for those.</p>
        </section>
      </main>
    </div>
  );
}
