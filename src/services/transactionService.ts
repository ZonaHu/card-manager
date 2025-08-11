import type { Transaction, ApiResponse } from '../types';

export class TransactionService {
  constructor(private apiCall: (url: string, options?: RequestInit) => Promise<any>) {}

  async getTransactions(): Promise<Transaction[]> {
    const transactions = await this.apiCall('/api/transactions');
    return transactions.map((transaction: any) => ({
      ...transaction,
      cardId: transaction.card_id
    }));
  }

  async createTransaction(transactionData: {
    cardId: number;
    amount: number;
    description: string;
    category: string;
    date: string;
  }): Promise<Transaction> {
    const newTransaction = await this.apiCall('/api/transactions', {
      method: 'POST',
      body: JSON.stringify(transactionData)
    });

    return {
      ...newTransaction,
      cardId: newTransaction.card_id
    };
  }

  async updateTransaction(transactionData: {
    id: number;
    amount: number;
    description: string;
    category: string;
  }): Promise<Transaction> {
    const updatedTransaction = await this.apiCall(`/api/transactions/${transactionData.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        amount: transactionData.amount,
        description: transactionData.description,
        category: transactionData.category
      })
    });

    return {
      ...updatedTransaction,
      cardId: updatedTransaction.card_id
    };
  }

  async syncTransactions(type: 'recent' | 'all' = 'recent', months?: number): Promise<ApiResponse> {
    const endpoint = type === 'all' 
      ? `/api/sync-transactions${months ? `?months=${months}` : ''}` 
      : '/api/sync-recent-transactions';
    
    return this.apiCall(endpoint, { method: 'POST' });
  }

  async recategorizeTransactions(): Promise<ApiResponse> {
    return this.apiCall('/api/transactions/recategorize', {
      method: 'POST'
    });
  }
}