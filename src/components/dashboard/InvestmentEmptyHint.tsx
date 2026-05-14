import React from 'react';
import { Info } from 'lucide-react';
import type { Card } from '../../types';

interface Props { cards: Card[]; transactions: { card_id?: number; cardId?: number }[]; }

export const InvestmentEmptyHint: React.FC<Props> = ({ cards, transactions }) => {
  const investmentCards = cards.filter(c =>
    c.category === 'investment' || c.category === 'tfsa' || c.category === 'rrsp');
  if (investmentCards.length === 0) return null;
  const txCardIds = new Set(transactions.map(t => t.cardId ?? (t as any).card_id));
  const empty = investmentCards.filter(c => !txCardIds.has(c.id));
  if (empty.length === 0) return null;
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900 mb-4 flex items-start gap-2">
      <Info size={16} className="text-blue-600 mt-0.5" />
      <div>
        <strong>{empty.length} investment account{empty.length > 1 ? 's' : ''} show balances but no transactions.</strong>
        {' '}Plaid's <code>/transactions/sync</code> only returns depository + credit activity.
        Brokerage trades and contributions need <code>/investments/transactions</code>,
        which this app doesn't call yet. Balances will refresh; trade history won't.
        <ul className="mt-1 list-disc list-inside text-xs text-blue-700">
          {empty.slice(0, 5).map(c => (
            <li key={c.id}>{c.name} ••••{c.last_four}</li>
          ))}
          {empty.length > 5 && <li>and {empty.length - 5} more</li>}
        </ul>
      </div>
    </div>
  );
};
