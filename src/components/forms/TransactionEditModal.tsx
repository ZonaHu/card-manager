import React, { useState } from 'react';
import type { Transaction, Card } from '../../types';
import { CATEGORIES } from '../../constants/categories';

interface TransactionEditModalProps {
  transaction: Transaction;
  cards: Card[];
  onSubmit: (data: {
    id: number;
    amount: number;
    description: string;
    category: string;
  }) => void;
  onCancel: () => void;
}

export const TransactionEditModal: React.FC<TransactionEditModalProps> = ({
  transaction,
  cards,
  onSubmit,
  onCancel
}) => {
  const [amount, setAmount] = useState(Math.abs(transaction.amount).toString());
  const [description, setDescription] = useState(transaction.description);
  const [category, setCategory] = useState(transaction.category);
  const [isNegative, setIsNegative] = useState(transaction.amount < 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      id: transaction.id,
      amount: isNegative ? -parseFloat(amount) : parseFloat(amount),
      description,
      category
    });
  };

  const card = cards.find(c => c.id === transaction.cardId);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-semibold mb-4">Edit Transaction</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Card
            </label>
            <div className="p-3 bg-gray-100 rounded-lg text-sm text-gray-600">
              {card?.name || 'Unknown Card'}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount
            </label>
            <div className="flex gap-2">
              <select
                value={isNegative ? 'expense' : 'income'}
                onChange={(e) => setIsNegative(e.target.value === 'expense')}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="expense">Expense (-)</option>
                <option value="income">Income (+)</option>
              </select>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                step="0.01"
                min="0"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              required
            >
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};