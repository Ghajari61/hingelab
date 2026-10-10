/**
 * Uploaded fonts, kept in IndexedDB in this browser only. They are never uploaded or shared.
 * (Cloud storage per user arrives with accounts in Phase 3.)
 */

export interface StoredFontMeta {
  id: string;
  name: string;
  fileName: string;
  added: number;
}

export interface StoredFont extends StoredFontMeta {
  bytes: ArrayBuffer;
}

const DB_NAME = "hingelab-fonts";
const STORE = "fonts";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function listStoredFonts(): Promise<StoredFontMeta[]> {
  const all = await run<StoredFont[]>("readonly", (s) => s.getAll() as IDBRequest<StoredFont[]>);
  return all.map(({ id, name, fileName, added }) => ({ id, name, fileName, added })).sort((a, b) => a.added - b.added);
}

export const getStoredFont = (id: string) => run<StoredFont | undefined>("readonly", (s) => s.get(id) as IDBRequest<StoredFont | undefined>);
export const putStoredFont = (f: StoredFont) => run("readwrite", (s) => s.put(f));
export const deleteStoredFont = (id: string) => run("readwrite", (s) => s.delete(id));
