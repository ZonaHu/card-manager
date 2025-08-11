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
}

export interface MonthlyData {
  transactions: Transaction[];
  spending: number;
  income: number;
  byCategory: Record<string, number>;
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