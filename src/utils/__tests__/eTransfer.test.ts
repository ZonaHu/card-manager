import { describe, it, expect } from 'vitest';
import {
  isETransfer,
  extractCounterparty,
  summarizeETransfers,
  groupETransfersByCounterparty
} from '../eTransfer';
import type { Transaction } from '../../types';

// Names are synthetic test fixtures (Alice/Bob/Carol/Jane Doe). The regex
// targets bank-feed description shapes — the words themselves don't matter,
// only the structure (verb prefix, dash separator, ref-number prefix, etc.).

let id = 0;
function tx(date: string, amount: number, description: string): Transaction {
  return { id: ++id, card_id: 1, cardId: 1, amount, description, category: 'Other', date, source: 'plaid' };
}

describe('isETransfer', () => {
  it('matches every observed bank format', () => {
    expect(isETransfer(tx('2026-05-01', -50, 'INTERAC E-TRANSFER SEND alice'))).toBe(true);
    expect(isETransfer(tx('2026-05-01', 50, 'INTERAC E-TRANSFER RECEIVE Bob'))).toBe(true);
    expect(isETransfer(tx('2026-05-01', -50, 'Carol Smith - INTERAC e-Transfer®'))).toBe(true);
    expect(isETransfer(tx('2026-05-01', -50, 'E-TRANSFER 011000000000 ALICE COOPER'))).toBe(true);
    expect(isETransfer(tx('2026-05-01', -50, '[CW]INTERAC ETRNSFR SENT TD 20260000000ABCDEF'))).toBe(true);
  });

  it('ignores non e-transfer descriptions', () => {
    expect(isETransfer(tx('2026-05-01', -50, 'COFFEE SHOP'))).toBe(false);
    expect(isETransfer(tx('2026-05-01', -50, 'PAYROLL'))).toBe(false);
    // "Transfer" alone shouldn't count — that's our internal-transfer marker,
    // distinct from Interac e-Transfers.
    expect(isETransfer(tx('2026-05-01', -50, 'Transfer to savings'))).toBe(false);
  });
});

describe('extractCounterparty', () => {
  it('pulls the name from each format', () => {
    expect(extractCounterparty('INTERAC E-TRANSFER SEND alice')).toBe('alice');
    expect(extractCounterparty('INTERAC E-TRANSFER RECEIVE FIRST MIDDLE LAST')).toBe('FIRST MIDDLE LAST');
    expect(extractCounterparty('Carol Smith - INTERAC e-Transfer®')).toBe('Carol Smith');
    expect(extractCounterparty('E-TRANSFER 011000000000 ALICE COOPER')).toBe('ALICE COOPER');
    expect(extractCounterparty('[CW]INTERAC ETRNSFR SENT TD 20260000000ABCDEF')).toBe('Interac transfer');
  });

  it('returns unknown when description is missing', () => {
    expect(extractCounterparty(undefined)).toBe('unknown');
    expect(extractCounterparty('')).toBe('unknown');
  });

  it('still surfaces the name when "INTERAC ETRNSFR RECEIVED" carries one', () => {
    // Regression: earlier code returned the generic "Interac transfer" for
    // any ETRNSFR string, dropping a usable name suffix.
    expect(extractCounterparty('INTERAC ETRNSFR RECEIVED Jane Doe')).toBe('Jane Doe');
  });
});

describe('summarizeETransfers', () => {
  it('totals in and out separately and computes net', () => {
    const r = summarizeETransfers([
      tx('2026-05-01', 200, 'INTERAC E-TRANSFER RECEIVE Alice'),
      tx('2026-05-02', -50, 'INTERAC E-TRANSFER SEND Bob'),
      tx('2026-05-03', -30, 'INTERAC E-TRANSFER SEND Carol'),
      tx('2026-05-04', -10, 'COFFEE') // not an e-transfer — excluded
    ]);
    expect(r.totalIn).toBe(200);
    expect(r.totalOut).toBe(80);
    expect(r.net).toBe(120);
    expect(r.countIn).toBe(1);
    expect(r.countOut).toBe(2);
  });
});

describe('groupETransfersByCounterparty', () => {
  it('groups same-name interactions and sorts by volume', () => {
    const r = groupETransfersByCounterparty([
      tx('2026-05-01', 200, 'INTERAC E-TRANSFER RECEIVE alice'),
      tx('2026-05-02', -50, 'INTERAC E-TRANSFER SEND alice'),
      tx('2026-05-03', -10, 'INTERAC E-TRANSFER SEND bob')
    ]);
    expect(r).toHaveLength(2);
    expect(r[0].counterparty).toBe('alice');
    expect(r[0].totalIn).toBe(200);
    expect(r[0].totalOut).toBe(50);
    expect(r[0].net).toBe(150);
    expect(r[0].count).toBe(2);
    expect(r[1].counterparty).toBe('bob');
  });
});
