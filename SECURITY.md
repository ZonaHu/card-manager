# Security Policy

## Scope + threat model

Card Manager is a **self-hosted, single-user-per-deployment** personal finance dashboard. The security model assumes:

- One user (the operator) per running instance
- The instance is either on `localhost` or behind a reverse proxy under the operator's control
- The operator manages their own secrets via `server/.env`
- The operator is responsible for HTTPS termination, OS hardening, and backup encryption

It is **not designed as a multi-tenant SaaS.** Deploying it for multiple unrelated users is outside the security model — features like the backup endpoint dump the entire SQLite database, and the UX is not designed for tenant isolation.

## Supported versions

Only the `main` branch is supported. There are no point releases. To get a security fix, pull the latest `main` and restart.

## Reporting a vulnerability

If you find a security issue, please:

1. **Do NOT open a public GitHub issue.** Public issues tip off attackers before a fix is available.
2. Email the maintainer directly: `zuomiao.hu@gmail.com` with the subject line `card-manager security`.
3. Include:
   - A description of the vulnerability
   - Steps to reproduce (ideally a minimal test case)
   - The commit SHA / branch you reproduced on
   - The `X-Request-ID` from any error response, if applicable
   - Your assessment of severity + impact

You should expect:
- **Acknowledgment within 7 days.**
- **A first-pass response (fix in progress, more info needed, or won't-fix with reasoning) within 14 days.**
- **A patch landed on `main` within 30 days** for any High/Critical issue, sooner where feasible.

Once the fix is published, the issue will be disclosed via a follow-up commit message + (if you consent) credit in the release notes.

## Known limitations (documented, not vulnerabilities)

The items below are deliberate trade-offs for self-hosted personal use. They are NOT vulnerabilities for the intended deployment model but would be for a multi-tenant SaaS:

- **No 2FA / TOTP** — passwords are the only auth factor. Rate limiting on `/auth/*` mitigates brute force (20 attempts / 15 min). On the roadmap.
- **No email verification** — anyone can register with any email. Acceptable since this is single-user; the operator is the only legitimate registrant.
- **No account lockout** — the rate limiter is the only brake on repeated failures.
- **Plaid access tokens** — encrypted at rest with AES-256-GCM, but the encryption key (`ENCRYPTION_KEY`) lives in `server/.env` alongside the database. Anyone with filesystem access has both.
- **Backup endpoint** — dumps the entire SQLite database. Restricted via `ADMIN_USER_IDS` env, but defaults to "any user" when unset (single-tenant assumption).
- **Backup file is plaintext SQLite** — encrypt before syncing to cloud storage. The bundled `backup-db.sh` does not encrypt.
- **No CSRF tokens** — relies on `SameSite=strict` cookies in production. Adequate for the deployment model but not deep-defense.
- **No CSP report-uri** — CSP violations are logged to the browser console but not collected server-side.
- **HTTPS not enforced in app code** — assumes reverse proxy handles TLS termination. Document this on your deployment.
- **bcrypt cost = 10** when `NODE_ENV !== 'production'`. Production deployments MUST set `NODE_ENV=production` so the cost rises to 12.

## What we DO consider in-scope vulnerabilities

- Auth bypass (JWT forgery, cookie tampering, session fixation)
- Cross-user data reach (the `user_id` scoping on every query is load-bearing)
- SQL injection (every query must be parameterized — no string interpolation)
- Plaid access-token disclosure (encryption boundary, transport, log lines)
- Webhook signature bypass
- XSS, especially in user-controlled fields (transaction notes, descriptions, rule patterns)
- Path traversal in any file-handling code (backup, future receipt uploads)
- Denial-of-service against a single-user instance (memory bombs, unbounded loops)
- Secret leakage in commits, logs, or stack traces

## Security hardening already in place

For context — these are documented + tested:

- AES-256-GCM at-rest encryption for Plaid access tokens (`enc:v1:` envelope, migration 014 backfills legacy plaintext)
- Refresh-token rotation with atomic SQL guard (no race between concurrent `/auth/refresh` calls)
- JWT `tv` (token_version) field invalidated on logout — every previously-issued cookie stops verifying immediately
- httpOnly + SameSite cookies, 15 min TTL on auth cookie
- Helmet CSP with strict `script-src` in production; `connect-src` limited to `'self'` + `*.plaid.com`
- `X-Request-ID` middleware sanitizes inbound header (regex-filtered) so it can't be used to inject log lines
- Webhook verification via Plaid JWKS (ES256 signature + body hash + iat freshness)
- Server refuses to start with placeholder secrets from `.env.example`
- All SQL parameterized; queries scoped `WHERE user_id = ?`
- Atomic DB transactions (`BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`) on the exchange + sync paths

See `DEVELOPMENT.md` § "Auth flow" and § "Encryption" for protocol details, and `README.md` § "Security model" for a user-facing summary.

## Out of scope

- Vulnerabilities in third-party dependencies. Report those to the upstream maintainers; we'll bump versions as patches land.
- Issues that require physical access to the host or root-level OS access — that's outside the app's threat model.
- Browser-extension or browser-bug-driven attacks.
- Social engineering of the operator.
