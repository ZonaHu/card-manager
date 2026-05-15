import { describe, it, expect } from 'vitest';
import { computeBreakdown } from '../netWorthBreakdown';
import type { Card } from '../../types';

const card = (overrides: Partial<Card> & { id: number; category?: string; type?: string }): Card => ({
  id: overrides.id,
  name: overrides.name ?? `Card ${overrides.id}`,
  type: overrides.type ?? 'debit',
  last_four: '0001',
  balance: 0,
  currency: 'CAD',
  connected: true,
  category: overrides.category ?? 'chequing'
});

describe('computeBreakdown', () => {
  it('groups assets vs liabilities and shares sum to 1', () => {
    const cards: Card[] = [
      card({ id: 1, category: 'chequing' }),
      card({ id: 2, category: 'tfsa' }),
      card({ id: 3, category: 'credit', type: 'credit' })
    ];
    const byCard = { 1: 1000, 2: 5000, 3: 2000 }; // CC balance 2000 = $2000 debt
    const r = computeBreakdown(cards, byCard);

    expect(r.totalAssets).toBe(6000);
    expect(r.totalLiabilities).toBe(2000);
    expect(r.netWorth).toBe(4000);
    expect(r.gross).toBe(8000);

    const sum = r.entries.reduce((s, e) => s + e.share, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it('sorts assets first (largest → smallest), then liabilities', () => {
    const cards: Card[] = [
      card({ id: 1, name: 'Small chequing', category: 'chequing' }),
      card({ id: 2, name: 'Big TFSA', category: 'tfsa' }),
      card({ id: 3, name: 'CC', category: 'credit', type: 'credit' })
    ];
    const r = computeBreakdown(cards, { 1: 500, 2: 10000, 3: 800 });
    expect(r.entries.map(e => e.name)).toEqual(['Big TFSA', 'Small chequing', 'CC']);
  });

  it('marks credit cards as liabilities with negative balance', () => {
    const cards: Card[] = [card({ id: 1, category: 'credit', type: 'credit' })];
    const r = computeBreakdown(cards, { 1: 1500 });
    expect(r.entries[0].kind).toBe('liability');
    expect(r.entries[0].balance).toBe(-1500);
    expect(r.entries[0].share).toBe(1);
  });

  it('skips cards missing from the byCard map', () => {
    const cards: Card[] = [
      card({ id: 1, category: 'chequing' }),
      card({ id: 99, category: 'savings' })
    ];
    const r = computeBreakdown(cards, { 1: 500 });
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0].card_id).toBe(1);
  });

  it('returns share=0 when gross is zero (all empty accounts)', () => {
    const cards: Card[] = [card({ id: 1, category: 'chequing' })];
    const r = computeBreakdown(cards, { 1: 0 });
    expect(r.entries[0].share).toBe(0);
    expect(r.gross).toBe(0);
  });
});
