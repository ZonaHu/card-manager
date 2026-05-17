import React from 'react';
import { CATEGORIES } from '../../constants/categories';

interface Props {
  selectedCount: number;
  onApplyCategory: (category: string) => Promise<void>;
  onClear: () => void;
}

// Fixed-bottom action bar that appears when at least one row is selected.
// Hidden when selectedCount is 0 so it stays out of the way during normal
// browsing. Kept dead simple — one dropdown + one apply button.
export const TransactionSelectionBar: React.FC<Props> = ({ selectedCount, onApplyCategory, onClear }) => {
  const [category, setCategory] = React.useState<string>(CATEGORIES[0]);
  const [busy, setBusy] = React.useState(false);

  if (selectedCount === 0) return null;

  const apply = async () => {
    setBusy(true);
    try { await onApplyCategory(category); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-white border border-gray-200 shadow-xl rounded-full px-4 py-2 flex items-center gap-3">
      <span className="text-sm font-medium text-gray-900">
        {selectedCount} selected
      </span>
      <select
        value={category}
        onChange={e => setCategory(e.target.value)}
        className="text-sm border border-gray-300 rounded-full px-2.5 py-1 bg-white"
      >
        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <button
        type="button"
        disabled={busy}
        onClick={apply}
        className="bg-indigo-600 text-white text-sm px-3 py-1 rounded-full hover:bg-indigo-700 disabled:bg-indigo-300"
      >
        {busy ? 'Applying…' : 'Set category'}
      </button>
      <button
        type="button"
        onClick={onClear}
        className="text-sm text-gray-500 hover:text-gray-700"
      >
        Clear
      </button>
    </div>
  );
};
