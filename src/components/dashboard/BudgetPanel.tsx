import React, { useEffect, useState } from 'react';
import { Target } from 'lucide-react';
import type { BudgetConfig, UserRegion } from '../../types';
import { formatCurrency } from '../../utils/currency';
import { CATEGORIES } from '../../constants/categories';
import { API_BASE_URL } from '../../config/api';
import { mergeWithDefaults } from '../../utils/budgetDefaults';

interface BudgetPanelProps {
  byCategory: Record<string, number>;
  userRegion: UserRegion;
}

/**
 * Shows category spending against user-configured monthly budgets. Pulls the
 * budget config on mount; the user can edit per-category targets inline.
 * "Set" a category to 0 to remove it.
 */
export const BudgetPanel: React.FC<BudgetPanelProps> = ({ byCategory, userRegion }) => {
  const [budget, setBudget] = useState<BudgetConfig>({});
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/user/budget`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : { budget: {} })
      .then(data => {
        if (cancelled) return;
        const saved = data.budget || {};
        // First-time users (empty object) → seed with defaults so the dashboard
        // immediately shows realistic targets. Existing users see their saved
        // values untouched.
        setBudget(Object.keys(saved).length === 0 ? mergeWithDefaults({}) : saved);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const startEdit = () => {
    const next: Record<string, string> = {};
    CATEGORIES.forEach(c => { next[c] = String(budget[c] ?? ''); });
    setDraft(next);
    setEditing(true);
  };

  const save = async () => {
    const next: BudgetConfig = {};
    for (const [k, v] of Object.entries(draft)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) next[k] = n;
    }
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/user/budget`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budget: next })
      });
      const data = await r.json();
      setBudget(data.budget || {});
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const rows = Object.keys(budget).length
    ? Object.entries(budget).map(([category, target]) => {
        const actual = byCategory[category] || 0;
        const pct = target > 0 ? Math.min(100, (actual / target) * 100) : 0;
        const over = actual > target;
        return { category, target, actual, pct, over };
      })
    : [];

  return (
    <div className="bg-white rounded-xl p-6 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target className="text-indigo-600" size={20} />
          <h3 className="text-lg font-semibold text-gray-900">Budgets</h3>
        </div>
        {!editing && (
          <button onClick={startEdit} className="text-sm text-indigo-600 hover:text-indigo-700">
            {rows.length === 0 ? 'Set budgets' : 'Edit'}
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          {CATEGORIES.map(category => (
            <div key={category} className="flex items-center gap-2">
              <label className="w-32 text-sm text-gray-700">{category}</label>
              <input
                type="number"
                min="0"
                step="1"
                value={draft[category] ?? ''}
                onChange={e => setDraft(d => ({ ...d, [category]: e.target.value }))}
                placeholder="0"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1 text-sm"
              />
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <button
              onClick={save}
              disabled={saving}
              className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-sm px-4 py-2 rounded-lg text-gray-700 hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-6">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-indigo-50 rounded-full mb-3">
            <Target className="text-indigo-400" size={20} />
          </div>
          <p className="text-sm text-gray-700 font-medium mb-1">No budgets set</p>
          <p className="text-xs text-gray-500 mb-3">
            Define monthly targets to see over/under at a glance.
          </p>
          <button
            onClick={startEdit}
            className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700"
          >
            Set up budgets
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(row => (
            <div key={row.category}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-700">{row.category}</span>
                <span className={row.over ? 'text-red-600 font-medium' : 'text-gray-600'}>
                  {formatCurrency(row.actual, userRegion.currency)} / {formatCurrency(row.target, userRegion.currency)}
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 ${row.over ? 'bg-red-500' : 'bg-indigo-500'}`}
                  style={{ width: `${row.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
