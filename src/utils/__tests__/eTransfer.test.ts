import { describe, it, expect } from 'vitest';
import {
  isETransfer,
  extractCounterparty,
  summarizeETransfers,
  groupETransfersByCounterparty
} from '../eTransfer';
import type { Transaction } from '../../types';

let id = 0;
function tx(date: string, amount: number, description: string): Transaction {
  return { id: ++id, card_id: 1, cardId: 1, amount, description, category: 'Other', date, source: 'plaid' };
}

describe('isETransfer', () => {
  it('matches every observed bank format', () => {
    expect(isETransfer(tx('2026-05-01', -50, 'INTERAC E-TRANSFER SEND simon'))).toBe(true);
    expect(isETransfer(tx('2026-05-01', 50, 'INTERAC E-TRANSFER RECEIVE Foo'))).toBe(true);
    expect(isETransfer(tx('2026-05-01', -50, 'Yutang Yang - INTERAC e-Transfer®'))).toBe(true);
    expect(isETransfer(tx('2026-05-01', -50, 'E-TRANSFER 011644895753 YANG YANG'))).toBe(true);
    expect(isETransfer(tx('2026-05-01', -50, '[CW]INTERAC ETRNSFR SENT TD 20260991049TCCJZE'))).toBe(true);
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
    expect(extractCounterparty('INTERAC E-TRANSFER SEND simon')).toBe('simon');
    expect(extractCounterparty('INTERAC E-TRANSFER RECEIVE DAN TAM THUY HOANG')).toBe('DAN TAM THUY HOANG');
    expect(extractCounterparty('Yutang Yang - INTERAC e-Transfer®')).toBe('Yutang Yang');
    expect(extractCounterparty('E-TRANSFER 011644895753 YANG YANG')).toBe('YANG YANG');
    expect(extractCounterparty('[CW]INTERAC ETRNSFR SENT TD 20260991049TCCJZE')).toBe('Interac transfer');
  });

  it('returns unknown when description is missing', () => {
    expect(extractCounterparty(undefined)).toBe('unknown');
    expect(extractCounterparty('')).toBe('unknown');
  });
});

describe('summarizeETransfers', () => {
  it('totals in and out separately and computes net', () => {
    const r = summarizeETransfers([
      tx('2026-05-01', 200, 'INTERAC E-TRANSFER RECEIVE Foo'),
      tx('2026-05-02', -50, 'INTERAC E-TRANSFER SEND Bar'),
      tx('2026-05-03', -30, 'INTERAC E-TRANSFER SEND Baz'),
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
      tx('2026-05-01', 200, 'INTERAC E-TRANSFER RECEIVE simon'),
      tx('2026-05-02', -50, 'INTERAC E-TRANSFER SEND simon'),
      tx('2026-05-03', -10, 'INTERAC E-TRANSFER SEND yangyang')
    ]);
    expect(r).toHaveLength(2);
    expect(r[0].counterparty).toBe('simon');
    expect(r[0].totalIn).toBe(200);
    expect(r[0].totalOut).toBe(50);
    expect(r[0].net).toBe(150);
    expect(r[0].count).toBe(2);
    expect(r[1].counterparty).toBe('yangyang');
  });
});
