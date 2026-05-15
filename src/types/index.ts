export interface User {
  id: number;
  name: string;
  email: string;
}

export interface CardCategory {
  label: string;
  icon: string;
  color: string;
  description: string;
}

export interface Card {
  id: number;
  name: string;
  type: string;
  last_four: string;
  balance: number;
  currency?: string;
  plaid_id?: string;
  connected: boolean;
  category?: string;
  categoryInfo?: CardCategory;
  institution_name?: string;
  account_subtype?: string;
  item_id?: string;
  needs_reauth?: boolean;
  reauth_error_code?: string;
  last_synced_at?: string;
  last_sync_attempt_at?: string;
  last_sync_error?: string;
}

export type BudgetConfig = Record<string, number>;

export interface RecurringTransaction {
  description: string;
  amount: number;     // latest seen amount (rounded display)
  minAmount: number;
  maxAmount: number;
  category: string;
  occurrences: number;
  lastSeen: string;
  averageIntervalDays: number;
}

export interface Transaction {
  id: number;
  card_id: number;
  cardId: number;
  amount: number;
  description: string;
  category: string;
  date: string;
  source: string;
  pending?: boolean | number;
  transaction_currency?: string;
  original_amount?: number;
  // ID of the purchase this transaction reimburses (set on positive entries
  // when a friend pays back their share of an outlay).
  reimburses_id?: number | null;
  // Free-form user note. Persisted in SQLite; survives Plaid resync as long
  // as the transaction id stays stable.
  notes?: string | null;
}

export interface MonthlyData {
  transactions: Transaction[];
  spending: number;
  creditCardSpending?: number;
  depositAccountSpending?: number;
  depositAccountCashOutflow?: number; // total cash leaving deposit accounts, including CC payments
  income: number;
  byCategory: Record<string, number>;
  allTransactions?: Transaction[];
  // E-Transfer breakdown — surfaced separately so users can see net Interac
  // activity without it polluting spend/income totals.
  eTransfersIn?: number;
  eTransfersOut?: number;
  // Total amount of reimbursements applied to spending this month (positive
  // value; already subtracted from `spending`). Lets the UI show "Spent $X,
  // reimbursed $Y, net $Z" so the headline number matches reality.
  reimbursementsApplied?: number;
  // Counts of rows that actually contributed to the headline spending/income
  // numbers. Excludes pending, washes, transfers, e-transfers, and other
  // skipped rows so the "N transactions" caption matches what's counted.
  spendingTxnCount?: number;
  incomeTxnCount?: number;
}

export interface UserRegion {
  country: string;
  currency: string;
}

export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
}

export type TransactionFilter = 'all' | string;
export type TransactionSort = 'newest' | 'oldest' | 'highest' | 'lowest';