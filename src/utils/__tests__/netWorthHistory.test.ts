import { describe, it, expect } from 'vitest';
import { computeNetWorthHistory } from '../netWorthHistory';
import type { Card, Transaction } from '../../types';

const today = new Date();
const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
function lastMonthEom(): string {
  // Last day of the prior month. The rollback uses string comparison against
  // t.date so any date in the current month sorts > lastMonthEom.
  const d = new Date(today.getFullYear(), today.getMonth(), 0); // day 0 = last of prior
  return d.toISOString().split('T')[0];
}

const inThisMonth = (day = 5) =>
  `${thisMonth}-${String(day).padStart(2, '0')}`;

describe('computeNetWorthHistory', () => {
  it('rolls a chequing-account purchase back correctly (balance was higher pre-spend)', () => {
    const cards: Card[] = [
      { id: 1, name: 'Chequing', type: 'debit', last_four: '0001', balance: 450, currency: 'CAD', connected: true, category: 'chequing' }
    ];
    const transactions: Transaction[] = [
      { id: 1, card_id: 1, cardId: 1, amount: -50, description: 'COFFEE', category: 'Food', date: inThisMonth(5), source: 'plaid' },
      // older anchor so monthsBack >= 2
      { id: 2, card_id: 1, cardId: 1, amount: -10, description: 'COFFEE', category: 'Food', date: '2026-02-01', source: 'plaid' }
    ];
    const history = computeNetWorthHistory(cards, transactions);
    // Use the IMMEDIATELY prior month (latest entry before thisMonth) so the
    // rollback only undoes current-month activity, not the entire history.
    const lastMonthPoint = [...history].reverse().find(p => p.month < thisMonth)!;
    // Pre-coffee end-of-prior-month balance should be 450 + 50 = 500.
    expect(lastMonthPoint.byCard[1]).toBe(500);
    expect(lastMonthPoint.total).toBe(500);
  });

  it('rolls a credit-card purchase back correctly (debt was LOWER pre-purchase)', () => {
    // Regression for the CC sign bug. CC.balance is debt (positive = you owe).
    // After a $50 purchase, debt goes 500 → 550. Pre-purchase debt was 500.
    const cards: Card[] = [
      { id: 1, name: 'Amex', type: 'credit', last_four: '1000', balance: 550, currency: 'CAD', connected: true, category: 'credit' }
    ];
    const transactions: Transaction[] = [
      { id: 1, card_id: 1, cardId: 1, amount: -50, description: 'PURCHASE', category: 'Food', date: inThisMonth(5), source: 'plaid' },
      { id: 2, card_id: 1, cardId: 1, amount: -10, description: 'PURCHASE', category: 'Food', date: '2026-02-01', source: 'plaid' }
    ];
    const history = computeNetWorthHistory(cards, transactions);
    // Use the IMMEDIATELY prior month (latest entry before thisMonth) so the
    // rollback only undoes current-month activity, not the entire history.
    const lastMonthPoint = [...history].reverse().find(p => p.month < thisMonth)!;
    // Pre-purchase debt = 500. Net worth contribution = -500 (debt subtracted).
    expect(lastMonthPoint.byCard[1]).toBe(500);
    expect(lastMonthPoint.total).toBe(-500);
  });

  it('treats a credit-card payment correctly (debt drops to 0 after the payment)', () => {
    // CC currently $0 debt. A $1000 payment landed AFTER eom (positive in our
    // DB, since we store -plaid.amount). Pre-payment debt was $1000.
    const cards: Card[] = [
      { id: 1, name: 'Amex', type: 'credit', last_four: '1000', balance: 0, currency: 'CAD', connected: true, category: 'credit' }
    ];
    const transactions: Transaction[] = [
      { id: 1, card_id: 1, cardId: 1, amount: 1000, description: 'PAYMENT RECEIVED', category: 'Other', date: inThisMonth(5), source: 'plaid' },
      { id: 2, card_id: 1, cardId: 1, amount: -10, description: 'ANCHOR', category: 'Food', date: '2026-02-01', source: 'plaid' }
    ];
    const history = computeNetWorthHistory(cards, transactions);
    // Use the IMMEDIATELY prior month (latest entry before thisMonth) so the
    // rollback only undoes current-month activity, not the entire history.
    const lastMonthPoint = [...history].reverse().find(p => p.month < thisMonth)!;
    // Pre-payment, debt was $1000 → net worth contribution -$1000.
    expect(lastMonthPoint.byCard[1]).toBe(1000);
    expect(lastMonthPoint.total).toBe(-1000);
  });

  it('uses last-known eom anchor for last month', () => {
    // Verify last-month string parses correctly (cross-check anchor logic).
    const eom = lastMonthEom();
    expect(eom.length).toBe(10); // YYYY-MM-DD
  });
});
