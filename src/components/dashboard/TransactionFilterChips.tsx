import React from 'react';
import { X, Filter } from 'lucide-react';
import { CATEGORIES } from '../../constants/categories';
import type { Card } from '../../types';

interface Props {
  cards: Card[];
  filters: {
    category?: string;
    cardId?: number | null;
    pendingOnly?: boolean;
    minAmount?: number;
    maxAmount?: number;
  };
  onChange: (next: Props['filters']) => void;
}

// Compact filter strip rendered above the transactions list. Chips are
// independent (AND-combined in the parent) so the user can stack filters —
// "Food + Amex + > $50", etc. Each chip flips to an "active" indigo style
// when its value is set so the strip's state is glanceable.
export const TransactionFilterChips: React.FC<Props> = ({ cards, filters, onChange }) => {
  const set = (patch: Partial<Props['filters']>) => onChange({ ...filters, ...patch });

  const isCategoryActive = !!filters.category && filters.category !== 'all';
  const isCardActive = filters.cardId != null;
  const isPendingActive = !!filters.pendingOnly;
  const isAmountActive = typeof filters.minAmount === 'number' || typeof filters.maxAmount === 'number';

  // Correct precedence — wrapping the chained ternary in parens. Old version
  // had a `?:` / `+` precedence bug that produced 1 instead of an accurate
  // count when category was the only active chip.
  const activeCount =
    (isCategoryActive ? 1 : 0) +
    (isCardActive ? 1 : 0) +
    (isPendingActive ? 1 : 0) +
    (isAmountActive ? 1 : 0);

  const chipBase = 'text-xs border rounded-full px-2.5 py-1 bg-white transition-colors';
  const chipIdle = 'border-gray-300 text-gray-700';
  const chipActive = 'border-indigo-300 bg-indigo-50 text-indigo-800';

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <div className="flex items-center gap-1 text-xs text-gray-500 mr-1">
        <Filter size={12} />
        <span>Filter:</span>
        {activeCount > 0 && (
          <span className="bg-indigo-600 text-white text-[10px] font-semibold rounded-full px-1.5 py-0.5 ml-0.5">
            {activeCount}
          </span>
        )}
      </div>

      <select
        value={filters.category || 'all'}
        onChange={e => set({ category: e.target.value })}
        className={`${chipBase} ${isCategoryActive ? chipActive : chipIdle}`}
      >
        <option value="all">All categories</option>
        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>

      <select
        value={filters.cardId ?? ''}
        onChange={e => set({ cardId: e.target.value ? Number(e.target.value) : null })}
        className={`${chipBase} max-w-[180px] truncate ${isCardActive ? chipActive : chipIdle}`}
      >
        <option value="">All cards</option>
        {cards.map(c => <option key={c.id} value={c.id}>{c.name} •{c.last_four}</option>)}
      </select>

      <label className={`flex items-center gap-1 cursor-pointer ${chipBase} ${isPendingActive ? chipActive : chipIdle}`}>
        <input
          type="checkbox"
          checked={isPendingActive}
          onChange={e => set({ pendingOnly: e.target.checked })}
          className="accent-indigo-600"
        />
        Pending only
      </label>

      <div className={`flex items-center gap-1 ${chipBase} ${isAmountActive ? chipActive : chipIdle}`}>
        <span className="text-[11px] opacity-70">$</span>
        <input
          type="number"
          inputMode="decimal"
          value={filters.minAmount ?? ''}
          onChange={e => set({ minAmount: e.target.value === '' ? undefined : Number(e.target.value) })}
          placeholder="min"
          className="w-12 bg-transparent focus:outline-none text-xs"
        />
        <span className="opacity-50">–</span>
        <input
          type="number"
          inputMode="decimal"
          value={filters.maxAmount ?? ''}
          onChange={e => set({ maxAmount: e.target.value === '' ? undefined : Number(e.target.value) })}
          placeholder="max"
          className="w-12 bg-transparent focus:outline-none text-xs"
        />
      </div>

      {activeCount > 0 && (
        <button
          onClick={() => onChange({})}
          className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          <X size={12} /> clear all
        </button>
      )}
    </div>
  );
};
