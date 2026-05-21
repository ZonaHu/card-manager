# Power Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four power-user wins — bulk recategorize, one-click quick-add transaction from dashboard, soft-delete transactions with undo, and a version field on persisted localStorage state so future shape changes don't silently break stored data.

**Architecture:** React 18 + Vite + TS frontend, Express + SQLite. New columns + endpoints stay backward-compatible: `deleted_at` defaults NULL (so existing rows look "live"), batch-recategorize is additive, versioned persistedState reuses the existing read/write helpers. 130 tests currently green; must stay green at every commit. Branch `main`; user has standing approval for direct commits and pushes.

**Tech Stack:** React 18.2, Vite 4.5, Tailwind, vitest 1.6, supertest, lucide-react. Migrations end at 015; this plan adds 016.

---

## File Structure

**New files:**
- `server/migrations/016_transactions_deleted_at.js` — adds `deleted_at TEXT NULL` to transactions + an index for the SELECT filter
- `src/components/dashboard/TransactionSelectionBar.tsx` — fixed-bottom bar that appears when ≥1 row is selected, hosts the bulk-recategorize control
- `src/components/dashboard/UndoDeleteBanner.tsx` — short-lived toast offering "Undo" after a delete; auto-dismisses after 30 s
- `src/utils/__tests__/persistedState.versioning.test.ts` — tests for the new version-mismatch fallback

**Modified files:**
- `server/routes/transactions.js` — adds `POST /:id/restore` + `DELETE /:id` (soft) + `POST /batch-recategorize`; GET / now adds `AND deleted_at IS NULL`
- `src/components/dashboard/TransactionsList.tsx` — adds per-row checkbox + "select all" header + bulk-action props
- `src/components/CardManagerRefactored.tsx` — wires selection state, quick-add button, undo banner mount
- `src/components/forms/TransactionEditModal.tsx` — adds Delete button (calls DELETE then closes modal + surfaces undo)
- `src/services/transactionService.ts` — `deleteTransaction`, `restoreTransaction`, `batchRecategorize` methods
- `src/utils/persistedState.ts` — accepts a `version` arg + drops stored payloads from prior versions
- `tests/server/reimbursement.test.ts` — extend with soft-delete + restore + batch-recategorize tests (reuses existing seed helper)

---

## Phase 1 — Backend foundations

### Task 1: Migration 016 — `deleted_at` on transactions

**Files:**
- Create: `server/migrations/016_transactions_deleted_at.js`

- [ ] **Step 1: Write the migration**

```javascript
// server/migrations/016_transactions_deleted_at.js
//
// Soft-delete column. NULL = live, ISO timestamp = deleted at that time.
// Index speeds up the "WHERE deleted_at IS NULL" filter the GET route now
// has on every query.

async function safeAddColumn(dbRun, table, columnDef) {
  try { await dbRun(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`); }
  catch (err) {
    if (!String(err && err.message).includes('duplicate column name')) throw err;
  }
}

exports.up = async (db, { dbRun }) => {
  await safeAddColumn(dbRun, 'transactions', `deleted_at TEXT`);
  await dbRun('CREATE INDEX IF NOT EXISTS idx_transactions_deleted_at ON transactions(deleted_at)');
};
```

- [ ] **Step 2: Restart server, verify migration applied**

```bash
pkill -f "node index.js" 2>/dev/null; sleep 1
cd /Users/zuomiaohu/Desktop/card-manager/server && node index.js > /tmp/boot.log 2>&1 &
sleep 3
head -5 /tmp/boot.log
sqlite3 /Users/zuomiaohu/Desktop/card-manager/server/database.db "SELECT version FROM schema_migrations ORDER BY version;"
sqlite3 /Users/zuomiaohu/Desktop/card-manager/server/database.db "PRAGMA table_info(transactions);" | grep deleted_at
```

Expected: `applying migration 016_...`, versions 1–16 listed, `deleted_at|TEXT|0||0` row.

- [ ] **Step 3: Commit**

```bash
git add server/migrations/016_transactions_deleted_at.js
git commit -m "$(cat <<'EOF'
feat(db): migration 016 — transactions.deleted_at for soft delete

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Soft-delete + restore + filter routes

**Files:**
- Modify: `server/routes/transactions.js`
- Modify: `tests/server/reimbursement.test.ts` (extend with new tests — file already imports buildTestApp)

- [ ] **Step 1: Filter GET / to hide deleted rows**

In `server/routes/transactions.js`, find the existing `router.get('/', ...)` handler. The SQL is currently:

```javascript
db.all(
  `SELECT * FROM transactions ${where} ORDER BY date DESC LIMIT ? OFFSET ?`,
  ...
);
```

Update the `where` builder so every list query excludes deleted rows. Replace the existing `let where = 'WHERE user_id = ?';` with:

```javascript
let where = 'WHERE user_id = ? AND deleted_at IS NULL';
```

The existing `if (month) { where += ' AND date >= ? AND date < ?'; ... }` branch keeps working because we just appended a new top-level condition before any later append.

- [ ] **Step 2: Add the DELETE handler (soft)**

Below the existing `router.put('/:id', ...)` handler and BEFORE `return router;`, add:

```javascript
// Soft-delete: stamp deleted_at instead of dropping the row, so the user
// can undo within the UI window. The reimbursement-pointer scrub trigger
// (migration 015) doesn't fire on soft delete — and that's deliberate;
// the linked reimbursement keeps working until the user actually purges.
router.delete('/:id', authenticateToken, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid transaction id' });
  db.run(
    `UPDATE transactions SET deleted_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [id, req.user.userId],
    function (err) {
      if (err) return sendServerError(res, err);
      if (this.changes === 0) return res.status(404).json({ error: 'Transaction not found' });
      res.json({ ok: true, id });
    }
  );
});

// Restore endpoint — flips deleted_at back to NULL. Only the owner can
// restore their own row.
router.post('/:id/restore', authenticateToken, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid transaction id' });
  db.run(
    'UPDATE transactions SET deleted_at = NULL WHERE id = ? AND user_id = ?',
    [id, req.user.userId],
    function (err) {
      if (err) return sendServerError(res, err);
      if (this.changes === 0) return res.status(404).json({ error: 'Transaction not found' });
      db.get('SELECT * FROM transactions WHERE id = ?', [id],
        (e, row) => e ? sendServerError(res, e) : res.json(row));
    }
  );
});
```

- [ ] **Step 3: Write tests in reimbursement.test.ts (file already covers transactions routes)**

Append to `tests/server/reimbursement.test.ts` inside the existing top-level `describe('POST /api/transactions/:id/reimburses', ...)` block (or a sibling `describe`):

```typescript
describe('soft-delete + restore', () => {
  let app: any;
  beforeEach(async () => { ({ app } = await buildTestApp()); });

  async function seedRow(agent: any) {
    await agent.post('/api/auth/register')
      .send({ name: 'D', email: 'd@example.com', password: 'longenough123' });
    const cardRes = await agent.post('/api/cards').send({
      name: 'Test Checking', type: 'debit', lastFour: '0001', balance: 1000
    });
    const txRes = await agent.post('/api/transactions').send({
      cardId: cardRes.body.id, amount: -10, description: 'COFFEE',
      category: 'Food', date: '2026-04-01'
    });
    return { txId: txRes.body.id };
  }

  it('DELETE /:id hides the row from subsequent GET /', async () => {
    const agent = request.agent(app);
    const { txId } = await seedRow(agent);
    const before = await agent.get('/api/transactions');
    expect(before.body.find((t: any) => t.id === txId)).toBeTruthy();

    const del = await agent.delete(`/api/transactions/${txId}`);
    expect(del.status).toBe(200);

    const after = await agent.get('/api/transactions');
    expect(after.body.find((t: any) => t.id === txId)).toBeUndefined();
  });

  it('POST /:id/restore brings the row back', async () => {
    const agent = request.agent(app);
    const { txId } = await seedRow(agent);
    await agent.delete(`/api/transactions/${txId}`);

    const res = await agent.post(`/api/transactions/${txId}/restore`);
    expect(res.status).toBe(200);
    expect(res.body.deleted_at).toBeNull();

    const after = await agent.get('/api/transactions');
    expect(after.body.find((t: any) => t.id === txId)).toBeTruthy();
  });

  it('DELETE is idempotent — second delete on the same row returns 404 (already deleted)', async () => {
    const agent = request.agent(app);
    const { txId } = await seedRow(agent);
    await agent.delete(`/api/transactions/${txId}`);
    const res2 = await agent.delete(`/api/transactions/${txId}`);
    expect(res2.status).toBe(404);
  });

  it('restoring another user\'s deleted row returns 404 — no cross-user reach', async () => {
    const a = request.agent(app);
    const { txId } = await seedRow(a);
    await a.delete(`/api/transactions/${txId}`);

    const b = request.agent(app);
    await b.post('/api/auth/register')
      .send({ name: 'B', email: 'b@example.com', password: 'longenough123' });
    const res = await b.post(`/api/transactions/${txId}/restore`);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 4: Run tests + build**

Run: `npm test`
Expected: 134 passing (130 + 4 new).

Run: `npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add server/routes/transactions.js tests/server/reimbursement.test.ts
git commit -m "$(cat <<'EOF'
feat(api): soft-delete + restore endpoints for transactions

DELETE /api/transactions/:id stamps deleted_at instead of dropping the row.
POST /api/transactions/:id/restore flips deleted_at back to NULL.
GET / now filters WHERE deleted_at IS NULL so deleted rows disappear from
the dashboard immediately. 4 new tests cover the round-trip, idempotency,
and cross-user isolation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Batch-recategorize endpoint

**Files:**
- Modify: `server/routes/transactions.js`
- Modify: `tests/server/reimbursement.test.ts`

- [ ] **Step 1: Add the endpoint**

In `server/routes/transactions.js`, just before `return router;`, add:

```javascript
// Bulk category update. Body: { ids: number[], category: string }. Limits
// to 500 ids per call so a runaway client can't lock the DB; the dashboard
// never selects that many in a single action.
router.post('/batch-recategorize', authenticateToken, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Number.isFinite) : null;
  const category = typeof req.body?.category === 'string' ? req.body.category.trim() : '';
  if (!ids || ids.length === 0) return res.status(400).json({ error: 'ids array is required' });
  if (ids.length > 500) return res.status(400).json({ error: 'too many ids (max 500)' });
  if (!category) return res.status(400).json({ error: 'category is required' });

  const placeholders = ids.map(() => '?').join(',');
  db.run(
    `UPDATE transactions SET category = ? WHERE id IN (${placeholders}) AND user_id = ? AND deleted_at IS NULL`,
    [category, ...ids, req.user.userId],
    function (err) {
      if (err) return sendServerError(res, err);
      res.json({ ok: true, updated: this.changes });
    }
  );
});
```

- [ ] **Step 2: Write tests**

Append a new `describe` block to `tests/server/reimbursement.test.ts`:

```typescript
describe('POST /api/transactions/batch-recategorize', () => {
  let app: any;
  beforeEach(async () => { ({ app } = await buildTestApp()); });

  async function seedThree(agent: any) {
    await agent.post('/api/auth/register')
      .send({ name: 'C', email: 'c@example.com', password: 'longenough123' });
    const cardRes = await agent.post('/api/cards').send({
      name: 'C Checking', type: 'debit', lastFour: '0001', balance: 1000
    });
    const cardId = cardRes.body.id;
    const ids: number[] = [];
    for (const desc of ['A', 'B', 'C']) {
      const r = await agent.post('/api/transactions').send({
        cardId, amount: -10, description: desc, category: 'Other', date: '2026-04-01'
      });
      ids.push(r.body.id);
    }
    return ids;
  }

  it('updates category on every supplied id (in caller\'s scope)', async () => {
    const agent = request.agent(app);
    const ids = await seedThree(agent);
    const res = await agent.post('/api/transactions/batch-recategorize')
      .send({ ids, category: 'Food' });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(3);

    const list = await agent.get('/api/transactions');
    for (const id of ids) {
      const row = list.body.find((t: any) => t.id === id);
      expect(row.category).toBe('Food');
    }
  });

  it('rejects empty ids array', async () => {
    const agent = request.agent(app);
    await seedThree(agent);
    const res = await agent.post('/api/transactions/batch-recategorize')
      .send({ ids: [], category: 'Food' });
    expect(res.status).toBe(400);
  });

  it('cannot touch another user\'s rows', async () => {
    const a = request.agent(app);
    const aIds = await seedThree(a);

    const b = request.agent(app);
    await b.post('/api/auth/register')
      .send({ name: 'B', email: 'b2@example.com', password: 'longenough123' });
    const res = await b.post('/api/transactions/batch-recategorize')
      .send({ ids: aIds, category: 'Food' });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(0); // user_id filter zero'd out all matches
  });
});
```

- [ ] **Step 3: Run + commit**

Run: `npm test`
Expected: 137 passing (134 + 3).

```bash
git add server/routes/transactions.js tests/server/reimbursement.test.ts
git commit -m "$(cat <<'EOF'
feat(api): batch-recategorize endpoint

POST /api/transactions/batch-recategorize { ids, category } updates many
rows at once, bounded to 500 ids per call. Filtered to caller's user_id +
deleted_at IS NULL so cross-user reach is impossible and already-deleted
rows are skipped silently.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — Versioned persistence

### Task 4: persistedState supports a version field

**Files:**
- Modify: `src/utils/persistedState.ts`
- Create: `src/utils/__tests__/persistedState.versioning.test.ts`
- Modify: `src/components/CardManagerRefactored.tsx` (bump both keys to v=1)

- [ ] **Step 1: Write the failing test**

```typescript
// @vitest-environment happy-dom
// src/utils/__tests__/persistedState.versioning.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { readPersisted, writePersisted } from '../persistedState';

describe('persistedState versioning', () => {
  beforeEach(() => { window.localStorage.clear(); });

  it('reads a value back when version matches', () => {
    writePersisted('test:v', { value: 1 }, 2);
    expect(readPersisted('test:v', { value: 0 }, 2)).toEqual({ value: 1 });
  });

  it('returns fallback when stored version is lower than requested', () => {
    writePersisted('test:v', { value: 1 }, 1);
    expect(readPersisted('test:v', { value: 99 }, 2)).toEqual({ value: 99 });
  });

  it('returns fallback when stored version is higher than requested', () => {
    // Forward-compat: a newer app shape that we don\'t know how to parse yet
    // should also fall through to fallback rather than handing back the
    // future-format value.
    writePersisted('test:v', { value: 1 }, 5);
    expect(readPersisted('test:v', { value: 99 }, 2)).toEqual({ value: 99 });
  });

  it('omitting version on both sides preserves the unversioned path', () => {
    writePersisted('test:noversion', { a: 1 });
    expect(readPersisted('test:noversion', null)).toEqual({ a: 1 });
  });

  it('a stored UNVERSIONED payload is treated as version=0 — a request for v>=1 falls back', () => {
    // This is what gives existing users a clean slate when we bump the
    // schema: their old key (no version envelope) is discarded the first
    // time we read with a version arg.
    window.localStorage.setItem('test:upgrade', JSON.stringify({ raw: 'old' }));
    expect(readPersisted('test:upgrade', { fresh: true }, 1)).toEqual({ fresh: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/utils/__tests__/persistedState.versioning.test.ts`
Expected: FAIL — the helpers don't accept a version arg yet.

- [ ] **Step 3: Update persistedState.ts**

Replace the file contents:

```typescript
// src/utils/persistedState.ts

/**
 * Read a JSON value from localStorage with safe fallback.
 *
 * When called with a version arg, the stored payload MUST be wrapped as
 * `{ v: number, data: T }` and v must equal the requested version. Any
 * other shape (legacy unversioned blob, lower version, higher version)
 * falls back to the supplied default. This is how we let future shape
 * changes invalidate stored state silently instead of handing the UI a
 * payload it can't parse.
 *
 * Without a version arg, the original raw round-trip behavior is preserved.
 */
export function readPersisted<T>(key: string, fallback: T, version?: number): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    if (version === undefined) return parsed as T;
    if (parsed && typeof parsed === 'object' && parsed.v === version && 'data' in parsed) {
      return parsed.data as T;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

/**
 * Write a JSON-serializable value to localStorage. Pass a version to wrap
 * as `{ v, data }`; readers can then detect schema drift on the next load.
 * `null` removes the key entirely.
 */
export function writePersisted(key: string, value: unknown, version?: number): void {
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
      return;
    }
    const payload = version === undefined ? value : { v: version, data: value };
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/utils/__tests__/persistedState.versioning.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Bump the two existing keys to v=1**

In `src/components/CardManagerRefactored.tsx`, find the `searchQuery` + `chipFilters` lazy initializers + their write effects (around lines 109–115 and 124–125). Add a constant version and thread it through both calls:

```tsx
const PERSIST_VERSION = 1;
```

(Add this next to the existing `SEARCH_KEY` + `CHIPS_KEY` constants near the top of the file.)

Then update the four call sites:

```tsx
const [searchQuery, setSearchQuery] = useState<string>(
  () => readPersisted(SEARCH_KEY, '', PERSIST_VERSION)
);
const [chipFilters, setChipFilters] = useState<{
  category?: string; cardId?: number | null; pendingOnly?: boolean;
  minAmount?: number; maxAmount?: number;
}>(() => readPersisted(CHIPS_KEY, {}, PERSIST_VERSION));
```

```tsx
useEffect(() => { writePersisted(SEARCH_KEY, searchQuery, PERSIST_VERSION); }, [searchQuery]);
useEffect(() => { writePersisted(CHIPS_KEY, chipFilters, PERSIST_VERSION); }, [chipFilters]);
```

- [ ] **Step 6: Run all tests + build + commit**

Run: `npm test`
Expected: 142 passing (137 + 5 new).

Run: `npm run build`
Expected: clean.

```bash
git add src/utils/persistedState.ts src/utils/__tests__/persistedState.versioning.test.ts src/components/CardManagerRefactored.tsx
git commit -m "$(cat <<'EOF'
feat(persist): version field on persisted state, fallback on mismatch

readPersisted/writePersisted now accept an optional version. When set the
payload is wrapped as { v, data }; readers fall back to the supplied
default when the stored version differs (lower, higher, or
unversioned-from-an-old-app-build). Bumped search + chip-filters keys to
v=1 so any future shape change just needs a version bump to invalidate
stored state cleanly.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — Quick-add transaction

### Task 5: Surface "Add transaction" button on the dashboard

**Files:**
- Modify: `src/components/CardManagerRefactored.tsx`

- [ ] **Step 1: Wire the button**

The TransactionForm already mounts behind the `showAddTransaction` flag (around line 1043 of CardManagerRefactored). The flag is currently flipped only via the burger-menu "Add Card Options" path. Expose it directly.

Find the transactions section header — search the file for the existing search input wrapper that holds `<input ... value={searchQuery} ... />`. Just before the search input (or to the right of it, in the same flex row), add:

```tsx
<button
  onClick={() => setShowAddTransaction(true)}
  className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 flex items-center gap-1.5"
  title="Manually add a transaction"
>
  <Plus size={14} /> Add transaction
</button>
```

(`Plus` is already imported at the top of the file from `lucide-react`.)

The exact wrapper to add inside depends on the existing search-row layout — find the `flex` parent of the `<input ... value={searchQuery} ... />` and append this button as a sibling so it sits on the same row.

- [ ] **Step 2: Run tests + build**

Run: `npm test`
Expected: 142 passing.

Run: `npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/CardManagerRefactored.tsx
git commit -m "$(cat <<'EOF'
feat(ui): quick-add transaction button on dashboard

The TransactionForm modal was already wired behind showAddTransaction;
this exposes it directly via a button next to the transaction search
instead of burying it under the burger menu's add-card flow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — Bulk recategorize UI

### Task 6: TransactionsList — row checkboxes + selection state

**Files:**
- Modify: `src/components/dashboard/TransactionsList.tsx`
- Modify: `src/components/CardManagerRefactored.tsx`

- [ ] **Step 1: Extend TransactionsListProps**

In `src/components/dashboard/TransactionsList.tsx`, expand the props interface:

```tsx
interface TransactionsListProps {
  transactions: Transaction[];
  cards: Card[];
  userRegion: UserRegion;
  onTransactionClick: (transaction: Transaction) => void;
  limit?: number;
  allTransactions?: Transaction[];
  filtersActive?: boolean;
  onClearFilters?: () => void;
  // New — bulk-selection wiring. When `selectedIds` is provided the list
  // renders a checkbox per row; clicking a checkbox calls onToggleSelect
  // with the row id. Omit both to keep the read-only behavior.
  selectedIds?: Set<number>;
  onToggleSelect?: (id: number) => void;
  onToggleSelectAll?: (allVisibleIds: number[], target: boolean) => void;
}
```

- [ ] **Step 2: Add the select-all header + per-row checkbox**

In the `TransactionsList` component body, just before the existing `return <div className="space-y-3">…` (where rows are mapped), add a selectAll bar that's only rendered when `onToggleSelect` is wired:

```tsx
const visibleIds = displayTransactions.map(t => t.id);
const allSelected = selectedIds !== undefined
  && visibleIds.length > 0
  && visibleIds.every(id => selectedIds.has(id));

const selectionEnabled = !!onToggleSelect;
```

Then wrap the rendered list with an optional header row:

```tsx
return (
  <div className="space-y-3">
    {selectionEnabled && onToggleSelectAll && (
      <div className="flex items-center gap-2 text-xs text-gray-600 px-3">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={(e) => onToggleSelectAll(visibleIds, e.target.checked)}
          aria-label="Select all visible transactions"
          className="accent-indigo-600"
        />
        <span>
          {selectedIds && selectedIds.size > 0
            ? `${selectedIds.size} selected`
            : 'Select all'}
        </span>
      </div>
    )}
    {displayTransactions.map(transaction => {
      // ...existing row logic
```

Inside the row map, alter the row to render a checkbox on the left when selection is enabled. Currently the row is a single `<button onClick={...}>` — to keep clicks on the checkbox from also opening the edit modal, split the row into two interactive zones. Replace the outer `<button ...>` with a `<div>` and have the existing content sit as a nested `<button>` that takes the click; the checkbox renders alongside it:

```tsx
return (
  <div
    key={transaction.id}
    className="w-full flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50 hover:border-gray-200 focus-within:ring-2 focus-within:ring-indigo-300 focus-within:border-indigo-200 transition-colors"
  >
    {selectionEnabled && (
      <input
        type="checkbox"
        checked={selectedIds!.has(transaction.id)}
        onChange={() => onToggleSelect!(transaction.id)}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Select transaction ${transaction.description}`}
        className="mr-3 accent-indigo-600 flex-shrink-0"
      />
    )}
    <button
      type="button"
      onClick={() => onTransactionClick(transaction)}
      className="flex-1 flex items-center justify-between text-left cursor-pointer focus:outline-none"
    >
      {/* existing left-side <div> with category dot + description + badges */}
      {/* existing right-side <div> with amount + date */}
    </button>
  </div>
);
```

Keep all existing badge / cross-month / reimbursement / notes JSX inside the inner `<button>`. The point of the split is to keep the checkbox's onClick scoped to selection only.

- [ ] **Step 3: Wire selection state into the parent**

In `src/components/CardManagerRefactored.tsx`, add:

```tsx
const [selectedTxIds, setSelectedTxIds] = useState<Set<number>>(new Set());

const toggleTxSelect = (id: number) => {
  setSelectedTxIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
};

const toggleSelectAll = (ids: number[], target: boolean) => {
  setSelectedTxIds(prev => {
    const next = new Set(prev);
    if (target) ids.forEach(id => next.add(id));
    else ids.forEach(id => next.delete(id));
    return next;
  });
};

const clearTxSelection = () => setSelectedTxIds(new Set());
```

Pass through to the existing `<TransactionsList … />` mount:

```tsx
<TransactionsList
  transactions={applyFilters(monthlyData.transactions, { query: searchQuery, ...chipFilters })}
  allTransactions={transactions}
  cards={cards}
  userRegion={userRegion}
  onTransactionClick={handleTransactionClick}
  filtersActive={/* existing */}
  onClearFilters={/* existing */}
  selectedIds={selectedTxIds}
  onToggleSelect={toggleTxSelect}
  onToggleSelectAll={toggleSelectAll}
/>
```

- [ ] **Step 4: Run tests + build**

Run: `npm test`
Expected: 142 passing (no test changes — UI only).

Run: `npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/TransactionsList.tsx src/components/CardManagerRefactored.tsx
git commit -m "$(cat <<'EOF'
feat(ui): row checkboxes + selection state on transactions list

TransactionsList renders a checkbox per row + a "select all visible"
header when the new selection props are wired. Selection lives in the
parent so the upcoming bulk-action bar can read from it. Click handling
split so checkboxes don't open the edit modal.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Selection action bar + bulk-recategorize wire

**Files:**
- Create: `src/components/dashboard/TransactionSelectionBar.tsx`
- Modify: `src/services/transactionService.ts`
- Modify: `src/components/CardManagerRefactored.tsx`

- [ ] **Step 1: Service method**

In `src/services/transactionService.ts`, add inside the class body:

```typescript
async batchRecategorize(ids: number[], category: string): Promise<{ ok: boolean; updated: number }> {
  return this.apiCall('/api/transactions/batch-recategorize', {
    method: 'POST',
    body: JSON.stringify({ ids, category })
  });
}
```

- [ ] **Step 2: Action bar component**

```tsx
// src/components/dashboard/TransactionSelectionBar.tsx
import React from 'react';
import { CATEGORIES } from '../../constants/categories';

interface Props {
  selectedCount: number;
  onApplyCategory: (category: string) => Promise<void>;
  onClear: () => void;
}

// Fixed-bottom action bar that appears when at least one row is selected.
// Hidden when selectedCount is 0 so it stays out of the way during normal
// browsing. Kept dead simple — one dropdown + one apply button.
export const TransactionSelectionBar: React.FC<Props> = ({ selectedCount, onApplyCategory, onClear }) => {
  const [category, setCategory] = React.useState<string>(CATEGORIES[0]);
  const [busy, setBusy] = React.useState(false);

  if (selectedCount === 0) return null;

  const apply = async () => {
    setBusy(true);
    try { await onApplyCategory(category); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-white border border-gray-200 shadow-xl rounded-full px-4 py-2 flex items-center gap-3">
      <span className="text-sm font-medium text-gray-900">
        {selectedCount} selected
      </span>
      <select
        value={category}
        onChange={e => setCategory(e.target.value)}
        className="text-sm border border-gray-300 rounded-full px-2.5 py-1 bg-white"
      >
        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <button
        type="button"
        disabled={busy}
        onClick={apply}
        className="bg-indigo-600 text-white text-sm px-3 py-1 rounded-full hover:bg-indigo-700 disabled:bg-indigo-300"
      >
        {busy ? 'Applying…' : 'Set category'}
      </button>
      <button
        type="button"
        onClick={onClear}
        className="text-sm text-gray-500 hover:text-gray-700"
      >
        Clear
      </button>
    </div>
  );
};
```

- [ ] **Step 3: Mount in CardManagerRefactored**

Add import:

```tsx
import { TransactionSelectionBar } from './dashboard/TransactionSelectionBar';
```

Add a handler near `toggleTxSelect`:

```tsx
const applyBatchCategory = async (category: string) => {
  if (selectedTxIds.size === 0) return;
  const ids = Array.from(selectedTxIds);
  try {
    await transactionService.batchRecategorize(ids, category);
    await loadData();
    clearTxSelection();
    setSyncBanner({ show: true, message: `Updated ${ids.length} transaction${ids.length === 1 ? '' : 's'}.`, type: 'success' });
    setTimeout(() => setSyncBanner(null), 4000);
  } catch (e: any) {
    setSyncBanner({ show: true, message: `Bulk update failed: ${e.message}`, type: 'error' });
  }
};
```

Mount the bar near the end of the dashboard return (just before the closing `</div>` of the outermost container, so the fixed-position rule positions it relative to the viewport):

```tsx
<TransactionSelectionBar
  selectedCount={selectedTxIds.size}
  onApplyCategory={applyBatchCategory}
  onClear={clearTxSelection}
/>
```

- [ ] **Step 4: Run tests + build**

Run: `npm test`
Expected: 142 passing.

Run: `npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/TransactionSelectionBar.tsx src/services/transactionService.ts src/components/CardManagerRefactored.tsx
git commit -m "$(cat <<'EOF'
feat(ui): bulk recategorize action bar

Fixed-bottom pill appears when ≥1 transaction is selected. Pick a category,
click Set — the new /batch-recategorize endpoint updates every selected
row in one round-trip. Selection clears on success and a sync-banner
confirms the count.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5 — Soft-delete UX (undo banner + modal hook)

### Task 8: Delete button in edit modal + UndoDeleteBanner

**Files:**
- Create: `src/components/dashboard/UndoDeleteBanner.tsx`
- Modify: `src/services/transactionService.ts`
- Modify: `src/components/forms/TransactionEditModal.tsx`
- Modify: `src/components/CardManagerRefactored.tsx`

- [ ] **Step 1: Service methods**

Add to `src/services/transactionService.ts`:

```typescript
async deleteTransaction(id: number): Promise<{ ok: boolean; id: number }> {
  return this.apiCall(`/api/transactions/${id}`, { method: 'DELETE' });
}

async restoreTransaction(id: number): Promise<Transaction> {
  const row = await this.apiCall(`/api/transactions/${id}/restore`, { method: 'POST' });
  return { ...row, cardId: row.card_id };
}
```

- [ ] **Step 2: UndoDeleteBanner**

```tsx
// src/components/dashboard/UndoDeleteBanner.tsx
import React from 'react';
import { Trash2 } from 'lucide-react';

interface Props {
  description: string;
  onUndo: () => void;
  onDismiss: () => void;
  ttlMs?: number;
}

/**
 * Shown briefly after a transaction soft-delete. Clicking Undo restores;
 * otherwise the banner self-dismisses after ttlMs so the dashboard
 * doesn't clutter. The soft-delete row stays in the DB (deleted_at set)
 * regardless — the banner only manages the visible affordance.
 */
export const UndoDeleteBanner: React.FC<Props> = ({ description, onUndo, onDismiss, ttlMs = 30_000 }) => {
  React.useEffect(() => {
    const t = setTimeout(onDismiss, ttlMs);
    return () => clearTimeout(t);
  }, [onDismiss, ttlMs]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white rounded-full px-4 py-2 shadow-xl flex items-center gap-3"
    >
      <Trash2 size={14} className="text-rose-300" />
      <span className="text-sm truncate max-w-[220px]">
        Deleted "{description}"
      </span>
      <button
        onClick={onUndo}
        className="text-sm font-medium text-indigo-300 hover:text-white"
      >
        Undo
      </button>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-sm text-gray-400 hover:text-gray-200"
      >
        ×
      </button>
    </div>
  );
};
```

- [ ] **Step 3: Delete button in TransactionEditModal**

In `src/components/forms/TransactionEditModal.tsx`, the action bar at the bottom currently has Cancel + Save. Add a Delete button on the left. Find the action bar:

```tsx
<div className="flex gap-3 px-6 py-4 border-t border-gray-100 bg-white flex-shrink-0">
  <button
    type="button"
    onClick={onCancel}
    className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 transition-colors"
  >
    Cancel
  </button>
  <button
    type="submit"
    ...
  >
    {savingRule ? 'Saving…' : 'Save Changes'}
  </button>
</div>
```

Extend the props:

```tsx
onDelete?: (id: number, description: string) => void;
```

And update the JSX to:

```tsx
<div className="flex gap-2 px-6 py-4 border-t border-gray-100 bg-white flex-shrink-0">
  {onDelete && (
    <button
      type="button"
      onClick={() => onDelete(transaction.id, transaction.description)}
      className="bg-rose-50 text-rose-700 px-3 py-2 rounded-lg hover:bg-rose-100 text-sm font-medium"
    >
      Delete
    </button>
  )}
  <button
    type="button"
    onClick={onCancel}
    className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 transition-colors"
  >
    Cancel
  </button>
  <button
    type="submit"
    disabled={savingRule}
    className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-indigo-400"
  >
    {savingRule ? 'Saving…' : 'Save Changes'}
  </button>
</div>
```

- [ ] **Step 4: Wire delete + undo in CardManagerRefactored**

Add imports:

```tsx
import { UndoDeleteBanner } from './dashboard/UndoDeleteBanner';
```

Add state next to the other dialog state:

```tsx
const [recentDelete, setRecentDelete] = useState<{ id: number; description: string } | null>(null);
```

Add the delete handler:

```tsx
const handleDeleteTransaction = async (id: number, description: string) => {
  try {
    await transactionService.deleteTransaction(id);
    setShowTransactionEditModal(false);
    setEditingTransaction(null);
    setRecentDelete({ id, description });
    await loadData();
  } catch (e: any) {
    setSyncBanner({ show: true, message: `Delete failed: ${e.message}`, type: 'error' });
  }
};

const handleUndoDelete = async () => {
  if (!recentDelete) return;
  try {
    await transactionService.restoreTransaction(recentDelete.id);
    setRecentDelete(null);
    await loadData();
  } catch (e: any) {
    setSyncBanner({ show: true, message: `Restore failed: ${e.message}`, type: 'error' });
  }
};
```

Pass `onDelete` into the modal:

```tsx
<TransactionEditModal
  transaction={editingTransaction}
  cards={cards}
  allTransactions={transactions}
  onSubmit={updateTransaction}
  onCancel={() => { setShowTransactionEditModal(false); setEditingTransaction(null); }}
  onReimbursementChange={loadData}
  onDelete={handleDeleteTransaction}
/>
```

Mount the banner near the bottom of the dashboard return (alongside the TransactionSelectionBar):

```tsx
{recentDelete && (
  <UndoDeleteBanner
    description={recentDelete.description}
    onUndo={handleUndoDelete}
    onDismiss={() => setRecentDelete(null)}
  />
)}
```

- [ ] **Step 5: Run tests + build**

Run: `npm test`
Expected: 142 passing.

Run: `npm run build`
Expected: clean.

- [ ] **Step 6: Commit + push everything**

```bash
git add src/components/dashboard/UndoDeleteBanner.tsx src/services/transactionService.ts src/components/forms/TransactionEditModal.tsx src/components/CardManagerRefactored.tsx
git commit -m "$(cat <<'EOF'
feat(ui): soft-delete with 30s undo banner

Delete button in the edit modal calls the new soft-delete endpoint;
UndoDeleteBanner appears at the bottom for 30s offering Undo (restore).
Banner self-dismisses on timeout. Failures route through the existing
sync-banner for visibility.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin main
```

---

## Final Verification

- [ ] **Step 1: Full test sweep**

Run: `npm test`
Expected: 142 passing.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: clean; main bundle ≤ 305 KB, NetWorthChart chunk ≤ 400 KB.

- [ ] **Step 3: Server boots + migration 016 applied**

```bash
pkill -f "node index.js" 2>/dev/null; sleep 1
cd /Users/zuomiaohu/Desktop/card-manager/server && node index.js > /tmp/boot.log 2>&1 &
sleep 3
head -5 /tmp/boot.log
sqlite3 /Users/zuomiaohu/Desktop/card-manager/server/database.db "SELECT version FROM schema_migrations ORDER BY version;"
```

Expected: versions 1–16 present.

- [ ] **Step 4: Manual smoke**

- Open http://localhost:5174/. Click "Add transaction" — modal opens.
- Tick 2-3 rows in the transactions list — pill appears at the bottom — pick a category — pill clears + sync banner confirms.
- Open a transaction → Delete → undo banner appears at the bottom → Undo → row reappears in the list.
- Set search query, set chip filter, refresh — both still applied (versioned localStorage).

---

## Self-Review Checklist

- [x] **Spec coverage:** Bulk recategorize (Task 3 endpoint + Task 6 row checkboxes + Task 7 action bar) ✓. Quick-add (Task 5) ✓. Soft-delete (Task 1 migration + Task 2 endpoints + Task 8 UI) ✓. Versioned localStorage (Task 4) ✓.
- [x] **No placeholders:** every step has exact code or shell commands.
- [x] **Type consistency:** `selectedIds: Set<number>` matches between TransactionsList props + CardManagerRefactored state. `batch-recategorize` body `{ ids, category }` matches between service method + server route + tests. `deleteTransaction` returns `{ ok, id }`; restore returns the full row.
- [x] **Test count growth:** 130 → 142. 4 new soft-delete tests + 3 batch-recategorize tests + 5 versioning tests = 12 new tests, all server- or pure-fn.
- [x] **Migration sequencing:** Task 1 migration runs BEFORE Task 2 endpoints land — order matters because the route's WHERE clause references the new column.
- [x] **Cross-cutting risk:** the existing reimburses_id scrub trigger fires on hard DELETE (migration 015); soft-delete deliberately does NOT trigger it. Documented in Task 2 Step 2 comment so a future maintainer doesn't "fix" it by adding cascade scrub.
