import React from 'react';
import { CreditCard, Trash2 } from 'lucide-react';
import type { Card, UserRegion } from '../../types';
import { formatCurrency } from '../../utils/currency';

interface DisplayCard extends Card {
  categoryInfo?: { label: string; color: string; description: string };
}

interface CardGridProps {
  cards: DisplayCard[];                 // already filtered by categoryFilter
  categoryFilter: string;
  onCategoryFilterChange: (filter: string) => void;
  userRegion: UserRegion;
  onCardClick: (card: Card) => void;
  onDeleteCard: (id: number) => void;
}

// Tailwind's JIT can't see classes built from template literals, so a
// `border-${color}-500` expression silently gets purged from the production
// CSS. Static map keeps each border class on the safelist while still
// varying it by category.
const CARD_BORDER_BY_COLOR: Record<string, string> = {
  blue: 'border-blue-500',
  green: 'border-green-500',
  emerald: 'border-emerald-500',
  purple: 'border-purple-500',
  indigo: 'border-indigo-500',
  violet: 'border-violet-500',
  orange: 'border-orange-500',
  red: 'border-red-500',
  gray: 'border-gray-500'
};
function cardBorderClass(color: string | undefined): string {
  return (color && CARD_BORDER_BY_COLOR[color]) || 'border-gray-500';
}

/**
 * "Your Cards" section: category filter dropdown + a grid of one tile per
 * card showing name, last four, balance, institution, sync status, and a
 * delete button. Click a tile to open the card detail modal. Self-hides
 * when the user has no cards.
 */
export const CardGrid: React.FC<CardGridProps> = ({
  cards,
  categoryFilter,
  onCategoryFilterChange,
  userRegion,
  onCardClick,
  onDeleteCard
}) => {
  if (cards.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">Your Cards</h2>
        <div className="flex gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => onCategoryFilterChange(e.target.value)}
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
        {cards.map(card => (
          <button
            key={card.id}
            onClick={() => onCardClick(card)}
            className={`bg-white rounded-xl p-6 shadow-lg border-l-4 hover:shadow-xl transition-all cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-indigo-300 ${cardBorderClass(card.categoryInfo?.color)}`}
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
                    onDeleteCard(card.id);
                  }}
                  className="text-gray-400 hover:text-red-600 transition-colors"
                  title="Delete card"
                  aria-label={`Delete card ${card.name}`}
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
  );
};
