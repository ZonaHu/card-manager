import type { Transaction } from '../types';

export interface ChipFilters {
  query: string;
  category?: string;                 // 'all' or category name
  cardId?: number | null;            // null/undefined = all cards
  pendingOnly?: boolean;
  minAmount?: number;                // absolute
  maxAmount?: number;                // absolute
}

export function matchesSearch(t: Transaction, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const desc = (t.description ?? '').toLowerCase();
  const notes = (t.notes ?? '').toLowerCase();
  return desc.includes(q) || notes.includes(q);
}

export function applyFilters(transactions: Transaction[], f: ChipFilters): Transaction[] {
  return transactions.filter(t => {
    if (!matchesSearch(t, f.query)) return false;
    if (f.category && f.category !== 'all' && t.category !== f.category) return false;
    if (f.cardId != null && (t.cardId ?? (t as any).card_id) !== f.cardId) return false;
    if (f.pendingOnly && !t.pending) return false;
    const abs = Math.abs(t.amount);
    if (typeof f.minAmount === 'number' && abs < f.minAmount) return false;
    if (typeof f.maxAmount === 'number' && abs > f.maxAmount) return false;
    return true;
  });
}
