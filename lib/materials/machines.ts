/**
 * The user's machines, kept on this device beside their materials: the bed's size and the regions
 * of it the head cannot reach or that must stay clear (clamps, a honeycomb edge, a camera's blind
 * spot). Layouts and the geometry checks use the usable bed.
 */
export interface KeepOut { x: number; y: number; w: number; h: number; name?: string }

export interface UserMachine {
  /** "mc-" and a short random id. */
  id: string;
  name: string;
  bedW: number;
  bedH: number;
  keepOut: KeepOut[];
  laser: "co2" | "diode" | "fiber" | "blade";
}

export const MACHINES_KEY = "hingelab-machines";
const MAX_MACHINES = 30;
const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null);

export function cleanMachine(x: unknown): UserMachine | null {
  if (!x || typeof x !== "object") return null;
  const q = x as Record<string, unknown>;
  const name = typeof q.name === "string" ? q.name.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 80) : "";
  const bedW = num(q.bedW, 10, 5000), bedH = num(q.bedH, 10, 5000);
  if (!name || bedW == null || bedH == null) return null;
  const keepOut: KeepOut[] = [];
  for (const k of Array.isArray(q.keepOut) ? q.keepOut.slice(0, 20) : []) {
    const r = (k && typeof k === "object" ? k : {}) as Record<string, unknown>;
    const x0 = num(r.x, 0, bedW), y0 = num(r.y, 0, bedH), w = num(r.w, 0.1, bedW), h = num(r.h, 0.1, bedH);
    if (x0 == null || y0 == null || w == null || h == null) continue;
    keepOut.push({ x: x0, y: y0, w: Math.min(w, bedW - x0), h: Math.min(h, bedH - y0), ...(typeof r.name === "string" ? { name: r.name.slice(0, 40) } : {}) });
  }
  const laser = q.laser === "diode" || q.laser === "fiber" || q.laser === "blade" ? q.laser : "co2";
  const id = typeof q.id === "string" && /^mc-[a-z0-9]{1,24}$/.test(q.id) ? q.id : `mc-${Math.random().toString(36).slice(2, 12)}`;
  return { id, name, bedW, bedH, keepOut, laser };
}

export function loadMachines(): UserMachine[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = JSON.parse(localStorage.getItem(MACHINES_KEY) ?? "[]");
    return (Array.isArray(raw) ? raw : []).map(cleanMachine).filter((m): m is UserMachine => !!m).slice(0, MAX_MACHINES);
  } catch {
    return [];
  }
}

export function saveMachines(list: UserMachine[]): void {
  try {
    localStorage.setItem(MACHINES_KEY, JSON.stringify(list.map(cleanMachine).filter(Boolean).slice(0, MAX_MACHINES)));
  } catch {
    /* storage full or blocked */
  }
}

/** Whether a box on the sheet (mm, from its corner) overlaps a keep-out region. */
export function hitsKeepOut(m: Pick<UserMachine, "keepOut">, b: { x0: number; y0: number; x1: number; y1: number }): KeepOut | null {
  return m.keepOut.find((k) => b.x0 < k.x + k.w && b.x1 > k.x && b.y0 < k.y + k.h && b.y1 > k.y) ?? null;
}
