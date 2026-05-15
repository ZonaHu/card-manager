/**
 * Read a JSON value from localStorage with safe fallback when nothing is
 * stored, the key was deleted, or the stored payload is corrupted (e.g.
 * from a stale app version that wrote a different shape). Never throws.
 */
export function readPersisted<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Write a JSON-serializable value to localStorage. Passing `null` removes
 * the key entirely so callers can clear without juggling a separate
 * remove function. Errors (quota exceeded, private mode) are swallowed —
 * persistence is a nice-to-have, not a correctness boundary.
 */
export function writePersisted(key: string, value: unknown): void {
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
