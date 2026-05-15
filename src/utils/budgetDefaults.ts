// src/utils/budgetDefaults.ts
import type { BudgetConfig } from '../types';

// Starting-point budgets for the editor when the user hasn't set one yet.
// These are deliberately conservative — easy to bump, but a default of 0
// means "nothing flagged" which is misleading after the user adds new
// categories.
export const DEFAULT_BUDGETS: BudgetConfig = {
  Food: 800,
  Shopping: 400,
  Transport: 200,
  Bills: 1800,        // rent + utilities + internet + mobile baseline
  Entertainment: 150,
  Health: 100,
  Travel: 250,
  Income: 0,
  Transfer: 0,
  Cash: 200,          // typical ATM cadence
  Deposit: 0,         // inbound bucket, not an expense
  Other: 100
};

export function mergeWithDefaults(saved: BudgetConfig): BudgetConfig {
  return { ...DEFAULT_BUDGETS, ...saved };
}
