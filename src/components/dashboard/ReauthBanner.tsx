import React from 'react';
import { AlertCircle } from 'lucide-react';
import type { Card } from '../../types';

interface ReauthBannerProps {
  cards: Card[];
  onReconnect: (target: { itemId: string; institutionName: string }) => void;
}

/**
 * Yellow banner that appears when any Plaid item has needs_reauth set
 * (typically ITEM_LOGIN_REQUIRED / NEW_MFA_NEEDED returned during sync).
 * Self-hides when no card needs reauth so the dashboard stays quiet in the
 * common case. Groups cards by item_id so a single bank with three accounts
 * shows up as one row instead of three.
 */
export const ReauthBanner: React.FC<ReauthBannerProps> = ({ cards, onReconnect }) => {
  const needsReauth = cards.filter(c => c.needs_reauth && c.item_id);
  if (needsReauth.length === 0) return null;

  // Group cards by item_id so each bank shows up once.
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
                  onClick={() => onReconnect({ itemId: item.itemId, institutionName: item.institutionName })}
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
};
