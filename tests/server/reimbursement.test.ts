import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers';

async function seed(agent: any) {
  await agent.post('/api/auth/register')
    .send({ name: 'R', email: 'reimb@example.com', password: 'longenough123' });
  const cardRes = await agent.post('/api/cards').send({
    name: 'Test Checking', type: 'debit', lastFour: '0001', balance: 1000
  });
  const cardId = cardRes.body.id;
  const purchaseRes = await agent.post('/api/transactions').send({
    cardId, amount: -100, description: 'DINNER', category: 'Food', date: '2026-04-10'
  });
  const reimbRes = await agent.post('/api/transactions').send({
    cardId, amount: 40, description: 'INTERAC E-TRANSFER RECEIVE Friend', category: 'Other', date: '2026-04-12'
  });
  return { cardId, purchaseId: purchaseRes.body.id, reimbId: reimbRes.body.id };
}

describe('POST /api/transactions/:id/reimburses', () => {
  let app: any;
  beforeEach(async () => { ({ app } = await buildTestApp()); });

  it('links a positive transaction to its target purchase', async () => {
    const agent = request.agent(app);
    const { purchaseId, reimbId } = await seed(agent);
    const res = await agent.post(`/api/transactions/${reimbId}/reimburses`)
      .send({ purchaseId });
    expect(res.status).toBe(200);
    expect(res.body.reimburses_id).toBe(purchaseId);
  });

  it('unlinks when purchaseId is null', async () => {
    const agent = request.agent(app);
    const { purchaseId, reimbId } = await seed(agent);
    await agent.post(`/api/transactions/${reimbId}/reimburses`).send({ purchaseId });
    const res = await agent.post(`/api/transactions/${reimbId}/reimburses`)
      .send({ purchaseId: null });
    expect(res.status).toBe(200);
    expect(res.body.reimburses_id).toBeNull();
  });

  it('rejects linking a negative transaction as the reimbursement', async () => {
    const agent = request.agent(app);
    const { purchaseId, reimbId } = await seed(agent);
    // try to swap: use purchase as reimbursement against another purchase
    const res = await agent.post(`/api/transactions/${purchaseId}/reimburses`)
      .send({ purchaseId: reimbId });
    expect(res.status).toBe(400);
  });

  it('rejects self-link', async () => {
    const agent = request.agent(app);
    const { reimbId } = await seed(agent);
    const res = await agent.post(`/api/transactions/${reimbId}/reimburses`)
      .send({ purchaseId: reimbId });
    expect(res.status).toBe(400);
  });
});
