import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers';

// These tests exercise the shared-secret webhook path. The JWKS-signed path
// (PLAID_WEBHOOK_JWT_VERIFICATION=true) is exercised only against a real
// Plaid environment; mocking it requires forging JWTs and substituting the
// SDK's webhookVerificationKeyGet response.

describe('POST /api/plaid/webhook', () => {
  let app: any;

  beforeEach(async () => {
    delete process.env.PLAID_WEBHOOK_JWT_VERIFICATION;
    delete process.env.PLAID_WEBHOOK_SECRET;
    ({ app } = await buildTestApp());
  });

  it('accepts the webhook when no secret is configured (dev mode)', async () => {
    const res = await request(app)
      .post('/api/plaid/webhook')
      .set('Content-Type', 'application/json')
      .send({ webhook_type: 'TRANSACTIONS', webhook_code: 'DEFAULT_UPDATE' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('rejects with 401 when configured secret does not match', async () => {
    process.env.PLAID_WEBHOOK_SECRET = 'expected-secret';
    ({ app } = await buildTestApp());

    const res = await request(app)
      .post('/api/plaid/webhook')
      .set('Content-Type', 'application/json')
      .set('Plaid-Verification', 'wrong-secret')
      .send({ webhook_type: 'TRANSACTIONS' });
    expect(res.status).toBe(401);
    delete process.env.PLAID_WEBHOOK_SECRET;
  });

  it('accepts when the configured shared secret matches', async () => {
    process.env.PLAID_WEBHOOK_SECRET = 'correct-secret';
    ({ app } = await buildTestApp());

    const res = await request(app)
      .post('/api/plaid/webhook')
      .set('Content-Type', 'application/json')
      .set('Plaid-Verification', 'correct-secret')
      .send({ webhook_type: 'TRANSACTIONS' });
    expect(res.status).toBe(200);
    delete process.env.PLAID_WEBHOOK_SECRET;
  });
});
