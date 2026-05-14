import React, { useEffect, useState } from 'react';
import { Settings, Plus, Trash2, ChevronDown, ChevronRight, Tag, Split } from 'lucide-react';
import type { Card, Transaction } from '../../types';
import { CATEGORIES } from '../../constants/categories';
import { API_BASE_URL } from '../../config/api';
import { RulePreviewPopover } from './RulePreviewPopover';

interface CategorizationRule {
  id: number;
  pattern: string;
  category: string;
  created_at?: string;
}

interface SplitRule {
  id: number;
  card_id: number | null;
  pattern: string;
  threshold: number;
  split_amount: number;
  split_category: string;
  split_description: string;
  created_at?: string;
}

interface RulesPanelProps {
  cards: Card[];
  allTransactions: Transaction[];
}

/**
 * Manage the two kinds of sync-time rules in one place:
 *
 *   - **Categorization rules** override the default Plaid category on any
 *     transaction whose description contains the pattern.
 *   - **Split rules** peel off a fixed amount from large charges (e.g. METRO
 *     Amex 1004 > $500 → split $500 into a Transfer sibling for paypower).
 *
 * Both run during Plaid sync. Existing transactions aren't touched —
 * categorize/split runs only on newly synced rows.
 */
export const RulesPanel: React.FC<RulesPanelProps> = ({ cards, allTransactions }) => {
  const [open, setOpen] = useState(false);
  const [catRules, setCatRules] = useState<CategorizationRule[]>([]);
  const [splitRules, setSplitRules] = useState<SplitRule[]>([]);
  const [catDraft, setCatDraft] = useState({ pattern: '', category: 'Other' });
  const [splitDraft, setSplitDraft] = useState({
    pattern: '', card_id: '' as string | number, threshold: 500, split_amount: 500,
    split_category: 'Transfer', split_description: ''
  });
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const [cr, sr] = await Promise.all([
        fetch(`${API_BASE_URL}/api/categorization-rules`, { credentials: 'include' }).then(r => r.ok ? r.json() : []),
        fetch(`${API_BASE_URL}/api/categorization-rules/split/list`, { credentials: 'include' }).then(r => r.ok ? r.json() : [])
      ]);
      setCatRules(cr);
      setSplitRules(sr);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open) refresh(); }, [open]);

  const addCategorizationRule = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = catDraft.pattern.trim();
    if (!p) return;
    await fetch(`${API_BASE_URL}/api/categorization-rules`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pattern: p, category: catDraft.category })
    });
    setCatDraft({ pattern: '', category: 'Other' });
    refresh();
  };

  const deleteCategorizationRule = async (id: number) => {
    await fetch(`${API_BASE_URL}/api/categorization-rules/${id}`, {
      method: 'DELETE', credentials: 'include'
    });
    refresh();
  };

  const addSplitRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!splitDraft.pattern.trim() || !(splitDraft.threshold > 0) || !(splitDraft.split_amount > 0)) return;
    await fetch(`${API_BASE_URL}/api/categorization-rules/split/list`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pattern: splitDraft.pattern.trim(),
        card_id: splitDraft.card_id === '' ? null : Number(splitDraft.card_id),
        threshold: Number(splitDraft.threshold),
        split_amount: Number(splitDraft.split_amount),
        split_category: splitDraft.split_category,
        split_description: splitDraft.split_description.trim() ||
          `${splitDraft.split_category.toUpperCase()} (split from ${splitDraft.pattern.trim()})`
      })
    });
    setSplitDraft({
      pattern: '', card_id: '', threshold: 500, split_amount: 500,
      split_category: 'Transfer', split_description: ''
    });
    refresh();
  };

  const deleteSplitRule = async (id: number) => {
    await fetch(`${API_BASE_URL}/api/categorization-rules/split/list/${id}`, {
      method: 'DELETE', credentials: 'include'
    });
    refresh();
  };

  const cardName = (id: number | null) => {
    if (id == null) return 'Any card';
    const c = cards.find(c => c.id === id);
    return c ? `${c.name} ••••${c.last_four}` : `Card #${id}`;
  };

  return (
    <div className="bg-white rounded-xl shadow-lg mb-6">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 rounded-xl"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <Settings size={18} className="text-gray-600" />
          <span className="font-semibold text-gray-900">Sync Rules</span>
          <span className="text-xs text-gray-500">
            {catRules.length + splitRules.length} active
          </span>
        </div>
        {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
      </button>

      {open && (
        <div className="p-6 border-t border-gray-100 space-y-6">
          {/* Categorization rules */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Tag size={16} className="text-indigo-600" />
              <h4 className="font-semibold text-gray-900">Categorization</h4>
              <span className="text-xs text-gray-500">
                Override category for any transaction whose description matches.
              </span>
            </div>

            {catRules.length > 0 && (
              <ul className="space-y-1 mb-3">
                {catRules.map(r => (
                  <li key={r.id} className="flex items-center justify-between text-sm bg-gray-50 rounded-md px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-gray-800 truncate">{r.pattern}</span>
                      <span className="text-gray-400 mx-2">→</span>
                      <span className="text-gray-900">{r.category}</span>
                    </div>
                    <button
                      onClick={() => deleteCategorizationRule(r.id)}
                      className="text-gray-400 hover:text-red-600 ml-2"
                      aria-label={`Delete rule for ${r.pattern}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div>
              <form onSubmit={addCategorizationRule} className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={catDraft.pattern}
                  onChange={e => setCatDraft(d => ({ ...d, pattern: e.target.value }))}
                  placeholder="Pattern (substring, e.g. NETFLIX)"
                  className="flex-1 min-w-[150px] border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                />
                <select
                  value={catDraft.category}
                  onChange={e => setCatDraft(d => ({ ...d, category: e.target.value }))}
                  className="border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button
                  type="submit"
                  className="bg-indigo-600 text-white text-sm px-3 py-1.5 rounded-md hover:bg-indigo-700 flex items-center gap-1"
                >
                  <Plus size={14} /> Add
                </button>
              </form>
              <RulePreviewPopover pattern={catDraft.pattern} transactions={allTransactions} />
            </div>
          </section>

          {/* Split rules */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Split size={16} className="text-purple-600" />
              <h4 className="font-semibold text-gray-900">Splits</h4>
              <span className="text-xs text-gray-500">
                Peel a fixed amount off large charges. Useful for prepaid loads disguised as purchases.
              </span>
            </div>

            {splitRules.length > 0 && (
              <ul className="space-y-1 mb-3">
                {splitRules.map(r => (
                  <li key={r.id} className="flex items-center justify-between text-sm bg-gray-50 rounded-md px-3 py-2">
                    <div className="flex-1 min-w-0 text-gray-800">
                      <span className="font-mono">{r.pattern}</span>
                      <span className="text-gray-400 mx-1">on</span>
                      <span className="text-gray-600">{cardName(r.card_id)}</span>
                      <span className="text-gray-400 mx-1">·</span>
                      <span>if &gt; ${r.threshold}</span>
                      <span className="text-gray-400 mx-1">→</span>
                      <span>split ${r.split_amount} to {r.split_category}</span>
                    </div>
                    <button
                      onClick={() => deleteSplitRule(r.id)}
                      className="text-gray-400 hover:text-red-600 ml-2"
                      aria-label={`Delete split rule for ${r.pattern}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div>
              <form onSubmit={addSplitRule} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
                <input
                  type="text"
                  value={splitDraft.pattern}
                  onChange={e => setSplitDraft(d => ({ ...d, pattern: e.target.value }))}
                  placeholder="Pattern (e.g. METRO)"
                  className="sm:col-span-2 border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                />
                <select
                  value={splitDraft.card_id}
                  onChange={e => setSplitDraft(d => ({ ...d, card_id: e.target.value }))}
                  className="border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                >
                  <option value="">Any card</option>
                  {cards.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ••••{c.last_four}</option>
                  ))}
                </select>
                <input
                  type="number" min="1" step="0.01"
                  value={splitDraft.threshold}
                  onChange={e => setSplitDraft(d => ({ ...d, threshold: Number(e.target.value) }))}
                  placeholder="Threshold"
                  title="Trigger if |amount| > threshold"
                  className="border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                />
                <input
                  type="number" min="1" step="0.01"
                  value={splitDraft.split_amount}
                  onChange={e => setSplitDraft(d => ({ ...d, split_amount: Number(e.target.value) }))}
                  placeholder="Split amount"
                  title="Amount peeled into sibling"
                  className="border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                />
                <div className="flex gap-2">
                  <select
                    value={splitDraft.split_category}
                    onChange={e => setSplitDraft(d => ({ ...d, split_category: e.target.value }))}
                    className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button
                    type="submit"
                    className="bg-purple-600 text-white text-sm px-3 py-1.5 rounded-md hover:bg-purple-700 flex items-center gap-1"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </form>
              <RulePreviewPopover pattern={splitDraft.pattern} transactions={allTransactions} />
            </div>
          </section>

          {loading && <div className="text-xs text-gray-400">Loading…</div>}
        </div>
      )}
    </div>
  );
};
