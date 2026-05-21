# Roadmap

Forward-looking. Items here are NOT promises — just what's likely to land if/when there's appetite. Pulled from the reviewer findings + sessions notes accumulated through 2026-05.

For the security-only subset, see [`SECURITY.md`](./SECURITY.md). For implementation plans of work already shipped, see [`docs/superpowers/plans/`](./docs/superpowers/plans/).

## Recently shipped (cross-out as done)

- ✅ GitHub Actions CI (test + build + npm audit + bundle-size guard) — `.github/workflows/test.yml`
- ✅ Reconcile-safety guards (Full Sync no longer wipes local rows on empty Plaid response)
- ✅ Drill-down precision — Spending/Income tile clicks use exact contributor id-sets, not approximate category filters
- ✅ Reimbursement cap (`reimbursementsApplied` never overstates the headline reduction)
- ✅ countAsIncome guard against mis-tagged CC payment rows
- ✅ Refund-via-Interac routing fix
- ✅ Pending exclusion from FixedCostsPanel + RecurringList
- ✅ byCategory reconciliation with the Spending headline
- ✅ Encrypted access tokens at rest (migration 014 backfill)
- ✅ Soft-delete + undo banner
- ✅ Bulk recategorize action bar
- ✅ Mobile responsiveness sweep
- ✅ Repo OSS-readiness: LICENSE (MIT), SECURITY.md, ROADMAP.md, badges in README

---

## Security

| Priority | Item | Status |
|---|---|---|
| 🔴 High | 2FA / TOTP on login | Not started |
| 🔴 High | Email verification on register | Not started |
| 🟡 Med  | Account lockout after N failed logins (rate limiter is only brake today) | Not started |
| 🟡 Med  | Backup-file encryption (currently plaintext SQLite) | Not started |
| 🟡 Med  | CSP `report-to` endpoint for violation telemetry | Not started |
| 🟢 Low  | Logout-all-devices UI (server-side `token_version` bump exists, no UI) | Not started |
| 🟢 Low  | `ENCRYPTION_KEY` rotation tooling (re-encrypt all rows under new key) | Not started |

## Features

| Priority | Item | Status |
|---|---|---|
| 🟡 Med  | Plaid `/investments/transactions` for real brokerage trades (today: balance snapshots only) | Not started |
| 🟡 Med  | Audit log table — record significant actions (rule edits, reimbursement links, deletes) | Not started |
| 🟡 Med  | Spending forecast widget — project month-end based on pace | Not started |
| 🟢 Low  | Receipt photo attachments per transaction | Not started |
| 🟢 Low  | Calendar heatmap view of spending intensity | Not started |
| 🟢 Low  | Cash-flow forecast curve (separate from net worth) | Not started |
| 🟢 Low  | Mint / YNAB / OFX import path | Not started |
| 🟢 Low  | Multi-currency FX-rate cache + conversion | Not started |

## Operations + tooling

| Priority | Item | Status |
|---|---|---|
| ✅      | GitHub Actions CI (run tests + build + audit on PRs) | Shipped |
| 🔴 High | Dependabot / Renovate (deps drift over time) | Not started |
| 🟡 Med  | Plaid webhook handling polish — auto-incremental-sync on DEFAULT_UPDATE | Partially wired |
| 🟡 Med  | Idle session timeout (auto-logout after 30 min inactive) | Not started |
| 🟢 Low  | Backend hot-reload via `nodemon` in `npm run dev` | nodemon installed, not wired |

## Code quality

| Priority | Item | Status |
|---|---|---|
| 🟡 Med  | Split `CardManagerRefactored` further — already 1415 → 782 lines via 8 extractions; could go further (transactions section, dashboard layout grid) | Iterating |
| 🟡 Med  | Frontend integration tests via Playwright / Cypress | Not started |
| 🟢 Low  | RTL-based component tests for high-value widgets (TransactionsList badges, FixedCostsPanel click-through) | Not started |
| 🟢 Low  | Storybook for component preview | Not started |

## Mobile / UX polish

| Priority | Item | Status |
|---|---|---|
| 🟢 Low | Dark mode | Not started |
| 🟢 Low | Bottom-anchored nav on mobile | Not started |
| 🟢 Low | Onboarding tour for new users | Not started |
| 🟢 Low | Print / PDF view of dashboard | Not started |

## Explicitly out of scope

- **Multi-tenant SaaS.** This app is single-user-per-deployment by design. The DB has `user_id` scoping but the UX, backup model, and ops tooling all assume one operator.
- **ML-based categorization.** Substring rules are simpler + transparent. ML would obscure the why.
- **Crypto exchanges without Plaid coverage.** Add as a manual card if needed.

---

## How to propose new items

1. Open a GitHub issue with the `enhancement` label.
2. Include: problem you're trying to solve, proposed approach, alternatives considered, rough effort estimate.
3. If you want to implement it yourself, follow the "Adding a feature" checklist in [`DEVELOPMENT.md`](./DEVELOPMENT.md).

For security issues, follow [`SECURITY.md`](./SECURITY.md) instead — don't open a public issue.
