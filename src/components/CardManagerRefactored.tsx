import React, { useState, useMemo, useEffect } from 'react';
import { CreditCard, Plus, Menu, X, ExternalLink, Sparkles, LogOut, Zap } from 'lucide-react';

// Types and constants
import type { Card, Transaction, MonthlyData, User, UserRegion, TransactionFilter, TransactionSort } from '../types';
import { CATEGORIES, getCategoryColor } from '../constants/categories';

// Hooks and services
import { useApi } from '../hooks/useApi';
import { CardService } from '../services/cardService';
import { TransactionService } from '../services/transactionService';

// Components
import { FinancialOverview } from './dashboard/FinancialOverview';
import { CategoryBreakdown } from './dashboard/CategoryBreakdown';
import { TransactionFilters } from './dashboard/TransactionFilters';
import { TransactionsList } from './dashboard/TransactionsList';
import { TransactionEditModal } from './forms/TransactionEditModal';
import PlaidLink from './PlaidLink';
import RegionSelector from './RegionSelector';

// Utilities
import { formatCurrency } from '../utils/currency';

interface CardManagerProps {
  user: User;
  token: string;
  onLogout: () => void;
}

const CardManagerRefactored: React.FC<CardManagerProps> = ({ user, token, onLogout }) => {
  // State
  const [cards, setCards] = useState<Card[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cardCategories, setCardCategories] = useState<Record<string, any>>({});
  const [showAddCard, setShowAddCard] = useState(false);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [showPlaidLink, setShowPlaidLink] = useState(false);
  const [showRegionSelector, setShowRegionSelector] = useState(false);
  const [currentMonth, setCurrentMonth] = useState('2025-08');
  const [loading, setLoading] = useState(true);
  const [isNewUser, setIsNewUser] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [transactionFilter, setTransactionFilter] = useState<TransactionFilter>('all');
  const [transactionSort, setTransactionSort] = useState<TransactionSort>('newest');
  const [userRegion, setUserRegion] = useState<UserRegion>({ country: 'US', currency: 'USD' });
  const [showMenu, setShowMenu] = useState(false);
  const [showAddCardOptions, setShowAddCardOptions] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [showTransactionEditModal, setShowTransactionEditModal] = useState(false);

  // Hooks and services
  const { apiCall, error, setError } = useApi(token);
  const cardService = useMemo(() => new CardService(apiCall), [apiCall]);
  const transactionService = useMemo(() => new TransactionService(apiCall), [apiCall]);

  // Computed data
  const monthlyData = useMemo<MonthlyData>(() => {
    let filteredTransactions = transactions.filter(t => 
      t.date.startsWith(currentMonth)
    );

    // Apply category filter
    if (transactionFilter !== 'all') {
      filteredTransactions = filteredTransactions.filter(t => t.category === transactionFilter);
    }

    // Apply sorting
    switch (transactionSort) {
      case 'oldest':
        filteredTransactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        break;
      case 'highest':
        filteredTransactions.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
        break;
      case 'lowest':
        filteredTransactions.sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount));
        break;
      default: // newest
        filteredTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

    const spending = filteredTransactions
      .filter(t => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
    const income = filteredTransactions
      .filter(t => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);

    const byCategory = filteredTransactions.reduce((acc, t) => {
      if (t.amount < 0) {
        acc[t.category] = (acc[t.category] || 0) + Math.abs(t.amount);
      }
      return acc;
    }, {} as Record<string, number>);

    return {
      transactions: filteredTransactions,
      spending,
      income,
      byCategory
    };
  }, [transactions, currentMonth, transactionFilter, transactionSort]);

  // Event handlers
  const loadData = async () => {
    try {
      setLoading(true);
      const [cardsData, transactionsData, preferencesData, categoriesData] = await Promise.all([
        cardService.getCards(),
        transactionService.getTransactions(),
        apiCall('/api/user/preferences'),
        cardService.getCardCategories()
      ]);
      
      setCards(cardsData.map((card: any) => ({
        ...card,
        lastFour: card.last_four,
        connected: !!card.plaid_id
      })));
      
      setTransactions(transactionsData);
      setCardCategories(categoriesData);

      setUserRegion({
        country: preferencesData.country || 'US',
        currency: preferencesData.currency || 'USD'
      });

      const isNew = cardsData.length === 0 && transactionsData.length === 0;
      setIsNewUser(isNew);
      
      if (isNew && !preferencesData.country) {
        setShowRegionSelector(true);
      }
    } catch (err: any) {
      setError(err.message);
      if (err.message.includes('token')) {
        onLogout();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTransactionClick = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setShowTransactionEditModal(true);
  };

  const updateTransaction = async (transactionData: any) => {
    try {
      const updatedTransaction = await transactionService.updateTransaction(transactionData);
      
      setTransactions(transactions.map(t => 
        t.id === transactionData.id ? updatedTransaction : t
      ));
      setShowTransactionEditModal(false);
      setEditingTransaction(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handlePlaidSuccess = (newAccounts: Card[]) => {
    setCards([...cards, ...newAccounts]);
    setShowPlaidLink(false);
    loadData();
  };

  const handleRegionSelected = (country: string, currency: string) => {
    setUserRegion({ country, currency });
    setShowRegionSelector(false);
    if (isNewUser) {
      setShowPlaidLink(true);
    }
  };

  // Effects
  useEffect(() => {
    loadData();
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your financial data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Card Manager</h1>
              <p className="text-gray-600">Welcome back, {user.name}!</p>
            </div>
          </div>

          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow"
            >
              {showMenu ? <X size={20} /> : <Menu size={20} />}
            </button>

            {showMenu && (
              <div className="absolute right-0 top-12 w-64 bg-white rounded-xl shadow-lg border z-50">
                <div className="p-2">
                  <button
                    onClick={() => {
                      setShowPlaidLink(true);
                      setShowMenu(false);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 rounded-lg flex items-center gap-3"
                  >
                    <ExternalLink size={16} className="text-blue-600" />
                    <div>
                      <div className="font-medium">Connect Bank Account</div>
                      <div className="text-sm text-gray-500">Link with Plaid for automatic syncing</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      onLogout();
                      setShowMenu(false);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 rounded-lg flex items-center gap-3 mt-2 border-t border-gray-100"
                  >
                    <LogOut size={16} className="text-red-600" />
                    <div>
                      <div className="font-medium">Logout</div>
                      <div className="text-sm text-gray-500">Sign out of your account</div>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {/* New User Welcome */}
        {isNewUser && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6 mb-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-gray-900 mb-1">Welcome to Card Manager! 🎉</h2>
                <p className="text-gray-600 mb-3">
                  Get started by connecting your bank accounts to automatically import your cards and transactions.
                </p>
                <button
                  onClick={() => setShowPlaidLink(true)}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-2 rounded-lg font-semibold hover:shadow-lg transition-all flex items-center gap-2"
                >
                  <ExternalLink size={16} />
                  Connect Your First Account
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Financial Overview */}
        <FinancialOverview
          monthlyData={monthlyData}
          userRegion={userRegion}
          currentMonth={currentMonth}
          onMonthChange={setCurrentMonth}
        />

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          {/* Category Breakdown */}
          <div className="bg-white rounded-xl p-6 shadow-lg">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Category Breakdown</h2>
            <CategoryBreakdown
              monthlyData={monthlyData}
              userRegion={userRegion}
              selectedFilter={transactionFilter}
              onCategoryClick={setTransactionFilter}
            />
          </div>

          {/* Recent Transactions */}
          <div className="lg:col-span-2 bg-white rounded-xl p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold text-gray-900">Recent Transactions</h2>
                {transactionFilter !== 'all' && (
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${getCategoryColor(transactionFilter)}`}></div>
                    <span className="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded-md">{transactionFilter}</span>
                    <button
                      onClick={() => setTransactionFilter('all')}
                      className="text-xs text-gray-500 hover:text-red-600"
                      title="Clear filter"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
              <TransactionFilters
                transactionFilter={transactionFilter}
                transactionSort={transactionSort}
                onFilterChange={setTransactionFilter}
                onSortChange={setTransactionSort}
              />
            </div>
            
            <TransactionsList
              transactions={monthlyData.transactions}
              cards={cards}
              userRegion={userRegion}
              onTransactionClick={handleTransactionClick}
            />
          </div>
        </div>

        {/* Modals */}
        {showPlaidLink && (
          <PlaidLink
            token={token}
            onSuccess={handlePlaidSuccess}
            onClose={() => setShowPlaidLink(false)}
            isNewUser={isNewUser}
          />
        )}

        {showRegionSelector && (
          <RegionSelector
            token={token}
            onRegionSelected={handleRegionSelected}
            onClose={() => setShowRegionSelector(false)}
            currentRegion={userRegion.country}
          />
        )}

        {showTransactionEditModal && editingTransaction && (
          <TransactionEditModal
            transaction={editingTransaction}
            cards={cards}
            onSubmit={updateTransaction}
            onCancel={() => {
              setShowTransactionEditModal(false);
              setEditingTransaction(null);
            }}
          />
        )}
      </div>
    </div>
  );
};

export default CardManagerRefactored;