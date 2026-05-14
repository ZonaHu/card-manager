import React, { useState, useMemo, useEffect, useRef } from 'react';
import { CreditCard, Plus, Menu, X, ExternalLink, Sparkles, LogOut, Zap, TrendingUp, Edit3, Trash2, AlertCircle, Globe, HelpCircle, Check, Search, Download } from 'lucide-react';

// Types and constants
import type { Card, CardCategory, Transaction, MonthlyData, User, UserRegion, TransactionFilter, TransactionSort } from '../types';
import { CATEGORIES, getCategoryColor } from '../constants/categories';

// Hooks and services
import { useApi } from '../hooks/useApi';
import { CardService } from '../services/cardService';
import { TransactionService } from '../services/transactionService';

// Pure spend-calc lives in utils so it can be unit-tested.
import { calculateMonthlyData } from '../utils/spendCalculation';
import { transactionsToCsv, downloadCsv } from '../utils/csvExport';

// Components
import { FinancialOverview } from './dashboard/FinancialOverview';
import { CategoryBreakdown } from './dashboard/CategoryBreakdown';
import { TransactionFilters } from './dashboard/TransactionFilters';
import { TransactionsList } from './dashboard/TransactionsList';
import { BudgetPanel } from './dashboard/BudgetPanel';
import { RecurringList } from './dashboard/RecurringList';
import { ETransferPanel } from './dashboard/ETransferPanel';
import { FixedCostsPanel } from './dashboard/FixedCostsPanel';
import { RulesPanel } from './dashboard/RulesPanel';
import { SpendingComparison } from './dashboard/SpendingComparison';
import { InvestmentEmptyHint } from './dashboard/InvestmentEmptyHint';
// Recharts is heavy — lazy-load the chart so the initial bundle stays lean.
const NetWorthChart = React.lazy(() =>
  import('./dashboard/NetWorthChart').then(m => ({ default: m.NetWorthChart }))
);
import { TransactionEditModal } from './forms/TransactionEditModal';
import { CardDetailModal } from './cards/CardDetailModal';
import About from './About';
import PlaidLink from './PlaidLink';
import PlaidUpdateLink from './PlaidUpdateLink';
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
  const [cardCategories, setCardCategories] = useState<Record<string, CardCategory>>({});
  const [showAddCard, setShowAddCard] = useState(false);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [showPlaidLink, setShowPlaidLink] = useState(false);
  const [showRegionSelector, setShowRegionSelector] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
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
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [showCardDetail, setShowCardDetail] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [syncBanner, setSyncBanner] = useState<{show: boolean, message: string, type: 'success' | 'error' | 'info'} | null>(null);
  const [reauthTarget, setReauthTarget] = useState<{ itemId: string; institutionName: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const transactionsRef = useRef<HTMLDivElement>(null);

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

  // After the first successful data load, jump to the most recent month that
  // actually has transactions. Default-to-today is awkward because the start of
  // a new month often shows empty totals before any txns post.
  const didAutoJump = useRef(false);
  useEffect(() => {
    if (didAutoJump.current) return;
    if (transactions.length === 0) return;
    const months = new Set(transactions.map(t => t.date.slice(0, 7)));
    const latest = Array.from(months).sort().reverse()[0];
    if (latest && latest !== currentMonth) {
      setCurrentMonth(latest);
    }
    didAutoJump.current = true;
  }, [transactions]);

  const monthlyData = useMemo<MonthlyData>(
    () => calculateMonthlyData({ transactions, cards, currentMonth, transactionFilter, transactionSort }),
    [transactions, cards, currentMonth, transactionFilter, transactionSort]
  );

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

  const handleCardClick = (card: Card) => {
    setSelectedCard(card);
    setShowCardDetail(true);
  };

  const scrollToTransactions = () => {
    transactionsRef.current?.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'start' 
    });
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
      setSyncBanner({ show: true, message: 'Syncing transactions...', type: 'info' });
      
      const result = await transactionService.syncTransactions(type, months);
      console.log('Sync result:', result);
      
      // Reload data to show new transactions
      await loadData();
      
      // Show success message
      const syncType = type === 'all' ? 'Full sync' : 'Quick sync';
      const transactionCount = result.newTransactions || 0;
      setSyncBanner({ 
        show: true, 
        message: `${syncType} successful! ${transactionCount} transactions ${transactionCount === 1 ? 'added' : 'added'}.`, 
        type: 'success' 
      });
      
      // Auto-hide banner after 5 seconds
      setTimeout(() => setSyncBanner(null), 5000);
    } catch (err: any) {
      console.error('Sync error:', err);
      setSyncBanner({ show: true, message: `Sync failed: ${err.message}`, type: 'error' });
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const recategorizeTransactions = async () => {
    try {
      setLoading(true);
      setError('');
      setSyncBanner({ show: true, message: 'Fixing categories...', type: 'info' });
      
      const result = await transactionService.recategorizeTransactions();
      
      // Reload data to show updated categories
      await loadData();
      
      console.log('Recategorization result:', result);
      
      // Show success message
      const updatedCount = result.updatedTransactions || 0;
      setSyncBanner({ 
        show: true, 
        message: `Categories updated! ${updatedCount} transaction${updatedCount !== 1 ? 's' : ''} recategorized.`, 
        type: 'success' 
      });
      
      // Auto-hide banner after 5 seconds
      setTimeout(() => setSyncBanner(null), 5000);
    } catch (err: any) {
      setSyncBanner({ show: true, message: `Category fix failed: ${err.message}`, type: 'error' });
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
              <p className="text-gray-600">
                Welcome back, {user.name}!
                {(() => {
                  // Surface the most recent sync state. If any connected card failed
                  // its last attempt, prefer showing the failure (with reason) over
                  // the older "synced" timestamp so the user knows data is stale.
                  const failing = cards.filter(c =>
                    c.last_sync_error && (!c.last_synced_at ||
                      (c.last_sync_attempt_at && c.last_sync_attempt_at > (c.last_synced_at || ''))));
                  if (failing.length > 0) {
                    const codes = Array.from(new Set(failing.map(c => c.last_sync_error).filter(Boolean)));
                    return <span className="text-xs text-amber-600 ml-2">· {failing.length} card{failing.length > 1 ? 's' : ''} not syncing ({codes.slice(0, 2).join(', ')})</span>;
                  }
                  const stamps = cards
                    .map(c => c.last_synced_at)
                    .filter(Boolean) as string[];
                  if (stamps.length === 0) return null;
                  const latest = stamps.sort().slice(-1)[0];
                  const ms = Date.now() - new Date(latest + 'Z').getTime();
                  const mins = Math.round(ms / 60000);
                  const label = mins < 1 ? 'just now'
                    : mins < 60 ? `${mins}m ago`
                    : mins < 60 * 24 ? `${Math.round(mins / 60)}h ago`
                    : `${Math.round(mins / 60 / 24)}d ago`;
                  return <span className="text-xs text-gray-500 ml-2">· Synced {label}</span>;
                })()}
              </p>
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
                      setShowRegionSelector(true);
                      setShowMenu(false);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3"
                  >
                    <Globe size={16} className="text-purple-600" />
                    <div>
                      <div className="font-medium">Change Region</div>
                      <div className="text-sm text-gray-500">Update country and currency ({userRegion.country} - {userRegion.currency})</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setShowAbout(true);
                      setShowMenu(false);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3"
                  >
                    <HelpCircle size={16} className="text-gray-600" />
                    <div>
                      <div className="font-medium">About & Security</div>
                      <div className="text-sm text-gray-500">Privacy, security, and how it works</div>
                    </div>
                  </button>

                  <button
                    onClick={async () => {
                      setShowMenu(false);
                      setSyncBanner({ show: true, message: 'Creating backup…', type: 'info' });
                      try {
                        await apiCall('/api/backup/run', { method: 'POST' });
                        setSyncBanner({ show: true, message: 'Backup created.', type: 'success' });
                        setTimeout(() => setSyncBanner(null), 4000);
                      } catch (e: any) {
                        setSyncBanner({ show: true, message: `Backup failed: ${e.message}`, type: 'error' });
                      }
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3"
                  >
                    <Download size={16} className="text-blue-600" />
                    <div>
                      <div className="font-medium">Run Backup Now</div>
                      <div className="text-sm text-gray-500">Snapshot the local database</div>
                    </div>
                  </button>

                  <div className="px-4 py-2 border-t border-gray-100"></div>

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

        {/* Reauth Banner — shown when any Plaid item needs credential update */}
        {(() => {
          const needsReauth = cards.filter(c => c.needs_reauth && c.item_id);
          if (needsReauth.length === 0) return null;
          const byItem = new Map<string, { itemId: string; institutionName: string; accounts: string[] }>();
          needsReauth.forEach(c => {
            const itemId = c.item_id!;
            if (!byItem.has(itemId)) {
              byItem.set(itemId, {
                itemId,
                institutionName: c.institution_name || 'your bank',
                accounts: []
              });
            }
            byItem.get(itemId)!.accounts.push(`${c.name} ••••${c.last_four}`);
          });
          return (
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-amber-900 mb-2">
                    {byItem.size === 1 ? 'One bank needs' : `${byItem.size} banks need`} reauthentication
                  </p>
                  <p className="text-sm text-amber-800 mb-3">
                    Plaid returned a credential/MFA error. Transaction sync is paused for these accounts until you reauthorize.
                  </p>
                  <div className="space-y-2">
                    {Array.from(byItem.values()).map(item => (
                      <div key={item.itemId} className="flex items-center justify-between bg-white rounded-md px-3 py-2 border border-amber-200">
                        <div className="text-sm">
                          <div className="font-medium text-gray-900">{item.institutionName}</div>
                          <div className="text-gray-500 text-xs">{item.accounts.join(', ')}</div>
                        </div>
                        <button
                          onClick={() => setReauthTarget({ itemId: item.itemId, institutionName: item.institutionName })}
                          className="text-sm bg-amber-600 text-white px-3 py-1.5 rounded-md hover:bg-amber-700"
                        >
                          Reconnect
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Sync Banner */}
        {syncBanner?.show && (
          <div className={`border rounded-lg p-4 mb-6 flex items-center justify-between ${
            syncBanner.type === 'success' ? 'bg-green-50 border-green-200' :
            syncBanner.type === 'error' ? 'bg-red-50 border-red-200' :
            'bg-blue-50 border-blue-200'
          }`}>
            <div className="flex items-center gap-3">
              {syncBanner.type === 'success' && (
                <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                  <Check size={14} className="text-white" />
                </div>
              )}
              {syncBanner.type === 'error' && (
                <AlertCircle className="w-6 h-6 text-red-500" />
              )}
              {syncBanner.type === 'info' && (
                <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm">i</span>
                </div>
              )}
              <p className={`font-medium ${
                syncBanner.type === 'success' ? 'text-green-800' :
                syncBanner.type === 'error' ? 'text-red-800' :
                'text-blue-800'
              }`}>
                {syncBanner.message}
              </p>
            </div>
            <button
              onClick={() => setSyncBanner(null)}
              className={`text-sm px-3 py-1 rounded-lg transition-colors ${
                syncBanner.type === 'success' ? 'text-green-600 hover:bg-green-100' :
                syncBanner.type === 'error' ? 'text-red-600 hover:bg-red-100' :
                'text-blue-600 hover:bg-blue-100'
              }`}
            >
              <X size={14} />
            </button>
          </div>
        )}

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
                <h2 className="text-xl font-semibold text-gray-900 mb-1">Welcome to Card Manager</h2>
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
          onScrollToTransactions={scrollToTransactions}
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
                <button
                  key={card.id}
                  onClick={() => handleCardClick(card)}
                  className={`bg-white rounded-xl p-6 shadow-lg border-l-4 hover:shadow-xl transition-all cursor-pointer text-left ${card.categoryInfo?.color ? `border-${card.categoryInfo.color}-500` : 'border-gray-500'}`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <CreditCard className="w-6 h-6 text-gray-500" />
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
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteCard(card.id);
                        }}
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
                </button>
              ))}
            </div>
          </div>
        )}

        <InvestmentEmptyHint cards={cards} transactions={transactions} />

        {/* Insights row — net worth + budgets + recurring */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <React.Suspense fallback={
            <div className="bg-white rounded-xl p-6 shadow-lg text-sm text-gray-400">Loading chart…</div>
          }>
            <NetWorthChart cards={cards} transactions={transactions} userRegion={userRegion} />
          </React.Suspense>
          <BudgetPanel byCategory={monthlyData.byCategory} userRegion={userRegion} />
          <RecurringList transactions={transactions} userRegion={userRegion} />
        </div>

        {/* Fixed monthly obligations + e-Transfer activity, side-by-side on
            wide screens. Both panels self-hide when there's nothing to show. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <FixedCostsPanel
            transactions={transactions}
            currentMonth={currentMonth}
            userRegion={userRegion}
          />
          <ETransferPanel transactions={monthlyData.transactions} userRegion={userRegion} />
        </div>

        {/* MoM / YoY spending comparison */}
        <div className="mb-8">
          <SpendingComparison
            transactions={transactions}
            cards={cards}
            currentMonth={currentMonth}
            userRegion={userRegion}
          />
        </div>

        {/* Sync rules — categorization overrides + auto-split. Collapsed by
            default; surfaces what's running silently during Plaid sync. */}
        <RulesPanel cards={cards} allTransactions={transactions} />

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
          <div ref={transactionsRef} className="lg:col-span-2 bg-white rounded-xl p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
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
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search…"
                    className="pl-7 pr-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-44"
                  />
                </div>
                <button
                  onClick={() => {
                    const filtered = searchQuery.trim()
                      ? monthlyData.transactions.filter(t =>
                          (t.description ?? '').toLowerCase().includes(searchQuery.toLowerCase().trim()))
                      : monthlyData.transactions;
                    downloadCsv(`transactions-${currentMonth}.csv`, transactionsToCsv(filtered, cards));
                  }}
                  className="flex items-center gap-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg"
                  title="Export current view to CSV"
                >
                  <Download size={14} /> CSV
                </button>
                <TransactionFilters
                  transactionFilter={transactionFilter}
                  transactionSort={transactionSort}
                  onFilterChange={setTransactionFilter}
                  onSortChange={setTransactionSort}
                />
              </div>
            </div>

            <TransactionsList
              transactions={
                searchQuery.trim()
                  ? monthlyData.transactions.filter(t =>
                      (t.description ?? '').toLowerCase().includes(searchQuery.toLowerCase().trim()))
                  : monthlyData.transactions
              }
              allTransactions={transactions}
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

        {reauthTarget && (
          <PlaidUpdateLink
            itemId={reauthTarget.itemId}
            institutionName={reauthTarget.institutionName}
            onSuccess={() => {
              setReauthTarget(null);
              setSyncBanner({ show: true, message: `${reauthTarget.institutionName} reconnected. Syncing…`, type: 'info' });
              loadData();
            }}
            onExit={() => setReauthTarget(null)}
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
            allTransactions={transactions}
            onSubmit={updateTransaction}
            onCancel={() => {
              setShowTransactionEditModal(false);
              setEditingTransaction(null);
            }}
            onReimbursementChange={loadData}
          />
        )}

        {showCardDetail && selectedCard && (
          <CardDetailModal
            card={selectedCard}
            transactions={transactions}
            userRegion={userRegion}
            onClose={() => {
              setShowCardDetail(false);
              setSelectedCard(null);
            }}
            onTransactionClick={handleTransactionClick}
          />
        )}

        {showAbout && (
          <About onClose={() => setShowAbout(false)} />
        )}
      </div>
    </div>
  );
};

// Form Components (temporary - should be moved to separate files)
const CardForm: React.FC<{ 
  onSubmit: (data: any) => void;
  onCancel: () => void;
  cardCategories: Record<string, CardCategory>;
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
    <div role="dialog" aria-modal="true" className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
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
    <div role="dialog" aria-modal="true" className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
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
    <div role="dialog" aria-modal="true" className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
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