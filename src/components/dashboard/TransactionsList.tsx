import React from 'react';
import type { Transaction, Card, UserRegion } from '../../types';
import { getCategoryColor } from '../../constants/categories';
import { formatCurrency } from '../../utils/currency';

interface TransactionsListProps {
  transactions: Transaction[];
  cards: Card[];
  userRegion: UserRegion;
  onTransactionClick: (transaction: Transaction) => void;
  limit?: number;
}

export const TransactionsList: React.FC<TransactionsListProps> = ({
  transactions,
  cards,
  userRegion,
  onTransactionClick,
  limit = 10
}) => {
  const displayTransactions = transactions.slice(0, limit);

  if (transactions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No transactions for this month
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {displayTransactions.map(transaction => {
        const card = cards.find(c => c.id === transaction.cardId);
        
        return (
          <button 
            key={transaction.id} 
            onClick={() => onTransactionClick(transaction)}
            className="w-full flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50 hover:border-gray-200 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${getCategoryColor(transaction.category)}`} />
              <div className="text-left">
                <p className="font-medium text-gray-900">{transaction.description}</p>
                <p className="text-sm text-gray-500">{card?.name} • {transaction.category}</p>
              </div>
            </div>
            <div className="text-right">
              <p className={`font-semibold ${transaction.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {transaction.amount > 0 ? '+' : ''}{formatCurrency(Math.abs(transaction.amount), userRegion.currency)}
              </p>
              <p className="text-sm text-gray-500">{transaction.date}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
};