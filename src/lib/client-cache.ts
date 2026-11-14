/**
 * Tiny TTL cache for client-side Server Action results.
 * Repeat searches / playlist switches are served locally instead of re-hitting
 * the server action (and therefore YouTube), which is the cheapest data saving available.
 * Follows the same Map + LRU-ish eviction pattern used by the server-side caches.
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export function createTtlCache<T>(ttlMs: number, maxEntries = 40) {
  const store = new Map<string, Entry<T>>();

  return {
    get(key: string): T | undefined {
      const hit = store.get(key);
      if (!hit) return undefined;
      if (hit.expiresAt <= Date.now()) {
        store.delete(key);
        return undefined;
      }
      // refresh recency so hot keys survive eviction
      store.delete(key);
      store.set(key, hit);
      return hit.value;
    },
    set(key: string, value: T): T {
      if (store.size >= maxEntries) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    },
    clear() {
      store.clear();
    },
  };
}

// Country/locale hint is stable for a session — computing it on every action was pure duplicate work.
let cachedHint: string | null = null;

export function getClientHint(): string {
  if (cachedHint !== null) return cachedHint;
  if (typeof window === "undefined") return "";
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const langs = (navigator.languages || (navigator.language ? [navigator.language] : []))
      .filter(Boolean)
      .join("|");
    cachedHint = [tz, langs].filter(Boolean).join("|");
  } catch {
    cachedHint = "";
  }
  return cachedHint;
}