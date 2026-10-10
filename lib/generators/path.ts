/** Read and write a dot path ("face.size") in nested settings without mutating them. */
export function getPath(o: unknown, key: string): unknown {
  let cur: unknown = o;
  for (const k of key.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

export function setPath<T>(o: T, key: string, v: unknown): T {
  const [k, ...rest] = key.split(".");
  const src = (o ?? {}) as Record<string, unknown>;
  return { ...src, [k]: rest.length ? setPath(src[k], rest.join("."), v) : v } as T;
}
