/**
 * Interlocking names on a grid, like a crossword: every name after the first crosses one already
 * placed on a shared letter, names never run side by side (no accidental two-letter words), and
 * the grid stays as compact as it can. The result is always one connected group of tiles.
 */
export interface Placed { word: string; x: number; y: number; across: boolean }
export interface Grid { cells: Map<string, string>; placed: Placed[]; skipped: string[]; w: number; h: number; x0: number; y0: number }

const key = (x: number, y: number) => `${x},${y}`;

/** Letters only, in capitals (spaces, dots and dashes dropped): what goes on the tiles. */
export const tileWord = (s: string, caps = true) => [...(caps ? s.toLocaleUpperCase() : s)].filter((c) => /\p{L}|\p{N}/u.test(c)).join("");

function fits(cells: Map<string, string>, w: string, x: number, y: number, across: boolean): number {
  const dx = across ? 1 : 0, dy = across ? 0 : 1;
  const at = (i: number) => [x + dx * i, y + dy * i] as const;
  // the cells just before and after the word stay empty
  if (cells.has(key(x - dx, y - dy)) || cells.has(key(x + dx * w.length, y + dy * w.length))) return -1;
  let cross = 0;
  for (let i = 0; i < w.length; i++) {
    const [cx, cy] = at(i), c = cells.get(key(cx, cy));
    if (c !== undefined) {
      if (c !== w[i]) return -1;
      cross++;
      continue;
    }
    // a new letter: nothing beside it across the word's direction
    if (cells.has(key(cx + dy, cy + dx)) || cells.has(key(cx - dy, cy - dx))) return -1;
  }
  return cross === w.length ? -1 : cross;
}

function bounds(cells: Map<string, string>) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const k of cells.keys()) { const [x, y] = k.split(",").map(Number); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
}

/**
 * The best of several greedy fills: each starting word in turn and a few orders, keeping the grid
 * that leaves out the fewest names, then the smallest and squarest.
 */
export function crossword(words: string[]): Grid {
  const list = words.filter((w) => w.length > 0);
  if (list.length < 2) return fill(list);
  const byLen = list.map((w, i) => ({ w, i })).sort((a, b) => b.w.length - a.w.length || a.i - b.i).map((o) => o.w);
  const orders: string[][] = [byLen];
  for (let k = 1; k < Math.min(list.length, 10); k++) orders.push([byLen[k], ...byLen.filter((_, j) => j !== k)]);
  orders.push([...byLen].reverse(), list);
  let best: Grid | null = null;
  const rank = (g: Grid) => g.skipped.length * 1e6 + g.w * g.h + Math.abs(g.w - g.h) * 4;
  for (const o of orders) {
    const g = fill(o, true);
    if (!best || rank(g) < rank(best)) best = g;
    if (!best.skipped.length && orders.indexOf(o) >= 3) break;
  }
  return best!;
}

/** Places the words in order (the first across at the origin, the rest in passes until nothing more fits). */
function fill(words: string[], ordered = false): Grid {
  const list = words.filter((w) => w.length > 0);
  const cells = new Map<string, string>(), placed: Placed[] = [];
  if (!list.length) return { cells, placed, skipped: [], w: 0, h: 0, x0: 0, y0: 0 };
  const order = ordered ? list.map((w, i) => ({ w, i })) : list.map((w, i) => ({ w, i })).sort((a, b) => b.w.length - a.w.length || a.i - b.i);
  const put = (p: Placed) => {
    for (let i = 0; i < p.word.length; i++) cells.set(key(p.x + (p.across ? i : 0), p.y + (p.across ? 0 : i)), p.word[i]);
    placed.push(p);
  };
  put({ word: order[0].w, x: 0, y: 0, across: true });
  let left = order.slice(1).map((o) => o.w);
  for (let pass = 0; pass < 4 && left.length; pass++) {
    const next: string[] = [];
    for (const w of left) {
      let best: { p: Placed; score: number } | null = null;
      const b0 = bounds(cells);
      for (const [k, c] of cells) {
        const [cx, cy] = k.split(",").map(Number);
        for (let i = 0; i < w.length; i++) {
          if (w[i] !== c) continue;
          for (const across of [true, false]) {
            const x = across ? cx - i : cx, y = across ? cy : cy - i;
            const cross = fits(cells, w, x, y, across);
            if (cross < 1) continue;
            const x1 = Math.max(b0.x1, across ? x + w.length - 1 : x), y1 = Math.max(b0.y1, across ? y : y + w.length - 1);
            const nx0 = Math.min(b0.x0, x), ny0 = Math.min(b0.y0, y);
            const W = x1 - nx0 + 1, H = y1 - ny0 + 1;
            // more crossings, a smaller and squarer grid, and alternating directions read best
            const score = cross * 40 - W * H - Math.abs(W - H) * 3 + (across === !placed[placed.length - 1].across ? 2 : 0);
            if (!best || score > best.score) best = { p: { word: w, x, y, across }, score };
          }
        }
      }
      if (best) put(best.p);
      else next.push(w);
    }
    if (next.length === left.length) { left = next; break; }
    left = next;
  }
  const b = bounds(cells);
  return { cells, placed, skipped: left, w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1, x0: b.x0, y0: b.y0 };
}
