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

  it('PUT /api/transactions/:id round-trips notes (persisted, not wiped on subsequent update)', async () => {
    const agent = request.agent(app);
    const { purchaseId } = await seed(agent);

    // First update — set a note.
    let res = await agent.put(`/api/transactions/${purchaseId}`).send({
      amount: -100, description: 'DINNER', category: 'Food', notes: 'split with Yutang'
    });
    expect(res.status).toBe(200);
    expect(res.body.notes).toBe('split with Yutang');

    // Second update without notes field — backend should treat undefined as
    // null (matches the validation rule). Round-trip stays stable.
    res = await agent.put(`/api/transactions/${purchaseId}`).send({
      amount: -100, description: 'DINNER', category: 'Food'
    });
    expect(res.status).toBe(200);
    expect(res.body.notes).toBeNull();

    // Set notes again, verify length cap.
    const huge = 'a'.repeat(3000);
    res = await agent.put(`/api/transactions/${purchaseId}`).send({
      amount: -100, description: 'DINNER', category: 'Food', notes: huge
    });
    expect(res.status).toBe(200);
    expect(res.body.notes.length).toBe(2000);
  });

  it('does NOT let user A link across user B transactions', async () => {
    const a = request.agent(app);
    const seedA = await seed(a);

    const b = request.agent(app);
    await b.post('/api/auth/register')
      .send({ name: 'B', email: 'b@example.com', password: 'longenough123' });
    const cardB = await b.post('/api/cards').send({
      name: 'B Checking', type: 'debit', lastFour: '0002', balance: 1000
    });
    const purchaseB = await b.post('/api/transactions').send({
      cardId: cardB.body.id, amount: -50, description: 'B DINNER', category: 'Food', date: '2026-04-10'
    });

    // A tries to link their reimbursement to B's purchase — must 404.
    const res = await a.post(`/api/transactions/${seedA.reimbId}/reimburses`)
      .send({ purchaseId: purchaseB.body.id });
    expect(res.status).toBe(404);
  });
});

describe('soft-delete + restore', () => {
  let app: any;
  beforeEach(async () => { ({ app } = await buildTestApp()); });

  async function seedRow(agent: any) {
    await agent.post('/api/auth/register')
      .send({ name: 'D', email: 'd@example.com', password: 'longenough123' });
    const cardRes = await agent.post('/api/cards').send({
      name: 'Test Checking', type: 'debit', lastFour: '0001', balance: 1000
    });
    const txRes = await agent.post('/api/transactions').send({
      cardId: cardRes.body.id, amount: -10, description: 'COFFEE',
      category: 'Food', date: '2026-04-01'
    });
    return { txId: txRes.body.id };
  }

  it('DELETE /:id hides the row from subsequent GET /', async () => {
    const agent = request.agent(app);
    const { txId } = await seedRow(agent);
    const before = await agent.get('/api/transactions');
    expect(before.body.find((t: any) => t.id === txId)).toBeTruthy();

    const del = await agent.delete(`/api/transactions/${txId}`);
    expect(del.status).toBe(200);

    const after = await agent.get('/api/transactions');
    expect(after.body.find((t: any) => t.id === txId)).toBeUndefined();
  });

  it('POST /:id/restore brings the row back', async () => {
    const agent = request.agent(app);
    const { txId } = await seedRow(agent);
    await agent.delete(`/api/transactions/${txId}`);

    const res = await agent.post(`/api/transactions/${txId}/restore`);
    expect(res.status).toBe(200);
    expect(res.body.deleted_at).toBeNull();

    const after = await agent.get('/api/transactions');
    expect(after.body.find((t: any) => t.id === txId)).toBeTruthy();
  });

  it('DELETE is idempotent — second delete on the same row returns 404 (already deleted)', async () => {
    const agent = request.agent(app);
    const { txId } = await seedRow(agent);
    await agent.delete(`/api/transactions/${txId}`);
    const res2 = await agent.delete(`/api/transactions/${txId}`);
    expect(res2.status).toBe(404);
  });

  it('restoring another user\'s deleted row returns 404 — no cross-user reach', async () => {
    const a = request.agent(app);
    const { txId } = await seedRow(a);
    await a.delete(`/api/transactions/${txId}`);

    const b = request.agent(app);
    await b.post('/api/auth/register')
      .send({ name: 'B', email: 'b@example.com', password: 'longenough123' });
    const res = await b.post(`/api/transactions/${txId}/restore`);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/transactions/batch-recategorize', () => {
  let app: any;
  beforeEach(async () => { ({ app } = await buildTestApp()); });

  async function seedThree(agent: any) {
    await agent.post('/api/auth/register')
      .send({ name: 'C', email: 'c@example.com', password: 'longenough123' });
    const cardRes = await agent.post('/api/cards').send({
      name: 'C Checking', type: 'debit', lastFour: '0001', balance: 1000
    });
    const cardId = cardRes.body.id;
    const ids: number[] = [];
    for (const desc of ['A', 'B', 'C']) {
      const r = await agent.post('/api/transactions').send({
        cardId, amount: -10, description: desc, category: 'Other', date: '2026-04-01'
      });
      ids.push(r.body.id);
    }
    return ids;
  }

  it('updates category on every supplied id (in caller\'s scope)', async () => {
    const agent = request.agent(app);
    const ids = await seedThree(agent);
    const res = await agent.post('/api/transactions/batch-recategorize')
      .send({ ids, category: 'Food' });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(3);

    const list = await agent.get('/api/transactions');
    for (const id of ids) {
      const row = list.body.find((t: any) => t.id === id);
      expect(row.category).toBe('Food');
    }
  });

  it('rejects empty ids array', async () => {
    const agent = request.agent(app);
    await seedThree(agent);
    const res = await agent.post('/api/transactions/batch-recategorize')
      .send({ ids: [], category: 'Food' });
    expect(res.status).toBe(400);
  });

  it('cannot touch another user\'s rows', async () => {
    const a = request.agent(app);
    const aIds = await seedThree(a);

    const b = request.agent(app);
    await b.post('/api/auth/register')
      .send({ name: 'B', email: 'b2@example.com', password: 'longenough123' });
    const res = await b.post('/api/transactions/batch-recategorize')
      .send({ ids: aIds, category: 'Food' });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(0); // user_id filter zero'd out all matches
  });
});
