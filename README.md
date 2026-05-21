# Card Manager

Self-hosted personal finance dashboard. Connects to your Canadian/US bank accounts via Plaid, syncs transactions, surfaces recurring costs, e-Transfer activity, fixed monthly bills, net-worth history, and budgets. Single-user-per-deployment by design.

> **Status:** active personal-use; backend hardened (encrypted access tokens, refresh-token rotation, request-id tracing, atomic sync, soft-delete), frontend mobile-friendly, 142 tests green.

---

## Table of Contents

- [What you get](#what-you-get)
- [System requirements](#system-requirements)
- [First-time setup](#first-time-setup)
- [Day-to-day operation](#day-to-day-operation)
- [Feature reference](#feature-reference)
- [Sync model](#sync-model)
- [Backups + data persistence](#backups--data-persistence)
- [Security model](#security-model)
- [Troubleshooting](#troubleshooting)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [FAQ](#faq)
- [Glossary](#glossary)

---

## What you get

| Capability | Where it shows up |
|---|---|
| Auto-sync transactions from connected banks | `Sync now` button in burger menu + per-institution status |
| Monthly spending overview (cash / credit split) | Top tiles + Category Breakdown |
| Recurring subscription detection | Recurring panel (auto, no setup) |
| Fixed monthly bills (rent/utilities/internet/mobile) | Fixed Costs panel — drill-through to underlying rows |
| Interac e-Transfer activity (in/out by counterparty) | E-Transfers panel |
| Net worth chart + per-account breakdown (%) | Net Worth widget — expandable account breakdown |
| Reimbursement linking (friend pays you back) | Edit modal on positive transactions |
| Notes on any transaction | Edit modal — survives sync + rebuilds |
| Categorization rules (auto-tag future txns) | "Remember this merchant" toggle in edit modal |
| Split rules (e.g. peel off "Investment" portion of mortgage) | Rules panel |
| Bulk recategorize | Row checkboxes → bottom action bar |
| Soft-delete with 30s undo | Delete button in edit modal |
| Filter chips: category, card, pending-only, amount range | Above transaction list |
| Search by description AND notes | Search input (`Cmd/Ctrl+K` to focus) |
| CSV export with metadata header | "Export CSV" button |
| Budget targets per category w/ over/under | Budgets panel |
| Sync staleness banner (24h threshold) | Top of dashboard |
| Investment balance snapshots | NetWorth chart on TFSA/RRSP/brokerage |

---

## System requirements

- **Node.js** 18+ (tested on 20, 22). `nvm use` if you have one.
- **macOS / Linux** for the bundled `backup-db.sh`. Windows works for the app itself; the shell-script backup needs WSL.
- **SQLite 3** — ships with the `sqlite3` Node module, no separate install.
- **Plaid account** (free sandbox tier is enough for testing). Sign up at [dashboard.plaid.com](https://dashboard.plaid.com/).
- **(Optional) Google OAuth client** if you want Google sign-in. Local email/password works fine without it.

Disk usage: typical setup is < 200 MB (mostly node_modules). The SQLite database itself stays around 1-5 MB per year of activity.

---

## First-time setup

### 1. Clone and install

```bash
git clone https://github.com/ZonaHu/card-manager.git
cd card-manager
npm install                  # frontend deps
cd server && npm install     # backend deps
cd ..
```

### 2. Configure secrets

The app **refuses to start** with placeholder secrets in `server/.env` — by design, the placeholders in the template would let anyone with the source forge JWTs against your deployment.

```bash
cp .env.example .env
cp server/.env.example server/.env
```

Now generate real secrets:

```bash
# 32-byte hex secrets — paste output into server/.env
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "SESSION_SECRET=$(openssl rand -hex 32)"
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)"
```

Replace the three placeholder lines in `server/.env` with the generated values. `ENCRYPTION_KEY` encrypts Plaid access tokens at rest — **do not change it after first sync** or you'll lose access to existing connections (you'd have to disconnect/reconnect every bank).

### 3. Plaid credentials

Get sandbox keys from [dashboard.plaid.com → Team Settings → Keys](https://dashboard.plaid.com/team/keys).

```bash
# server/.env
PLAID_CLIENT_ID=<your client id>
PLAID_SECRET=<your sandbox/development/production secret>
PLAID_ENV=sandbox    # or development | production
```

Sandbox accepts the fake credentials `user_good` / `pass_good` for testing. Production requires real bank credentials and Plaid charges per active connection.

### 4. Optional: Google OAuth

Skip this if you only want email/password login. Otherwise:

1. Console → APIs & Services → Credentials → Create OAuth 2.0 Client ID (Web)
2. Authorized redirect URI: `http://localhost:3001/api/auth/google/callback`
3. Paste into `server/.env`:

```bash
GOOGLE_CLIENT_ID=<from console>
GOOGLE_CLIENT_SECRET=<from console>
```

### 5. Optional: webhook signing (production only)

If you expose the backend publicly and want Plaid to push updates instead of polling:

```bash
PLAID_WEBHOOK_JWT_VERIFICATION=true
# OR for a simpler shared-secret setup:
PLAID_WEBHOOK_SECRET=<random string you also paste into Plaid dashboard>
```

In production the webhook endpoint refuses unverified requests. In development it accepts unverified ones with a warning.

### 6. First start

```bash
# Terminal 1 — backend
cd server && node index.js

# Terminal 2 — frontend dev server
npm run dev
```

Backend boots on port 3001, frontend on 5173 (or 5174 if 5173 is taken). On first start the migrator runs all 16 schema migrations against `server/database.db` (created on the spot). Visit http://localhost:5173 (or whichever port Vite picked).

### 7. Create your account + link a bank

1. Open the frontend → **Register** with an email + 12+ char password
2. (Once logged in) Burger menu → **Connect Bank** → goes through Plaid Link
3. In sandbox, pick any institution + use `user_good` / `pass_good`
4. After linking, hit **Sync now** (it auto-runs on connect but a manual nudge is fine)

---

## Day-to-day operation

### Starting the app

```bash
# Backend
cd /path/to/card-manager/server && node index.js
# Frontend (separate terminal, leave running)
cd /path/to/card-manager && npm run dev
```

For a more permanent setup use a process manager like `pm2`:

```bash
cd server
pm2 start index.js --name card-manager-server
pm2 startup     # one-time: install pm2 system service
pm2 save
```

### Stopping cleanly

```bash
pkill -f "node index.js"          # backend
# Vite responds to Ctrl-C in its terminal
```

The SQLite database is just a file on disk — killing processes does not corrupt it (writes are atomic per transaction). However, killing mid-sync may leave some Plaid items with `last_sync_error` set; just run another sync.

### Daily workflow (typical)

1. **Open the dashboard.** If the yellow "data is X hours stale" banner is present, click **Sync now**.
2. **Scan new transactions.** Anything categorized "Other" can be reclassified via the edit modal (click any row). Toggle **Remember this merchant** to make the rule stick for future syncs.
3. **Link reimbursements.** When a friend Interac-transfers you back, open that incoming row → **Reimbursement for a purchase?** → pick the original outlay. Spending headline drops accordingly.
4. **Bulk clean-up.** Tick multiple rows → bottom pill → pick category → Set.
5. **Add notes.** Click any row → Notes textarea (2000 char cap, survives sync + builds).

### Adding transactions manually

Click **Add transaction** next to the search bar. Fill the form. Useful for cash purchases that never hit a connected card.

### Deleting transactions

Open the row → **Delete** in the edit modal. The row vanishes from the list immediately; a black undo pill appears at the bottom for 30 s. Click **Undo** to restore, or do nothing — after 30 s the row stays soft-deleted (still in the DB with `deleted_at` set, hidden from queries).

If you want to *permanently* purge soft-deleted rows, run the SQL directly:

```bash
sqlite3 server/database.db "DELETE FROM transactions WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '-90 days');"
```

---

## Feature reference

### Dashboard tiles (top row)

- **Period** — month selector
- **Spending** — total outflow from cards. Shows "Net of $X reimbursements" when applicable. E-Transfers excluded.
- **Income** — Payroll, direct deposits, tax refunds. Excludes Deposit-category rows + Interac transfers (those are tracked separately).
- **Net** — `depositAccountCashOutflow − income`. Shows "—" if depository data isn't available (typical for credit-card-only users).

### Insights row

- **Net Worth chart** — line over time, max 24 months back. Cash + credit cards roll backward through transactions; investment / TFSA / RRSP use balance snapshots (one per sync). Below the chart, expand **Account breakdown** for $ + % share per account.
- **Budgets** — set monthly targets per category. Empty defaults are seeded on first load (Food $800, Bills $1800, etc.). Click **Edit** to adjust.
- **Recurring** — auto-detected subscriptions (3+ occurrences, ~30-day cadence). Hides vendors already shown in Fixed Costs to avoid duplication.

### Fixed Costs + E-Transfers row

- **Fixed monthly costs** — detected by vendor regex (CHEXY, Metergy, Bell, Fido, Rogers, Telus etc.). Shows current + prior month + delta per vendor. Click a row to drill down: search filter applies + scrolls to transactions.
- **E-Transfers** — net Interac flow (in/out/net). Grouped by counterparty. Click a row to drill into that person's transactions.

### Categorization rules

Two rule types:

1. **Categorization rule** — substring match on description → assign category. Created via the "Remember this merchant" toggle when editing a transaction. Manage all rules in the Rules panel (burger menu → Rules).
2. **Split rule** — when a transaction matches a pattern AND is over a threshold, peel off a `split_amount` and create a sibling row with a different category. Useful for "rent payment that's part principal, part interest" or "mortgage that's part-investment."

Patterns must be ≥3 characters to prevent accidental over-matching.

### Reimbursement linking

When a positive transaction (e-Transfer received, refund, etc.) offsets a prior purchase:

1. Open the positive row → **Reimbursement for a purchase?** section
2. Search recent purchases (last ~30 days)
3. Pick the matching outlay

The dashboard then:
- Subtracts the reimbursement from the purchase's contribution to spending (clamped at zero — can't go negative)
- Hides the reimbursement from income totals
- Shows "Reimbursed: -$X" badge on the original purchase + "Reimburses: <desc>" hint on the positive row

Cross-month case (April purchase, May reimbursement): the link still works for the badge/hint but doesn't retroactively reduce April's spending headline. The "Net of $X reimbursements" hint only shows for in-month pairs.

### Filter chips

Above the transaction list:
- **All categories** → dropdown picks one
- **All cards** → dropdown picks one
- **Pending only** → toggle
- **$min–$max** → absolute-value range
- Active chips light up indigo with a count badge
- **Clear all** when any filter is active

Search query + chips compose with AND. State is persisted to `localStorage` (versioned, so future shape changes invalidate stored state cleanly).

### CSV export

Burger menu → **Export current view to CSV**. Output starts with a metadata block:

```
# Exported: 2026-05-19T17:42:11.000Z
# Rows: 247
# Source: card-manager
date,description,amount,category,card,card_last_four
2026-05-19,COFFEE,-4.50,Food,BMO checking,7852
...
```

Only the currently-filtered + searched view is exported (matches what's on screen).

---

## Sync model

### How syncing works

The first time you connect a bank via Plaid Link, the backend:

1. Exchanges the public token for a long-lived access token
2. Encrypts the token (`enc:v1:<iv>:<tag>:<ciphertext>`) and stores it in `cards.access_token` + `plaid_items.access_token`
3. Pulls the initial 30-day window via `transactionsGet`
4. Creates one row in `cards` per Plaid account + one row in `plaid_items` per institution

Subsequent syncs use `transactionsSync` with a per-institution cursor. The cursor is persisted on `plaid_items.sync_cursor` so each call only fetches what changed.

### Two sync modes

- **Quick sync** (default) — runs `transactionsSync` on every connected `plaid_items` row. Returns added/modified/removed since the last cursor.
- **Full sync** (menu → **Full sync** → choose 6/12/24 months) — sweeps a configurable window via `transactionsGet`. Reconciles by deleting local Plaid rows that no longer appear in the response. Useful after editing categorization rules or fixing a sync glitch.

### What happens on each sync

For every connected plaid_item:

1. `transactionsSync` (paginated, hard guard at 200 pages = 100k transactions)
2. Insert `added`, update `modified`, delete `removed` — all in one DB transaction (`BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`)
3. Persist new cursor
4. Update card balances via `accountsGet` (soft-fail: if this errors, the sync is still considered successful since the txns are already saved)
5. Write balance snapshots (one row per card per day for net-worth history)
6. Auto-recategorize via Plaid's category signal (so changes to user rules apply to fresh rows)

### When syncs fail

- **Item login required / new MFA needed** — Plaid wants the user to re-verify. The dashboard shows a red banner with an "Update credentials" button (uses Plaid Link in update mode, no new institution selection).
- **Invalid access token** — token was revoked at the bank side. The `plaid_items` row is deleted automatically; user reconnects via the normal flow.
- **Network blip on accountsGet** — soft-fail, sync still reports success. Try again to refresh balances.
- **Per-institution failures don't block siblings** — if CIBC fails but TD works, you see updated TD txns.

### Staleness banner

The dashboard checks each `plaid_items.last_synced_at` against a 24-hour threshold. If any institution is stale and not flagged for reauth (those have their own banner), the yellow "data is X hours stale" banner appears with a one-click **Sync now**. SQLite returns timestamps without a UTC suffix; the parser appends 'Z' to avoid timezone drift.

---

## Backups + data persistence

The entire app state — accounts, transactions, rules, notes, snapshots — lives in `server/database.db`. The frontend stores zero data (other than session cookies + localStorage filter preferences). Backup the file, you've backed up the app.

### Manual backup

```bash
cd server
./scripts/backup-db.sh
```

This rotates timestamped copies into `server/backups/`. Keep them on a different volume or sync to cloud storage.

### Via the API (admin only)

`POST /api/backup/run` triggers the same script via the burger menu (**Run Backup Now**). By default the route accepts any authenticated user since the deployment is single-tenant. To lock it down:

```bash
ADMIN_USER_IDS=1,2     # in server/.env, comma-separated user ids
```

With that set, only listed user ids can trigger backups or list existing backup files.

### Restoring from a backup

The app does not currently have an in-app restore UI. To restore manually:

```bash
# Stop the server first!
pkill -f "node index.js"

# Restore
cp server/backups/database-2026-05-19_03-00-00.db server/database.db

# Restart
cd server && node index.js
```

The migrator runs on every boot; if you restore from before a migration was added, the migrator brings the schema forward automatically.

### What survives across rebuilds

`npm run build`, `git pull`, server restarts — all of these leave `server/database.db` untouched (it's in `.gitignore`). The only ways to lose data:

- Manually delete `server/database.db`
- Drop or alter tables via SQLite CLI
- Lose the `ENCRYPTION_KEY` (Plaid access tokens become unreadable; you'd have to reconnect every bank)

---

## Security model

| Surface | What's done |
|---|---|
| Passwords | bcrypt @ cost 10 (12 in production). Minimum 8 chars enforced server-side. |
| Sessions | httpOnly JWT cookie, 15 min TTL. Refresh-token rotation (7-day TTL, single-use, atomic via SQL guard). |
| Logout | Bumps `token_version` server-side, invalidates every JWT cookie issued before. |
| Secrets | App refuses to start with placeholder values from `.env.example`. Min 16 chars enforced for `JWT_SECRET` + `SESSION_SECRET`. |
| Plaid access tokens | AES-256-GCM at rest. Migration 014 backfills any legacy plaintext rows on boot. |
| CSRF | SameSite=strict cookies in production. |
| XSS | React's default escaping + Helmet CSP (script-src `'self'` in prod; dev relaxes for Vite HMR only). |
| SQL injection | All queries parameterized. No string interpolation into SQL. |
| Webhook auth | Plaid JWT verification (ES256, JWKS public key) when `PLAID_WEBHOOK_JWT_VERIFICATION=true`. Shared-secret fallback. Body-hash + iat freshness check. |
| Rate limiting | `/auth/*` paths rate-limited via express-rate-limit. |
| Audit | `X-Request-ID` middleware tags every request; server logs reference it; `sendServerError` returns the id in the response body so users can quote it in bug reports. |
| Cross-user isolation | Every query scoped `WHERE user_id = ?`. Reimbursement linking, batch recategorize, soft-delete all verified by tests against a second user. |
| Backups | Endpoint admin-gated via `ADMIN_USER_IDS`. Backup file is plaintext SQLite — store securely. |

For the full reviewer-driven hardening trail, see git history c3f568f3..HEAD.

---

## Troubleshooting

### Server won't start: "SESSION_SECRET is still set to the placeholder"

You're trying to run with the example `.env`. Rotate the secrets:

```bash
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "SESSION_SECRET=$(openssl rand -hex 32)"
```

Paste those into `server/.env` replacing the existing lines.

### "ENCRYPTION_KEY env var is required" or "must be 64-char hex"

```bash
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)"
```

### "Bank linked but no transactions"

- Hit **Sync now** in the burger menu.
- For sandbox accounts, transactions backfill ~30 days; full history requires `development` or `production` Plaid env.
- Check the per-institution status in the burger menu (green check = healthy, yellow = stale, red = needs reauth).

### "Items not syncing — needs_reauth"

Plaid expired the connection (institution rotated credentials, MFA required, user changed password). Click **Update credentials** in the red banner — opens Plaid Link in update mode, walks you through re-verifying without picking the institution again.

### Existing JWTs invalid after secret rotation

When you rotate `JWT_SECRET` (e.g. as part of the placeholder-secret check), every existing browser session is invalidated. Re-login fresh — that's the intended behavior.

### Wrong category on a transaction

1. Click the row → change Category → Save Changes
2. (Optional) Toggle **Remember this merchant** + tweak the pattern. Future syncs will auto-apply the rule.

### Rule didn't apply to existing rows

The rule applies on insert + on `transactionsSync` modification. To apply retroactively, run **Fix Categorization** in the burger menu — pulls fresh Plaid data for every connected token and re-runs the mapping. Slow (one round-trip per access token) but thorough.

### Recurring widget shows nothing

Detection needs **3+ occurrences ~30 days apart** for the same vendor at similar amounts (±15%). One- or two-month subscriptions won't show until cycle 3 lands.

### Net worth chart missing investment history

Investment / TFSA / RRSP accounts use balance snapshots, written one per sync. First sync = one data point = no line. Sync over multiple days/months to build history. Cash + credit cards use rollback from current balance through transactions, which works immediately.

### Dashboard slow with many transactions

Performance is fine up to ~10k transactions in current month. If you have a longer history loaded, the GET endpoint paginates (`limit=5000` default). Slowness usually means one of the dashboard memos hasn't filtered to current month — check console for warnings.

### Filter chips + search not persisting

State is versioned in localStorage. If you upgrade across a shape-change release, your saved filters reset (by design — old shape might break the UI). Just re-apply.

### Modal too tall on small screen

The modal caps at 90vh with internal scroll + pinned action bar. If buttons are off-screen, scroll inside the modal. Outer overlay also scrolls on tiny screens.

### Stuck soft-delete (row hidden but you don't want it deleted)

```bash
sqlite3 server/database.db "UPDATE transactions SET deleted_at = NULL WHERE id = <ID>;"
```

Refresh the dashboard.

---

## Keyboard shortcuts

| Keys | Action |
|---|---|
| `Cmd/Ctrl + K` | Focus transaction search input |
| `Escape` | Close the active modal (or burger menu) |
| `Tab` / `Shift+Tab` | Navigate form fields (modal action bar reachable via keyboard) |
| `Enter` in form | Submit the modal |

---

## FAQ

**Q: Can I use this without Plaid?**
Yes. Skip Plaid setup. Manually add transactions via the **Add transaction** button. You lose auto-sync but all dashboard features still work.

**Q: Multi-user / family-shared deployment?**
Not the design goal. The DB has a `user_id` column on every table and queries enforce scoping, so two registered users won't see each other's data. But there's no admin UI to manage them, no quota, no per-user backup. Run a separate deployment per family member, or set `ADMIN_USER_IDS` to your id and you become the operator.

**Q: Does it work offline?**
Frontend loads + lets you browse cached data. Sync + adding new rows needs the backend up. Both run on localhost so "offline" usually means "I stopped the server."

**Q: Can I migrate from a different finance app (Mint, YNAB)?**
No import UI today. You can manually `INSERT` into the `transactions` table via SQLite CLI if you really want to backfill — match the schema in migration 001 + current schema for new columns.

**Q: Does it support crypto / non-bank investments?**
Plaid covers Wealthsimple Crypto Exchange + Robinhood. For exchanges without Plaid coverage, add a manual "card" via the burger menu + add transactions manually.

**Q: Currency conversion?**
Each transaction stores `transaction_currency` + `original_amount`. The dashboard tile uses the card's home currency (set per region). Multi-currency totals are NOT auto-converted (no FX rate lookup) — see the small "in USD" / "in CAD" hint under any cross-currency transaction.

**Q: Why does the Recurring panel skip my rent?**
Rent is shown in **Fixed Costs**, not **Recurring** — they used to duplicate, now they don't. Same with utilities, internet, mobile.

**Q: What happens if I revoke a Plaid connection from my bank's website?**
Next sync fails with `INVALID_ACCESS_TOKEN`. The backend deletes the `plaid_items` row automatically. The `cards` rows stick around (so existing transactions don't lose their card name) — you reconnect via the normal Connect Bank flow if you want fresh data.

---

## Glossary

- **plaid_items** — one row per (user, institution) pair. Owns the encrypted access token + sync cursor + reauth state.
- **cards** — one row per account. Belongs to one plaid_items row. Has its own balance + category (chequing/savings/credit/etc.).
- **transaction** — one row per posted (or pending) Plaid txn, plus user-entered manual rows. `source = 'plaid' | 'manual'`.
- **reimburses_id** — FK from a positive transaction to the negative purchase it offsets.
- **deleted_at** — NULL = live, ISO timestamp = soft-deleted. GET filters NULL only.
- **enc:v1:** — prefix marking an encrypted access token in the DB.
- **Cash** — category for ATM withdrawals + bank drafts.
- **Deposit** — category for inbound funds that aren't payroll/income (PayPal cashout, generic INTERNET DEPOSIT). Excluded from income totals.
- **Transfer** — user marker for inter-account movements; excluded from spend + income.
- **Wash** — same-card same-day opposite-sign pair flagged by bracket code or "rebate"/"refund" keyword; net-zero, both sides excluded.
- **Snapshot** — daily balance row in `balance_snapshots`. Used by NetWorthChart for investment-account history.

---

## Where to go next

- **Maintainer / developer guide:** see [`DEVELOPMENT.md`](./DEVELOPMENT.md).
- **Issue tracker:** GitHub Issues.
- **Plaid sandbox docs:** [plaid.com/docs/sandbox](https://plaid.com/docs/sandbox/).

If something doesn't fit any heading above, open an issue with the `X-Request-ID` from the response body — the server logs reference it.
