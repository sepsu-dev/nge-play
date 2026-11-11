const DB_NAME = "ngeplay_db";
const DB_VERSION = 1;
const STORE_NAME = "kv";

export type StoreKey = "liked" | "history" | "playlists" | "session";

let dbPromise: Promise<IDBDatabase | null> | null = null;

function storageKey(base: StoreKey, uid: string) {
  return `ngeplay_${base}_${uid}`;
}

function getDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

function readLegacyLocalStorage<T>(base: StoreKey, uid: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw =
      localStorage.getItem(storageKey(base, uid)) ||
      (uid === "guest" ? localStorage.getItem(`ngeplay_${base}`) : null);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeLocalStorageFallback<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export async function readStored<T>(base: StoreKey, uid: string): Promise<T | null> {
  const key = storageKey(base, uid);
  const db = await getDb();
  if (!db) return readLegacyLocalStorage<T>(base, uid);

  const fromIdb = await new Promise<T | undefined>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });

  if (fromIdb !== undefined) return fromIdb;

  // One-time migration from legacy localStorage if IndexedDB is empty for this key
  const legacy = readLegacyLocalStorage<T>(base, uid);
  if (legacy !== null) {
    await writeStored(base, uid, legacy);
  }
  return legacy;
}

export async function writeStored<T>(base: StoreKey, uid: string, value: T): Promise<void> {
  const key = storageKey(base, uid);
  const db = await getDb();
  if (!db) {
    writeLocalStorageFallback(key, value);
    return;
  }

  const ok = await new Promise<boolean>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });

  if (!ok) writeLocalStorageFallback(key, value);
}

// Mirror only lightweight session snapshot on unload as synchronous safety net
// since IndexedDB async writes can be aborted during tab close.
export function flushSessionSync<T>(uid: string, value: T) {
  writeLocalStorageFallback(storageKey("session", uid), value);
}

let persistRequested = false;
export function requestPersistentStorage() {
  if (persistRequested || typeof navigator === "undefined") return;
  persistRequested = true;
  try {
    navigator.storage?.persisted?.().then((already) => {
      if (!already) navigator.storage?.persist?.().catch(() => {});
    });
  } catch {}
}
