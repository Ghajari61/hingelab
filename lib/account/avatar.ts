/** What an account's avatar shows when it has no picture: up to two initials on a colour of its own. */

/** Two letters from the name, or from the email's local part ("sara.ahmadi@…" → "SA", "ghajari61@…" → "GH"). */
export function avatarInitials(email?: string | null, name?: string | null): string {
  const words = (s: string) => s.split(/[^\p{L}\p{N}]+/u).map((w) => w.replace(/\p{N}+/gu, "")).filter(Boolean);
  const n = words((name ?? "").trim());
  if (n.length >= 2) return (first(n[0]) + first(n[n.length - 1])).toUpperCase();
  if (n.length === 1) return pair(n[0]);
  const local = words((email ?? "").split("@")[0] ?? "");
  if (local.length >= 2) return (first(local[0]) + first(local[1])).toUpperCase();
  if (local.length === 1) return pair(local[0]);
  return "?";
}

const first = (w: string) => [...w][0] ?? "";
const pair = (w: string) => [...w].slice(0, 2).join("").toUpperCase();

/** A stable hue (0–359) for the account, so the same person always gets the same colour. */
export function avatarHue(seed?: string | null): number {
  let h = 2166136261;
  for (const ch of (seed ?? "").toLowerCase()) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 360;
}

/** The avatar's background: a two-stop gradient around the account's hue. */
export function avatarBackground(seed?: string | null): string {
  const hue = avatarHue(seed);
  return `linear-gradient(135deg, hsl(${hue} 70% 52%), hsl(${(hue + 40) % 360} 72% 42%))`;
}
