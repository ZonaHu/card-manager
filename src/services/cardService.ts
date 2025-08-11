import type { Card, ApiResponse } from '../types';

export class CardService {
  constructor(private apiCall: (url: string, options?: RequestInit) => Promise<any>) {}

  async getCards(): Promise<Card[]> {
    return this.apiCall('/api/cards');
  }

  async createCard(cardData: {
    name: string;
    type: string;
    lastFour: string;
    balance: number;
    currency: string;
    category?: string;
  }): Promise<Card> {
    return this.apiCall('/api/cards', {
      method: 'POST',
      body: JSON.stringify({
        name: cardData.name,
        type: cardData.type,
        lastFour: cardData.lastFour,
        balance: cardData.balance,
        currency: cardData.currency,
        category: cardData.category || 'other'
      })
    });
  }

  async deleteCard(cardId: number): Promise<void> {
    return this.apiCall(`/api/cards/${cardId}`, {
      method: 'DELETE'
    });
  }

  async getCardCategories(): Promise<Record<string, any>> {
    return this.apiCall('/api/card-categories');
  }
}