import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers';

describe('health + rules + pagination', () => {
  let app: any;

  beforeEach(async () => {
    ({ app } = await buildTestApp());
  });

  it('GET /health returns 200 and DB-ok status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('exposes helmet security headers', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  it('categorization rules CRUD round-trip', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register')
      .send({ name: 'A', email: 'rules@example.com', password: 'longenough123' });

    let res = await agent.get('/api/categorization-rules');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);

    res = await agent.post('/api/categorization-rules')
      .send({ pattern: 'NETFLIX', category: 'Entertainment' });
    expect(res.status).toBe(201);
    const ruleId = res.body.id;

    res = await agent.get('/api/categorization-rules');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].pattern).toBe('NETFLIX');

    res = await agent.post('/api/categorization-rules')
      .send({ pattern: '', category: 'Entertainment' });
    expect(res.status).toBe(400);

    res = await agent.delete(`/api/categorization-rules/${ruleId}`);
    expect(res.status).toBe(200);
    res = await agent.get('/api/categorization-rules');
    expect(res.body).toEqual([]);
  });

  it('paginates GET /api/transactions and filters by month', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register')
      .send({ name: 'P', email: 'pg@example.com', password: 'longenough123' });

    const cardRes = await agent.post('/api/cards')
      .send({ name: 'Card', type: 'debit', lastFour: '0001', balance: 0, currency: 'USD', category: 'chequing' });
    const cardId = cardRes.body.id;

    for (let i = 1; i <= 3; i++) {
      await agent.post('/api/transactions').send({
        cardId, amount: -10 * i, description: `April ${i}`,
        category: 'Food', date: `2026-04-0${i}`
      });
    }
    for (let i = 1; i <= 2; i++) {
      await agent.post('/api/transactions').send({
        cardId, amount: -10 * i, description: `May ${i}`,
        category: 'Food', date: `2026-05-0${i}`
      });
    }

    let res = await agent.get('/api/transactions?month=2026-04');
    expect(res.body).toHaveLength(3);
    res = await agent.get('/api/transactions?month=2026-05');
    expect(res.body).toHaveLength(2);
    res = await agent.get('/api/transactions?limit=2');
    expect(res.body).toHaveLength(2);
  });
});
