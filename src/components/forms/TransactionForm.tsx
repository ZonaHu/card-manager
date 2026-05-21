import React, { useState } from 'react';
import type { Card } from '../../types';

interface TransactionFormProps {
  cards: Card[];
  categories: readonly string[];
  onSubmit: (data: {
    cardId: number;
    amount: number;
    description: string;
    category: string;
    date: string;
  }) => void;
  onCancel: () => void;
}

// Manual "Add Transaction" form. Useful for cash purchases that never hit a
// connected card, or for backfilling rows that Plaid won't surface (cross-
// border, gift cards, etc.).
export const TransactionForm: React.FC<TransactionFormProps> = ({ cards, categories, onSubmit, onCancel }) => {
  const [cardId, setCardId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(categories[0]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [isExpense, setIsExpense] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      cardId: parseInt(cardId),
      amount: isExpense ? -Math.abs(parseFloat(amount)) : Math.abs(parseFloat(amount)),
      description,
      category,
      date
    });
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="transaction-form-title" className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md">
        <h2 id="transaction-form-title" className="text-xl font-semibold mb-4">Add Transaction</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <select
            value={cardId}
            onChange={(e) => setCardId(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg"
            required
          >
            <option value="">Select Card</option>
            {cards.map(card => (
              <option key={card.id} value={card.id}>{card.name}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg"
            required
          />
          <div className="flex gap-2">
            <select
              value={isExpense ? 'expense' : 'income'}
              onChange={(e) => setIsExpense(e.target.value === 'expense')}
              className="px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
            <input
              type="number"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 p-3 border border-gray-300 rounded-lg"
              step="0.01"
              required
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg"
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg"
            required
          />
          <div className="flex gap-3">
            <button type="button" onClick={onCancel} className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg">
              Cancel
            </button>
            <button type="submit" className="flex-1 bg-indigo-600 text-white py-2 rounded-lg">
              Add Transaction
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
