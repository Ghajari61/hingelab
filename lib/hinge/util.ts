/** Shared numeric helpers. Kept identical to the prototype. */
export const TAU = Math.PI * 2;

export const r3 = (n: number) => Math.round(n * 1000) / 1000;

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
