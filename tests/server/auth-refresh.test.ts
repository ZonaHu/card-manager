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
