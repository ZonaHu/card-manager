import React, { useState, useMemo, useEffect } from 'react';
import { CreditCard, Plus, DollarSign, TrendingUp, Calendar, Trash2, Edit3, ExternalLink, Zap, AlertCircle, LogOut, Sparkles, Globe } from 'lucide-react';
import PlaidLink from './PlaidLink';
import RegionSelector from './RegionSelector';
import { formatCurrency, getCurrencySymbol } from '../utils/currency';

interface CardCategory {
  label: string;
  icon: string;
  color: string;
  description: string;
}

interface Card {
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

interface Transaction {
  id: number;
  card_id: number;
  amount: number;
  description: string;
  category: string;
  date: string;
  source: string;
}

interface User {
  id: number;
  name: string;
  email: string;
}

interface CardManagerProps {
  user: User;
  token: string;
  onLogout: () => void;
}

const CardManagerWithAuth: React.FC<CardManagerProps> = ({ user, token, onLogout }) => {
  const [cards, setCards] = useState<Card[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cardCategories, setCardCategories] = useState<Record<string, CardCategory>>({});
  const [showAddCard, setShowAddCard] = useState(false);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [showPlaidLink, setShowPlaidLink] = useState(false);
  const [showRegionSelector, setShowRegionSelector] = useState(false);
  const [currentMonth, setCurrentMonth] = useState('2025-08');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isNewUser, setIsNewUser] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [userRegion, setUserRegion] = useState({ country: 'US', currency: 'USD' });

  const categories = ['Food & Dining', 'Shopping', 'Transportation', 'Bills & Utilities', 'Entertainment', 'Healthcare', 'Travel', 'Income', 'Other'];

  const categoryColors = {
    'Food & Dining': '#FF6B6B',
    'Shopping': '#4ECDC4', 
    'Transportation': '#45B7D1',
    'Bills & Utilities': '#96CEB4',
    'Entertainment': '#FECA57',
    'Healthcare': '#FF9FF3',
    'Travel': '#54A0FF',
    'Income': '#5F27CD',
    'Other': '#C8D6E5'
  };

  const apiCall = async (url: string, options: RequestInit = {}) => {
    const response = await fetch(`http://localhost:3001${url}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Something went wrong');
    }

    return response.json();
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [cardsData, transactionsData, preferencesData, categoriesData] = await Promise.all([
        apiCall('/api/cards'),
        apiCall('/api/transactions'),
        apiCall('/api/user/preferences'),
        apiCall('/api/card-categories')
      ]);
      
      setCards(cardsData.map((card: any) => ({
        ...card,
        lastFour: card.last_four,
        connected: !!card.plaid_id
      })));
      
      setTransactions(transactionsData.map((transaction: any) => ({
        ...transaction,
        cardId: transaction.card_id
      })));
      
      setCardCategories(categoriesData);

      setUserRegion({
        country: preferencesData.country || 'US',
        currency: preferencesData.currency || 'USD'
      });

      // Check if user is new (no cards or transactions)
      const isNew = cardsData.length === 0 && transactionsData.length === 0;
      setIsNewUser(isNew);
      
      // Show region selector for new users if not already set
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

  useEffect(() => {
    loadData();
  }, []);

  const handlePlaidSuccess = (newAccounts: Card[]) => {
    setCards(prevCards => [...prevCards, ...newAccounts]);
    setShowPlaidLink(false);
    setIsNewUser(false);
    // Reload data to get the imported transactions
    loadData();
  };

  const handlePlaidClose = () => {
    setShowPlaidLink(false);
    // If user closes Plaid, show manual entry form
    setShowAddCard(true);
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
      setShowAddCard(true);
    }
  };

  const addCard = async (cardData: any) => {
    try {
      const newCard = await apiCall('/api/cards', {
        method: 'POST',
        body: JSON.stringify({
          name: cardData.name,
          type: cardData.type,
          lastFour: cardData.lastFour,
          balance: cardData.balance,
          currency: userRegion.currency,
          category: cardData.category || 'other'
        })
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

  const addTransaction = async (transactionData: any) => {
    try {
      const newTransaction = await apiCall('/api/transactions', {
        method: 'POST',
        body: JSON.stringify({
          cardId: transactionData.cardId,
          amount: transactionData.amount,
          description: transactionData.description,
          category: transactionData.category,
          date: transactionData.date
        })
      });

      setTransactions([{
        ...newTransaction,
        cardId: newTransaction.card_id
      }, ...transactions]);
      setShowAddTransaction(false);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const deleteCard = async (cardId: number) => {
    try {
      await apiCall(`/api/cards/${cardId}`, {
        method: 'DELETE'
      });

      setCards(cards.filter(card => card.id !== cardId));
      setTransactions(transactions.filter(t => t.cardId !== cardId));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const syncTransactions = async (type: 'recent' | 'all' = 'recent', months?: number) => {
    try {
      setLoading(true);
      setError('');
      
      const endpoint = type === 'recent' ? '/api/plaid/sync-transactions' : '/api/plaid/sync-all-transactions';
      const body = type === 'all' ? { months: months || 3 } : {};
      
      const result = await apiCall(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      // Refresh data after sync
      await loadData();
      
      // Show success message
      setError(`✅ ${result.message} - ${result.newTransactions} new transactions added`);
      setTimeout(() => setError(''), 5000);
      
    } catch (err: any) {
      setError(`Sync failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const monthlyData = useMemo(() => {
    const filtered = transactions.filter(t => t.date.startsWith(currentMonth));
    const spending = filtered.filter(t => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const income = filtered.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
    
    const byCategory = filtered.reduce((acc, t) => {
      if (t.amount < 0) {
        acc[t.category] = (acc[t.category] || 0) + Math.abs(t.amount);
      }
      return acc;
    }, {} as Record<string, number>);

    return { spending, income, byCategory, transactions: filtered };
  }, [transactions, currentMonth]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-600 text-sm">{error}</p>
            <button
              onClick={() => setError('')}
              className="mt-2 text-sm text-red-500 hover:text-red-700"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <CreditCard className="text-indigo-600" />
              Card Manager
            </h1>
            <p className="text-gray-600 mt-1">Welcome back, {user.name}!</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowRegionSelector(true)}
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-gray-200 transition-colors"
              title="Change region"
            >
              <Globe size={16} />
              {userRegion.country === 'CA' ? '🇨🇦' : '🇺🇸'}
            </button>
            {cards.some(card => card.connected) && (
              <>
                <button
                  onClick={() => syncTransactions('recent')}
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-purple-700 transition-colors"
                  disabled={loading}
                  title="Sync recent transactions (30 days)"
                >
                  <Zap size={16} />
                  {loading ? 'Syncing...' : 'Quick Sync'}
                </button>
                <button
                  onClick={() => syncTransactions('all', 3)}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700 transition-colors"
                  disabled={loading}
                  title="Sync all transaction history (3 months)"
                >
                  <TrendingUp size={16} />
                  {loading ? 'Syncing...' : 'Full Sync'}
                </button>
              </>
            )}
            {cards.length > 0 && (
              <button
                onClick={() => setShowPlaidLink(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors"
              >
                <ExternalLink size={16} />
                Connect Bank
              </button>
            )}
            <button
              onClick={handleAddCardClick}
              className={`${isNewUser ? 'bg-gradient-to-r from-blue-600 to-indigo-600 shadow-lg' : 'bg-indigo-600'} text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:shadow-md transition-all`}
            >
              {isNewUser ? <Sparkles size={16} /> : <Plus size={16} />}
              {isNewUser ? 'Get Started' : 'Add Card'}
            </button>
            <button
              onClick={() => setShowAddTransaction(true)}
              className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-green-700 transition-colors"
            >
              <Plus size={16} />
              Add Transaction
            </button>
            <button
              onClick={onLogout}
              className="bg-red-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-red-700 transition-colors"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </div>

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

        {/* Category Filter */}
        {cards.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                categoryFilter === 'all' 
                  ? 'bg-indigo-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All Cards ({cards.length})
            </button>
            {Object.entries(cardCategories).map(([key, category]) => {
              const count = cards.filter(card => card.category === key).length;
              if (count === 0) return null;
              
              return (
                <button
                  key={key}
                  onClick={() => setCategoryFilter(key)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                    categoryFilter === key 
                      ? 'bg-indigo-600 text-white' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <span>{category.icon}</span>
                  {category.label} ({count})
                </button>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {cards
            .filter(card => categoryFilter === 'all' || card.category === categoryFilter)
            .map(card => {
              const categoryInfo = card.categoryInfo || cardCategories[card.category || 'other'] || cardCategories.other;
              
              return (
                <div key={card.id} className={`bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow ${card.connected ? 'border-l-4 border-green-500' : ''}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{categoryInfo.icon}</span>
                        <span className={`text-xs px-2 py-1 rounded-full bg-${categoryInfo.color}-100 text-${categoryInfo.color}-800`}>
                          {categoryInfo.label}
                        </span>
                        {card.connected && <Zap size={16} className="text-green-500" />}
                      </div>
                      <h3 className="font-semibold text-lg text-gray-900">
                        {card.name}
                      </h3>
                      <p className="text-gray-500 capitalize">{card.type} •••• {card.last_four}</p>
                      {card.connected && <p className="text-xs text-green-600 font-medium">Auto-synced</p>}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => deleteCard(card.id)}
                        className="text-red-500 hover:text-red-700 p-1"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-gray-900">
                    {formatCurrency(Math.abs(card.balance), card.currency || userRegion.currency)}
                    {card.type === 'credit' && card.balance < 0 && <span className="text-sm text-red-500 ml-1">debt</span>}
                  </div>
                </div>
              );
            })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-xl p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Monthly Overview</h2>
              <input
                type="month"
                value={currentMonth}
                onChange={(e) => setCurrentMonth(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1"
              />
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Total Income</span>
                <span className="text-green-600 font-semibold">{formatCurrency(monthlyData.income, userRegion.currency)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Total Spending</span>
                <span className="text-red-600 font-semibold">{formatCurrency(monthlyData.spending, userRegion.currency)}</span>
              </div>
              <div className="border-t pt-4">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-gray-900">Net</span>
                  <span className={`font-bold ${monthlyData.income - monthlyData.spending >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(monthlyData.income - monthlyData.spending, userRegion.currency)}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="mt-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Top Categories</h3>
              <div className="space-y-2">
                {Object.entries(monthlyData.byCategory)
                  .sort(([,a], [,b]) => b - a)
                  .slice(0, 3)
                  .map(([category, amount]) => (
                    <div key={category} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: categoryColors[category as keyof typeof categoryColors] }}
                        />
                        <span className="text-sm text-gray-700">{category}</span>
                      </div>
                      <span className="text-sm font-medium text-gray-900">{formatCurrency(amount as number, userRegion.currency)}</span>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-lg">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Category Breakdown</h2>
            <div className="space-y-3">
              {Object.entries(monthlyData.byCategory)
                .sort(([,a], [,b]) => b - a)
                .map(([category, amount]) => (
                  <div key={category} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: categoryColors[category as keyof typeof categoryColors] }}
                      />
                      <span className="font-medium text-gray-900">{category}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-gray-900">{formatCurrency(amount as number, userRegion.currency)}</div>
                      <div className="text-sm text-gray-500">
                        {monthlyData.spending > 0 ? ((amount / monthlyData.spending) * 100).toFixed(1) : 0}%
                      </div>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-lg">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Transactions</h2>
          <div className="space-y-3">
            {monthlyData.transactions.slice(0, 10).map(transaction => {
              const card = cards.find(c => c.id === transaction.cardId);
              return (
                <div key={transaction.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${transaction.amount > 0 ? 'bg-green-500' : 'bg-red-500'}`} />
                    <div>
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
                </div>
              );
            })}
            {monthlyData.transactions.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No transactions for this month
              </div>
            )}
          </div>
        </div>

        {showPlaidLink && (
          <PlaidLink
            token={token}
            onSuccess={handlePlaidSuccess}
            onClose={handlePlaidClose}
            isNewUser={isNewUser}
          />
        )}

        {showAddCard && (
          <CardForm onSubmit={addCard} onCancel={() => setShowAddCard(false)} cardCategories={cardCategories} />
        )}

        {showRegionSelector && (
          <RegionSelector
            token={token}
            onRegionSelected={handleRegionSelected}
            onClose={() => setShowRegionSelector(false)}
          />
        )}

        {showAddTransaction && (
          <TransactionForm
            cards={cards}
            categories={categories}
            onSubmit={addTransaction}
            onCancel={() => setShowAddTransaction(false)}
          />
        )}
      </div>
    </div>
  );
};

const CardForm: React.FC<{ 
  onSubmit: (data: any) => void; 
  onCancel: () => void;
  cardCategories: Record<string, CardCategory>;
}> = ({ onSubmit, onCancel, cardCategories }) => {
  const [formData, setFormData] = useState({
    name: '',
    type: 'credit',
    lastFour: '',
    balance: 0,
    category: 'credit'
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.name && formData.lastFour && formData.balance !== undefined) {
      onSubmit(formData);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">Add New Card</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="Card Name"
            value={formData.name}
            onChange={(e) => setFormData({...formData, name: e.target.value})}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
            required
          />
          <select
            value={formData.type}
            onChange={(e) => setFormData({...formData, type: e.target.value})}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          >
            <option value="credit">Credit Card</option>
            <option value="debit">Debit Card</option>
          </select>
          
          <select
            value={formData.category}
            onChange={(e) => setFormData({...formData, category: e.target.value})}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          >
            <option value="">Select Account Type</option>
            {Object.entries(cardCategories).map(([key, category]) => (
              <option key={key} value={key}>
                {category.icon} {category.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Last 4 digits"
            value={formData.lastFour}
            onChange={(e) => setFormData({...formData, lastFour: e.target.value})}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
            maxLength={4}
            pattern="[0-9]{4}"
            required
          />
          <input
            type="number"
            placeholder="Current Balance"
            value={formData.balance}
            onChange={(e) => setFormData({...formData, balance: parseFloat(e.target.value) || 0})}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
            step="0.01"
            required
          />
          <div className="flex gap-3 pt-4">
            <button type="submit" className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700">
              Add Card
            </button>
            <button type="button" onClick={onCancel} className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const TransactionForm: React.FC<{ 
  cards: Card[]; 
  categories: string[]; 
  onSubmit: (data: any) => void; 
  onCancel: () => void; 
}> = ({ cards, categories, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({
    cardId: cards[0]?.id || '',
    amount: '',
    description: '',
    category: categories[0],
    date: new Date().toISOString().split('T')[0]
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.cardId && formData.amount && formData.description && formData.category && formData.date) {
      onSubmit({
        ...formData,
        amount: parseFloat(formData.amount),
        cardId: parseInt(formData.cardId.toString())
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">Add Transaction</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <select
            value={formData.cardId}
            onChange={(e) => setFormData({...formData, cardId: parseInt(e.target.value)})}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
            required
          >
            {cards.map(card => (
              <option key={card.id} value={card.id}>
                {card.name} •••• {card.last_four}
              </option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Amount (negative for spending)"
            value={formData.amount}
            onChange={(e) => setFormData({...formData, amount: e.target.value})}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
            step="0.01"
            required
          />
          <input
            type="text"
            placeholder="Description"
            value={formData.description}
            onChange={(e) => setFormData({...formData, description: e.target.value})}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
            required
          />
          <select
            value={formData.category}
            onChange={(e) => setFormData({...formData, category: e.target.value})}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          >
            {categories.map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          <input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({...formData, date: e.target.value})}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
            required
          />
          <div className="flex gap-3 pt-4">
            <button type="submit" className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700">
              Add Transaction
            </button>
            <button type="button" onClick={onCancel} className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CardManagerWithAuth;