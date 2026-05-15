import type { Transaction } from '../types';

/**
 * True when a transaction matches the user's search query. Searches both the
 * bank description AND the user's note so notes become first-class search
 * targets. Empty/whitespace queries match everything.
 */
export function matchesSearch(t: Transaction, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const desc = (t.description ?? '').toLowerCase();
  const notes = (t.notes ?? '').toLowerCase();
  return desc.includes(q) || notes.includes(q);
}
