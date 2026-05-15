import React from 'react';
import { X } from 'lucide-react';
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
// "Food + Amex + > $50", etc.
export const TransactionFilterChips: React.FC<Props> = ({ cards, filters, onChange }) => {
  const set = (patch: Partial<Props['filters']>) => onChange({ ...filters, ...patch });
  const active =
    filters.category && filters.category !== 'all'
      ? 1 : 0
    + (filters.cardId != null ? 1 : 0)
    + (filters.pendingOnly ? 1 : 0)
    + (typeof filters.minAmount === 'number' || typeof filters.maxAmount === 'number' ? 1 : 0);

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <select
        value={filters.category || 'all'}
        onChange={e => set({ category: e.target.value })}
        className="text-xs border border-gray-300 rounded-full px-2.5 py-1 bg-white"
      >
        <option value="all">All categories</option>
        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>

      <select
        value={filters.cardId ?? ''}
        onChange={e => set({ cardId: e.target.value ? Number(e.target.value) : null })}
        className="text-xs border border-gray-300 rounded-full px-2.5 py-1 bg-white max-w-[180px] truncate"
      >
        <option value="">All cards</option>
        {cards.map(c => <option key={c.id} value={c.id}>{c.name} •{c.last_four}</option>)}
      </select>

      <label className="flex items-center gap-1 text-xs border border-gray-300 rounded-full px-2.5 py-1 bg-white cursor-pointer">
        <input
          type="checkbox"
          checked={!!filters.pendingOnly}
          onChange={e => set({ pendingOnly: e.target.checked })}
        />
        Pending only
      </label>

      <div className="flex items-center gap-1 text-xs">
        <span className="text-gray-500">$</span>
        <input
          type="number"
          inputMode="decimal"
          value={filters.minAmount ?? ''}
          onChange={e => set({ minAmount: e.target.value === '' ? undefined : Number(e.target.value) })}
          placeholder="min"
          className="w-16 border border-gray-300 rounded-full px-2 py-1 bg-white"
        />
        <span className="text-gray-500">–</span>
        <input
          type="number"
          inputMode="decimal"
          value={filters.maxAmount ?? ''}
          onChange={e => set({ maxAmount: e.target.value === '' ? undefined : Number(e.target.value) })}
          placeholder="max"
          className="w-16 border border-gray-300 rounded-full px-2 py-1 bg-white"
        />
      </div>

      {active > 0 && (
        <button
          onClick={() => onChange({})}
          className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          <X size={12} /> clear
        </button>
      )}
    </div>
  );
};
