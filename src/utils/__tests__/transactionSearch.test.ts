import { describe, it, expect } from 'vitest';
import { matchesSearch, applyFilters, type ChipFilters } from '../transactionSearch';
import type { Transaction } from '../../types';

const t = (description: string, notes?: string | null): Transaction => ({
  id: 1, card_id: 1, cardId: 1, amount: -10, description,
  category: 'Food', date: '2026-04-01', source: 'plaid', notes
});

describe('matchesSearch', () => {
  it('matches description case-insensitively', () => {
    expect(matchesSearch(t('Coffee Shop'), 'coffee')).toBe(true);
    expect(matchesSearch(t('Coffee Shop'), 'TEA')).toBe(false);
  });

  it('matches inside the notes field too', () => {
    expect(matchesSearch(t('UBER 4421', 'ride home from airport'), 'airport')).toBe(true);
    expect(matchesSearch(t('UBER 4421', null), 'airport')).toBe(false);
  });

  it('returns true for empty / whitespace queries (no filter)', () => {
    expect(matchesSearch(t('Coffee'), '')).toBe(true);
    expect(matchesSearch(t('Coffee'), '   ')).toBe(true);
  });
});

const mk = (extra: Partial<Transaction>): Transaction => ({
  id: extra.id ?? 1, card_id: 1, cardId: 1, amount: -10,
  description: 'COFFEE', category: 'Food', date: '2026-04-01', source: 'plaid',
  ...extra
});

describe('applyFilters', () => {
  const all = [
    mk({ id: 1, amount: -10, category: 'Food', cardId: 1, pending: 0 }),
    mk({ id: 2, amount: -200, category: 'Bills', cardId: 2, pending: 0 }),
    mk({ id: 3, amount: -10, category: 'Food', cardId: 1, pending: 1 }),
    mk({ id: 4, amount: 50, category: 'Income', cardId: 1, pending: 0 })
  ];

  it('filters by category', () => {
    const out = applyFilters(all, { query: '', category: 'Food' } as ChipFilters);
    expect(out.map(t => t.id).sort()).toEqual([1, 3]);
  });

  it('filters by card', () => {
    const out = applyFilters(all, { query: '', cardId: 2 } as ChipFilters);
    expect(out.map(t => t.id)).toEqual([2]);
  });

  it('filters to pending only', () => {
    const out = applyFilters(all, { query: '', pendingOnly: true } as ChipFilters);
    expect(out.map(t => t.id)).toEqual([3]);
  });

  it('filters by absolute amount range', () => {
    const out = applyFilters(all, { query: '', minAmount: 50, maxAmount: 250 } as ChipFilters);
    // |amount| in [50,250] → 200 and 50.
    expect(out.map(t => t.id).sort()).toEqual([2, 4]);
  });

  it('combines all filters (AND)', () => {
    const out = applyFilters(all, {
      query: 'coffee', category: 'Food', cardId: 1, pendingOnly: false
    } as ChipFilters);
    expect(out.map(t => t.id).sort()).toEqual([1, 3]);
  });
});
