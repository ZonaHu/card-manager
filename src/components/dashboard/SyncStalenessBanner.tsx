// src/components/dashboard/SyncStalenessBanner.tsx
import React from 'react';
import { Clock } from 'lucide-react';
import { findStaleItems, type PlaidItemSummary } from '../../utils/syncStaleness';

interface Props {
  items: PlaidItemSummary[];
  onSync: () => void;
}

// Nudges the user to re-sync when any connected institution hasn't been
// touched in 24+ hours. Excludes items already showing in the reauth banner
// (handled separately) so the dashboard never shows two prompts for the
// same connection.
export const SyncStalenessBanner: React.FC<Props> = ({ items, onSync }) => {
  const stale = React.useMemo(() => findStaleItems(items, 24), [items]);
  if (stale.length === 0) return null;

  const names = stale.map(i => i.institution_name || 'unnamed institution').slice(0, 3).join(', ');
  const extra = stale.length > 3 ? ` and ${stale.length - 3} more` : '';

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-amber-900">
        <Clock size={16} className="text-amber-600" />
        <span>
          Data from <strong>{names}</strong>{extra} is more than 24 hours old.
        </span>
      </div>
      <button
        onClick={onSync}
        className="text-sm font-medium bg-amber-600 text-white px-3 py-1.5 rounded hover:bg-amber-700"
      >
        Sync now
      </button>
    </div>
  );
};
