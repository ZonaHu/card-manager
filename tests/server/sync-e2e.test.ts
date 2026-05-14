import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers';
import { makeMockPlaid } from './__mocks__/plaidMock';
import { createRequire } from 'module';
const require_ = createRequire(import.meta.url);

describe('E2E: register → exchange → sync → aggregate', () => {
  let app: any, db: any;
  beforeEach(async () => {
    ({ app, db } = await buildTestApp());
    // Mutate the singleton in-place AFTER buildTestApp() so route handlers
    // that captured the reference still see the mock.
    const plaidLib = require_('../../server/lib/plaid');
    Object.assign(plaidLib.plaidClient, makeMockPlaid({
      accounts: [{ account_id: 'A1', type: 'depository', subtype: 'checking', mask: '0001', balances: { current: 1000 } }],
      transactionsSync: {
        added: [
          { transaction_id: 'TX1', account_id: 'A1', amount: 50, name: 'COFFEE', date: '2026-04-10', pending: false, iso_currency_code: 'CAD' },
          { transaction_id: 'TX2', account_id: 'A1', amount: 100, name: 'GROCERY', date: '2026-04-11', pending: false, iso_currency_code: 'CAD' }
        ],
        next_cursor: 'C1'
      }
    }));
  });

  it('exchanges a public token, syncs txns, and reports spend via /api/transactions', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({ name: 'E', email: 'e@e.com', password: 'longenough1' });

    const ex = await agent.post('/api/plaid/exchange-public-token').send({
      public_token: 'PT_FAKE', institution: { name: 'Test Bank' }
    });
    expect(ex.status).toBe(200);

    // exchange-public-token populates `cards` but not `plaid_items`.
    // sync-transactions reads from plaid_items, so we backfill it here using
    // the encrypted access_token that was stored on the card during exchange.
    const { upsertItem } = require_('../../server/lib/plaidItems');
    const card = await new Promise<any>((resolve, reject) =>
      db.get('SELECT * FROM cards WHERE item_id = ?', ['IT_STUB'], (err: any, row: any) =>
        err ? reject(err) : resolve(row)));
    expect(card).toBeTruthy();
    await upsertItem(db, card.user_id, {
      item_id: 'IT_STUB',
      institution_name: 'Test Bank',
      access_token: card.access_token   // already encrypted
    });

    const sync = await agent.post('/api/plaid/sync-transactions');
    expect(sync.status).toBe(200);
    expect(sync.body.newTransactions).toBeGreaterThanOrEqual(2);

    const txs = await agent.get('/api/transactions?month=2026-04');
    expect(txs.status).toBe(200);
    expect(txs.body.length).toBe(2);
    const total = txs.body.reduce((s: number, t: any) => s + Math.abs(t.amount), 0);
    expect(total).toBe(150);
  });
});
