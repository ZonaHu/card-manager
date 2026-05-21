import { describe, it, expect } from 'vitest';
import { calculateMonthlyData } from '../spendCalculation';
import type { Card, Transaction } from '../../types';

// Test fixtures. Keep them realistic so failures are easier to diagnose.
const cards: Card[] = [
  { id: 1, name: 'BMO checking', type: 'debit', last_four: '7852', balance: 1000, currency: 'CAD', connected: true, category: 'chequing', institution_name: 'BMO' },
  { id: 2, name: 'BMO savings', type: 'debit', last_four: '4853', balance: 500, currency: 'CAD', connected: true, category: 'savings', institution_name: 'BMO' },
  { id: 3, name: 'Amex', type: 'credit', last_four: '1000', balance: 0, currency: 'CAD', connected: true, category: 'credit', institution_name: 'Amex' },
  { id: 4, name: 'CIBC brokerage', type: 'debit', last_four: '8444', balance: 0, currency: 'CAD', connected: true, category: 'investment', institution_name: 'CIBC' }
];

let idCounter = 0;
function tx(partial: Partial<Transaction> & { amount: number; date: string; cardId: number }): Transaction {
  return {
    id: ++idCounter,
    card_id: partial.cardId,
    cardId: partial.cardId,
    amount: partial.amount,
    description: partial.description ?? '',
    category: partial.category ?? 'Shopping',
    date: partial.date,
    source: 'plaid'
  };
}

function calc(transactions: Transaction[]) {
  return calculateMonthlyData({
    transactions,
    cards,
    currentMonth: '2026-04',
    transactionFilter: 'all',
    transactionSort: 'newest'
  });
}

describe('calculateMonthlyData', () => {
  it('counts straightforward credit-card spending under creditCardSpending', () => {
    const r = calc([
      tx({ cardId: 3, amount: -50, date: '2026-04-05', description: 'COFFEE' })
    ]);
    expect(r.creditCardSpending).toBe(50);
    expect(r.depositAccountSpending).toBe(0);
    expect(r.spending).toBe(50);
  });

  it('counts straightforward deposit-account spending under depositAccountSpending', () => {
    const r = calc([
      tx({ cardId: 1, amount: -25, date: '2026-04-05', description: 'GROCERY' })
    ]);
    expect(r.depositAccountSpending).toBe(25);
    expect(r.depositAccountCashOutflow).toBe(25);
  });

  it('excludes a credit-card payment matched by amount+date from spending', () => {
    // Deposit outflow $500 + matching Amex payment received $500 within 5 days = CC payment.
    const r = calc([
      tx({ cardId: 1, amount: -500, date: '2026-04-05', description: 'AMEX CARDS' }),
      tx({ cardId: 3, amount: 500, date: '2026-04-06', description: 'PAYMENT RECEIVED' })
    ]);
    expect(r.depositAccountSpending).toBe(0);
    expect(r.depositAccountCashOutflow).toBe(0);
    expect(r.spending).toBe(0);
  });

  it('tolerates small amount drift across banks (FX/rounding)', () => {
    // Outflow $1118.62, inflow $1118.66 — diff $0.04. Old $0.01 tolerance would miss.
    const r = calc([
      tx({ cardId: 1, amount: -1118.62, date: '2026-04-05', description: 'AMEX CARDS' }),
      tx({ cardId: 3, amount: 1118.66, date: '2026-04-06', description: 'PAYMENT RECEIVED' })
    ]);
    expect(r.depositAccountSpending).toBe(0);
  });

  it('excludes deposit-to-deposit internal transfers (both sides)', () => {
    // Money moves from savings to checking on the same day. Both sides reported by Plaid.
    const r = calc([
      tx({ cardId: 2, amount: -200, date: '2026-04-05', description: 'TRANSFER' }),
      tx({ cardId: 1, amount: 200, date: '2026-04-05', description: 'TRANSFER IN' })
    ]);
    expect(r.depositAccountSpending).toBe(0);
    expect(r.depositAccountCashOutflow).toBe(0);
    expect(r.income).toBe(0); // 'transfer' keyword keeps the inflow out of income too
  });

  it('does NOT cross-match a same-card $100 inflow with an unrelated $100 outflow', () => {
    // Same checking account: $100 transfer in + $100 purchase. The purchase
    // must still count as spending — only DIFFERENT-card pairs are transfers.
    const r = calc([
      tx({ cardId: 1, amount: 100, date: '2026-04-05', description: 'TRANSFER IN' }),
      tx({ cardId: 1, amount: -100, date: '2026-04-05', description: '880 BAY STREET', category: 'Shopping' })
    ]);
    expect(r.depositAccountSpending).toBe(100);
  });

  it('treats positive credit-card amounts as payments, not income', () => {
    const r = calc([
      tx({ cardId: 3, amount: 500, date: '2026-04-05', description: 'PAYMENT RECEIVED' })
    ]);
    expect(r.income).toBe(0);
  });

  it("trusts Plaid's Income category even with a 'payment' keyword in the description", () => {
    // Reimbursement labeled 'Payment for services' but Plaid says it's income.
    const r = calc([
      tx({ cardId: 1, amount: 1200, date: '2026-04-05', description: 'Payment for services', category: 'Income' })
    ]);
    expect(r.income).toBe(1200);
  });

  it('filters out non-Income positive amounts whose description hints at transfer', () => {
    const r = calc([
      tx({ cardId: 1, amount: 200, date: '2026-04-05', description: 'TRANSFER IN', category: 'Other' })
    ]);
    expect(r.income).toBe(0);
  });

  it('catches CC-payment by description when receiving side is unsynced', () => {
    // BMO checking marks "AMEX CARDS" without payment-keyword in desc.
    // No matching positive on a credit card (out of sync window) — must still exclude.
    const r = calc([
      tx({ cardId: 1, amount: -1526.25, date: '2026-04-06', description: '[CW]AMEX CARDS' })
    ]);
    expect(r.depositAccountSpending).toBe(0);
  });

  it('excludes investment contributions from spending', () => {
    const r = calc([
      tx({ cardId: 1, amount: -3000, date: '2026-04-05', description: 'PREAUTHORIZED DEBIT Wealthsimple Investments Inc.', category: 'Other' })
    ]);
    expect(r.depositAccountSpending).toBe(0);
    expect(r.depositAccountCashOutflow).toBe(0);
  });

  it('respects the transactionFilter and sort options', () => {
    const data = calc([
      tx({ cardId: 1, amount: -10, date: '2026-04-01', category: 'Food' }),
      tx({ cardId: 1, amount: -20, date: '2026-04-02', category: 'Shopping' }),
      tx({ cardId: 1, amount: -30, date: '2026-04-03', category: 'Food' })
    ]);
    expect(data.transactions).toHaveLength(3);

    const foodOnly = calculateMonthlyData({
      transactions: [
        tx({ cardId: 1, amount: -10, date: '2026-04-01', category: 'Food' }),
        tx({ cardId: 1, amount: -20, date: '2026-04-02', category: 'Shopping' }),
        tx({ cardId: 1, amount: -30, date: '2026-04-03', category: 'Food' })
      ],
      cards,
      currentMonth: '2026-04',
      transactionFilter: 'Food',
      transactionSort: 'oldest'
    });
    expect(foodOnly.transactions.map(t => t.category)).toEqual(['Food', 'Food']);
    expect(foodOnly.transactions[0].date < foodOnly.transactions[1].date).toBe(true);
  });

  it('filters by the requested currentMonth only', () => {
    const r = calc([
      tx({ cardId: 1, amount: -10, date: '2026-04-30' }),
      tx({ cardId: 1, amount: -20, date: '2026-05-01' })
    ]);
    expect(r.transactions).toHaveLength(1);
    expect(r.depositAccountSpending).toBe(10);
  });

  it('washes same-card same-day fee + rebate pairs sharing a bracket code', () => {
    // BMO posts the monthly fee and matching rebate on the same day. Net zero.
    const r = calc([
      tx({ cardId: 1, amount: -30.95, date: '2026-04-30', description: '[SC]PREMIUM PLAN', category: 'Bills' }),
      tx({ cardId: 1, amount: 30.95, date: '2026-04-30', description: '[SC]FULL PLAN FEE REBATE', category: 'Bills' })
    ]);
    expect(r.depositAccountSpending).toBe(0);
    expect(r.depositAccountCashOutflow).toBe(0);
    expect(r.income).toBe(0);
  });

  it('washes a pair signaled by the rebate keyword even without a bracket code', () => {
    const r = calc([
      tx({ cardId: 1, amount: -15, date: '2026-04-15', description: 'OVERDRAFT FEE', category: 'Bills' }),
      tx({ cardId: 1, amount: 15, date: '2026-04-15', description: 'OVERDRAFT FEE REVERSAL', category: 'Bills' })
    ]);
    expect(r.depositAccountSpending).toBe(0);
    expect(r.income).toBe(0);
  });

  it('does NOT wash an unrelated same-amount pair without bracket code or rebate keyword', () => {
    // A $30 purchase + a $30 paycheque tip on the same day should not collapse.
    const r = calc([
      tx({ cardId: 1, amount: -30, date: '2026-04-10', description: 'GROCERY', category: 'Food' }),
      tx({ cardId: 1, amount: 30, date: '2026-04-10', description: 'TIP', category: 'Income' })
    ]);
    expect(r.depositAccountSpending).toBe(30);
    expect(r.income).toBe(30);
  });

  it('treats generic "Transfer out" from a checking account as internal when an investment sibling exists at the same institution', () => {
    // Plaid only returns investment activity through a separate API, so the
    // receiving TFSA/RRSP/brokerage account has no matching positive in our
    // transaction feed. Without this rule, the outflow would be counted as spending.
    const wsCards: Card[] = [
      { id: 10, name: 'Wealthsimple checking', type: 'debit', last_four: '1095', balance: 1000, currency: 'CAD', connected: true, category: 'chequing', institution_name: 'Wealthsimple (Canada)' },
      { id: 11, name: 'Wealthsimple TFSA', type: 'debit', last_four: 'KQK6', balance: 50000, currency: 'CAD', connected: true, category: 'tfsa', institution_name: 'Wealthsimple (Canada)' }
    ];
    const r = calculateMonthlyData({
      transactions: [{
        id: 1, card_id: 10, cardId: 10, amount: -5000,
        description: 'Transfer out', category: 'Other', date: '2026-04-27', source: 'plaid'
      }],
      cards: wsCards,
      currentMonth: '2026-04',
      transactionFilter: 'all',
      transactionSort: 'newest'
    });
    expect(r.depositAccountSpending).toBe(0);
  });

  it('counts "Transfer out" as spending when there is no investment sibling at the same institution', () => {
    const r = calc([
      tx({ cardId: 1, amount: -500, date: '2026-04-15', description: 'Transfer out', category: 'Other' })
    ]);
    // BMO has no investment-category card in the fixture, so we can't safely
    // assume it's internal. Counts as spend.
    expect(r.depositAccountSpending).toBe(500);
  });

  it('offsets a credit-card refund against creditCardSpending', () => {
    // $191.22 purchase + $184.78 refund (partial) → net $6.44 spend on the card.
    const r = calc([
      tx({ cardId: 3, amount: -191.22, date: '2026-04-17', description: 'Actionoutdoorsholidays - Purchase', category: 'Travel' }),
      tx({ cardId: 3, amount: 184.78, date: '2026-04-20', description: 'Actionoutdoorsholidays - Refund', category: 'Travel' })
    ]);
    expect(r.creditCardSpending).toBeCloseTo(6.44, 2);
    expect(r.spending).toBeCloseTo(6.44, 2);
    expect(r.income).toBe(0);
  });

  it('offsets a deposit-card refund against depositAccountSpending', () => {
    const r = calc([
      tx({ cardId: 1, amount: -50, date: '2026-04-01', description: 'BIG STORE Purchase', category: 'Shopping' }),
      tx({ cardId: 1, amount: 20, date: '2026-04-02', description: 'BIG STORE Refund', category: 'Shopping' })
    ]);
    expect(r.depositAccountSpending).toBe(30);
    expect(r.depositAccountCashOutflow).toBe(30);
  });

  it('still ignores plain credit-card payment positives (no refund keyword)', () => {
    const r = calc([
      tx({ cardId: 3, amount: 500, date: '2026-04-05', description: 'PAYMENT RECEIVED - THANK YOU', category: 'Bills' })
    ]);
    expect(r.creditCardSpending).toBe(0);
    expect(r.income).toBe(0);
  });

  it('excludes pending transactions from spend and income', () => {
    const r = calc([
      tx({ cardId: 1, amount: -50, date: '2026-04-10', description: 'COFFEE', category: 'Food' }),
      { id: 999, card_id: 1, cardId: 1, amount: -100, description: 'PENDING THING', category: 'Food', date: '2026-04-11', source: 'plaid', pending: 1 } as any
    ]);
    expect(r.depositAccountSpending).toBe(50);
  });

  it('excludes any transaction explicitly tagged with the "Transfer" category', () => {
    // User-controlled marker for inter-account moves we cannot auto-detect
    // (e.g. BMO bank draft deposited into TD branch a few days later).
    const r = calc([
      tx({ cardId: 1, amount: -8000, date: '2026-04-08', description: '[DM]0442 DRAFT 020748373', category: 'Transfer' }),
      tx({ cardId: 1, amount: -50, date: '2026-04-09', description: 'COFFEE', category: 'Food' })
    ]);
    expect(r.depositAccountSpending).toBe(50);   // coffee only
    expect(r.depositAccountCashOutflow).toBe(50);
  });

  it('routes e-Transfers into their own bucket and out of spending/income', () => {
    const r = calc([
      tx({ cardId: 1, amount: 200, date: '2026-04-10', description: 'INTERAC E-TRANSFER RECEIVE Foo', category: 'Other' }),
      tx({ cardId: 1, amount: -50, date: '2026-04-11', description: 'INTERAC E-TRANSFER SEND Bar', category: 'Other' }),
      tx({ cardId: 1, amount: -30, date: '2026-04-12', description: 'COFFEE', category: 'Food' })
    ]);
    expect(r.eTransfersIn).toBe(200);
    expect(r.eTransfersOut).toBe(50);
    expect(r.depositAccountSpending).toBe(30); // coffee only, no e-transfer pollution
    expect(r.income).toBe(0);
  });

  it('subtracts a linked reimbursement from the original purchase spending', () => {
    // $100 dinner on credit card; friend later e-transfers $40 with reimburses_id linked.
    const dinner = tx({ cardId: 3, amount: -100, date: '2026-04-05', description: 'DINNER', category: 'Food' });
    const reimbursement = tx({ cardId: 1, amount: 40, date: '2026-04-08', description: 'INTERAC E-TRANSFER RECEIVE Friend', category: 'Other' });
    (reimbursement as any).reimburses_id = dinner.id;
    const r = calc([dinner, reimbursement]);
    expect(r.creditCardSpending).toBe(60);   // 100 - 40
    expect(r.eTransfersIn).toBe(0);          // reimbursement isn't double-counted in e-transfer either
    expect(r.income).toBe(0);
    expect(r.reimbursementsApplied).toBe(40);
  });

  it('does NOT credit a cross-month reimbursement against the previous-month spending headline', () => {
    // Reimbursing an April purchase in May. May's currentMonth filter excludes
    // the April purchase, so May's spending headline shouldn't drop AND
    // reimbursementsApplied shouldn't claim a reduction that didn't happen.
    const purchaseApr = tx({ cardId: 3, amount: -100, date: '2026-03-31', description: 'DINNER', category: 'Food' });
    const reimburseMay = tx({ cardId: 1, amount: 40, date: '2026-04-12', description: 'PAYBACK', category: 'Other' });
    (reimburseMay as any).reimburses_id = purchaseApr.id;
    const r = calc([purchaseApr, reimburseMay]);
    expect(r.depositAccountSpending).toBe(0);     // no in-month purchase to bite against
    expect(r.creditCardSpending).toBe(0);
    expect(r.reimbursementsApplied).toBe(0);      // headline must match
  });

  it('byCategory reconciles with the Spending headline — excludes Transfer/wash/e-Transfer/pending rows', () => {
    // Without the fix: byCategory would sum every negative row regardless of
    // whether it actually contributed to Spending. Verified by mixing rows
    // that the spending calc excludes vs counts.
    const pendingRow = tx({ cardId: 1, amount: -20, date: '2026-04-08', description: 'PENDING COFFEE', category: 'Food' });
    (pendingRow as any).pending = 1;
    const r = calc([
      tx({ cardId: 1, amount: -50, date: '2026-04-05', description: 'COFFEE', category: 'Food' }),                       // counts
      tx({ cardId: 1, amount: -100, date: '2026-04-06', description: 'Transfer to savings', category: 'Transfer' }),     // excluded (Transfer category)
      tx({ cardId: 1, amount: -30, date: '2026-04-07', description: 'INTERAC E-TRANSFER SEND Foo', category: 'Other' }), // excluded (e-Transfer)
      pendingRow,                                                                                                         // excluded (pending)
    ]);
    const sumOfCategories = Object.values(r.byCategory).reduce((s, v) => s + v, 0);
    expect(sumOfCategories).toBeCloseTo(r.spending, 2);
    expect(r.byCategory.Food).toBe(50);                   // only the unfiltered coffee
    expect(r.byCategory.Transfer).toBeUndefined();         // Transfer row was skipped
  });

  it('refund-via-Interac reduces spending instead of inflating eTransfersIn', () => {
    // Lyft-style: a refund issued through an e-Transfer should NET the
    // original purchase, not show up as "you received money" income.
    const r = calc([
      tx({ cardId: 3, amount: -50, date: '2026-04-10', description: 'LYFT ride', category: 'Transport' }),
      tx({ cardId: 3, amount: 50, date: '2026-04-12', description: 'INTERAC E-TRANSFER LYFT Refund', category: 'Transport' })
    ]);
    expect(r.creditCardSpending).toBe(0);   // refund subtracts purchase
    expect(r.eTransfersIn).toBe(0);          // NOT inflated by the refund
  });

  it('never lets a reimbursement push spending below zero', () => {
    const dinner = tx({ cardId: 3, amount: -20, date: '2026-04-05', description: 'DINNER', category: 'Food' });
    const reimbursement = tx({ cardId: 1, amount: 50, date: '2026-04-08', description: 'PAYBACK', category: 'Other' });
    (reimbursement as any).reimburses_id = dinner.id;
    const r = calc([dinner, reimbursement]);
    expect(r.creditCardSpending).toBe(0);
  });

  it('excludes generic "Deposit" positives from income (user reclasses true earnings to Income)', () => {
    const r = calc([
      tx({ cardId: 1, amount: 1500, date: '2026-04-05', description: 'DEPOSIT PAYPAL', category: 'Deposit' }),
      tx({ cardId: 1, amount: 322.70, date: '2026-04-15', description: 'PAYROLL DEPOSIT Amazon', category: 'Income' })
    ]);
    expect(r.income).toBe(322.70);   // only payroll counts
  });

  it('counts ATM withdrawals categorized "Cash" as deposit-account spending', () => {
    const r = calc([
      tx({ cardId: 1, amount: -100, date: '2026-04-10', description: 'ATM WITHDRAWAL BAY and COLLEGE', category: 'Cash' })
    ]);
    expect(r.depositAccountSpending).toBe(100);
    expect(r.byCategory.Cash).toBe(100);
  });

  it('produces a byCategory breakdown over negative amounts only', () => {
    const r = calc([
      tx({ cardId: 3, amount: -40, date: '2026-04-05', category: 'Food' }),
      tx({ cardId: 3, amount: -60, date: '2026-04-06', category: 'Food' }),
      tx({ cardId: 3, amount: -25, date: '2026-04-07', category: 'Shopping' }),
      tx({ cardId: 3, amount: 100, date: '2026-04-10', category: 'Food' }) // positive ignored
    ]);
    expect(r.byCategory.Food).toBe(100);
    expect(r.byCategory.Shopping).toBe(25);
  });
});
