/**
 * Locks that hold a box shut without glue, so every style builds them alike: a tab with a neck
 * that snaps into a slot, a hook that catches behind a slot's edge, and a friction tuck (rounded,
 * with short slits at the ends of its fold so it clicks in). Shapes are in a flap's frame: the
 * hinge along x from 0 to w, the flap reaching d toward +y.
 */
import { tuckFlap } from "./geom";
import type { Pt } from "./types";

export type LockKind = "tab" | "hook" | "friction";
export const LOCK_NAMES: Record<LockKind, string> = { tab: "Tab and slot", hook: "Hook lock", friction: "Friction tuck" };

/** The lock's flap: a tab whose shoulders are wider than its neck, a hooked tab, or a rounded tuck. */
export function lockTab(w: number, d: number, kind: LockKind, r = 3): Pt[] {
  if (kind === "friction") return tuckFlap(w, d, Math.min(r, w / 3, d / 2), Math.min(w / 8, 1));
  const n = Math.min(w * 0.18, 4);
  if (kind === "hook") return [[n, 0], [n, d * 0.55], [0, d * 0.72], [n * 0.6, d], [w - n, d], [w - n, 0]];
  return [[n, 0], [n, d * 0.45], [0, d * 0.6], [0, d * 0.85], [w * 0.15, d], [w * 0.85, d], [w, d * 0.85], [w, d * 0.6], [w - n, d * 0.45], [w - n, 0]];
}

/** The slot a tab `len` wide goes through: a thin rectangle in a face (`at` its frame), centred on (a, b), along u or v. */
export function lockSlot(at: (a: number, b: number) => Pt, a: number, b: number, len: number, t: number, along: "u" | "v" = "u"): Pt[] {
  const s = (t + 0.3) / 2, hu = along === "u" ? len / 2 : s, hv = along === "u" ? s : len / 2;
  return [at(a - hu, b - hv), at(a + hu, b - hv), at(a + hu, b + hv), at(a - hu, b + hv)];
}

/** How far a slit lock's cuts reach in from each end of a tuck's fold, mm. */
export const slitFor = (w: number) => Math.min(5, w / 6);
