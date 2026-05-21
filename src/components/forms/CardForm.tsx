import React, { useState } from 'react';
import type { CardCategory } from '../../types';

interface CardFormProps {
  onSubmit: (data: {
    name: string;
    type: string;
    lastFour: string;
    balance: number;
    category: string;
  }) => void;
  onCancel: () => void;
  cardCategories: Record<string, CardCategory>;
}

// Manual "Add Card" form. Used for accounts the user wants to track without
// linking through Plaid (cash envelopes, foreign cards, etc.).
export const CardForm: React.FC<CardFormProps> = ({ onSubmit, onCancel, cardCategories }) => {
  const [name, setName] = useState('');
  const [type, setType] = useState('credit');
  const [lastFour, setLastFour] = useState('');
  const [balance, setBalance] = useState('0');
  const [category, setCategory] = useState('credit');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      type,
      lastFour,
      balance: parseFloat(balance),
      category
    });
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="card-form-title" className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md">
        <h2 id="card-form-title" className="text-xl font-semibold mb-4">Add Card</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="Card Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg"
            required
          />
          <input
            type="text"
            placeholder="Last Four Digits"
            value={lastFour}
            onChange={(e) => setLastFour(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg"
            maxLength={4}
            required
          />
          <input
            type="number"
            placeholder="Balance"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg"
            step="0.01"
            required
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg"
          >
            <option value="credit">Credit</option>
            <option value="debit">Debit</option>
          </select>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg"
          >
            {Object.entries(cardCategories).map(([key, cat]) => (
              <option key={key} value={key}>{cat.label}</option>
            ))}
          </select>
          <div className="flex gap-3">
            <button type="button" onClick={onCancel} className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg">
              Cancel
            </button>
            <button type="submit" className="flex-1 bg-indigo-600 text-white py-2 rounded-lg">
              Add Card
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
