import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers';

describe('auth routes', () => {
  let app: any;

  beforeEach(async () => {
    ({ app } = await buildTestApp());
  });

  describe('POST /api/auth/register', () => {
    it('creates a user and sets an auth cookie', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Alice', email: 'alice@example.com', password: 'longenough123' });
      expect(res.status).toBe(201);
      expect(res.body.user).toMatchObject({ name: 'Alice', email: 'alice@example.com' });
      const setCookie = (res.headers['set-cookie'] || []) as string[];
      expect(setCookie.some(c => c.startsWith('auth_token='))).toBe(true);
    });

    it('rejects an invalid email via zod', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Bob', email: 'not-an-email', password: 'longenough123' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/email/i);
    });

    it('rejects passwords shorter than 8 characters', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Bob', email: 'bob@example.com', password: 'short' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/8 characters/);
    });

    it('rejects duplicate emails', async () => {
      const payload = { name: 'A', email: 'dup@example.com', password: 'longenough123' };
      await request(app).post('/api/auth/register').send(payload);
      const res = await request(app).post('/api/auth/register').send(payload);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/exists/i);
    });
  });

  describe('POST /api/auth/login', () => {
    it('signs in a registered user', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ name: 'C', email: 'c@example.com', password: 'longenough123' });
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'c@example.com', password: 'longenough123' });
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('c@example.com');
    });

    it('rejects wrong password with 401', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ name: 'D', email: 'd@example.com', password: 'longenough123' });
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'd@example.com', password: 'WRONG' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns 401 with no cookie', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('returns the current user when cookie is present', async () => {
      const agent = request.agent(app);
      await agent.post('/api/auth/register')
        .send({ name: 'E', email: 'e@example.com', password: 'longenough123' });
      const res = await agent.get('/api/auth/me');
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('e@example.com');
    });

    it('invalidates a captured cookie after logout (token_version bump)', async () => {
      const agent = request.agent(app);
      const reg = await agent.post('/api/auth/register')
        .send({ name: 'F', email: 'f@example.com', password: 'longenough123' });
      const setCookie = (reg.headers['set-cookie'] || []) as string[];
      const authCookie = setCookie.find(c => c.startsWith('auth_token='));
      expect(authCookie).toBeDefined();

      // Logout bumps token_version on the server.
      await agent.post('/api/auth/logout');

      // Replay the original cookie. tv mismatch → 401.
      const replay = await request(app)
        .get('/api/auth/me')
        .set('Cookie', authCookie as string);
      expect(replay.status).toBe(401);
    });
  });
});
