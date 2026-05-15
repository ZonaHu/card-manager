import { describe, it, expect } from 'vitest';
import { detectRecurringTransactions } from '../recurringDetection';
import { isFixedCost } from '../fixedCosts';
import type { Transaction } from '../../types';

let idCounter = 0;
function tx(date: string, amount: number, description: string, category = 'Entertainment'): Transaction {
  return {
    id: ++idCounter,
    card_id: 1,
    cardId: 1,
    amount,
    description,
    category,
    date,
    source: 'plaid'
  };
}

describe('detectRecurringTransactions', () => {
  it('identifies a monthly subscription with stable amount and ~30-day cadence', () => {
    const txs = [
      tx('2026-02-15', -9.99, 'NETFLIX 4827'),
      tx('2026-03-15', -9.99, 'NETFLIX 9182'),
      tx('2026-04-15', -9.99, 'NETFLIX 3344')
    ];
    const result = detectRecurringTransactions(txs);
    expect(result).toHaveLength(1);
    expect(result[0].description).toMatch(/NETFLIX/);
    expect(result[0].occurrences).toBe(3);
    expect(result[0].amount).toBeCloseTo(9.99);
    expect(result[0].averageIntervalDays).toBeGreaterThanOrEqual(28);
    expect(result[0].averageIntervalDays).toBeLessThanOrEqual(32);
  });

  it('merges $10 and $11 into one recurring when both occur monthly', () => {
    const txs = [
      tx('2026-02-15', -10, 'NETFLIX'),
      tx('2026-03-15', -10, 'NETFLIX'),
      tx('2026-04-15', -11, 'NETFLIX'),
      tx('2026-05-15', -11, 'NETFLIX')
    ];
    const r = detectRecurringTransactions(txs);
    expect(r).toHaveLength(1);
    expect(r[0].minAmount).toBe(10);
    expect(r[0].maxAmount).toBe(11);
  });

  it('rejects bursty same-week occurrences (not 30-day cadence)', () => {
    const txs = [
      tx('2026-04-01', -10, 'COFFEE'),
      tx('2026-04-03', -10, 'COFFEE'),
      tx('2026-04-05', -10, 'COFFEE')
    ];
    expect(detectRecurringTransactions(txs)).toHaveLength(0);
  });

  it('ignores groups under MIN_OCCURRENCES (3)', () => {
    const txs = [
      tx('2026-03-15', -9.99, 'DISNEY+ 1'),
      tx('2026-04-15', -9.99, 'DISNEY+ 2')
    ];
    expect(detectRecurringTransactions(txs)).toHaveLength(0);
  });

  it('ignores positive amounts (income, refunds)', () => {
    const txs = [
      tx('2026-02-01', 1000, 'PAYROLL 1', 'Income'),
      tx('2026-03-01', 1000, 'PAYROLL 2', 'Income'),
      tx('2026-04-01', 1000, 'PAYROLL 3', 'Income')
    ];
    expect(detectRecurringTransactions(txs)).toHaveLength(0);
  });

  it('orders results by total spend impact (amount × occurrences)', () => {
    const txs = [
      ...['2026-02-15', '2026-03-15', '2026-04-15'].map(d => tx(d, -5, 'SMALL SUB')),
      ...['2026-02-15', '2026-03-15', '2026-04-15'].map(d => tx(d, -50, 'BIG SUB'))
    ];
    const result = detectRecurringTransactions(txs);
    expect(result[0].description).toContain('BIG');
    expect(result[1].description).toContain('SMALL');
  });

  it('exposes isFixedCost so callers can dedupe against the FixedCosts panel', () => {
    // Sanity check — the import resolves and the helper recognises a Chexy
    // rent row. The actual filtering happens at the component layer.
    expect(isFixedCost({
      id: 1, card_id: 1, cardId: 1, amount: -1500, description: 'CHEXY RENT',
      category: 'Bills', date: '2026-04-01', source: 'plaid'
    } as any)).toBe(true);
  });
});
