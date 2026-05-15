import { describe, it, expect } from 'vitest';
import { matchesSearch } from '../transactionSearch';
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
