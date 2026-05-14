import { describe, it, expect } from 'vitest';
import { findCrossMonthRefunds } from '../refundCrossMonth';
import type { Transaction } from '../../types';

const t = (id: number, cardId: number, date: string, amount: number, description: string): Transaction => ({
  id, card_id: cardId, cardId, amount, description, category: 'Travel', date, source: 'plaid'
});

describe('findCrossMonthRefunds', () => {
  it('links an April refund to a March purchase on the same card', () => {
    const r = findCrossMonthRefunds([
      t(1, 10, '2026-03-15', -100, 'Shop Purchase'),
      t(2, 10, '2026-04-02', 100, 'Shop Refund')
    ]);
    expect(r).toEqual([{ refundId: 2, purchaseId: 1, purchaseMonth: '2026-03' }]);
  });

  it('does not link when refund is in the same month', () => {
    const r = findCrossMonthRefunds([
      t(1, 10, '2026-04-01', -100, 'Shop Purchase'),
      t(2, 10, '2026-04-15', 100, 'Shop Refund')
    ]);
    expect(r).toEqual([]);
  });

  it('ignores refunds without a matching purchase amount on the same card', () => {
    const r = findCrossMonthRefunds([
      t(1, 10, '2026-03-15', -50, 'Shop Purchase'),
      t(2, 11, '2026-04-02', 50, 'Shop Refund') // different card
    ]);
    expect(r).toEqual([]);
  });

  it('ignores positive amounts that are not refunds (income)', () => {
    const r = findCrossMonthRefunds([
      t(1, 10, '2026-03-15', -1000, 'Some Purchase'),
      t(2, 10, '2026-04-02', 1000, 'PAYROLL')
    ]);
    expect(r).toEqual([]);
  });
});
