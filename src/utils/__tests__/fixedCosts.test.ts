import { describe, it, expect } from 'vitest';
import { isFixedCost, summarizeFixedCosts } from '../fixedCosts';
import type { Transaction } from '../../types';

let id = 0;
function tx(date: string, amount: number, description: string, category = 'Bills'): Transaction {
  return { id: ++id, card_id: 1, cardId: 1, amount, description, category, date, source: 'plaid' };
}

describe('isFixedCost', () => {
  it('matches known rent / utility / telecom vendors', () => {
    expect(isFixedCost(tx('2026-04-01', -1526.25, 'CHEXY RENT'))).toBe(true);
    expect(isFixedCost(tx('2026-04-09', -229.72, 'Metergy/Ez-Pay - Purchase'))).toBe(true);
    expect(isFixedCost(tx('2026-04-08', -62.15, 'Bell Canada (Ob) - Purchase'))).toBe(true);
    expect(isFixedCost(tx('2026-04-22', -28.08, 'FIDO MOBILE BPY'))).toBe(true);
  });

  it('does not match unrelated negatives', () => {
    expect(isFixedCost(tx('2026-04-01', -50, 'COFFEE'))).toBe(false);
    expect(isFixedCost(tx('2026-04-01', -50, 'PAYROLL'))).toBe(false);
  });

  it('does not match positive amounts (refund/income)', () => {
    expect(isFixedCost(tx('2026-04-01', 1526.25, 'CHEXY RENT REFUND'))).toBe(false);
  });
});

describe('summarizeFixedCosts', () => {
  it('rolls up current and prior month per vendor and computes deltas', () => {
    const r = summarizeFixedCosts([
      tx('2026-04-01', -1526.25, 'CHEXY RENT'),
      tx('2026-03-27', -1526.25, 'CHEXY RENT'),
      tx('2026-04-09', -229.72, 'Metergy/Ez-Pay - Purchase'),
      tx('2026-02-14', -2.10, 'Metergy/Ez-Pay Fee - Purchase'),  // outside window
      tx('2026-04-08', -62.15, 'Bell Canada (Ob) - Purchase'),
      tx('2026-03-06', -62.15, 'Bell Canada (Ob) - Purchase'),
      tx('2026-04-22', -28.08, 'FIDO MOBILE BPY'),
      tx('2026-04-10', -50, 'COFFEE')   // ignored — not a fixed cost
    ], '2026-04');

    const rent = r.entries.find(e => e.label === 'Chexy (Rent)')!;
    expect(rent.currentAmount).toBe(1526.25);
    expect(rent.priorAmount).toBe(1526.25);
    expect(rent.delta).toBe(0);

    const utilities = r.entries.find(e => e.label === 'Metergy (Utilities)')!;
    expect(utilities.currentAmount).toBe(229.72);
    expect(utilities.priorAmount).toBe(0); // Feb is two months prior, not counted

    const bell = r.entries.find(e => e.label === 'Bell (Internet)')!;
    expect(bell.delta).toBe(0);

    expect(r.currentTotal).toBeCloseTo(1526.25 + 229.72 + 62.15 + 28.08);
    // entries sorted by currentAmount desc → rent first
    expect(r.entries[0].label).toBe('Chexy (Rent)');
  });

  it('handles January → previous-year December for the prior-month lookup', () => {
    const r = summarizeFixedCosts([
      tx('2026-01-01', -1500, 'CHEXY RENT'),
      tx('2025-12-01', -1500, 'CHEXY RENT')
    ], '2026-01');
    const rent = r.entries.find(e => e.label === 'Chexy (Rent)')!;
    expect(rent.currentAmount).toBe(1500);
    expect(rent.priorAmount).toBe(1500);
  });
});
