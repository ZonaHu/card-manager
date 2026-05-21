# Audit Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 15 remaining items from the May 14 audit: Plaid sync robustness (pending state, FX, cursor drift, paging guard), auth refresh tokens + request-id correlation + CSP-everywhere, UX polish (recurring price tiers, investment hint, rule conflict preview, mobile, CSV metadata, cross-month refund visibility), and ops (E2E sync test, backup UI).

**Architecture:**
- Plaid sync moves from cards-as-source-of-truth to a new `plaid_items` table that owns access_token + cursor + reauth state, eliminating cursor drift races.
- Transactions gain `pending`, `transaction_currency`, and `original_amount` columns to model Plaid's full payload.
- Auth gains a long-lived `refresh_token` cookie + `/api/auth/refresh` endpoint to keep the 24h JWT sliding without forcing daily re-login.
- Cross-cutting middleware adds X-Request-ID generation/propagation.
- UI changes are additive: badges, tooltips, responsive grids, no schema churn.

**Tech Stack:**
- Backend: Node, Express, sqlite3, jsonwebtoken, helmet, vitest + supertest
- Frontend: React 18, TypeScript, Vite, Recharts, Tailwind, vitest
- Existing utilities: `server/utils/migrator.js`, `server/lib/{auth,plaid,plaidWebhook,splitRules,categorizationRules}.js`, `src/utils/spendCalculation.ts`

**Constraints:**
- App is in active daily use against a populated SQLite DB; every migration must be idempotent and additive (no destructive ALTER).
- All 57 existing tests must remain green at every commit boundary.
- Bundle is already split (main 261 KB + lazy chart 388 KB); don't regress.
- ENCRYPTION_KEY is set; Plaid `access_token` is encrypted at rest.

---

## File structure (created/touched)

**Created:**
- `server/migrations/008_plaid_items.js` — new table + cards FK
- `server/migrations/009_transaction_pending_and_currency.js` — pending + FX columns
- `server/migrations/010_refresh_tokens.js` — refresh_tokens table
- `server/lib/plaidItems.js` — load/upsert/list helpers
- `server/lib/requestId.js` — middleware + tiny client helper
- `server/routes/backup.js` — backup trigger + list endpoints
- `tests/server/sync-e2e.test.ts` — register → mock Plaid → sync → assert spend
- `tests/server/__mocks__/plaidMock.ts` — minimal Plaid SDK mock
- `src/components/dashboard/InvestmentEmptyHint.tsx`
- `src/components/dashboard/RulePreviewPopover.tsx`
- `src/utils/refundCrossMonth.ts` — pure detector
- `src/utils/__tests__/refundCrossMonth.test.ts`

**Modified:**
- `server/app.js` — request-id middleware, CSP always-on, refresh-token route mount, backup route mount
- `server/lib/auth.js` — split short JWT + refresh token issuance
- `server/routes/auth.js` — `/refresh` endpoint, refresh on login/register
- `server/routes/plaid.js` — swap card-level cursor for plaid_items lookups, capture `pending`/`iso_currency_code`/`unofficial_currency_code`, raise paging guard to 200 + log warn at 10k
- `server/lib/plaidWebhook.js` — propagate request_id
- `server/utils/errors.js` — include `requestId` from `req` if present
- `src/utils/spendCalculation.ts` — honor `pending=0` filter, treat FX rows via `transaction_currency`/`original_amount`
- `src/utils/recurringDetection.ts` — relax bucket to nearest dollar with ±15% merge across adjacent buckets
- `src/components/dashboard/RulesPanel.tsx` — responsive grid, inline preview
- `src/components/dashboard/RecurringList.tsx` — show price-change hint when bucket merges
- `src/components/dashboard/TransactionsList.tsx` — Pending badge
- `src/components/forms/TransactionEditModal.tsx` — rule conflict preview before save
- `src/utils/csvExport.ts` — metadata header rows
- `src/types/index.ts` — new optional fields
- `src/hooks/useApi.ts` — capture `X-Request-ID` in error message

---

## Phase 1 — Sync robustness

### Task 1: Add `plaid_items` table

**Files:**
- Create: `server/migrations/008_plaid_items.js`

- [ ] **Step 1: Write the migration**

```javascript
// server/migrations/008_plaid_items.js
//
// Centralize per-Plaid-item state (access_token, cursor, reauth) on a new
// plaid_items row instead of duplicating it across every card. Cards point
// at their item via cards.plaid_item_pk. Existing card columns stay until
// Task 3 finishes the cutover.

async function safeAddColumn(dbRun, table, columnDef) {
  try { await dbRun(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`); }
  catch (err) {
    if (!String(err && err.message).includes('duplicate column name')) throw err;
  }
}

exports.up = async (db, { dbRun }) => {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS plaid_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      item_id TEXT NOT NULL,
      institution_name TEXT,
      access_token TEXT NOT NULL,
      sync_cursor TEXT,
      needs_reauth INTEGER DEFAULT 0,
      reauth_error_code TEXT,
      last_synced_at DATETIME,
      last_sync_attempt_at DATETIME,
      last_sync_error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, item_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_plaid_items_user ON plaid_items(user_id)`);
  await safeAddColumn(dbRun, 'cards', `plaid_item_pk INTEGER`);

  // Backfill: for every distinct (user_id, item_id) that already has cards,
  // create a plaid_items row using the access_token from the first card.
  const cardRows = await new Promise((res, rej) =>
    db.all(`SELECT user_id, item_id, MIN(access_token) AS access_token,
                   MIN(institution_name) AS institution_name,
                   MAX(needs_reauth) AS needs_reauth,
                   MAX(reauth_error_code) AS reauth_error_code,
                   MAX(plaid_sync_cursor) AS sync_cursor,
                   MAX(last_synced_at) AS last_synced_at,
                   MAX(last_sync_attempt_at) AS last_sync_attempt_at,
                   MAX(last_sync_error) AS last_sync_error
            FROM cards
            WHERE item_id IS NOT NULL AND access_token IS NOT NULL
            GROUP BY user_id, item_id`,
      (e, r) => e ? rej(e) : res(r)));

  for (const row of cardRows) {
    await dbRun(
      `INSERT OR IGNORE INTO plaid_items
       (user_id, item_id, institution_name, access_token, sync_cursor,
        needs_reauth, reauth_error_code, last_synced_at, last_sync_attempt_at, last_sync_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.user_id, row.item_id, row.institution_name, row.access_token,
       row.sync_cursor, row.needs_reauth || 0, row.reauth_error_code,
       row.last_synced_at, row.last_sync_attempt_at, row.last_sync_error]
    );
    // Wire cards.plaid_item_pk
    await dbRun(
      `UPDATE cards SET plaid_item_pk = (SELECT id FROM plaid_items WHERE user_id=? AND item_id=?)
       WHERE user_id=? AND item_id=?`,
      [row.user_id, row.item_id, row.user_id, row.item_id]
    );
  }
};
```

- [ ] **Step 2: Restart server, verify migration runs cleanly**

Run: `pkill -f 'node index.js'; sleep 1; cd server && node index.js > /tmp/boot.out 2>&1 &`
Run: `sleep 2 && head -20 /tmp/boot.out`
Expected: `applying migration 008_plaid_items.js` + `applied 1 migration(s)`.

- [ ] **Step 3: Verify backfill rows exist**

Run: `sqlite3 server/database.db "SELECT COUNT(*) AS items, COUNT(DISTINCT user_id) AS users FROM plaid_items;"`
Expected: items >= 1, users >= 1 (matches number of distinct Plaid items currently connected).

Run: `sqlite3 server/database.db "SELECT id, item_id, SUBSTR(access_token,1,12) AS tok, needs_reauth, last_synced_at FROM plaid_items;"`
Expected: tokens start with `enc:v1:` (encrypted), one row per item.

Run: `sqlite3 server/database.db "SELECT COUNT(*) FROM cards WHERE plaid_item_pk IS NULL AND item_id IS NOT NULL;"`
Expected: 0 (every Plaid-connected card got the FK).

- [ ] **Step 4: Commit**

```bash
git add server/migrations/008_plaid_items.js
git commit -m "feat(sync): add plaid_items table + backfill from cards"
```

### Task 2: Helpers for plaid_items

**Files:**
- Create: `server/lib/plaidItems.js`
- Test: `tests/server/plaid-items.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/server/plaid-items.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { buildTestApp } from './helpers';
import { createRequire } from 'module';
const require_ = createRequire(import.meta.url);
const { upsertItem, loadItemsForUser, updateCursor, markItemReauth, clearItemReauth, recordItemSyncSuccess, recordItemSyncFailure } = require_('../../server/lib/plaidItems');

describe('plaidItems lib', () => {
  let db: any;
  beforeEach(async () => { ({ db } = await buildTestApp()); });

  it('upserts an item and round-trips fields', async () => {
    const id = await upsertItem(db, 1, { item_id: 'IT_1', institution_name: 'Test Bank', access_token: 'enc:v1:fake' });
    const rows = await loadItemsForUser(db, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(id);
    expect(rows[0].item_id).toBe('IT_1');
  });

  it('updateCursor persists and recordItemSyncSuccess timestamps + clears error', async () => {
    const id = await upsertItem(db, 1, { item_id: 'IT_2', institution_name: 'X', access_token: 'enc:v1:abc' });
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
    const id = await upsertItem(db, 1, { item_id: 'IT_3', institution_name: 'X', access_token: 'enc:v1:abc' });
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
```

- [ ] **Step 2: Run test — verify it fails (module missing)**

Run: `npm test -- tests/server/plaid-items.test.ts`
Expected: FAIL with `Cannot find module '../../server/lib/plaidItems'`.

- [ ] **Step 3: Implement the helper module**

```javascript
// server/lib/plaidItems.js
//
// CRUD around the plaid_items table. Routes use this instead of touching the
// columns directly so we stay consistent (e.g., always stamping
// last_sync_attempt_at on every attempt, success or failure).

function upsertItem(db, userId, { item_id, institution_name, access_token }) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO plaid_items (user_id, item_id, institution_name, access_token)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, item_id) DO UPDATE SET
         institution_name = excluded.institution_name,
         access_token = excluded.access_token`,
      [userId, item_id, institution_name, access_token],
      function (err) {
        if (err) return reject(err);
        if (this.lastID) return resolve(this.lastID);
        db.get('SELECT id FROM plaid_items WHERE user_id=? AND item_id=?',
          [userId, item_id], (e, row) => e ? reject(e) : resolve(row && row.id));
      }
    );
  });
}

function loadItemsForUser(db, userId) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM plaid_items WHERE user_id = ? ORDER BY id', [userId],
      (err, rows) => err ? reject(err) : resolve(rows || []));
  });
}

function loadItemByPk(db, pk) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM plaid_items WHERE id = ?', [pk],
      (err, row) => err ? reject(err) : resolve(row));
  });
}

function updateCursor(db, itemPk, cursor) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE plaid_items SET sync_cursor = ? WHERE id = ?',
      [cursor, itemPk], err => err ? reject(err) : resolve());
  });
}

function recordItemSyncSuccess(db, itemPk) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE plaid_items
       SET last_synced_at = CURRENT_TIMESTAMP,
           last_sync_attempt_at = CURRENT_TIMESTAMP,
           last_sync_error = NULL
       WHERE id = ?`,
      [itemPk], err => err ? reject(err) : resolve());
  });
}

function recordItemSyncFailure(db, itemPk, errorMsg) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE plaid_items
       SET last_sync_attempt_at = CURRENT_TIMESTAMP,
           last_sync_error = ?
       WHERE id = ?`,
      [errorMsg, itemPk], err => err ? reject(err) : resolve());
  });
}

function markItemReauth(db, itemPk, errorCode) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE plaid_items SET needs_reauth=1, reauth_error_code=? WHERE id=?',
      [errorCode, itemPk], err => err ? reject(err) : resolve());
  });
}

function clearItemReauth(db, itemPk) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE plaid_items SET needs_reauth=0, reauth_error_code=NULL WHERE id=?',
      [itemPk], err => err ? reject(err) : resolve());
  });
}

module.exports = {
  upsertItem, loadItemsForUser, loadItemByPk, updateCursor,
  recordItemSyncSuccess, recordItemSyncFailure, markItemReauth, clearItemReauth
};
```

- [ ] **Step 4: Run test again**

Run: `npm test -- tests/server/plaid-items.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add server/lib/plaidItems.js tests/server/plaid-items.test.ts
git commit -m "feat(sync): plaid_items helper lib + tests"
```

### Task 3: Cut `syncIncremental` over to plaid_items

**Files:**
- Modify: `server/routes/plaid.js` (sync paths)
- Modify: `server/app.js` (deps)

- [ ] **Step 1: Add plaidItems lib to deps in app.js**

In `server/app.js`, after the `categorizationRules` require:

```javascript
const plaidItems = require('./lib/plaidItems');
```

In the `plaidRoutes({...})` call's deps object, add:
```javascript
plaidItems,
```

- [ ] **Step 2: Refactor syncIncremental in `server/routes/plaid.js`**

Replace the body of `syncIncremental` and the per-token loop in `/sync-transactions`:

```javascript
async function syncIncremental({ userId, cards, accessToken, itemPk, cursor, rules = [], splitRules = [] }) {
  // ... existing transactionsSync paging loop unchanged ...

  // After the COMMIT, persist the new cursor on plaid_items (not cards).
  if (nextCursor && itemPk) {
    await plaidItems.updateCursor(db, itemPk, nextCursor);
  }
  // ... rest unchanged (balances, last-synced stamps) ...
}
```

In `/sync-transactions` route handler, replace the `loadDecryptedPlaidCards` + cursor-from-cards lookup with a join against plaid_items:

```javascript
const items = await plaidItems.loadItemsForUser(db, req.user.userId);
for (const item of items) {
  if (item.needs_reauth) continue;
  const accessToken = decryptSecret(item.access_token);
  const itemCards = (await loadDecryptedPlaidCards(req.user.userId))
    .filter(c => c.item_id === item.item_id);
  if (itemCards.length === 0) continue;
  try {
    const result = await syncIncremental({
      userId: req.user.userId, cards: itemCards, accessToken,
      itemPk: item.id, cursor: item.sync_cursor, rules, splitRules
    });
    await plaidItems.recordItemSyncSuccess(db, item.id);
    totalAdded += result.added;
    totalModified += result.modified;
    totalRemoved += result.removed;
  } catch (tokenError) {
    const code = tokenError.response?.data?.error_code;
    await plaidItems.recordItemSyncFailure(db, item.id, code || tokenError.message);
    await handleSyncTokenError(tokenError, itemCards);
  }
}
```

- [ ] **Step 3: Update `handleSyncTokenError` to call plaidItems.markItemReauth**

Replace `markCardsNeedReauth(cards.map(c => c.id), code)` with a lookup of the card's plaid_item_pk and call `plaidItems.markItemReauth(db, itemPk, code)`.

- [ ] **Step 4: Run all existing sync tests**

Run: `npm test -- tests/server/`
Expected: all currently-passing server tests still pass.

- [ ] **Step 5: Commit**

```bash
git add server/app.js server/routes/plaid.js
git commit -m "refactor(sync): syncIncremental reads/writes cursor via plaid_items"
```

### Task 4: Capture `pending` on transactions

**Files:**
- Create: `server/migrations/009_transaction_pending_and_currency.js`
- Modify: `server/routes/plaid.js` (insert/update of transactions)
- Modify: `src/utils/spendCalculation.ts`
- Modify: `src/types/index.ts`
- Modify: `src/components/dashboard/TransactionsList.tsx`

- [ ] **Step 1: Write the migration**

```javascript
// server/migrations/009_transaction_pending_and_currency.js
async function safeAddColumn(dbRun, table, columnDef) {
  try { await dbRun(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`); }
  catch (err) {
    if (!String(err && err.message).includes('duplicate column name')) throw err;
  }
}

exports.up = async (db, { dbRun }) => {
  await safeAddColumn(dbRun, 'transactions', `pending INTEGER DEFAULT 0`);
  await safeAddColumn(dbRun, 'transactions', `transaction_currency TEXT`);
  await safeAddColumn(dbRun, 'transactions', `original_amount REAL`);
};
```

- [ ] **Step 2: Update Plaid insert in syncIncremental**

In `server/routes/plaid.js`, find the INSERT in the added/modified loops. Change column list to include pending/transaction_currency/original_amount, and the values to capture from the Plaid payload:

```javascript
db.run(
  `INSERT INTO transactions
     (user_id, card_id, amount, description, category, date, source,
      plaid_transaction_id, pending, transaction_currency, original_amount)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [
    userId, matchingCard.id, storedAmount, t.name,
    categorizeWithRules(t, rules), t.date, 'plaid', t.transaction_id,
    t.pending ? 1 : 0,
    t.iso_currency_code || t.unofficial_currency_code || null,
    t.amount  // original Plaid amount (positive=outgoing); we already stored negated as storedAmount
  ],
  // ...
);
```

For the `modified` loop, extend the UPDATE to include these fields.

- [ ] **Step 3: Update Transaction type**

`src/types/index.ts`:
```typescript
export interface Transaction {
  // ... existing fields
  pending?: boolean | number;
  transaction_currency?: string;
  original_amount?: number;
}
```

- [ ] **Step 4: Filter pending out of spend calc**

In `src/utils/spendCalculation.ts`, at the top of the for-loop body, add:

```typescript
for (const t of filtered) {
  // Pending transactions can be modified or removed by Plaid before they
  // post — exclude them from spend/income aggregates to avoid double-counting
  // when they later settle.
  if (t.pending) continue;
  if (washedIds.has(t.id)) continue;
  // ... rest unchanged
```

- [ ] **Step 5: Add Pending badge in TransactionsList**

In `src/components/dashboard/TransactionsList.tsx`, alongside the other badges:

```tsx
const isPending = !!transaction.pending;
{isPending && <Badge tone="blue" title="Not yet posted — excluded from totals until it settles">Pending</Badge>}
```

- [ ] **Step 6: Add test**

`src/utils/__tests__/spendCalculation.test.ts`:

```typescript
it('excludes pending transactions from spend and income', () => {
  const r = calc([
    tx({ cardId: 1, amount: -50, date: '2026-04-10', description: 'COFFEE', category: 'Food' }),
    { id: 999, card_id: 1, cardId: 1, amount: -100, description: 'PENDING THING', category: 'Food', date: '2026-04-11', source: 'plaid', pending: 1 } as any
  ]);
  expect(r.depositAccountSpending).toBe(50);
});
```

- [ ] **Step 7: Run tests + commit**

Run: `npm test`
Expected: all tests pass including new pending-exclusion test.

```bash
git add server/migrations/009_transaction_pending_and_currency.js server/routes/plaid.js src/utils/spendCalculation.ts src/utils/__tests__/spendCalculation.test.ts src/types/index.ts src/components/dashboard/TransactionsList.tsx
git commit -m "feat(sync): track pending state + FX columns, exclude pending from spend"
```

### Task 5: FX / converted_amount handling

**Files:**
- Modify: `server/routes/plaid.js` (insert path)
- Modify: `src/utils/currency.ts` (if needed for display)
- Modify: `src/components/dashboard/TransactionsList.tsx`

- [ ] **Step 1: Inspect existing currency util**

Run: `cat /Users/zuomiaohu/Desktop/card-manager/src/utils/currency.ts`
Confirm `formatCurrency(amount, currency)` exists.

- [ ] **Step 2: When Plaid returns iso_currency_code != card currency, prefer Plaid's value as-is and store the foreign amount in original_amount**

Already added in Task 4. The existing `amount` column gets Plaid's `transaction.amount` directly (signed). If Plaid uses card-native currency, this matches our stored card currency. If foreign, the database row carries native amount + transaction_currency. The Transactions list will show original currency next to converted on display only.

- [ ] **Step 3: Display foreign currency hint in TransactionsList**

Add a small grey label next to the right-aligned amount:

```tsx
{transaction.transaction_currency && card?.currency && transaction.transaction_currency !== card.currency && (
  <p className="text-[10px] text-gray-400">
    in {transaction.transaction_currency}
  </p>
)}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/TransactionsList.tsx
git commit -m "feat(ui): show foreign currency hint when transaction currency differs from card"
```

### Task 6: Paging guard 50 → 200 + huge-backfill warning

**Files:**
- Modify: `server/routes/plaid.js`

- [ ] **Step 1: Raise the guard**

In `syncIncremental`, replace `if (++pageGuard > 50)` with `if (++pageGuard > 200)` and add a logger.warn when `added.length > 10000` after the loop exits.

```javascript
if (++pageGuard > 200) {
  logger.warn('transactionsSync paging guard reached', { pages: pageGuard, userId, itemPk });
  break;
}
// after the while loop:
if (added.length > 10000) {
  logger.warn('large backfill', { added: added.length, userId, itemPk });
}
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/plaid.js
git commit -m "fix(sync): raise paging guard to 200 + warn on >10k adds"
```

---

## Phase 2 — Auth + observability

### Task 7: JWT refresh tokens

**Files:**
- Create: `server/migrations/010_refresh_tokens.js`
- Modify: `server/lib/auth.js`
- Modify: `server/routes/auth.js`
- Test: `tests/server/auth-refresh.test.ts`

- [ ] **Step 1: Migration for refresh tokens**

```javascript
// server/migrations/010_refresh_tokens.js
//
// Refresh tokens live server-side in their own table so we can rotate +
// revoke. The cookie holds an opaque random ID; the row maps it to a user.

exports.up = async (db, { dbRun }) => {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      revoked_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id)`);
};
```

- [ ] **Step 2: Update lib/auth.js with shorter JWT + refresh helpers**

In `server/lib/auth.js`:

```javascript
const crypto = require('crypto');

const ACCESS_TOKEN_TTL = '15m';  // short-lived JWT
const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: IS_PROD ? 'strict' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000  // 7 days
};

function issueAuthCookie(res, payload) {
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
  res.cookie(AUTH_COOKIE_NAME, token, { ...AUTH_COOKIE_OPTS, maxAge: 15 * 60 * 1000 });
  return token;
}

function generateRefreshToken() { return crypto.randomBytes(32).toString('hex'); }

function issueRefreshCookie(res, value) {
  res.cookie(REFRESH_COOKIE_NAME, value, REFRESH_COOKIE_OPTS);
}

module.exports = {
  // existing exports +
  ACCESS_TOKEN_TTL, REFRESH_COOKIE_NAME, REFRESH_COOKIE_OPTS,
  generateRefreshToken, issueRefreshCookie
};
```

- [ ] **Step 3: Update register / login / OAuth callback to issue refresh too**

In `server/routes/auth.js`, after each `issueAuthCookie(...)` call in register/login/oauth, also:

```javascript
const refresh = generateRefreshToken();
const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
db.run('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
  [userId, refresh, expires],
  err => { /* ignore — refresh issuance is best-effort */ });
issueRefreshCookie(res, refresh);
```

- [ ] **Step 4: Add `/refresh` endpoint**

```javascript
router.post('/refresh', (req, res) => {
  const presented = req.cookies && req.cookies[REFRESH_COOKIE_NAME];
  if (!presented) return res.status(401).json({ error: 'No refresh token' });
  db.get(
    `SELECT rt.*, u.id AS uid, u.email, u.name, u.token_version
     FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
     WHERE rt.token = ? AND rt.revoked_at IS NULL AND rt.expires_at > CURRENT_TIMESTAMP`,
    [presented],
    (err, row) => {
      if (err) return sendServerError(res, err);
      if (!row) return res.status(401).json({ error: 'Invalid refresh token' });
      // Rotate: revoke old, issue new (defense against replay).
      db.run('UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?', [row.id]);
      const newRefresh = generateRefreshToken();
      const exp = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      db.run('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
        [row.uid, newRefresh, exp]);
      issueRefreshCookie(res, newRefresh);
      const token = issueAuthCookie(res, { userId: row.uid, email: row.email, name: row.name, tv: row.token_version });
      res.json({ token, user: { id: row.uid, email: row.email, name: row.name } });
    }
  );
});
```

- [ ] **Step 5: Logout revokes the refresh token**

In `/logout` handler, add before clearing cookies:

```javascript
const presented = req.cookies && req.cookies[REFRESH_COOKIE_NAME];
if (presented) {
  db.run('UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE token = ?', [presented]);
}
res.clearCookie(REFRESH_COOKIE_NAME, { ...REFRESH_COOKIE_OPTS, maxAge: undefined });
```

- [ ] **Step 6: Write the test**

```typescript
// tests/server/auth-refresh.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers';

describe('refresh-token flow', () => {
  let app: any;
  beforeEach(async () => { ({ app } = await buildTestApp()); });

  it('issues both auth and refresh cookies on register', async () => {
    const res = await request(app).post('/api/auth/register')
      .send({ name: 'A', email: 'a@a.com', password: 'longenough1' });
    const cookies = (res.headers['set-cookie'] || []) as string[];
    expect(cookies.some(c => c.startsWith('auth_token='))).toBe(true);
    expect(cookies.some(c => c.startsWith('refresh_token='))).toBe(true);
  });

  it('issues a fresh JWT when refresh cookie is presented', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({ name: 'B', email: 'b@a.com', password: 'longenough1' });
    const r = await agent.post('/api/auth/refresh');
    expect(r.status).toBe(200);
    expect(r.body.token).toBeDefined();
  });

  it('rotates: replaying the OLD refresh after one /refresh fails', async () => {
    const agent = request.agent(app);
    const reg = await agent.post('/api/auth/register').send({ name: 'C', email: 'c@a.com', password: 'longenough1' });
    const setCookie = (reg.headers['set-cookie'] || []) as string[];
    const oldRefresh = setCookie.find(c => c.startsWith('refresh_token='));
    await agent.post('/api/auth/refresh');  // rotates
    const replay = await request(app).post('/api/auth/refresh').set('Cookie', oldRefresh as string);
    expect(replay.status).toBe(401);
  });
});
```

- [ ] **Step 7: Run tests + commit**

Run: `npm test -- tests/server/auth-refresh.test.ts`
Expected: 3 PASS. Plus `npm test` overall stays green.

```bash
git add server/migrations/010_refresh_tokens.js server/lib/auth.js server/routes/auth.js tests/server/auth-refresh.test.ts
git commit -m "feat(auth): refresh-token rotation, 15m JWT + 7d refresh"
```

### Task 8: Request-ID middleware

**Files:**
- Create: `server/lib/requestId.js`
- Modify: `server/app.js`
- Modify: `server/utils/errors.js`
- Modify: `src/hooks/useApi.ts`

- [ ] **Step 1: Write the middleware**

```javascript
// server/lib/requestId.js
//
// Generates an X-Request-ID per request (or honors the incoming header).
// Sets res.locals.requestId so errors.js can include it in JSON responses
// and frontend toasts can display it for support.

const crypto = require('crypto');

function requestId(req, res, next) {
  const incoming = req.headers['x-request-id'];
  const id = (typeof incoming === 'string' && incoming.length <= 64)
    ? incoming
    : crypto.randomBytes(8).toString('hex');
  res.locals.requestId = id;
  res.setHeader('X-Request-ID', id);
  next();
}

module.exports = { requestId };
```

- [ ] **Step 2: Mount in app.js before any route**

In `server/app.js`, after `app.use(helmet(...))`:

```javascript
const { requestId } = require('./lib/requestId');
app.use(requestId);
```

- [ ] **Step 3: Include requestId in error responses**

In `server/utils/errors.js`, change `sendServerError`:

```javascript
function sendServerError(res, err, publicMessage = 'Server error', status = 500) {
  const requestId = (res.locals && res.locals.requestId) || newRequestId();
  logger.error(publicMessage, {
    requestId,
    err: err && err.stack ? err.stack : String(err),
    upstream: err && err.response && err.response.data
  });
  res.status(status).json({ error: publicMessage, requestId });
}
```

- [ ] **Step 4: Surface in frontend errors**

In `src/hooks/useApi.ts`, change the catch arm:

```typescript
if (!response.ok) {
  const errorData = await response.json().catch(() => ({}));
  const rid = response.headers.get('X-Request-ID');
  throw new Error(errorData.error
    ? `${errorData.error}${rid ? ` (ref ${rid})` : ''}`
    : 'Something went wrong');
}
```

- [ ] **Step 5: Run tests + commit**

Run: `npm test`
Expected: all green (no behavior change to existing assertions).

```bash
git add server/lib/requestId.js server/app.js server/utils/errors.js src/hooks/useApi.ts
git commit -m "feat(obs): X-Request-ID middleware + propagate to error toasts"
```

### Task 9: CSP enabled in all modes

**Files:**
- Modify: `server/app.js`

- [ ] **Step 1: Replace the helmet CSP toggle with a safe always-on policy**

```javascript
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      // Vite dev injects inline scripts via HMR — disable script-src
      // in dev only. Otherwise default to strict same-origin.
      'script-src': IS_PROD ? ["'self'"] : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'connect-src': ["'self'", 'https://*.plaid.com', 'https:'],
      'img-src': ["'self'", 'data:', 'https:'],
      'frame-src': ['https://cdn.plaid.com']
    }
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
```

- [ ] **Step 2: Verify the existing helmet test still finds X-Frame-Options**

Run: `npm test -- tests/server/health-and-rules.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add server/app.js
git commit -m "fix(security): keep CSP enabled in dev with vite-compatible directives"
```

---

## Phase 3 — UX polish

### Task 10: Recurring price-tier merging

**Files:**
- Modify: `src/utils/recurringDetection.ts`
- Modify: `src/types/index.ts`
- Modify: `src/components/dashboard/RecurringList.tsx`
- Modify: `src/utils/__tests__/recurringDetection.test.ts`

- [ ] **Step 1: Extend RecurringTransaction type with `priceRange`**

`src/types/index.ts`:
```typescript
export interface RecurringTransaction {
  description: string;
  amount: number;
  minAmount: number;
  maxAmount: number;
  category: string;
  occurrences: number;
  lastSeen: string;
  averageIntervalDays: number;
}
```

- [ ] **Step 2: Merge adjacent buckets within ±15%**

In `src/utils/recurringDetection.ts`, after building per-description groups, post-process to merge buckets whose amounts are within 15% of each other for the same normalized description.

```typescript
function mergeBuckets(groups: Map<string, Transaction[]>): Map<string, Transaction[]> {
  const byDesc = new Map<string, Map<string, Transaction[]>>();
  for (const [key, list] of groups) {
    const [desc, amt] = key.split('|');
    if (!byDesc.has(desc)) byDesc.set(desc, new Map());
    byDesc.get(desc)!.set(amt, list);
  }
  const out = new Map<string, Transaction[]>();
  for (const [desc, amountMap] of byDesc) {
    const sortedBuckets = Array.from(amountMap.entries())
      .map(([k, l]) => ({ amount: Number(k), list: l }))
      .sort((a, b) => a.amount - b.amount);
    // Greedy merge: walk in ascending order, glue if within 15% of running average.
    let acc: { amount: number; list: Transaction[] } | null = null;
    for (const b of sortedBuckets) {
      if (!acc) { acc = { amount: b.amount, list: [...b.list] }; continue; }
      if (b.amount <= acc.amount * 1.15) {
        acc.list.push(...b.list);
      } else {
        out.set(`${desc}|${acc.amount}`, acc.list);
        acc = { amount: b.amount, list: [...b.list] };
      }
    }
    if (acc) out.set(`${desc}|${acc.amount}`, acc.list);
  }
  return out;
}
```

Call `mergeBuckets(groups)` before iterating to detect recurrences. Compute `minAmount`/`maxAmount` from the merged list.

- [ ] **Step 3: Show price-range hint in UI**

`src/components/dashboard/RecurringList.tsx`:
```tsx
<div className="text-xs text-gray-500">
  {r.category} · {r.occurrences}× · every ~{r.averageIntervalDays} days
  {r.minAmount !== r.maxAmount && (
    <> · {formatCurrency(r.minAmount, userRegion.currency)}–{formatCurrency(r.maxAmount, userRegion.currency)}</>
  )}
</div>
```

- [ ] **Step 4: Test**

```typescript
// in recurringDetection.test.ts
it('merges $10 and $11 into one recurring when both occur monthly', () => {
  const txs = [
    tx('2026-02-15', -10, 'NETFLIX'),
    tx('2026-03-15', -10, 'NETFLIX'),
    tx('2026-04-15', -11, 'NETFLIX'),
    tx('2026-05-15', -11, 'NETFLIX')
  ];
  const r = detectRecurringTransactions(txs);
  expect(r).toHaveLength(1);
  expect(r[0].minAmount).toBe(10);
  expect(r[0].maxAmount).toBe(11);
});
```

- [ ] **Step 5: Run tests + commit**

Run: `npm test`
Expected: green.

```bash
git add src/utils/recurringDetection.ts src/utils/__tests__/recurringDetection.test.ts src/types/index.ts src/components/dashboard/RecurringList.tsx
git commit -m "feat(ui): merge ±15% adjacent buckets into one recurring with price range"
```

### Task 11: Investment-account empty-state hint

**Files:**
- Create: `src/components/dashboard/InvestmentEmptyHint.tsx`
- Modify: `src/components/CardManagerRefactored.tsx`

- [ ] **Step 1: Build the hint component**

```tsx
// src/components/dashboard/InvestmentEmptyHint.tsx
import React from 'react';
import { TrendingUp, Info } from 'lucide-react';
import type { Card } from '../../types';

interface Props { cards: Card[]; transactions: { card_id?: number; cardId?: number }[]; }

export const InvestmentEmptyHint: React.FC<Props> = ({ cards, transactions }) => {
  const investmentCards = cards.filter(c =>
    c.category === 'investment' || c.category === 'tfsa' || c.category === 'rrsp');
  if (investmentCards.length === 0) return null;
  const txCardIds = new Set(transactions.map(t => t.cardId ?? (t as any).card_id));
  const empty = investmentCards.filter(c => !txCardIds.has(c.id));
  if (empty.length === 0) return null;
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900 mb-4 flex items-start gap-2">
      <Info size={16} className="text-blue-600 mt-0.5" />
      <div>
        <strong>{empty.length} investment account{empty.length > 1 ? 's' : ''} show balances but no transactions.</strong>
        {' '}Plaid's <code>/transactions/sync</code> only returns depository + credit activity.
        Brokerage trades and contributions need <code>/investments/transactions</code>,
        which this app doesn't call yet. Balances will refresh; trade history won't.
        <ul className="mt-1 list-disc list-inside text-xs text-blue-700">
          {empty.slice(0, 5).map(c => (
            <li key={c.id}>{c.name} ••••{c.last_four}</li>
          ))}
          {empty.length > 5 && <li>and {empty.length - 5} more</li>}
        </ul>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Mount in dashboard**

In `src/components/CardManagerRefactored.tsx`, just above the Insights row:

```tsx
import { InvestmentEmptyHint } from './dashboard/InvestmentEmptyHint';
// ...
<InvestmentEmptyHint cards={cards} transactions={transactions} />
```

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/InvestmentEmptyHint.tsx src/components/CardManagerRefactored.tsx
git commit -m "feat(ui): hint when investment accounts have balances but no transaction history"
```

### Task 12: Rule conflict preview

**Files:**
- Create: `src/components/dashboard/RulePreviewPopover.tsx`
- Modify: `src/components/forms/TransactionEditModal.tsx`
- Modify: `src/components/dashboard/RulesPanel.tsx`

- [ ] **Step 1: Build the popover component**

```tsx
// src/components/dashboard/RulePreviewPopover.tsx
import React from 'react';
import type { Transaction } from '../../types';

interface Props {
  pattern: string;
  transactions: Transaction[];
}

export const RulePreviewPopover: React.FC<Props> = ({ pattern, transactions }) => {
  const p = pattern.trim().toLowerCase();
  if (!p) return null;
  const matches = transactions.filter(t =>
    (t.description ?? '').toLowerCase().includes(p)).slice(0, 5);
  return (
    <div className="text-xs bg-gray-50 border border-gray-200 rounded p-2 mt-1">
      {matches.length === 0
        ? <span className="text-gray-500">No existing transactions match this pattern.</span>
        : (
          <>
            <div className="text-gray-500 mb-1">{matches.length} match{matches.length > 1 ? 'es' : ''} (sample):</div>
            {matches.map(t => (
              <div key={t.id} className="truncate text-gray-700">{t.date} · {t.description}</div>
            ))}
          </>
        )}
    </div>
  );
};
```

- [ ] **Step 2: Wire into TransactionEditModal**

In `src/components/forms/TransactionEditModal.tsx`, accept `allTransactions` prop and render the popover below the merchant pattern field when `rememberMerchant` is true:

```tsx
{rememberMerchant && (
  <>
    <input ... />
    <RulePreviewPopover pattern={merchantPattern} transactions={allTransactions} />
  </>
)}
```

Pass `allTransactions={transactions}` from `CardManagerRefactored`.

- [ ] **Step 3: Same popover in RulesPanel add form**

Add the popover beneath the pattern input in both categorization and split forms.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/RulePreviewPopover.tsx src/components/forms/TransactionEditModal.tsx src/components/dashboard/RulesPanel.tsx src/components/CardManagerRefactored.tsx
git commit -m "feat(ui): rule pattern preview shows sample matches before saving"
```

### Task 13: RulesPanel mobile responsive

**Files:**
- Modify: `src/components/dashboard/RulesPanel.tsx`

- [ ] **Step 1: Replace the dense `grid-cols-6` form with stacked-on-mobile layout**

Change the split-rule form `grid-cols-1 sm:grid-cols-6` to `grid-cols-1 sm:grid-cols-2 lg:grid-cols-6` and adjust col-spans accordingly.

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/RulesPanel.tsx
git commit -m "fix(ui): RulesPanel split form reflows on small screens"
```

### Task 14: CSV metadata header

**Files:**
- Modify: `src/utils/csvExport.ts`
- Modify: `src/utils/__tests__/csvExport.test.ts`

- [ ] **Step 1: Add a meta block at the top of the CSV**

```typescript
// in transactionsToCsv():
const meta = [
  `# Exported: ${new Date().toISOString()}`,
  `# Rows: ${transactions.length}`,
  `# Source: card-manager`
].join('\r\n');
return meta + '\r\n' + [header.join(','), ...rows].join('\r\n');
```

- [ ] **Step 2: Update test expectations**

```typescript
// in csvExport.test.ts adjust the first test:
it('emits a metadata block then header and rows', () => {
  const csv = transactionsToCsv([
    { id: 1, card_id: 1, cardId: 1, amount: -12.34, description: 'COFFEE', category: 'Food', date: '2026-04-01', source: 'plaid' }
  ], cards);
  const lines = csv.split('\r\n');
  expect(lines[0]).toMatch(/^# Exported:/);
  expect(lines[1]).toMatch(/^# Rows: 1/);
  expect(lines.find(l => l.startsWith('date,description'))).toBeDefined();
});
```

- [ ] **Step 3: Commit**

```bash
git add src/utils/csvExport.ts src/utils/__tests__/csvExport.test.ts
git commit -m "feat(export): prepend metadata header (timestamp + row count) to CSV"
```

### Task 15: Cross-month refund visibility

**Files:**
- Create: `src/utils/refundCrossMonth.ts`
- Create: `src/utils/__tests__/refundCrossMonth.test.ts`
- Modify: `src/components/dashboard/TransactionsList.tsx`

- [ ] **Step 1: Write the detector**

```typescript
// src/utils/refundCrossMonth.ts
import type { Transaction } from '../types';

// Given the full transaction history, find refunds that pair to a purchase
// posted in a different calendar month. Returns a Set of refund txn ids that
// should be flagged in the UI as "cross-month refund — original purchase X".

const REFUND_KEYWORDS = /\brefund\b|\breversal\b|\breversed\b|merchandise return/i;

export interface CrossMonthRefund {
  refundId: number;
  purchaseId: number;
  purchaseMonth: string;
}

export function findCrossMonthRefunds(transactions: Transaction[]): CrossMonthRefund[] {
  const out: CrossMonthRefund[] = [];
  // Index purchases by card_id + amount magnitude for cheap lookup.
  const purchasesByKey = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (t.amount >= 0) continue;
    const cardId = (t as any).cardId ?? (t as any).card_id;
    const key = `${cardId}|${Math.round(Math.abs(t.amount))}`;
    if (!purchasesByKey.has(key)) purchasesByKey.set(key, []);
    purchasesByKey.get(key)!.push(t);
  }
  for (const r of transactions) {
    if (r.amount <= 0) continue;
    if (!REFUND_KEYWORDS.test(r.description || '')) continue;
    const cardId = (r as any).cardId ?? (r as any).card_id;
    const candidates = purchasesByKey.get(`${cardId}|${Math.round(r.amount)}`) || [];
    const match = candidates.find(p =>
      p.date <= r.date && p.date.slice(0, 7) !== r.date.slice(0, 7));
    if (match) {
      out.push({ refundId: r.id, purchaseId: match.id, purchaseMonth: match.date.slice(0, 7) });
    }
  }
  return out;
}
```

- [ ] **Step 2: Tests**

```typescript
// src/utils/__tests__/refundCrossMonth.test.ts
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
});
```

- [ ] **Step 3: Surface in TransactionsList**

```tsx
// import the helper at top
import { findCrossMonthRefunds } from '../../utils/refundCrossMonth';
// inside the component:
const crossMonth = React.useMemo(
  () => new Map(findCrossMonthRefunds(transactions).map(x => [x.refundId, x])),
  [transactions]
);
// for refund rows that have a cross-month link, show a secondary line:
{crossMonth.has(transaction.id) && (
  <p className="text-[10px] text-blue-600">
    Refunds a purchase from {crossMonth.get(transaction.id)!.purchaseMonth}
  </p>
)}
```

- [ ] **Step 4: Run tests + commit**

Run: `npm test`
Expected: green.

```bash
git add src/utils/refundCrossMonth.ts src/utils/__tests__/refundCrossMonth.test.ts src/components/dashboard/TransactionsList.tsx
git commit -m "feat(ui): flag cross-month refunds with original purchase month"
```

---

## Phase 4 — Ops & coverage

### Task 16: End-to-end sync integration test

**Files:**
- Create: `tests/server/__mocks__/plaidMock.ts`
- Create: `tests/server/sync-e2e.test.ts`

- [ ] **Step 1: Build a minimal Plaid SDK mock**

```typescript
// tests/server/__mocks__/plaidMock.ts
//
// Stub the parts of the Plaid SDK we call from server/lib/plaid.js so
// integration tests can run without network.

export function makeMockPlaid(scenario: {
  accounts: any[];
  transactionsSync: { added: any[]; modified?: any[]; removed?: any[]; next_cursor: string; has_more?: boolean };
}) {
  return {
    itemPublicTokenExchange: async () => ({ data: { access_token: 'enc-stub', item_id: 'IT_STUB' } }),
    accountsGet: async () => ({ data: { accounts: scenario.accounts } }),
    transactionsSync: async () => ({ data: {
      added: scenario.transactionsSync.added,
      modified: scenario.transactionsSync.modified || [],
      removed: scenario.transactionsSync.removed || [],
      has_more: scenario.transactionsSync.has_more || false,
      next_cursor: scenario.transactionsSync.next_cursor
    }})
  };
}
```

- [ ] **Step 2: Write the test**

```typescript
// tests/server/sync-e2e.test.ts
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
    // Swap the plaid client used by lib/plaid.js
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
```

- [ ] **Step 3: Run test**

Run: `npm test -- tests/server/sync-e2e.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/server/__mocks__/plaidMock.ts tests/server/sync-e2e.test.ts
git commit -m "test(e2e): register → exchange → sync → aggregate"
```

### Task 17: Backup UI trigger

**Files:**
- Create: `server/routes/backup.js`
- Modify: `server/app.js`
- Modify: `src/components/CardManagerRefactored.tsx` (menu item) OR add to existing menu component

- [ ] **Step 1: Server route**

```javascript
// server/routes/backup.js
const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

module.exports = function makeBackupRoutes(deps) {
  const { authenticateToken, sendServerError } = deps;
  const router = express.Router();
  const scriptPath = path.join(__dirname, '..', 'scripts', 'backup-db.sh');
  const backupDir = path.join(__dirname, '..', 'backups');

  router.post('/run', authenticateToken, (req, res) => {
    const child = spawn('bash', [scriptPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { err += d.toString(); });
    child.on('close', code => {
      if (code !== 0) return sendServerError(res, new Error(err || `exit ${code}`), 'Backup failed');
      res.json({ ok: true, log: out });
    });
  });

  router.get('/list', authenticateToken, (req, res) => {
    if (!fs.existsSync(backupDir)) return res.json({ backups: [] });
    const files = fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.db'))
      .map(f => {
        const stat = fs.statSync(path.join(backupDir, f));
        return { name: f, size: stat.size, modified: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.modified.localeCompare(a.modified));
    res.json({ backups: files });
  });

  return router;
};
```

- [ ] **Step 2: Mount in app.js**

```javascript
const backupRoutes = require('./routes/backup');
// ...
app.use('/api/backup', backupRoutes(sharedDeps));
```

- [ ] **Step 3: Add a button in the menu**

In the existing dropdown menu inside `CardManagerRefactored.tsx`, add an item:

```tsx
<button
  onClick={async () => {
    setShowMenu(false);
    try {
      const r = await fetch(`${API_BASE_URL}/api/backup/run`, { method: 'POST', credentials: 'include' });
      const data = await r.json();
      setSyncBanner({ show: true,
        message: data.ok ? 'Backup created.' : 'Backup failed',
        type: data.ok ? 'success' : 'error' });
    } catch {
      setSyncBanner({ show: true, message: 'Backup failed', type: 'error' });
    }
  }}
  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
>
  Run Backup Now
</button>
```

- [ ] **Step 4: Smoke test in browser + commit**

Manual: open dashboard → menu → Run Backup Now → confirm banner reads "Backup created." and `server/backups/` has a new file.

```bash
git add server/routes/backup.js server/app.js src/components/CardManagerRefactored.tsx
git commit -m "feat(ops): one-click backup trigger from dashboard menu"
```

---

## Final verification

- [ ] **Step 1: Full test sweep**

Run: `npm test`
Expected: all tests pass; new count should be ≥ 67.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: clean build, main bundle ≤ 280 KB, NetWorthChart chunk ≤ 400 KB.

- [ ] **Step 3: Server boots + migrations applied**

```bash
pkill -f "node index.js" 2>/dev/null
sleep 1
cd server && node index.js > /tmp/boot.log 2>&1 &
sleep 3
head -20 /tmp/boot.log
sqlite3 database.db "SELECT version FROM schema_migrations ORDER BY version;"
```
Expected: versions 1–10 present, server "running on port 3001".

- [ ] **Step 4: Endpoint smoke**

```bash
curl -s -o /dev/null -w "health %{http_code}\n" http://localhost:3001/health
curl -s -o /dev/null -w "rules %{http_code}\n" http://localhost:3001/api/categorization-rules
curl -s -o /dev/null -w "refresh %{http_code}\n" -X POST http://localhost:3001/api/auth/refresh
curl -s -o /dev/null -w "backup %{http_code}\n" -X POST http://localhost:3001/api/backup/run
```
Expected: health 200, rules 401, refresh 401, backup 401.

- [ ] **Step 5: Final commit (changelog)**

If you keep a CHANGELOG.md, append an entry. Otherwise:

```bash
git log --oneline -20
```
Confirm 17 task commits exist + are intentional.
