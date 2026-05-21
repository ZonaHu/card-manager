import React from 'react';
import { CreditCard, Plus, Sparkles } from 'lucide-react';
import type { Card, User } from '../../types';

interface DashboardHeaderProps {
  user: User;
  cards: Card[];
  isNewUser: boolean;
  onAddCardClick: () => void;
  // Menu component slot — kept as children so this header doesn't have to
  // know every prop DashboardMenu needs.
  menu: React.ReactNode;
}

/**
 * Top of the dashboard: app logo, greeting, last-sync status hint, primary
 * Add-Card button, and the burger menu slot. The sync status text picks the
 * most recent of either the last successful sync OR the most recent failure
 * — failures take precedence so the user always sees stale state explicitly.
 */
export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  user,
  cards,
  isNewUser,
  onAddCardClick,
  menu
}) => {
  return (
    <div className="flex items-center justify-between mb-8">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full flex items-center justify-center">
          <CreditCard className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Card Manager</h1>
          <p className="text-gray-600">
            Welcome back, {user.name}!
            <SyncStatusInline cards={cards} />
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onAddCardClick}
          className={`${isNewUser ? 'bg-gradient-to-r from-blue-600 to-indigo-600 shadow-lg' : 'bg-indigo-600'} text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:shadow-md transition-all`}
        >
          {isNewUser ? <Sparkles size={16} /> : <Plus size={16} />}
          {isNewUser ? 'Get Started' : 'Add Card'}
        </button>

        {menu}
      </div>
    </div>
  );
};

/**
 * Inline "synced 4h ago" / "2 cards not syncing" hint. Pure render from the
 * cards array — pulled out so the header JSX stays scannable.
 */
const SyncStatusInline: React.FC<{ cards: Card[] }> = ({ cards }) => {
  // Failure takes precedence: if any connected card has a recent attempt
  // that errored, surface that instead of the older success timestamp.
  const failing = cards.filter(c =>
    c.last_sync_error && (!c.last_synced_at ||
      (c.last_sync_attempt_at && c.last_sync_attempt_at > (c.last_synced_at || ''))));

  if (failing.length > 0) {
    const codes = Array.from(new Set(failing.map(c => c.last_sync_error).filter(Boolean)));
    return (
      <span className="text-xs text-amber-600 ml-2">
        · {failing.length} card{failing.length > 1 ? 's' : ''} not syncing ({codes.slice(0, 2).join(', ')})
      </span>
    );
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
};
