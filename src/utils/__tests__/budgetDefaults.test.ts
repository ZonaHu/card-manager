// src/utils/__tests__/budgetDefaults.test.ts
import { describe, it, expect } from 'vitest';
import { mergeWithDefaults, DEFAULT_BUDGETS } from '../budgetDefaults';

describe('mergeWithDefaults', () => {
  it('returns defaults when user has nothing saved', () => {
    expect(mergeWithDefaults({})).toEqual(DEFAULT_BUDGETS);
  });
  it('user values take precedence over defaults', () => {
    const merged = mergeWithDefaults({ Food: 999 });
    expect(merged.Food).toBe(999);
    expect(merged.Cash).toBe(DEFAULT_BUDGETS.Cash);
  });
  it('covers all the new categories (Cash, Deposit) with sane starting values', () => {
    expect(DEFAULT_BUDGETS.Cash).toBeGreaterThan(0);
    expect(DEFAULT_BUDGETS.Deposit).toBe(0); // inflow bucket — no expense budget
  });
});
