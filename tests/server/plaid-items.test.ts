import { describe, it, expect, beforeEach } from 'vitest';
import { buildTestApp } from './helpers';
import { createRequire } from 'module';
const require_ = createRequire(import.meta.url);
const {
  upsertItem, loadItemsForUser, updateCursor,
  markItemReauth, clearItemReauth,
  recordItemSyncSuccess, recordItemSyncFailure
} = require_('../../server/lib/plaidItems');

describe('plaidItems lib', () => {
  let db: any;
  beforeEach(async () => { ({ db } = await buildTestApp()); });

  it('upserts an item and round-trips fields', async () => {
    const id = await upsertItem(db, 1, {
      item_id: 'IT_1', institution_name: 'Test Bank', access_token: 'enc:v1:fake'
    });
    const rows = await loadItemsForUser(db, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(id);
    expect(rows[0].item_id).toBe('IT_1');
  });

  it('updateCursor persists and recordItemSyncSuccess timestamps + clears error', async () => {
    const id = await upsertItem(db, 1, {
      item_id: 'IT_2', institution_name: 'X', access_token: 'enc:v1:abc'
    });
    await updateCursor(db, id, 'CURSOR_AAA');
    await recordItemSyncFailure(db, id, 'NETWORK');
    await recordItemSyncSuccess(db, id);
    const rows = await loadItemsForUser(db, 1);
    const r = rows.find((x: any) => x.id === id);
    expect(r.sync_cursor).toBe('CURSOR_AAA');
    expect(r.last_sync_error).toBeNull();
    expect(r.last_synced_at).toBeTruthy();
    expect(r.last_sync_attempt_at).toBeTruthy();
  });

  it('markItemReauth and clearItemReauth toggle flags', async () => {
    const id = await upsertItem(db, 1, {
      item_id: 'IT_3', institution_name: 'X', access_token: 'enc:v1:abc'
    });
    await markItemReauth(db, id, 'ITEM_LOGIN_REQUIRED');
    let r = (await loadItemsForUser(db, 1))[0];
    expect(r.needs_reauth).toBe(1);
    expect(r.reauth_error_code).toBe('ITEM_LOGIN_REQUIRED');
    await clearItemReauth(db, id);
    r = (await loadItemsForUser(db, 1))[0];
    expect(r.needs_reauth).toBe(0);
    expect(r.reauth_error_code).toBeNull();
  });
});
