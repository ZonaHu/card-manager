import React, { useState, useMemo } from 'react';
import { X, TrendingUp, TrendingDown, Calendar, CreditCard } from 'lucide-react';
import type { Card, Transaction, UserRegion } from '../../types';
import { CATEGORIES, getCategoryColor } from '../../constants/categories';
import { formatCurrency } from '../../utils/currency';
import { TransactionsList } from '../dashboard/TransactionsList';
import { useEscapeKey } from '../../hooks/useEscapeKey';

interface CardDetailModalProps {
  card: Card;
  transactions: Transaction[];
  userRegion: UserRegion;
  onClose: () => void;
  onTransactionClick: (transaction: Transaction) => void;
}

export const CardDetailModal: React.FC<CardDetailModalProps> = ({
  card,
  transactions,
  userRegion,
  onClose,
  onTransactionClick
}) => {
  useEscapeKey(true, onClose);

  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Filter transactions for this card. Accept both camelCase (frontend) and snake_case (backend) keys.
  const cardTransactions = useMemo(() => {
    return transactions.filter(t => t.cardId === card.id || (t as any).card_id === card.id);
  }, [transactions, card.id]);

  // Monthly data calculation
  const monthlyData = useMemo(() => {
    let filteredTransactions = cardTransactions.filter(t => 
      t.date.startsWith(currentMonth)
    );

    if (selectedCategory !== 'all') {
      filteredTransactions = filteredTransactions.filter(t => t.category === selectedCategory);
    }

    // Sort by date (newest first)
    filteredTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const spending = filteredTransactions
      .filter(t => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
    const isCreditCard = card.category === 'credit' || card.type === 'credit';
    const income = filteredTransactions
      .filter(t => {
        if (t.amount <= 0) return false;
        if (isCreditCard) return false; // Credit card positive amounts are payments, not income
        if (t.category === 'Income') return true;
        const isTransferOrPayment = t.category === 'Other' ||
                                   t.description?.toLowerCase().includes('transfer') ||
                                   t.description?.toLowerCase().includes('payment');
        return !isTransferOrPayment;
      })
      .reduce((sum, t) => sum + t.amount, 0);

    const byCategory = filteredTransactions.reduce((acc, t) => {
      if (t.amount < 0) {
        acc[t.category] = (acc[t.category] || 0) + Math.abs(t.amount);
      }
      return acc;
    }, {} as Record<string, number>);

    // Get available months for this card
    const allMonths = [...new Set(cardTransactions.map(t => t.date.substring(0, 7)))].sort().reverse();

    return {
      transactions: filteredTransactions,
      spending,
      income,
      byCategory,
      availableMonths: allMonths
    };
  }, [cardTransactions, currentMonth, selectedCategory]);

  const categoryEntries = Object.entries(monthlyData.byCategory)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10);

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                <CreditCard className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">{card.name}</h2>
                <p className="text-blue-100">•••• {card.last_four}</p>
                {card.institution_name && (
                  <p className="text-blue-200 text-sm">{card.institution_name}</p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close card details"
              className="w-10 h-10 bg-white bg-opacity-20 rounded-full flex items-center justify-center hover:bg-opacity-30 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Card Balance */}
          <div className="mt-4 p-4 bg-white bg-opacity-10 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-blue-100">Current Balance</span>
              <span className={`text-2xl font-bold ${card.balance >= 0 ? 'text-green-200' : 'text-red-200'}`}>
                {formatCurrency(Math.abs(card.balance), card.currency || userRegion.currency)}
              </span>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Month Selector */}
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-500" />
              <select
                value={currentMonth}
                onChange={(e) => setCurrentMonth(e.target.value)}
                className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {monthlyData.availableMonths.map(month => (
                  <option key={month} value={month}>
                    {new Date(month + '-01').toLocaleDateString('en-US', { 
                      year: 'numeric', 
                      month: 'long' 
                    })}
                  </option>
                ))}
              </select>
            </div>

            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Categories</option>
              {CATEGORIES.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>

            {/* Clear Filter */}
            {selectedCategory !== 'all' && (
              <button
                onClick={() => setSelectedCategory('all')}
                className="text-sm text-gray-500 hover:text-red-600 bg-gray-100 px-3 py-2 rounded-lg flex items-center gap-1"
              >
                Clear Filter <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          <div className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Monthly Overview */}
              <div className="lg:col-span-1 space-y-6">
                {/* Spending Summary */}
                <div className="bg-gray-50 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Summary</h3>
                  <div className="space-y-4">
                    {monthlyData.spending > 0 && (
                      <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <TrendingDown className="w-5 h-5 text-red-600" />
                          <span className="text-red-900 font-medium">Spending</span>
                        </div>
                        <span className="text-red-600 font-semibold">
                          -{formatCurrency(monthlyData.spending, userRegion.currency)}
                        </span>
                      </div>
                    )}
                    
                    {monthlyData.income > 0 && (
                      <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-5 h-5 text-green-600" />
                          <span className="text-green-900 font-medium">Income</span>
                        </div>
                        <span className="text-green-600 font-semibold">
                          +{formatCurrency(monthlyData.income, userRegion.currency)}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                      <span className="text-blue-900 font-medium">Net Change</span>
                      <span className={`font-semibold ${monthlyData.income - monthlyData.spending >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {monthlyData.income - monthlyData.spending >= 0 ? '+' : ''}{formatCurrency(monthlyData.income - monthlyData.spending, userRegion.currency)}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-gray-200">
                      <div className="flex items-center justify-between text-sm text-gray-600">
                        <span>Total Transactions</span>
                        <span>{monthlyData.transactions.length}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Category Breakdown */}
                {categoryEntries.length > 0 && (
                  <div className="bg-gray-50 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Category Breakdown</h3>
                    <div className="space-y-2">
                      {categoryEntries.map(([category, amount]) => (
                        <button
                          key={category}
                          onClick={() => setSelectedCategory(selectedCategory === category ? 'all' : category)}
                          className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
                            selectedCategory === category ? 'bg-indigo-100 border border-indigo-300' : 'bg-white hover:bg-gray-100'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${getCategoryColor(category)}`} />
                            <span className="text-sm font-medium text-gray-900">{category}</span>
                          </div>
                          <span className="text-sm text-gray-600">
                            {formatCurrency(amount, userRegion.currency)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Transactions List */}
              <div className="lg:col-span-2">
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="p-6 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-gray-900">Transactions</h3>
                      {selectedCategory !== 'all' && (
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${getCategoryColor(selectedCategory)}`} />
                          <span className="text-sm text-gray-600">{selectedCategory}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="p-6">
                    <TransactionsList
                      transactions={monthlyData.transactions}
                      cards={[card]}
                      userRegion={userRegion}
                      onTransactionClick={onTransactionClick}
                      limit={50}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};