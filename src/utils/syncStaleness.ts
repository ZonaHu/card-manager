// src/utils/syncStaleness.ts

export interface PlaidItemSummary {
  id: number;
  institution_name: string | null;
  last_synced_at: string | null;
  needs_reauth?: number | boolean;
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
    return nowMs - new Date(i.last_synced_at).getTime() > thresholdMs;
  });
}
