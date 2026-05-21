# Development Guide

Maintainer + contributor manual. Assumes you've already followed `README.md` through "First-time setup" and have the app running locally.

---

## Table of Contents

- [Architecture overview](#architecture-overview)
- [Repo layout](#repo-layout)
- [Backend](#backend)
  - [App factory + boot](#app-factory--boot)
  - [Migrations](#migrations)
  - [Routes](#routes)
  - [Lib modules](#lib-modules)
  - [Auth flow](#auth-flow)
  - [Plaid sync flow](#plaid-sync-flow)
  - [Encryption](#encryption)
- [Frontend](#frontend)
  - [Component tree](#component-tree)
  - [State + data flow](#state--data-flow)
  - [Spend calculation](#spend-calculation)
  - [Hooks](#hooks)
  - [Persisted state](#persisted-state)
- [Tests](#tests)
- [Adding a feature — end-to-end checklist](#adding-a-feature--end-to-end-checklist)
  - [Adding a migration](#adding-a-migration)
  - [Adding a backend route](#adding-a-backend-route)
  - [Adding a dashboard widget](#adding-a-dashboard-widget)
  - [Adding a categorization rule type](#adding-a-categorization-rule-type)
- [Conventions](#conventions)
- [Performance notes](#performance-notes)
- [Known limitations + footguns](#known-limitations--footguns)
- [Release workflow](#release-workflow)
- [Useful one-liners](#useful-one-liners)

---

## Architecture overview

```
   ┌────────────────────────┐         ┌──────────────────────────┐
   │  React 18 + Vite + TS  │ HTTP +  │  Express 4 + sqlite3     │
   │  Tailwind, recharts    │ cookies │  passport, plaid-node    │
   │  src/ → vite build     │ ◀─────▶ │  server/ → node index.js │
   └────────────────────────┘         └──────────────────────────┘
                                            │
                                            ▼
                              ┌─────────────────────────────┐
                              │  SQLite (server/database.db) │
                              │  16 migrations, see below    │
                              └─────────────────────────────┘
                                            │
                                            ▼
                              ┌─────────────────────────────┐
                              │  Plaid API (sandbox / prod) │
                              │  - itemPublicTokenExchange  │
                              │  - transactionsSync         │
                              │  - accountsGet              │
                              │  - webhookVerificationKeyGet│
                              └─────────────────────────────┘
```

**Single user per deployment.** Tables have `user_id` columns and queries are scoped, but there's no admin UI, no per-tenant quotas, and no resource isolation. Run separate instances if you need multi-user.

**No build step on the backend.** `server/index.js` is the production entrypoint; tests share the same app via `server/app.js`'s `makeApp(db)` factory.

**Tests run on the same SQLite engine** as production. `tests/server/helpers.ts` builds an in-memory DB (`:memory:`), runs every migration, and returns `{app, db}`. No mocks for the DB layer.

**Frontend talks to backend via cookies.** The `useApi` hook attaches `credentials: 'include'` to every fetch; CORS allows the configured `FRONTEND_URL`.

---

## Repo layout

```
card-manager/
├── README.md                  user-facing runbook
├── DEVELOPMENT.md             this file
├── package.json               frontend deps + scripts (vite, vitest, RTL)
├── vite.config.js             injects __APP_VERSION__ + __COMMIT_SHA__ at build time
├── tailwind.config.js
├── tsconfig.json
├── docs/superpowers/plans/    historical plan docs from each feature batch
├── src/                       frontend
│   ├── App.tsx                top-level router + global ErrorBoundary
│   ├── components/
│   │   ├── CardManagerRefactored.tsx   main dashboard (~1100 lines, splitting candidate)
│   │   ├── Auth.tsx                    login/register
│   │   ├── About.tsx
│   │   ├── ErrorBoundary.tsx           full-page + optional widget-level fallback
│   │   ├── PlaidLink.tsx               + PlaidUpdateLink.tsx for reauth
│   │   ├── RegionSelector.tsx
│   │   ├── cards/
│   │   │   └── CardDetailModal.tsx
│   │   ├── dashboard/                  every widget that lives below the header
│   │   │   ├── DashboardHeader.tsx     logo + welcome + sync hint + add-card + menu slot
│   │   │   ├── DashboardMenu.tsx       burger menu — own state + click-outside + Esc
│   │   │   ├── DashboardModals.tsx     centralized modal mounting (9 modals)
│   │   │   ├── ReauthBanner.tsx        Plaid needs_reauth yellow banner
│   │   │   ├── CardGrid.tsx            "Your Cards" filter + tiles
│   │   │   ├── FinancialOverview.tsx
│   │   │   ├── CategoryBreakdown.tsx
│   │   │   ├── NetWorthChart.tsx
│   │   │   ├── BudgetPanel.tsx
│   │   │   ├── RecurringList.tsx
│   │   │   ├── ETransferPanel.tsx
│   │   │   ├── FixedCostsPanel.tsx
│   │   │   ├── SpendingComparison.tsx
│   │   │   ├── InvestmentEmptyHint.tsx
│   │   │   ├── TransactionsList.tsx
│   │   │   ├── TransactionFilters.tsx + TransactionFilterChips.tsx
│   │   │   ├── TransactionSelectionBar.tsx
│   │   │   ├── UndoDeleteBanner.tsx
│   │   │   ├── SyncStalenessBanner.tsx + SyncStatusList.tsx
│   │   │   ├── RulesPanel.tsx + RulePreviewPopover.tsx
│   │   │   ├── DashboardSkeleton.tsx
│   │   │   └── WidgetErrorFallback.tsx
│   │   └── forms/
│   │       ├── TransactionEditModal.tsx
│   │       ├── CardForm.tsx
│   │       ├── TransactionForm.tsx
│   │       └── AddCardOptions.tsx
│   ├── hooks/
│   │   ├── useApi.ts                   wraps fetch + JSON + error → throws Error
│   │   ├── useEscapeKey.ts             window keydown for modal close
│   │   └── useGlobalShortcut.ts        Cmd/Ctrl+K etc.
│   ├── services/
│   │   ├── transactionService.ts       transaction CRUD + sync + batch ops
│   │   └── cardService.ts
│   ├── utils/                          pure logic, all unit-tested
│   │   ├── spendCalculation.ts         the spend-calc engine (most complex util)
│   │   ├── eTransfer.ts                Interac detection + counterparty extraction
│   │   ├── fixedCosts.ts               rent/utility/internet/mobile detection
│   │   ├── recurringDetection.ts       subscription detection
│   │   ├── refundCrossMonth.ts         cross-month refund pairing
│   │   ├── netWorthHistory.ts          rollback + snapshot composition
│   │   ├── netWorthBreakdown.ts        per-account share computation
│   │   ├── monthlyComparison.ts        MoM/YoY comparison numbers
│   │   ├── transactionSearch.ts        matchesSearch + applyFilters
│   │   ├── transactionPatterns.ts      shared regex constants (REFUND_KEYWORDS etc.)
│   │   ├── budgetDefaults.ts           seed values for first-load BudgetPanel
│   │   ├── syncStaleness.ts            findStaleItems + UTC timestamp parsing
│   │   ├── persistedState.ts           localStorage read/write with optional version
│   │   ├── csvExport.ts                CSV serializer w/ metadata header
│   │   └── currency.ts                 formatCurrency wrapper
│   ├── types/index.ts                  shared TS types (Transaction, MonthlyData, etc.)
│   ├── config/api.ts                   API_BASE_URL
│   ├── constants/categories.ts         category list + colors
│   └── vite-env.d.ts                   declares __APP_VERSION__ + __COMMIT_SHA__
├── server/
│   ├── index.js                        prod entrypoint: validates env → migrates → listens
│   ├── app.js                          makeApp(db, opts) factory — shared with tests
│   ├── database.db                     gitignored, single-user SQLite
│   ├── package.json
│   ├── .env.example                    template — server refuses placeholders at boot
│   ├── routes/
│   │   ├── auth.js                     register, login, refresh, logout, /me, google oauth
│   │   ├── cards.js                    /api/cards CRUD + /api/transactions/recategorize
│   │   ├── transactions.js             list + create + edit + delete (soft) + restore +
│   │   │                               /reimburses + /batch-recategorize + /balance-snapshots
│   │   ├── plaid.js                    link-token + exchange + sync + items list
│   │   ├── preferences.js              /api/user/preferences + /budget
│   │   ├── rules.js                    /api/categorization-rules + /split/list
│   │   └── backup.js                   /api/backup/run + /list (admin-gated)
│   ├── lib/                            db-aware helpers, route-agnostic
│   │   ├── auth.js                     JWT issue/verify, token_version, refresh cookies
│   │   ├── plaid.js                    Plaid client singleton + REAUTH_ERROR_CODES +
│   │   │                               mapPlaidCategoryToUserFriendly +
│   │   │                               description-first overrides (CASH_OUT_RE, BILLS_RE)
│   │   ├── plaidItems.js               CRUD around plaid_items table
│   │   ├── plaidWebhook.js             JWT verification + JWKS cache + shared-secret fallback
│   │   ├── balanceSnapshots.js         record + load helpers
│   │   ├── categorization.js           card-type detection (chequing/credit/tfsa/etc.)
│   │   ├── categorizationRules.js      load + apply substring rules
│   │   ├── splitRules.js               match + apply split rules
│   │   └── requestId.js                X-Request-ID middleware
│   ├── migrations/                     001 baseline → 016 deleted_at
│   ├── utils/
│   │   ├── crypto.js                   AES-256-GCM encrypt/decrypt for access_token
│   │   ├── errors.js                   sendServerError + sendClientError + requestId reuse
│   │   ├── logger.js                   winston wrapper
│   │   └── migrator.js                 runs migrations on boot, idempotent
│   └── scripts/
│       └── backup-db.sh                timestamped rotation of database.db
└── tests/
    └── server/
        ├── helpers.ts                  buildTestApp() — in-memory DB + migrations
        ├── auth.test.ts
        ├── auth-refresh.test.ts
        ├── balance-snapshots.test.ts
        ├── health-and-rules.test.ts
        ├── plaid-items.test.ts
        ├── reimbursement.test.ts       also covers soft-delete + batch-recategorize
        ├── sync-e2e.test.ts            register → exchange → sync → aggregate
        └── webhook.test.ts             JWT verify happy + tamper paths
```

Frontend unit tests live next to source under `src/**/__tests__/`.

---

## Backend

### App factory + boot

`server/index.js`:

1. Loads `.env`
2. **Validates required secrets**: rejects empty + `.env.example` placeholders + secrets under 16 chars
3. Encrypts the literal `"startup-check"` to validate `ENCRYPTION_KEY` shape
4. Opens `database.db`
5. Calls `runMigrations(db)` — applies every migration in `server/migrations/` in numeric order, skipping ones already in `schema_migrations`
6. Calls `makeApp(db)` to get the Express instance, listens on `PORT` (default 3001)

`server/app.js` exposes `makeApp(db, opts = {})`:

- `disableRateLimit: true` is set by tests
- Wires Helmet CSP, request-id middleware, CORS, session, passport
- Mounts every route factory with a shared `deps` object containing db, helpers, plaid client, cookie constants, etc.
- Returns the Express app

Test setup mirrors this: `tests/server/helpers.ts` does the same boot with an in-memory DB.

### Migrations

Each file in `server/migrations/` exports `up(db, { dbRun, dbGet })`. Numeric prefix is the version (`011_reimbursement_link.js` → version 11). Migrator runs them in order, recording each in `schema_migrations(version, name, applied_at)`.

| Version | Purpose |
|---|---|
| 001 | Baseline tables (users, cards, transactions) |
| 002 | Indexes |
| 003 | last_synced_at + budget_config columns |
| 004 | Plaid sync cursor on cards |
| 005 | categorization_rules table |
| 006 | split_rules table |
| 007 | sync_attempt_at + sync_error tracking |
| 008 | plaid_items table + backfill from cards |
| 009 | pending + transaction_currency + original_amount |
| 010 | refresh_tokens table |
| 011 | transactions.reimburses_id |
| 012 | transactions.notes |
| 013 | balance_snapshots table |
| 014 | Backfill: encrypt any plaintext access_token rows |
| 015 | reimburses_id scrub trigger on hard DELETE |
| 016 | transactions.deleted_at + index |

**Rules:**
- Migrations are **forward-only**. No `down()` defined; rollback = restore from backup.
- Migrations must be **idempotent** in the "already applied" sense — `runMigrations` skips ones in `schema_migrations`, but if you re-run a column ADD with `safeAddColumn`, it silently catches `duplicate column name` errors.
- Don't drop or rename columns. SQLite's `ALTER TABLE` support is too thin. Add a new column, write a transform migration, leave the old column unused.
- Don't `INSERT INTO schema_migrations` manually — the migrator does this after `up()` succeeds.

### Routes

Every route module exports a factory `function makeXxxRoutes(deps) { ... return router; }`. The `deps` object is built in `server/app.js` and contains everything the route needs (db, plaid client, helpers, cookie constants). This keeps routes from importing db globals + makes tests trivial (swap deps).

**Conventions:**
- All routes use `authenticateToken` middleware from `server/lib/auth.js`. The only exceptions: `/auth/register`, `/auth/login`, `/auth/refresh`, `/api/plaid/webhook`, `/health`.
- Every SQL query scoped `WHERE user_id = ?`. **No exceptions.** Routinely audit on review.
- Always use parameterized queries (`db.run(sql, params)` form). String interpolation into SQL is a critical bug.
- Soft-delete column `deleted_at` is filtered on every GET that returns transactions.
- Long-running operations wrap in `BEGIN IMMEDIATE` + `COMMIT` + `ROLLBACK` (see plaid.js syncIncremental for the canonical pattern).
- Errors via `sendServerError(res, err)` (500 + log) or `sendClientError(res, msg, status)` (4xx). Both include the request-id in the response body.

### Lib modules

`server/lib/` is the route-agnostic layer. Stays db-aware (takes `db` as first arg) but doesn't touch Express.

Most-edited:
- **`lib/auth.js`** — JWT lifecycle. `issueAuthCookie(res, payload)` writes the cookie + returns the token; `authenticateToken` middleware reads it back + checks `tv` (token_version) against the user row. Refresh-token rotation uses a SQL guard (`UPDATE … WHERE revoked_at IS NULL`) so two concurrent calls can't both win.
- **`lib/plaid.js`** — Plaid client singleton + `mapPlaidCategoryToUserFriendly`. The description-first overrides (CASH_OUT_RE, BILLS_RE, DEPOSIT_RE) run before Plaid's category signal so common bank-named patterns (CHEXY RENT, INTERNET DEPOSIT, ATM WITHDRAWAL) land in the right bucket even when Plaid returns `Other`.
- **`lib/plaidItems.js`** — every CRUD around the plaid_items table goes through here. Routes use it instead of touching columns directly so sync-attempt-tracking stays consistent.
- **`lib/plaidWebhook.js`** — verifies inbound webhooks. Two modes: JWT/JWKS (production) or shared-secret (dev). Body hash uses raw Buffer, not utf8 string, so signature verification works for any payload.

### Auth flow

```
POST /auth/register     → bcrypt password → INSERT users → issueAuthCookie + issueRefreshCookie
POST /auth/login        → bcrypt verify   → issueAuthCookie + issueRefreshCookie
POST /auth/refresh      → check refresh_tokens (atomic) → rotate + issueAuthCookie + new refresh
POST /auth/logout       → bump users.token_version + revoke refresh_token + clear cookies
GET  /auth/google       → passport-google-oauth20
GET  /auth/google/callback → issueAuthCookie + issueRefreshCookie → 302 to FRONTEND_URL
```

Every authenticated route runs `authenticateToken`:

1. Read JWT from `auth_token` cookie
2. Verify with JWT_SECRET
3. SELECT users.token_version WHERE id = payload.userId
4. Bail if `payload.tv !== user.token_version` (logout invalidated this token)
5. Attach `req.user = { userId, email, name }`

`token_version` is the kill-switch for stolen JWTs. Bumping it on logout invalidates every cookie issued before that moment, including the one the attacker grabbed.

### Plaid sync flow

```
POST /api/plaid/exchange-public-token
  ├─ plaidClient.itemPublicTokenExchange   (network)
  ├─ plaidClient.accountsGet               (network)
  ├─ plaidClient.transactionsGet (30d)     (network) ← pulled BEFORE DB tx
  ├─ BEGIN IMMEDIATE
  ├─   plaidItems.upsertItem               (gets itemPk)
  ├─   for each account: INSERT cards (with plaid_item_pk FK)
  ├─   for each Plaid txn: INSERT transactions (UNIQUE plaid_transaction_id)
  ├─ COMMIT  (or ROLLBACK on any error)
  └─ res.json({ accounts })

POST /api/plaid/sync-transactions
  ├─ for each plaidItems row:
  │   ├─ syncIncremental(itemPk):
  │   │   ├─ paginate plaidClient.transactionsSync (guard 200 pages)
  │   │   │   - persist nextCursor (including "" for new items)
  │   │   ├─ BEGIN IMMEDIATE
  │   │   │   ├─ INSERT added
  │   │   │   ├─ UPDATE modified
  │   │   │   ├─ DELETE removed (hard, not soft)
  │   │   │   ├─ plaidItems.updateCursor
  │   │   ├─ COMMIT  (or ROLLBACK)
  │   │   ├─ try: accountsGet + UPDATE balances + clearReauth + last_synced_at
  │   │   │   (soft-fail — txns are already committed)
  │   │   ├─ balanceSnapshots.recordSnapshots (today's row per card)
  │   │   └─ runRecategorize (apply rules + Plaid mapping to fresh rows)
  │   └─ on Plaid error: handleSyncTokenError (records last_sync_error, possibly markItemReauth or deletes plaid_items)
  └─ res.json({ newTransactions, modified, removed })
```

Webhook flow (when `PLAID_WEBHOOK_JWT_VERIFICATION=true`):

1. Plaid posts to `/api/plaid/webhook` with `Plaid-Verification` header (ES256 JWT)
2. `verifyPlaidWebhook(req, rawBody)` decodes JWT, fetches public key by `kid` from Plaid JWKS, caches it (1h)
3. Verifies signature, iat freshness (<5min), body hash matches SHA-256 of raw bytes
4. On `DEFAULT_UPDATE` etc., schedules an incremental sync; on `ITEM_LOGIN_REQUIRED`, marks the item for reauth

### Encryption

`server/utils/crypto.js`:

- AES-256-GCM, key from `ENCRYPTION_KEY` env (must be 64-char hex = 32 bytes)
- Storage format: `enc:v1:<iv_hex>:<authtag_hex>:<ciphertext_hex>`
- `encrypt(plaintext)` → returns the `enc:v1:` string
- `decrypt(stored)` → if stored starts with `enc:v1:`, decrypt; else return as-is (legacy plaintext passthrough). Throws on tampered ciphertext (GCM tag verification)
- `isEncrypted(value)` → bool, used by migration 014's backfill

**Never log decrypted access tokens.** The `decryptSecret` helper is intentionally not part of the default logger context.

**Key rotation = data loss.** Changing `ENCRYPTION_KEY` makes every stored token unreadable. Document this in `.env` if you ever consider a rotation.

---

## Frontend

### Component tree

```
App.tsx
├── ErrorBoundary (full-page red screen on unhandled error)
│   ├── Auth.tsx                        when no auth cookie
│   └── CardManagerRefactored.tsx       when authenticated
│       ├── DashboardSkeleton (loading state)
│       ├── SyncStalenessBanner
│       ├── ReauthBanner (inline in CardManager)
│       ├── SyncBanner (inline, role=status)
│       ├── FinancialOverview (4 tiles)
│       ├── CardGrid (Card buttons)
│       ├── Insights row:
│       │   ├── ErrorBoundary → NetWorthChart (lazy)
│       │   ├── BudgetPanel
│       │   └── ErrorBoundary → RecurringList
│       ├── Fixed costs + E-Transfers row:
│       │   ├── ErrorBoundary → FixedCostsPanel
│       │   └── ErrorBoundary → ETransferPanel
│       ├── SpendingComparison
│       ├── CategoryBreakdown
│       ├── Transactions section:
│       │   ├── Add Transaction button
│       │   ├── Search input (Cmd/Ctrl+K)
│       │   ├── TransactionFilterChips
│       │   └── TransactionsList (with checkboxes when selection enabled)
│       ├── RulesPanel
│       ├── TransactionSelectionBar (visible when N>0 selected)
│       ├── UndoDeleteBanner (visible after a delete)
│       ├── Modal stack (via state flags):
│       │   ├── TransactionForm (Add/Edit)
│       │   ├── TransactionEditModal
│       │   ├── CardDetailModal
│       │   ├── About
│       │   ├── PlaidLink + PlaidUpdateLink
│       │   └── RegionSelector
│       └── Burger menu (top-right) with SyncStatusList + version footer
```

**CardManagerRefactored is the orchestrator.** It owns: cards, transactions, snapshots, plaidItems, monthlyData (via useMemo on calculateMonthlyData), selectedTxIds, recentDelete, syncBanner, modal flags, search query, chip filters. Around 1100 lines. Splitting candidate but works.

### State + data flow

```
mount → loadData() pulls in parallel:
  cardService.getCards()
  transactionService.getTransactions()
  apiCall('/api/user/preferences')
  cardService.getCardCategories()

Then sequential, non-fatal:
  transactionService.getBalanceSnapshots()  → setSnapshots
  transactionService.getPlaidItems()        → setPlaidItems

Every dashboard widget receives the relevant slice via props.
calculateMonthlyData(transactions, cards, currentMonth, filters) → MonthlyData
  - Pure function in src/utils/spendCalculation.ts
  - Returns: spending, income, byCategory, eTransfersIn/Out, reimbursementsApplied,
    spendingTxnCount, incomeTxnCount, depositAccountCashOutflow, transactions (filtered)
```

User action → service method → backend → loadData() reruns → derived state recomputes via useMemo. No Redux/Zustand; useState + useMemo is enough for this size.

### Spend calculation

`src/utils/spendCalculation.ts` is the most-tested file in the repo (24 tests). Read it before changing any totals math.

**Skip order (per transaction):**

1. Pending → skip
2. Washed pair → skip
3. `category === 'Transfer'` → skip
4. `category === 'Deposit' && amount > 0` → skip (generic inbound, not income)
5. Positive + `reimburses_id` set → skip (accounted for against the linked purchase)
6. e-Transfer detected by regex → bucket into eTransfersIn/Out, skip from spending
7. Negative:
   - Credit card → creditCardSpending += abs(amount) − reimbursementByTarget[id]; spendingTxnCount++
   - Deposit account →
     - Match a positive on a CC card (same amount, ±7 days) → skip (CC payment)
     - Match a positive on another deposit account → skip (internal transfer)
     - Description-based CC payment fallback → skip
     - Investment-keyword (wealthsimple/questrade/…) → skip
     - "Transfer" + has investment sibling at same institution → skip
     - Else → depositAccountSpending += amount − reimbursementByTarget[id]; spendingTxnCount++
8. Positive (not e-Transfer, not reimbursement):
   - Credit card + refund keyword → creditCardSpending -= amount; skip
   - Deposit + refund keyword → depositAccountSpending -= amount; skip
   - countAsIncome(t) → income += amount; incomeTxnCount++

Reimbursements **only reduce headline spending when their target purchase is also in-month**. Cross-month links keep the badge but don't move the in-month total.

### Hooks

- **`useApi(token)`** — wraps `fetch` with `credentials: 'include'`, auth header, error normalization. Returns `{ apiCall, loading, error, clearError }`.
- **`useEscapeKey(active, onClose)`** — window keydown listener. Used by every modal.
- **`useGlobalShortcut(key, onFire)`** — Cmd/Ctrl+K-style shortcuts. Calls preventDefault.

### Persisted state

`src/utils/persistedState.ts`:

```ts
readPersisted(key, fallback)           // no version: raw round-trip
readPersisted(key, fallback, version)  // versioned: { v, data } envelope, returns fallback on mismatch
writePersisted(key, value, version?)   // version optional; null removes the key
```

Currently versioned keys (`PERSIST_VERSION = 1`):
- `card-manager:search`
- `card-manager:chip-filters`

To invalidate stored state in a future release: bump the version constant in `CardManagerRefactored.tsx`. Users will see a clean slate on next load.

---

## Tests

```
npm test              # vitest run
npm run test:watch    # vitest watch mode
```

**142 tests** across:

- `src/utils/__tests__/*` — pure unit tests, no DOM (a few use `happy-dom` via per-file pragma for localStorage tests)
- `src/hooks/__tests__/*` — hook tests via `@testing-library/react`'s `renderHook` with happy-dom env
- `tests/server/*` — supertest against `buildTestApp()` (in-memory SQLite). Each test gets a fresh DB.

**Test conventions:**

- One test file per src file (`recurringDetection.ts` → `recurringDetection.test.ts`)
- Server tests register a fresh user per test (or per `beforeEach`) — never assume state from a prior test
- For cross-user isolation, register a SECOND user with a unique email (existing tests already collide if you reuse emails — pick something distinct like `'b2@example.com'`)
- Use the `seed` helpers in `reimbursement.test.ts` for the common "register + card + txn" boilerplate
- Frontend hook tests need `// @vitest-environment happy-dom` pragma at the top

**Adding tests is mandatory for:**

- New routes (happy + cross-user + edge cases)
- New utility functions (pure → easy to test, no excuse)
- Spend-calc behavior changes (it's 1100 lines of conditional skips — without tests, regression risk is high)

Optional for:
- UI-only changes with no logic (e.g. CSS tweaks)

---

## Adding a feature — end-to-end checklist

### Adding a migration

1. Pick the next number: `ls server/migrations/ | tail -1`
2. Create `server/migrations/0NN_short_name.js`
3. Use this skeleton:
   ```js
   exports.up = async (db, { dbRun }) => {
     await dbRun(`ALTER TABLE foo ADD COLUMN bar TEXT`);
     // For ALTER TABLE … ADD COLUMN, wrap in safeAddColumn to allow re-runs.
   };
   ```
4. Restart the server — migrator applies it. Verify with:
   ```bash
   sqlite3 server/database.db "SELECT version FROM schema_migrations ORDER BY version;"
   ```
5. Update the migration table in this file under the [Migrations](#migrations) section.
6. Commit alongside any code that depends on the new column.

### Adding a backend route

1. Decide which module (`auth`, `cards`, `transactions`, `plaid`, etc.)
2. Add the handler inside the route factory, before `return router;`
3. Wrap auth-required routes with `authenticateToken` middleware
4. Scope every SQL query `WHERE user_id = ?`
5. Use parameterized queries — no string interpolation
6. Use `sendServerError(res, err)` for 500s and `sendClientError(res, msg, status)` for 4xx
7. Add tests in `tests/server/<routes>.test.ts`:
   - Happy path
   - Cross-user isolation (register a second user, attempt to reach across)
   - Validation (empty body, malformed input, oversized payload if applicable)
8. Run `npm test` — must stay green

### Adding a dashboard widget

1. Create `src/components/dashboard/MyWidget.tsx`. Pure function of its props; pull aggregates from `MonthlyData` if relevant. Self-hide (`return null`) when no data.
2. If it derives non-trivial state, factor the logic into `src/utils/myWidget.ts` + unit-test that.
3. Mount in `CardManagerRefactored.tsx` — pick a row in the existing layout or add a new one. Wrap in `<ErrorBoundary fallback={...} />` if it consumes anything that could throw (recharts, regex chains).
4. Pass `userRegion` if currency formatting is needed; use `formatCurrency()` from `utils/currency`.
5. If clickable rows drill into transactions, wire `onItemClick` to `setSearchQuery` + `scrollToTransactions` (existing pattern in FixedCostsPanel + ETransferPanel).
6. Mobile: use `p-4 sm:p-6` for panel padding, `text-xl sm:text-2xl` for headlines, `gap-2 sm:gap-3` for row gutters.

### Adding a categorization rule type

The existing flow:

```
src/utils/transactionPatterns.ts        shared keyword regexes
server/lib/plaid.js                     mapPlaidCategoryToUserFriendly +
                                        description overrides (CASH_OUT_RE, BILLS_RE)
src/constants/categories.ts             CATEGORIES list + CATEGORY_COLORS map
src/utils/spendCalculation.ts           if the new category should be excluded
                                        from spending/income, add skip logic
src/utils/budgetDefaults.ts             seed value for the new category
src/utils/fixedCosts.ts (if vendor-based)
```

Adding "Healthcare":

1. Add `'Healthcare'` to `CATEGORIES` array
2. Add color to `CATEGORY_COLORS`
3. (Optional) Add description regex in `server/lib/plaid.js` `mapPlaidCategoryToUserFriendly` for auto-detect
4. Add seed value `Healthcare: 200` to `DEFAULT_BUDGETS`
5. Run a one-shot SQL UPDATE to recategorize existing rows if desired:
   ```bash
   sqlite3 server/database.db "UPDATE transactions SET category = 'Healthcare' WHERE description LIKE '%PHARMACY%' AND category = 'Other';"
   ```

---

## Conventions

**Comments:** explain *why*, not *what*. The codebase favors a comment block at the top of each non-trivial function explaining its place in the system, NOT line-by-line narration. Look at `spendCalculation.ts` or `plaidWebhook.js` for the house style.

**Commit messages:** Conventional Commits style. `feat(scope):`, `fix(scope):`, `refactor(scope):`. Body explains *why* the change exists; the diff already shows *what*. Co-author footer when LLM-assisted.

**Branch + push policy:**
- Work directly on `main` for this single-maintainer deployment
- Push frequently — git is the backup of code; backups are the backup of data
- Never rewrite published history (`push --force`) unless absolutely necessary

**Tailwind:** static classes only. Don't build classes from template literals (`border-${color}-500`) — JIT can't see them and they get purged. Use a static map (see `cardBorderClass` in `CardManagerRefactored.tsx` for the pattern).

**TypeScript:**
- Strict mode. No `any` unless interfacing with untyped libs.
- Shared types in `src/types/index.ts`. Add new fields as optional when extending shapes that get persisted (so old DB rows still parse).
- Backend is JavaScript (CJS); use JSDoc when typing would help. Frontend is TS.

**Don't:**
- Add new top-level state to `CardManagerRefactored.tsx` without checking if existing state fits. The file is already long.
- Add a `useEffect` that fetches data on every render without dependencies. Use `useMemo` for derived state.
- Skip `WHERE user_id = ?` on any SELECT/UPDATE/DELETE.
- Mock the database in server tests. Use the real in-memory SQLite via `buildTestApp`.

---

## Performance notes

**Current scale:** typical user has ~6k transactions in DB after a year, dashboard recomputes ~12 memos per render. Frame budget is fine on a modern laptop.

**Known costs:**

- `findWashedTransactionIds` and `findCrossMonthRefunds` scan the full transaction list. O(n) per render. With month-filtering upstream, n is usually ≤500.
- `calculateMonthlyData` rebuilds indexes every call (positiveIndex). Cheap enough; would matter at 10x scale.
- `NetWorthChart` recharts render is the heaviest single component (~50-100ms first paint). It's lazy-loaded so the initial bundle stays at 296 KB.

**Bundle size:**

- main: ~300 KB / 83 KB gzip
- NetWorthChart chunk: ~392 KB / 114 KB gzip (recharts)
- Vite handles tree-shaking; don't add `import *` from heavy libs

**Database:**

- All hot paths have indexes (see migrations 002, 008, 013, 016)
- The `idx_transactions_deleted_at` index makes "WHERE deleted_at IS NULL" fast
- SQLite handles ~10k inserts/sec on commodity SSD; sync is bounded by Plaid response time, not DB writes

---

## Known limitations + footguns

**Plaid:**
- `/investments/transactions` isn't called. Brokerage trades don't appear; balance snapshots stand in for investment net-worth history.
- Multi-currency totals aren't FX-converted. We display the card's home currency + a small hint when a transaction was charged in a different currency.
- Plaid environment switching (sandbox → development → production) does NOT preserve tokens. Reconnecting required.

**Localization:**
- Hardcoded for US + CA. Other countries fall back to USD in code paths that don't pick a region.
- All UI strings in English.

**Single tenant:**
- DB has user_id scoping but no admin UI for managing users
- No quota / rate limit per user (just global limits on /auth)

**Tests:**
- One flaky test (`auth.test.ts logout invalidates cookie`) intermittently times out under full parallel load. Passes in isolation. Investigation deferred — not a real bug.
- No frontend integration tests via Playwright/Cypress. RTL covers hooks but not full dashboard interaction flows.

**Backups:**
- `backup-db.sh` produces plaintext SQLite copies. Encrypt at rest if you sync to cloud.
- No automated retention policy — accumulate forever unless you prune manually.

**Schema:**
- No `ON DELETE CASCADE` on FK columns. Card delete still works via explicit `DELETE FROM transactions WHERE card_id = ?` in the cards route. Adding new FKs: decide explicit cascade behavior up-front.

**Migration 014 is one-shot:**
- It encrypts plaintext access tokens that exist at migration time. If you ever import legacy plaintext data AFTER 014 has run, you'll need a fresh re-encrypt pass (or just sync the rows again so they're re-encrypted on write).

**Recurring detection:**
- 24-month max lookback for chart. Subscriptions in the past you no longer have don't appear.
- Detection threshold = 3 occurrences. Quarterly/yearly subscriptions take a full year to show up.

---

## Release workflow

This deployment doesn't have a formal release process; it's continuous deployment from `main`. The general flow:

1. Develop on `main` (single user, so no branching overhead)
2. Run `npm test` before committing
3. Run `npm run build` to verify the production bundle is clean
4. Commit + push
5. SSH to the host (or just restart locally), pull, restart the server with `pm2` or `node index.js`
6. Migrator runs on boot, picks up any new migrations

**If you need a more formal flow:**

1. Branch per feature
2. PR with passing CI
3. Tag releases (`v1.2.0`); `vite.config.js` already injects `__APP_VERSION__` + `__COMMIT_SHA__` from package.json + git
4. Use `pm2 reload` for zero-downtime restart

---

## Useful one-liners

```bash
# Test
npm test
npm test -- --run src/utils/__tests__/spendCalculation.test.ts
npm run test:watch

# Build
npm run build

# Restart server
pkill -f "node index.js" && cd server && node index.js > /tmp/boot.log 2>&1 &

# Verify migrations
sqlite3 server/database.db "SELECT version, name, applied_at FROM schema_migrations ORDER BY version;"

# Inspect a transaction by id
sqlite3 server/database.db "SELECT * FROM transactions WHERE id = 123;"

# Find soft-deleted rows
sqlite3 server/database.db "SELECT id, description, deleted_at FROM transactions WHERE deleted_at IS NOT NULL;"

# Purge old soft-deletes (90+ days)
sqlite3 server/database.db "DELETE FROM transactions WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '-90 days');"

# Show all encrypted access tokens (sanity check encryption)
sqlite3 server/database.db "SELECT id, substr(access_token, 1, 8) FROM cards WHERE access_token IS NOT NULL;"
# Output should all start with 'enc:v1:' — anything else is legacy plaintext

# Generate a new secret
openssl rand -hex 32

# Sync via API
curl -s -X POST -b cookies.txt http://localhost:3001/api/plaid/sync-transactions

# Inspect Plaid item state
sqlite3 server/database.db "SELECT id, institution_name, last_synced_at, last_sync_error, needs_reauth FROM plaid_items;"

# Count rows per category in current month
sqlite3 server/database.db "SELECT category, COUNT(*) AS n, ROUND(SUM(amount), 2) AS total FROM transactions WHERE date LIKE '2026-05%' AND deleted_at IS NULL GROUP BY category ORDER BY n DESC;"

# Tail server log
tail -f /tmp/boot.log

# Git: see all 50+ commits since the audit-followup work began
git log --oneline c3f568f3..HEAD

# Find the X-Request-ID in logs for a failed request
grep "<request-id>" /tmp/boot.log
```

---

## Where to keep contributing

The architecture is stable. Likely next surfaces:

- **Investment-account transactions** — wire up Plaid `/investments/transactions`. Migration adds an `investments` source enum + a new sync path.
- **Multi-currency totals** — FX rate cache + per-card-currency conversion on display.
- **Forecasting widget** — month-end projection based on pace through the month.
- **Calendar heatmap** — spending intensity per day.
- **Receipts** — image upload on a transaction; store in `server/uploads/` with size limits.
- **Audit log table** — record significant actions (rule edits, reimbursement links, deletes, category changes). Helps "why did this change."
- **Component split of CardManagerRefactored** — the file is now ~1200 lines after the soft-delete + selection-bar work. Split menu, modal stack, and the transaction toolbar into separate components.
- **Hot reload backend** — `nodemon` is in `server/package.json` devDeps but not used. Wire `npm run dev` in server/package.json to `nodemon index.js`.

For full review trail of prior work: `docs/superpowers/plans/` has each implementation plan with rationale, and `git log --oneline c3f568f3..HEAD` shows the resulting commits.

For forward-looking work (planned but not done yet), see [`../ROADMAP.md`](./ROADMAP.md).

For security policy + vulnerability disclosure, see [`../SECURITY.md`](./SECURITY.md). Never open a public GitHub issue for a security bug.
