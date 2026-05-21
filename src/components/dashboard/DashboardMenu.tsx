import React, { useEffect, useRef, useState } from 'react';
import {
  Menu, X, Zap, TrendingUp, Edit3, Plus, ExternalLink,
  Globe, HelpCircle, Download, LogOut
} from 'lucide-react';
import { SyncStatusList } from './SyncStatusList';
import type { Card, UserRegion } from '../../types';
import type { PlaidItemSummary } from '../../utils/syncStaleness';

interface DashboardMenuProps {
  cards: Card[];
  plaidItems: PlaidItemSummary[];
  userRegion: UserRegion;
  loading: boolean;

  // Action handlers — parent owns the actual side-effect logic, this
  // component is just the dropdown UI.
  onQuickSync: () => void;
  onFullSync: () => void;
  onFixCategories: () => void;
  onAddTransaction: () => void;
  onConnectBank: () => void;
  onChangeRegion: () => void;
  onShowAbout: () => void;
  onRunBackup: () => void;
  onLogout: () => void;
}

/**
 * Burger menu for the dashboard. Owns its own open/close state + the
 * click-outside/Escape dismiss behavior. Renders all sync, account, and
 * session actions as a single dropdown so the dashboard header stays
 * uncluttered.
 *
 * Sync-related menu items hide entirely when no card is Plaid-connected
 * (no point showing "Quick Sync" with nothing to sync against).
 */
export const DashboardMenu: React.FC<DashboardMenuProps> = ({
  cards,
  plaidItems,
  userRegion,
  loading,
  onQuickSync,
  onFullSync,
  onFixCategories,
  onAddTransaction,
  onConnectBank,
  onChangeRegion,
  onShowAbout,
  onRunBackup,
  onLogout
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const hasConnected = cards.some(c => c.connected);

  // Each menu item closes the dropdown after firing — wrap once.
  const wrap = (fn: () => void) => () => { setOpen(false); fn(); };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-colors"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-12 bg-white rounded-lg shadow-xl border border-gray-200 py-2 w-64 z-50">
          {hasConnected && (
            <>
              <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
                Sync Options
              </div>
              <button
                onClick={wrap(onQuickSync)}
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
                onClick={wrap(onFullSync)}
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
                onClick={wrap(onFixCategories)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3"
                disabled={loading}
              >
                <Edit3 size={16} className="text-green-600" />
                <div>
                  <div className="font-medium">{loading ? 'Fixing...' : 'Fix Categories'}</div>
                  <div className="text-sm text-gray-500">Update transaction categories from Plaid</div>
                </div>
              </button>

              <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 mt-2">
                Transactions
              </div>
              <button
                onClick={wrap(onAddTransaction)}
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

          <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 mt-2">
            Account
          </div>
          <button
            onClick={wrap(onConnectBank)}
            className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3"
          >
            <ExternalLink size={16} className="text-blue-600" />
            <div>
              <div className="font-medium">Connect Bank Account</div>
              <div className="text-sm text-gray-500">Link with Plaid for automatic syncing</div>
            </div>
          </button>

          <button
            onClick={wrap(onChangeRegion)}
            className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3"
          >
            <Globe size={16} className="text-purple-600" />
            <div>
              <div className="font-medium">Change Region</div>
              <div className="text-sm text-gray-500">Update country and currency ({userRegion.country} - {userRegion.currency})</div>
            </div>
          </button>

          <button
            onClick={wrap(onShowAbout)}
            className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3"
          >
            <HelpCircle size={16} className="text-gray-600" />
            <div>
              <div className="font-medium">About & Security</div>
              <div className="text-sm text-gray-500">Privacy, security, and how it works</div>
            </div>
          </button>

          <button
            onClick={wrap(onRunBackup)}
            className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3"
          >
            <Download size={16} className="text-blue-600" />
            <div>
              <div className="font-medium">Run Backup Now</div>
              <div className="text-sm text-gray-500">Snapshot the local database</div>
            </div>
          </button>

          <SyncStatusList items={plaidItems} />

          <div className="px-4 py-2 text-[10px] text-gray-400 border-t border-gray-100 flex items-center justify-between">
            <span>v{__APP_VERSION__}</span>
            <span className="font-mono">{__COMMIT_SHA__}</span>
          </div>

          <div className="px-4 py-2 border-t border-gray-100"></div>

          <button
            onClick={wrap(onLogout)}
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
  );
};
