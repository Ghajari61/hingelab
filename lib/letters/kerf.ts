/**
 * Kerf compensation for Letters, in one place: the beam removes half the kerf on each side of its
 * path, so outlines are offset out by K/2 and holes in by K/2, once. Every Letters module takes its
 * offset from here (a test keeps it that way).
 */
export const halfKerf = (p: { K: number }) => Math.max(0, p.K) / 2;

/** A slot's width less the kerf the beam removes from both sides. */
export const slotLessKerf = (w: number, p: { K: number }) => w - 2 * halfKerf(p);
