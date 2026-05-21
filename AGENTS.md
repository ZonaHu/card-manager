# AGENTS.md

Quick reference for AI coding assistants (Claude Code, Cursor, Copilot, Aider) and human contributors picking up this repo cold. Goal: get to "tests pass + app boots" in under 5 minutes, then know what to touch + what not to.

For end-user setup, see [`README.md`](./README.md). For deep architecture + maintenance, see [`DEVELOPMENT.md`](./DEVELOPMENT.md). For planned work, see [`ROADMAP.md`](./ROADMAP.md). For security model + reporting, see [`SECURITY.md`](./SECURITY.md).

---

## What is this

Self-hosted personal-finance dashboard. React 18 + Vite + TS frontend, Express + SQLite backend, Plaid for bank sync. **Single-user-per-deployment by design** — the DB has `user_id` scoping but the UX, backup model, and ops tooling all assume one operator. Do NOT redesign for multi-tenant without explicit scope expansion.

- **License:** MIT
- **Status:** active, 147 tests passing, schema at migration 16
- **Stack:** React 18.2, Vite 4.5, Tailwind, recharts, Express 4, sqlite3, vitest 1.6
- **Bundle:** main ~304 KB / NetWorthChart chunk ~392 KB (recharts is lazy-loaded)

---

## Get running in 5 minutes

```bash
# 1. Clone + install
git clone https://github.com/ZonaHu/card-manager.git
cd card-manager
npm install                              # frontend deps
cd server && npm install && cd ..        # backend deps

# 2. Generate real secrets (server refuses to start with placeholders)
cp .env.example .env
cp server/.env.example server/.env
# Edit server/.env — replace these three lines with output from these commands:
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "SESSION_SECRET=$(openssl rand -hex 32)"
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)"

# 3. Run tests + build (no Plaid keys needed — tests use in-memory SQLite)
npm test                # expect 147 passing
npm run build           # expect clean

# 4. Start the app
cd server && node index.js &           # backend on :3001
cd .. && npm run dev                    # frontend on :5173 or :5174

# 5. Register an account at http://localhost:5173
# 6. (Optional) Add real Plaid sandbox keys to server/.env for bank sync.
#    Without them, only manual transaction entry works — everything else
#    is fully functional.
```

If `node index.js` errors with **"X is still set to the placeholder shipped in .env.example"** — step 2 wasn't done. Generate fresh secrets.

---

## Mental model of the codebase

```
React (src/)  ──[fetch + cookies]──▶  Express (server/)  ──▶  SQLite (server/database.db)
                                                  └──▶  Plaid API (sandbox/prod)
```

- **Tests boot the same app** via `tests/server/helpers.ts` → `buildTestApp(db: ':memory:')`. No mocks for the DB layer.
- **Production entrypoint:** `server/index.js` (validates env → migrates → listens). Tests share `makeApp(db)` from `server/app.js`.
- **Migrations:** numbered files in `server/migrations/`, applied in order on every boot. Forward-only — no `down()` defined. Restore from backup to rollback.
- **Spend calculation:** all dashboard numbers funnel through `src/utils/spendCalculation.ts::calculateMonthlyData`. The most-tested file (~25 tests).
- **Auth:** httpOnly JWT cookie (15-min TTL) + 7-day refresh token rotation + `users.token_version` server-side kill switch. See `server/lib/auth.js`.
- **Plaid access tokens:** AES-256-GCM at rest with `enc:v1:` prefix. See `server/utils/crypto.js`. Don't log decrypted values.

---

## Common tasks

### Add a backend route

1. Pick the right module under `server/routes/` (auth, cards, transactions, plaid, preferences, rules, backup).
2. Add handler inside the route factory, before `return router;`.
3. Wrap with `authenticateToken` middleware unless it's a public endpoint (only `/auth/register`, `/auth/login`, `/auth/refresh`, `/api/plaid/webhook`, `/health` are).
4. **Scope every SQL query `WHERE user_id = ?`.** No exceptions.
5. **Use parameterized queries** (`db.run(sql, params)` form). Never string-interpolate user input into SQL.
6. Errors: `sendServerError(res, err)` for 500s, `sendClientError(res, msg, status)` for 4xx. Both inject `X-Request-ID` automatically.
7. Add tests in `tests/server/` covering happy path + cross-user isolation (register a SECOND user, verify they can't reach your data).

### Add a database migration

1. Next number: `ls server/migrations/ | tail -1`.
2. New file `server/migrations/0NN_short_name.js`.
3. Skeleton:
   ```js
   exports.up = async (db, { dbRun }) => {
     await dbRun(`ALTER TABLE foo ADD COLUMN bar TEXT`);
   };
   ```
4. Use `safeAddColumn` (copy from migration 012) when adding columns so re-runs don't error.
5. Restart the server; the migrator picks it up automatically.
6. Update the migrations table in `DEVELOPMENT.md`.

### Add a dashboard widget

1. New file under `src/components/dashboard/`. Pure function of its props. Self-hide when no data (`return null`).
2. If the widget derives non-trivial state, put the logic in `src/utils/` + unit-test it.
3. Mount in `src/components/CardManagerRefactored.tsx`. Wrap in `<ErrorBoundary fallback={...} />` if it consumes data that could throw (recharts, regex chains, lazy imports).
4. Mobile-friendly: `p-4 sm:p-6` panel padding, `text-xl sm:text-2xl` headlines, `gap-2 sm:gap-3` row gutters.
5. For click-through to filtered transactions, wire `onItemClick` to `setSearchQuery` + `scrollToTransactions` (pattern in `FixedCostsPanel.tsx`).

### Add a Plaid description-based override

The `mapPlaidCategoryToUserFriendly` in `server/lib/plaid.js` has a description-first override layer (`detectByDescription`). Add a new regex:

```js
const MY_PATTERN_RE = /your pattern/i;
function detectByDescription(desc) {
  if (!desc) return null;
  if (CASH_OUT_RE.test(desc)) return 'Cash';
  if (CC_PAYMENT_RE.test(desc)) return 'Transfer';
  if (MY_PATTERN_RE.test(desc)) return 'YourCategory';   // ← new
  // ...
}
```

This runs BEFORE Plaid's category signal at insert + sync time. New rows tag correctly; historical rows need a one-off SQL UPDATE or the "Fix Categorization" menu button.

### Touch the spend calculation

`src/utils/spendCalculation.ts::calculateMonthlyData` is dense. Skip-order matters:

1. `pending` → skip
2. wash pair → skip
3. `category === 'Transfer'` → skip
4. `category === 'Deposit' && amount > 0` → skip
5. positive + `reimburses_id` set → skip (offsets the linked purchase)
6. refund keyword on positive → reduce spending (BEFORE e-Transfer check)
7. e-Transfer → bucket in eTransfersIn/Out
8. Negative on CC → `creditCardSpending`
9. Negative on deposit account → matching-positive checks → `depositAccountSpending`
10. Positive payroll → `income` (via `countAsIncome` guard against CC payments)

Every aggregate (`spending`, `income`, `byCategory`, `eTransfersIn/Out`, `reimbursementsApplied`, `spendingContributorIds`, `incomeContributorIds`) is updated inline so they all reconcile. **Don't sum from raw `filtered` in a separate pass — that's what caused byCategory to drift before. **

Run the full test sweep before considering a change green:
```bash
npm test -- --run src/utils/__tests__/spendCalculation.test.ts
```

### Run + interpret tests

```bash
npm test                 # all 147
npm run test:watch       # vitest watch mode
npm test -- --run src/utils/__tests__/<file>.test.ts   # single file
```

- Hook tests use the `// @vitest-environment happy-dom` pragma at the top.
- Server tests boot a fresh in-memory SQLite via `buildTestApp()` per test. No mocks for SQL.
- One known flaky: `auth.test.ts > invalidates a captured cookie after logout` — intermittently times out under full parallel load. Pass `--run <file>` if it flakes; investigate only if it fails in isolation.

---

## Conventions (the bits the linter doesn't catch)

- **Tailwind:** static classes only. Never `border-${color}-500` — JIT can't see template literals + the class gets purged. Use a static map (see `cardBorderClass` in `CardGrid.tsx`).
- **SQL:** parameterized always. Every query scoped `WHERE user_id = ?`.
- **TypeScript:** strict. No `any` unless interfacing with an untyped lib. Shared types in `src/types/index.ts`. New persisted fields → mark optional so old DB rows still parse.
- **Comments:** explain WHY, not WHAT. Block at top of non-trivial functions explaining where it fits in the system. Don't narrate line-by-line.
- **Commits:** Conventional Commits. `feat(scope):`, `fix(scope):`, `refactor(scope):`, `docs:`, `chore:`. Body explains motivation; the diff already shows mechanics.
- **PRs:** template at `.github/PULL_REQUEST_TEMPLATE.md` lists the gotchas (user_id scoping, parameterized SQL, accessibility for new modals, mobile responsiveness, etc.).
- **Branches:** project runs single-maintainer continuous deployment from `main`. Feature branches optional. CI runs on every push + PR.

---

## Hard rules — don't do these

1. **Don't commit `.env`, `database.db`, or any file under `server/backups/`.** All gitignored. If you find them tracked, that's the bug.
2. **Don't hardcode API keys.** Read from `process.env`. Server refuses to start with placeholder values; rotate via `openssl rand -hex 32`.
3. **Don't change `ENCRYPTION_KEY` after first sync.** Every stored Plaid access token becomes unreadable — users have to reconnect every bank.
4. **Don't skip the `WHERE user_id = ?` scope** on any new SELECT/UPDATE/DELETE. Cross-user reach is the easiest way to introduce a serious security bug.
5. **Don't add new features to `CardManagerRefactored.tsx` directly.** Extract a sub-component into `src/components/dashboard/` and mount it. Parent is the orchestrator, not a feature bucket.
6. **Don't add multi-tenant features.** The threat model is explicitly single-user-per-deployment. Multi-user requires a from-scratch redesign of auth, backups, scoping, and UX — and is out of scope per `ROADMAP.md`.
7. **Don't mock the database in server tests.** Use the real in-memory SQLite via `buildTestApp`.
8. **Don't log decrypted access tokens.** `decryptSecret(card.access_token)` should never end up in a `console.log` or `logger.info` payload.
9. **Don't paste real bank data into tests.** Use synthetic names (`Alice`, `Bob`, `Carol`, `Jane Doe`). The regex targets structure, not specific people.
10. **Don't open a public GitHub issue for security bugs.** Email per `SECURITY.md`.

---

## Cheat sheet — common one-liners

```bash
# Generate secrets
openssl rand -hex 32

# Restart backend (Mac/Linux)
pkill -f "node index.js"; sleep 1; cd server && node index.js > /tmp/boot.log 2>&1 &

# View schema migration state
sqlite3 server/database.db "SELECT version, name, applied_at FROM schema_migrations ORDER BY version;"

# Inspect a transaction
sqlite3 server/database.db "SELECT * FROM transactions WHERE id = 123;"

# Sanity-check encryption (every token should start with 'enc:v1:')
sqlite3 server/database.db "SELECT id, substr(access_token, 1, 8) FROM cards WHERE access_token IS NOT NULL;"

# Count rows per category in current month
sqlite3 server/database.db "SELECT category, COUNT(*) n, ROUND(SUM(amount),2) total FROM transactions WHERE date LIKE '$(date +%Y-%m)%' AND deleted_at IS NULL GROUP BY category ORDER BY n DESC;"

# Manual backup
cd server && ./scripts/backup-db.sh

# Tail server log
tail -f /tmp/boot.log

# Hit a route via curl with cookie session
curl -s -c cookies.txt -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"yourpassword"}'
curl -s -b cookies.txt http://localhost:3001/api/transactions | jq '. | length'
```

---

## When in doubt

- **Architecture questions:** [`DEVELOPMENT.md`](./DEVELOPMENT.md) has the full repo map + component tree + spend-calc skip order.
- **User-facing behavior:** [`README.md`](./README.md) is the runbook.
- **Security:** [`SECURITY.md`](./SECURITY.md) lists what's hardened + what's a known trade-off.
- **What's planned:** [`ROADMAP.md`](./ROADMAP.md) — items there are intentional next steps; items NOT there are probably out of scope.
- **Historical context:** `docs/superpowers/plans/` has implementation plans for each feature batch with rationale.

If you can't find the answer in any of those, open a Discussion (not an Issue) on GitHub. Issues are reserved for confirmed bugs + concrete feature proposals.
