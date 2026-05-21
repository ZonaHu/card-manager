import { describe, it, expect } from 'vitest';
import { computeMonthlyComparison } from '../monthlyComparison';
import type { Card, Transaction } from '../../types';

const cards: Card[] = [
  { id: 1, name: 'checking', type: 'debit', last_four: '0001', balance: 0, connected: true, category: 'chequing' }
];

let idCounter = 0;
function tx(date: string, amount: number): Transaction {
  return {
    id: ++idCounter,
    card_id: 1,
    cardId: 1,
    amount,
    description: 'GROCERY',
    category: 'Food',
    date,
    source: 'manual'
  };
}

describe('computeMonthlyComparison', () => {
  it('returns correct spending for each window', () => {
    const txs = [
      tx('2025-04-10', -50),    // prevYear
      tx('2026-03-10', -100),   // prevMonth
      tx('2026-04-10', -200),   // current
      tx('2026-04-15', -50)     // current
    ];
    const r = computeMonthlyComparison(txs, cards, '2026-04');
    expect(r.current.spending).toBe(250);
    expect(r.prevMonth.spending).toBe(100);
    expect(r.prevYear.spending).toBe(50);
  });

  it('reports MoM as +150% when spend goes from $100 to $250', () => {
    const txs = [
      tx('2026-03-10', -100),
      tx('2026-04-10', -250)
    ];
    const r = computeMonthlyComparison(txs, cards, '2026-04');
    expect(r.momPct).toBeCloseTo(150);
  });

  it('reports null momPct when baseline is zero', () => {
    const txs = [tx('2026-04-10', -100)];
    const r = computeMonthlyComparison(txs, cards, '2026-04');
    expect(r.momPct).toBeNull();
    expect(r.yoyPct).toBeNull();
  });

  it('wraps January correctly: comparing Jan 2026 reads Dec 2025 and Jan 2025', () => {
    const txs = [
      tx('2025-01-10', -10),
      tx('2025-12-10', -20),
      tx('2026-01-10', -30)
    ];
    const r = computeMonthlyComparison(txs, cards, '2026-01');
    expect(r.prevMonth.month).toBe('2025-12');
    expect(r.prevYear.month).toBe('2025-01');
    expect(r.prevMonth.spending).toBe(20);
    expect(r.prevYear.spending).toBe(10);
  });
});
