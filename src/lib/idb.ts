/**
 * Tiny promise wrapper around IndexedDB with a localStorage fallback.
 * No backend, no external dependency — everything stays on the device.
 */

const DB_NAME = "orbis-local";
const DB_VERSION = 1;
export const STORES = ["projects", "settings", "notes"] as const;
export type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

function hasIdb() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB unavailable"));
  });
  return dbPromise;
}

const fallbackKey = (store: StoreName) => `orbis-idb-${store}`;

function readFallback<T extends { id: string }>(store: StoreName): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(fallbackKey(store));
    const parsed = raw ? (JSON.parse(raw) as T[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeFallback<T extends { id: string }>(store: StoreName, rows: T[]) {
  try {
    window.localStorage.setItem(fallbackKey(store), JSON.stringify(rows));
  } catch {
    /* quota exceeded — keep the in-memory copy only */
  }
}

export async function idbPut<T extends { id: string }>(store: StoreName, value: T): Promise<void> {
  if (!hasIdb()) {
    const rows = readFallback<T>(store).filter((row) => row.id !== value.id);
    writeFallback(store, [value, ...rows]);
    return;
  }
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Write failed"));
  });
}

export async function idbAll<T extends { id: string }>(store: StoreName): Promise<T[]> {
  if (!hasIdb()) return readFallback<T>(store);
  const db = await openDb();
  return new Promise<T[]>((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const request = tx.objectStore(store).getAll();
    request.onsuccess = () => resolve((request.result ?? []) as T[]);
    request.onerror = () => reject(request.error ?? new Error("Read failed"));
  });
}

export async function idbGet<T extends { id: string }>(store: StoreName, id: string): Promise<T | null> {
  if (!hasIdb()) return readFallback<T>(store).find((row) => row.id === id) ?? null;
  const db = await openDb();
  return new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const request = tx.objectStore(store).get(id);
    request.onsuccess = () => resolve((request.result ?? null) as T | null);
    request.onerror = () => reject(request.error ?? new Error("Read failed"));
  });
}

export async function idbDelete(store: StoreName, id: string): Promise<void> {
  if (!hasIdb()) {
    writeFallback(store, readFallback(store).filter((row) => row.id !== id));
    return;
  }
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Delete failed"));
  });
}

export function storageKind(): "indexeddb" | "localstorage" {
  return hasIdb() ? "indexeddb" : "localstorage";
}
