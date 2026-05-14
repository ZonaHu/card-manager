import { describe, it, expect } from 'vitest';
import { transactionsToCsv } from '../csvExport';
import type { Card, Transaction } from '../../types';

const cards: Card[] = [
  { id: 1, name: 'BMO checking', type: 'debit', last_four: '7852', balance: 1000, connected: true, category: 'chequing' }
];

describe('transactionsToCsv', () => {
  it('emits a metadata block then header and rows', () => {
    const csv = transactionsToCsv([
      { id: 1, card_id: 1, cardId: 1, amount: -12.34, description: 'COFFEE', category: 'Food', date: '2026-04-01', source: 'plaid' }
    ], cards);
    const lines = csv.split('\r\n');
    expect(lines[0]).toMatch(/^# Exported:/);
    expect(lines[1]).toMatch(/^# Rows: 1/);
    expect(lines[2]).toBe('# Source: card-manager');
    expect(lines.find(l => l.startsWith('date,description'))).toBeDefined();
    expect(lines.find(l => l === '2026-04-01,COFFEE,-12.34,Food,BMO checking,7852')).toBeDefined();
  });

  it('quotes fields containing commas, quotes, or newlines', () => {
    const csv = transactionsToCsv([
      { id: 1, card_id: 1, cardId: 1, amount: -10, description: 'GROCERY, INC', category: 'Food', date: '2026-04-01', source: 'plaid' },
      { id: 2, card_id: 1, cardId: 1, amount: -20, description: 'SHE SAID "HI"', category: 'Food', date: '2026-04-02', source: 'plaid' }
    ], cards);
    expect(csv).toContain('"GROCERY, INC"');
    expect(csv).toContain('"SHE SAID ""HI"""');
  });

  it('leaves card columns blank when no matching card', () => {
    const csv = transactionsToCsv([
      { id: 1, card_id: 999, cardId: 999, amount: -1, description: 'X', category: 'Other', date: '2026-04-01', source: 'manual' }
    ], cards);
    expect(csv.split('\r\n').find(l => l.startsWith('2026-04-01,X'))).toBe('2026-04-01,X,-1,Other,,');
  });
});
