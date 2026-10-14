"use client";

/**
 * Original photos, kept in this browser (IndexedDB) and never uploaded: the design stores only the
 * image made from one and its id, so the look can be changed and a sharp print made later. The most
 * recent few are kept.
 */

const DB = "hingelab-photos";
const STORE = "originals";
const KEEP = 12;

interface Original { id: string; blob: Blob; name: string; at: number }

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("No IndexedDB")); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}

const newId = () => `p${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Keeps the original and returns its id, or "" when this browser cannot keep it (private windows). */
export async function saveOriginal(blob: Blob, name: string): Promise<string> {
  try {
    const db = await open();
    const id = newId();
    const store = db.transaction(STORE, "readwrite").objectStore(STORE);
    await request(store.put({ id, blob, name, at: Date.now() } satisfies Original));
    const all = (await request(db.transaction(STORE, "readonly").objectStore(STORE).getAll())) as Original[];
    const old = all.sort((a, b) => b.at - a.at).slice(KEEP);
    if (old.length) {
      const del = db.transaction(STORE, "readwrite").objectStore(STORE);
      for (const o of old) del.delete(o.id);
    }
    db.close();
    return id;
  } catch {
    return "";
  }
}

export async function loadOriginal(id: string): Promise<Blob | null> {
  if (!id) return null;
  try {
    const db = await open();
    const o = (await request(db.transaction(STORE, "readonly").objectStore(STORE).get(id))) as Original | undefined;
    db.close();
    return o?.blob ?? null;
  } catch {
    return null;
  }
}
