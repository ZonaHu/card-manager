import React, { useState, useMemo, useEffect, useRef } from 'react';
import { CreditCard, Plus, Menu, X, ExternalLink, Sparkles, LogOut, Zap, TrendingUp, Edit3, Trash2, AlertCircle } from 'lucide-react';

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
  const menuRef = useRef<HTMLDivElement>(null);

  // Hooks and services
  const { apiCall, error, setError, loading: apiLoading } = useApi(token);
  const cardService = useMemo(() => new CardService(apiCall), [apiCall]);
  const transactionService = useMemo(() => new TransactionService(apiCall), [apiCall]);

  // Computed data
  const displayedCards = useMemo(() => {
    return cards
      .filter(card => {
        if (categoryFilter === 'all') return true;
        return card.category === categoryFilter;
      })
      .map(card => ({
        ...card,
        categoryInfo: cardCategories[card.category || 'credit']
      }));
  }, [cards, categoryFilter, cardCategories]);

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

  const handleAddCardClick = () => {
    if (isNewUser || cards.length === 0) {
      setShowPlaidLink(true);
    } else {
      setShowAddCardOptions(true);
    }
  };

  const syncTransactions = async (type: 'recent' | 'all' = 'recent', months?: number) => {
    try {
      console.log('Starting sync transactions:', { type, months });
      setLoading(true);
      setError('');
      
      const result = await transactionService.syncTransactions(type, months);
      console.log('Sync result:', result);
      
      // Reload data to show new transactions
      await loadData();
    } catch (err: any) {
      console.error('Sync error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const recategorizeTransactions = async () => {
    try {
      setLoading(true);
      setError('');
      
      const result = await transactionService.recategorizeTransactions();
      
      // Reload data to show updated categories
      await loadData();
      
      console.log('Recategorization result:', result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const addCard = async (cardData: any) => {
    try {
      const newCard = await cardService.createCard({
        ...cardData,
        currency: userRegion.currency
      });
      
      setCards([...cards, {
        ...newCard,
        lastFour: newCard.last_four,
        connected: !!newCard.plaid_id
      }]);
      setShowAddCard(false);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const deleteCard = async (cardId: number) => {
    try {
      await cardService.deleteCard(cardId);
      setCards(cards.filter(card => card.id !== cardId));
      setTransactions(transactions.filter(t => t.cardId !== cardId));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const addTransaction = async (transactionData: any) => {
    try {
      const newTransaction = await transactionService.createTransaction(transactionData);
      setTransactions([newTransaction, ...transactions]);
      setShowAddTransaction(false);
    } catch (err: any) {
      setError(err.message);
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

          <div className="flex items-center gap-3">
            <button
              onClick={handleAddCardClick}
              className={`${isNewUser ? 'bg-gradient-to-r from-blue-600 to-indigo-600 shadow-lg' : 'bg-indigo-600'} text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:shadow-md transition-all`}
            >
              {isNewUser ? <Sparkles size={16} /> : <Plus size={16} />}
              {isNewUser ? 'Get Started' : 'Add Card'}
            </button>
            
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700 transition-colors"
                title="Open menu"
              >
                {showMenu ? <X size={20} /> : <Menu size={20} />}
              </button>
              
              {showMenu && (
                <div className="absolute right-0 top-12 bg-white rounded-lg shadow-xl border border-gray-200 py-2 w-64 z-50">
                  {/* Sync Options */}
                  {cards.some(card => card.connected) && (
                    <>
                      <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
                        Sync Options
                      </div>
                      <button
                        onClick={() => {
                          syncTransactions('recent');
                          setShowMenu(false);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3"
                        disabled={loading}
                      >
                        <Zap size={16} className="text-purple-600" />
                        <div>
                          <div className="font-medium">{loading ? 'Syncing...' : 'Quick Sync'}</div>
                          <div className="text-sm text-gray-500">Recent transactions (30 days)</div>
                        </div>
                      </button>
                      <button
                        onClick={() => {
                          syncTransactions('all', 3);
                          setShowMenu(false);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3"
                        disabled={loading}
                      >
                        <TrendingUp size={16} className="text-indigo-600" />
                        <div>
                          <div className="font-medium">{loading ? 'Syncing...' : 'Full Sync'}</div>
                          <div className="text-sm text-gray-500">All transaction history (3 months)</div>
                        </div>
                      </button>
                      <button
                        onClick={() => {
                          recategorizeTransactions();
                          setShowMenu(false);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3"
                        disabled={loading}
                      >
                        <Edit3 size={16} className="text-green-600" />
                        <div>
                          <div className="font-medium">{loading ? 'Fixing...' : 'Fix Categories'}</div>
                          <div className="text-sm text-gray-500">Update transaction categories from Plaid</div>
                        </div>
                      </button>
                      
                      {/* Add Transaction */}
                      <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 mt-2">
                        Transactions
                      </div>
                      <button
                        onClick={() => {
                          setShowAddTransaction(true);
                          setShowMenu(false);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3"
                      >
                        <Plus size={16} className="text-green-600" />
                        <div>
                          <div className="font-medium">Add Transaction</div>
                          <div className="text-sm text-gray-500">Record a manual transaction</div>
                        </div>
                      </button>
                    </>
                  )}
                  
                  {/* Connect Bank Account */}
                  <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 mt-2">
                    Account
                  </div>
                  <button
                    onClick={() => {
                      setShowPlaidLink(true);
                      setShowMenu(false);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3"
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
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3"
                  >
                    <LogOut size={16} className="text-red-600" />
                    <div>
                      <div className="font-medium">Logout</div>
                      <div className="text-sm text-gray-500">Sign out of your account</div>
                    </div>
                  </button>
                </div>
              )}
            </div>
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

        {/* Cards Section */}
        {cards.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold text-gray-900">Your Cards</h2>
              <div className="flex gap-2">
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="bg-white border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="all">All Categories</option>
                  <option value="credit">Credit Cards</option>
                  <option value="chequing">Chequing Accounts</option>
                  <option value="savings">Savings Accounts</option>
                  <option value="tfsa">TFSA</option>
                  <option value="rrsp">RRSP</option>
                </select>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {displayedCards.map(card => (
                <div key={card.id} className={`bg-white rounded-xl p-6 shadow-lg border-l-4 ${card.categoryInfo?.color ? `border-${card.categoryInfo.color}-500` : 'border-gray-500'}`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl" role="img" aria-label={card.categoryInfo?.label}>
                        {card.categoryInfo?.icon || '💳'}
                      </span>
                      <div>
                        <h3 className="font-semibold text-gray-900">{card.name}</h3>
                        <p className="text-sm text-gray-500">
                          {card.categoryInfo?.label} •••• {card.last_four}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {card.connected && (
                        <div className="w-2 h-2 bg-green-500 rounded-full" title="Connected to Plaid"></div>
                      )}
                      <button
                        onClick={() => deleteCard(card.id)}
                        className="text-gray-400 hover:text-red-600 transition-colors"
                        title="Delete card"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Balance</span>
                      <span className={`font-semibold ${card.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(Math.abs(card.balance), card.currency || userRegion.currency)}
                      </span>
                    </div>
                    
                    {card.institution_name && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Institution</span>
                        <span className="text-sm text-gray-900">{card.institution_name}</span>
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Status</span>
                      <span className={`text-sm px-2 py-1 rounded-full ${card.connected ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                        {card.connected ? 'Auto-sync' : 'Manual'}
                      </span>
                    </div>
                  </div>
                  
                  {card.categoryInfo?.description && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <p className="text-xs text-gray-500">{card.categoryInfo.description}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

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

        {showAddCard && (
          <CardForm onSubmit={addCard} onCancel={() => setShowAddCard(false)} cardCategories={cardCategories} />
        )}

        {showAddTransaction && (
          <TransactionForm
            cards={cards}
            categories={CATEGORIES}
            onSubmit={addTransaction}
            onCancel={() => setShowAddTransaction(false)}
          />
        )}

        {showAddCardOptions && (
          <AddCardOptions
            onConnectBank={() => {
              setShowAddCardOptions(false);
              setShowPlaidLink(true);
            }}
            onAddManually={() => {
              setShowAddCardOptions(false);
              setShowAddCard(true);
            }}
            onClose={() => setShowAddCardOptions(false)}
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

// Form Components (temporary - should be moved to separate files)
const CardForm: React.FC<{ 
  onSubmit: (data: any) => void;
  onCancel: () => void;
  cardCategories: Record<string, any>;
}> = ({ onSubmit, onCancel, cardCategories }) => {
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-semibold mb-4">Add Card</h2>
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
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg"
          >
            {Object.entries(cardCategories).map(([key, cat]: [string, any]) => (
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

const TransactionForm: React.FC<{
  cards: Card[];
  categories: readonly string[];
  onSubmit: (data: any) => void;
  onCancel: () => void;
}> = ({ cards, categories, onSubmit, onCancel }) => {
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-semibold mb-4">Add Transaction</h2>
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

const AddCardOptions: React.FC<{
  onConnectBank: () => void;
  onAddManually: () => void;
  onClose: () => void;
}> = ({ onConnectBank, onAddManually, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md">
        <h3 className="text-xl font-semibold mb-2 text-gray-900">Add Card or Account</h3>
        <p className="text-gray-600 mb-6">Choose how you'd like to add your financial account</p>
        
        <div className="space-y-4">
          <button
            onClick={onConnectBank}
            className="w-full p-4 border-2 border-blue-200 bg-blue-50 rounded-lg hover:border-blue-300 hover:bg-blue-100 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center group-hover:bg-blue-700 transition-colors">
                <ExternalLink className="text-white" size={20} />
              </div>
              <div className="text-left">
                <h4 className="font-semibold text-gray-900">Connect Bank Account</h4>
                <p className="text-sm text-gray-600">Securely link with Plaid for automatic syncing</p>
              </div>
            </div>
          </button>

          <button
            onClick={onAddManually}
            className="w-full p-4 border-2 border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center group-hover:bg-gray-200 transition-colors">
                <Plus className="text-gray-600" size={20} />
              </div>
              <div className="text-left">
                <h4 className="font-semibold text-gray-900">Add Card Manually</h4>
                <p className="text-sm text-gray-600">Enter card details manually for basic tracking</p>
              </div>
            </div>
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-6 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default CardManagerRefactored;