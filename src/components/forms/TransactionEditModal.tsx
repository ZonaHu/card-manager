import React, { useState } from 'react';
import type { Transaction, Card } from '../../types';
import { CATEGORIES } from '../../constants/categories';
import { API_BASE_URL } from '../../config/api';
import { RulePreviewPopover } from '../dashboard/RulePreviewPopover';
import { useEscapeKey } from '../../hooks/useEscapeKey';

interface TransactionEditModalProps {
  transaction: Transaction;
  cards: Card[];
  allTransactions: Transaction[];
  onSubmit: (data: {
    id: number;
    amount: number;
    description: string;
    category: string;
    notes?: string | null;
  }) => void;
  onCancel: () => void;
  // Called after a reimbursement link is changed so the parent can re-fetch
  // transactions and re-render aggregates. Optional — older callers still work.
  onReimbursementChange?: () => void;
}

export const TransactionEditModal: React.FC<TransactionEditModalProps> = ({
  transaction,
  cards,
  allTransactions,
  onSubmit,
  onCancel,
  onReimbursementChange
}) => {
  useEscapeKey(true, onCancel);

  const [amount, setAmount] = useState(Math.abs(transaction.amount).toString());
  const [description, setDescription] = useState(transaction.description);
  const [category, setCategory] = useState(transaction.category);
  const [notes, setNotes] = useState(transaction.notes ?? '');
  const [isNegative, setIsNegative] = useState(transaction.amount < 0);
  const [rememberMerchant, setRememberMerchant] = useState(false);
  const [savingRule, setSavingRule] = useState(false);

  // Reimbursement linker state — only relevant when this transaction is positive.
  const [reimburseSearch, setReimburseSearch] = useState('');
  const [reimburseSaving, setReimburseSaving] = useState(false);
  const [reimburseError, setReimburseError] = useState<string | null>(null);
  const [linkedPurchaseId, setLinkedPurchaseId] = useState<number | null>(
    typeof transaction.reimburses_id === 'number' ? transaction.reimburses_id : null
  );
  const linkedPurchase = React.useMemo(
    () => linkedPurchaseId == null ? null : allTransactions.find(t => t.id === linkedPurchaseId) ?? null,
    [linkedPurchaseId, allTransactions]
  );
  const reimburseCandidates = React.useMemo(() => {
    if (transaction.amount <= 0) return [];
    const q = reimburseSearch.trim().toLowerCase();
    return allTransactions
      .filter(t => t.amount < 0 && t.id !== transaction.id)
      .filter(t => !q || (t.description ?? '').toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8);
  }, [allTransactions, reimburseSearch, transaction.amount, transaction.id]);

  async function setReimbursement(purchaseId: number | null) {
    try {
      setReimburseSaving(true);
      setReimburseError(null);
      const res = await fetch(`${API_BASE_URL}/api/transactions/${transaction.id}/reimburses`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchaseId })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setReimburseError(body?.error || `Failed (${res.status})`);
        return;
      }
      setLinkedPurchaseId(purchaseId);
      onReimbursementChange?.();
    } catch (e: any) {
      setReimburseError(e?.message || 'Network error');
    } finally {
      setReimburseSaving(false);
    }
  }

  // Default merchant pattern is a stable substring of the description — first
  // 1–3 alpha words. User can edit before saving.
  const defaultPattern = (description.match(/[A-Za-z][A-Za-z]+/g) || [])
    .slice(0, 3)
    .join(' ');
  const [merchantPattern, setMerchantPattern] = useState(defaultPattern);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // If user wants to remember this merchant, create the rule first so future
    // syncs apply it. Doing it before the transaction update means recategorize
    // runs against the new rule too.
    if (rememberMerchant && merchantPattern.trim()) {
      try {
        setSavingRule(true);
        await fetch(`${API_BASE_URL}/api/categorization-rules`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pattern: merchantPattern.trim(), category })
        });
      } catch {
        /* non-fatal */
      } finally {
        setSavingRule(false);
      }
    }
    onSubmit({
      id: transaction.id,
      amount: isNegative ? -parseFloat(amount) : parseFloat(amount),
      description,
      category,
      notes: notes.trim() || null
    });
  };

  const card = cards.find(c => c.id === transaction.cardId);

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] flex flex-col my-auto">
        <h2 className="text-xl font-semibold px-6 pt-6 pb-3 flex-shrink-0">Edit Transaction</h2>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Card</label>
            <div className="p-3 bg-gray-100 rounded-lg text-sm text-gray-600">
              {card?.name || 'Unknown Card'}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
            <div className="flex gap-2">
              <select
                value={isNegative ? 'expense' : 'income'}
                onChange={(e) => setIsNegative(e.target.value === 'expense')}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="expense">Expense (-)</option>
                <option value="income">Income (+)</option>
              </select>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                step="0.01"
                min="0"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              required
            >
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes <span className="text-gray-400 text-xs">(optional · {notes.length}/2000)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 2000))}
              placeholder="Anything to remember about this charge — context, who you were with, what for…"
              rows={3}
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm resize-y"
            />
          </div>

          <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3">
            <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMerchant}
                onChange={(e) => setRememberMerchant(e.target.checked)}
                className="mt-1"
              />
              <span>
                Remember this merchant — future transactions matching the
                pattern below will get this category automatically.
              </span>
            </label>
            {rememberMerchant && (
              <>
                <input
                  type="text"
                  value={merchantPattern}
                  onChange={(e) => setMerchantPattern(e.target.value)}
                  placeholder="Merchant pattern (substring match)"
                  className="mt-2 w-full p-2 border border-indigo-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <RulePreviewPopover pattern={merchantPattern} transactions={allTransactions} />
              </>
            )}
          </div>

          {transaction.amount > 0 && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
              <div className="text-sm font-medium text-emerald-900 mb-2">
                Reimbursement for a purchase?
              </div>
              {reimburseError && (
                <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1 mb-2">
                  {reimburseError}
                </div>
              )}
              {linkedPurchase ? (
                <div className="text-sm text-gray-700">
                  Linked to: <span className="font-medium">{linkedPurchase.description}</span>{' '}
                  ({linkedPurchase.date}, ${Math.abs(linkedPurchase.amount).toFixed(2)})
                  <button
                    type="button"
                    disabled={reimburseSaving}
                    onClick={() => setReimbursement(null)}
                    className="ml-2 text-xs text-rose-600 hover:underline disabled:opacity-50"
                  >
                    unlink
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-xs text-emerald-800 mb-2">
                    Picking a purchase subtracts this amount from that purchase's
                    contribution to spending instead of counting it as income.
                  </p>
                  <input
                    type="text"
                    value={reimburseSearch}
                    onChange={e => setReimburseSearch(e.target.value)}
                    placeholder="Search recent purchases…"
                    className="w-full p-2 text-sm border border-emerald-200 rounded mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <div className="space-y-1 max-h-44 overflow-auto">
                    {reimburseCandidates.length === 0 && (
                      <div className="text-xs text-gray-500">No matching purchases.</div>
                    )}
                    {reimburseCandidates.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        disabled={reimburseSaving}
                        onClick={() => setReimbursement(p.id)}
                        className="w-full text-left text-xs p-2 rounded hover:bg-emerald-100 disabled:opacity-50 flex justify-between gap-2"
                      >
                        <span className="truncate">{p.description}</span>
                        <span className="text-gray-600 whitespace-nowrap">
                          {p.date} · ${Math.abs(p.amount).toFixed(2)}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          </div>
          {/* Action bar pinned at the bottom — stays visible no matter how
              long the scrollable form body grows. */}
          <div className="flex gap-3 px-6 py-4 border-t border-gray-100 bg-white flex-shrink-0">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingRule}
              className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-indigo-400"
            >
              {savingRule ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
