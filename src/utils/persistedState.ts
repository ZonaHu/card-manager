// src/utils/persistedState.ts

/**
 * Read a JSON value from localStorage with safe fallback.
 *
 * When called with a version arg, the stored payload MUST be wrapped as
 * `{ v: number, data: T }` and v must equal the requested version. Any
 * other shape (legacy unversioned blob, lower version, higher version)
 * falls back to the supplied default. This is how we let future shape
 * changes invalidate stored state silently instead of handing the UI a
 * payload it can't parse.
 *
 * Without a version arg, the original raw round-trip behavior is preserved.
 */
export function readPersisted<T>(key: string, fallback: T, version?: number): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    if (version === undefined) return parsed as T;
    if (parsed && typeof parsed === 'object' && parsed.v === version && 'data' in parsed) {
      return parsed.data as T;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

/**
 * Write a JSON-serializable value to localStorage. Pass a version to wrap
 * as `{ v, data }`; readers can then detect schema drift on the next load.
 * `null` removes the key entirely.
 */
export function writePersisted(key: string, value: unknown, version?: number): void {
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
      return;
    }
    const payload = version === undefined ? value : { v: version, data: value };
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}
