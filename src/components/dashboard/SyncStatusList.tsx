// src/components/dashboard/SyncStatusList.tsx
import React from 'react';
import { Database, CheckCircle2, AlertCircle } from 'lucide-react';
import type { PlaidItemSummary } from '../../utils/syncStaleness';

interface Props {
  items: PlaidItemSummary[];
}

function relative(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

// Rendered inside the burger menu. Quick at-a-glance status per connected
// institution — green check for healthy + recent, yellow for stale, red for
// reauth-required. Reads directly from plaid_items via the staleness hook
// so the data matches the SyncStalenessBanner above.
export const SyncStatusList: React.FC<Props> = ({ items }) => {
  if (items.length === 0) return null;

  return (
    <div className="px-4 py-3 border-t border-gray-100">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500 mb-2">
        <Database size={12} />
        Connections
      </div>
      <ul className="space-y-1.5">
        {items.map(i => {
          const stale = !i.last_synced_at
            || Date.now() - new Date(i.last_synced_at).getTime() > 24 * 3_600_000;
          const Icon = i.needs_reauth ? AlertCircle : stale ? AlertCircle : CheckCircle2;
          const tone = i.needs_reauth ? 'text-rose-500' : stale ? 'text-amber-500' : 'text-emerald-500';
          return (
            <li key={i.id} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-gray-700 truncate">
                <Icon size={12} className={tone} />
                {i.institution_name || 'unnamed'}
              </span>
              <span className="text-gray-500 ml-2 whitespace-nowrap">
                {i.needs_reauth ? 'needs reauth' : relative(i.last_synced_at)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
