/**
 * The imported 3D model of the guest Parametric editor, kept in IndexedDB in this browser only
 * (model files are too large for localStorage). One model is kept: the last one imported.
 */

export interface StoredModel {
  name: string;
  /** name:size:lastModified, so the slicer can keep the prepared mesh between runs. */
  key: string;
  bytes: ArrayBuffer;
}

const DB_NAME = "hingelab-models";
const STORE = "models";
const CURRENT = "current";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
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

export const getStoredModel = () => run<StoredModel | undefined>("readonly", s => s.get(CURRENT) as IDBRequest<StoredModel | undefined>);
export const putStoredModel = (m: StoredModel) => run("readwrite", s => s.put(m, CURRENT));
