// src/utils/syncStaleness.ts

export interface PlaidItemSummary {
  id: number;
  institution_name: string | null;
  last_synced_at: string | null;
  needs_reauth?: number | boolean;
}

// SQLite's CURRENT_TIMESTAMP returns "YYYY-MM-DD HH:MM:SS" with NO timezone
// suffix; JS `new Date(...)` parses that as local time. Treat naive strings
// as UTC by appending 'Z' before parsing so the staleness math doesn't drift
// by the viewer's offset.
function parseUtcIsoish(s: string): number {
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) return new Date(s).getTime();
  return new Date(s.replace(' ', 'T') + 'Z').getTime();
}

/**
 * Filters the user's plaid_items rows down to the ones whose data is older
 * than `thresholdHours`. Items currently flagged for reauth are excluded —
 * the dedicated reauth banner already prompts the user, and adding a second
 * banner for the same item is noise.
 */
export function findStaleItems(
  items: PlaidItemSummary[],
  thresholdHours: number,
  nowMs: number = Date.now()
): PlaidItemSummary[] {
  const thresholdMs = thresholdHours * 3_600_000;
  return items.filter(i => {
    if (i.needs_reauth) return false;
    if (!i.last_synced_at) return true;
    return nowMs - parseUtcIsoish(i.last_synced_at) > thresholdMs;
  });
}
