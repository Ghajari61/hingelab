/**
 * Projects kept on this device (IndexedDB): guest projects, and the offline cache of cloud projects.
 * Local project ids start with "local-" so they never clash with cloud ids in /editor/[projectId].
 */
import { migrateDocument } from "./doc";
import type { Document } from "./types";

const DB_NAME = "hingelab-studio";
const DB_VERSION = 1;

export interface LocalProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  openedAt: string;
  /** Generator ids used in the document (for the icon on project cards). */
  generators: string[];
  /** Small SVG preview. */
  thumbnail?: string;
}

interface ProjectRecord extends LocalProjectSummary {
  doc: Document;
}

export const LOCAL_PREFIX = "local-";
export const isLocalId = (id: string) => id.startsWith(LOCAL_PREFIX);
export const newLocalId = () => LOCAL_PREFIX + (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains("projects")) d.createObjectStore("projects", { keyPath: "id" });
      if (!d.objectStoreNames.contains("assets")) d.createObjectStore("assets");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return db().then((d) => new Promise<T | undefined>((resolve, reject) => {
    const tx = d.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req ? (req.result as T) : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export function generatorsIn(doc: Document): string[] {
  const out = new Set<string>();
  const walk = (n: Document["root"]["children"][number]) => {
    if (n.type === "generator") out.add(n.generatorId);
    if (n.type === "group") n.children.forEach(walk);
  };
  doc.root.children.forEach(walk);
  return [...out];
}

export async function saveLocalProject(doc: Document, thumbnail?: string): Promise<void> {
  const now = new Date().toISOString();
  const prev = await run<ProjectRecord>("projects", "readonly", (s) => s.get(doc.id));
  const rec: ProjectRecord = {
    id: doc.id, name: doc.name, updatedAt: doc.updatedAt, openedAt: prev?.openedAt ?? now,
    generators: generatorsIn(doc), thumbnail: thumbnail ?? prev?.thumbnail, doc,
  };
  await run("projects", "readwrite", (s) => s.put(rec));
}

export async function loadLocalProject(id: string): Promise<Document | null> {
  const rec = await run<ProjectRecord>("projects", "readonly", (s) => s.get(id));
  if (!rec) return null;
  return migrateDocument(rec.doc);
}

/** Marks the project as opened now (recent projects are sorted by this). */
export async function touchLocalProject(id: string): Promise<void> {
  const rec = await run<ProjectRecord>("projects", "readonly", (s) => s.get(id));
  if (!rec) return;
  await run("projects", "readwrite", (s) => s.put({ ...rec, openedAt: new Date().toISOString() }));
}

export async function listLocalProjects(): Promise<LocalProjectSummary[]> {
  const all = (await run<ProjectRecord[]>("projects", "readonly", (s) => s.getAll())) ?? [];
  return all
    .map(({ doc: _doc, ...summary }) => { void _doc; return summary; })
    .sort((a, b) => (b.openedAt > a.openedAt ? 1 : b.openedAt < a.openedAt ? -1 : 0));
}

export async function deleteLocalProject(id: string): Promise<void> {
  await run("projects", "readwrite", (s) => s.delete(id));
  const keys = (await run<IDBValidKey[]>("assets", "readonly", (s) => s.getAllKeys())) ?? [];
  const mine = keys.filter((k) => typeof k === "string" && k.startsWith(id + "/"));
  if (mine.length) await run("assets", "readwrite", (s) => { mine.forEach((k) => s.delete(k)); });
}

export async function putLocalAsset(projectId: string, assetId: string, bytes: Uint8Array): Promise<void> {
  await run("assets", "readwrite", (s) => s.put(bytes, `${projectId}/${assetId}`));
}

export async function getLocalAsset(projectId: string, assetId: string): Promise<Uint8Array | null> {
  return (await run<Uint8Array>("assets", "readonly", (s) => s.get(`${projectId}/${assetId}`))) ?? null;
}

/** For tests: forget the cached connection so a fresh fake IndexedDB is used. */
export function resetLocalStoreForTests() {
  dbPromise = null;
}
