import { describe, it, expect, beforeEach } from 'vitest';
import { buildTestApp } from './helpers';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
const { recordSnapshots, loadSnapshots } = require_('../../server/lib/balanceSnapshots');

describe('balanceSnapshots', () => {
  let db: any;
  beforeEach(async () => { ({ db } = await buildTestApp()); });

  it('records one row per card per date and upserts on conflict', async () => {
    // Seed a user + two cards
    await new Promise<void>((r, rej) =>
      db.run('INSERT INTO users (id, name, email, password) VALUES (1, ?, ?, ?)',
        ['t', 't@e.com', 'x'], (e: any) => e ? rej(e) : r()));
    await new Promise<void>((r, rej) =>
      db.run('INSERT INTO cards (id, user_id, name, type, last_four, balance, currency, connected, category) VALUES (1, 1, ?, ?, ?, ?, ?, 1, ?), (2, 1, ?, ?, ?, ?, ?, 1, ?)',
        ['Chequing', 'debit', '0001', 500, 'CAD', 'chequing',
         'Brokerage', 'debit', '0002', 50000, 'CAD', 'investment'],
        (e: any) => e ? rej(e) : r()));

    await recordSnapshots(db, 1, [
      { id: 1, balance: 500 },
      { id: 2, balance: 50000 }
    ], '2026-05-14');

    // Re-record same day with different values → upsert, not duplicate row.
    await recordSnapshots(db, 1, [{ id: 2, balance: 50250 }], '2026-05-14');

    const rows = await loadSnapshots(db, 1, '2026-01-01');
    expect(rows).toHaveLength(2);
    const card2 = rows.find((r: any) => r.card_id === 2);
    expect(card2.balance).toBe(50250);
  });
});
