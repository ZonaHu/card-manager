import React from 'react';
import type { Transaction, Card, UserRegion } from '../../types';
import { getCategoryColor } from '../../constants/categories';
import { formatCurrency } from '../../utils/currency';
import { findWashedTransactionIds } from '../../utils/spendCalculation';
import { findCrossMonthRefunds } from '../../utils/refundCrossMonth';
import { isETransfer } from '../../utils/eTransfer';
import { REFUND_KEYWORDS } from '../../utils/transactionPatterns';
import { StickyNote } from 'lucide-react';

interface TransactionsListProps {
  transactions: Transaction[];
  cards: Card[];
  userRegion: UserRegion;
  onTransactionClick: (transaction: Transaction) => void;
  limit?: number;
  // Full history. Needed so a refund visible in the current month can be paired
  // to a purchase posted in a prior month (which isn't in `transactions`).
  allTransactions?: Transaction[];
  // True if the current empty state is caused by an active search/chip filter
  // rather than a genuinely empty month. Lets the empty state message
  // suggest "clear filters" instead of "try a different month."
  filtersActive?: boolean;
  onClearFilters?: () => void;
}

// Inline visual badges to make the dashboard self-explanatory: any
// transaction the spend calc treats specially gets a hint chip so the user
// can see at a glance why a particular row is or isn't affecting their totals.
const Badge: React.FC<{ tone: 'slate' | 'amber' | 'purple' | 'blue' | 'emerald'; children: React.ReactNode; title?: string }> = ({ tone, children, title }) => {
  const palette: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700',
    amber: 'bg-amber-100 text-amber-800',
    purple: 'bg-purple-100 text-purple-800',
    blue: 'bg-blue-100 text-blue-800',
    emerald: 'bg-emerald-100 text-emerald-800'
  };
  return (
    <span title={title} className={`text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded ${palette[tone]}`}>
      {children}
    </span>
  );
};

export const TransactionsList: React.FC<TransactionsListProps> = ({
  transactions,
  cards,
  userRegion,
  onTransactionClick,
  limit = 10,
  allTransactions,
  filtersActive,
  onClearFilters
}) => {
  // Cheap wash lookup over the visible window so we can badge net-zero pairs.
  const washedIds = React.useMemo(() => findWashedTransactionIds(transactions), [transactions]);
  const crossMonth = React.useMemo(
    () => new Map(findCrossMonthRefunds(allTransactions ?? transactions).map(x => [x.refundId, x])),
    [allTransactions, transactions]
  );
  // Build a reverse index: purchase.id → array of reimbursements pointing at it.
  // Lets the negative row show "Reimbursed $X" without scanning every render.
  const reimbursementsByPurchase = React.useMemo(() => {
    const map = new Map<number, Transaction[]>();
    for (const t of (allTransactions ?? transactions)) {
      if (typeof t.reimburses_id === 'number' && t.amount > 0) {
        if (!map.has(t.reimburses_id)) map.set(t.reimburses_id, []);
        map.get(t.reimburses_id)!.push(t);
      }
    }
    return map;
  }, [allTransactions, transactions]);
  const purchaseById = React.useMemo(() => {
    const map = new Map<number, Transaction>();
    for (const t of (allTransactions ?? transactions)) map.set(t.id, t);
    return map;
  }, [allTransactions, transactions]);
  const displayTransactions = transactions.slice(0, limit);

  if (transactions.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-gray-100 rounded-full mb-3">
          <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        {filtersActive ? (
          <>
            <p className="text-gray-700 font-medium">No matches for the current filters</p>
            <p className="text-sm text-gray-500 mt-1">
              {onClearFilters
                ? <>Adjust the chips above, or <button onClick={onClearFilters} className="text-indigo-600 hover:underline">clear all filters</button>.</>
                : 'Adjust the search or filter chips above.'}
            </p>
          </>
        ) : (
          <>
            <p className="text-gray-700 font-medium">No transactions this month</p>
            <p className="text-sm text-gray-500 mt-1">
              Try a different month or sync your connected accounts.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {displayTransactions.map(transaction => {
        const card = cards.find(c => c.id === transaction.cardId);
        const isTransfer = transaction.category === 'Transfer';
        const isWashed = washedIds.has(transaction.id);
        const isSplit = transaction.source === 'manual' &&
          /split from/i.test(transaction.description || '');
        const isRefund = transaction.amount > 0 &&
          REFUND_KEYWORDS.test(transaction.description || '');
        const isPending = !!transaction.pending;
        const isETx = isETransfer(transaction);
        const isReimbursement = typeof transaction.reimburses_id === 'number';
        const linkedPurchase = isReimbursement ? purchaseById.get(transaction.reimburses_id as number) : undefined;
        const reimbursedBy = reimbursementsByPurchase.get(transaction.id);
        const reimbursedTotal = reimbursedBy
          ? reimbursedBy.reduce((s, r) => s + r.amount, 0)
          : 0;

        return (
          <button
            key={transaction.id}
            onClick={() => onTransactionClick(transaction)}
            className="w-full flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50 hover:border-gray-200 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${getCategoryColor(transaction.category)}`} />
              <div className="text-left">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-gray-900">{transaction.description}</p>
                  {isTransfer && <Badge tone="slate" title="Not counted in spending or income">Transfer</Badge>}
                  {isWashed && <Badge tone="amber" title="Paired with an opposite-sign entry (e.g. fee + rebate) — net zero">Wash</Badge>}
                  {isSplit && <Badge tone="purple" title="Auto-split off a larger charge by a split rule">Split</Badge>}
                  {isRefund && <Badge tone="blue" title="Merchant refund — subtracted from card spending">Refund</Badge>}
                  {isPending && <Badge tone="blue" title="Not yet posted — excluded from totals until it settles">Pending</Badge>}
                  {isETx && <Badge tone="emerald" title="Interac e-Transfer — not counted in spending or income">E-Transfer</Badge>}
                  {isReimbursement && <Badge tone="emerald" title="Linked to a purchase — offsets that spend instead of counting as income">Reimburse</Badge>}
                </div>
                <p className="text-sm text-gray-500">{card?.name} •••• {card?.last_four} • {transaction.category}</p>
                {crossMonth.has(transaction.id) && (
                  <p className="text-[10px] text-blue-600">
                    Refunds a purchase from {crossMonth.get(transaction.id)!.purchaseMonth}
                  </p>
                )}
                {isReimbursement && linkedPurchase && (
                  <p className="text-[10px] text-emerald-700">
                    Reimburses: {linkedPurchase.description}
                  </p>
                )}
                {reimbursedTotal > 0 && (
                  <p className="text-[10px] text-emerald-700">
                    Reimbursed: -{formatCurrency(reimbursedTotal, userRegion.currency)}
                  </p>
                )}
                {transaction.notes && transaction.notes.trim() && (
                  <p className="text-[11px] text-gray-600 italic mt-1 flex items-start gap-1">
                    <StickyNote size={11} className="text-amber-500 mt-0.5 flex-shrink-0" />
                    <span className="line-clamp-2">{transaction.notes}</span>
                  </p>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className={`font-semibold ${transaction.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {transaction.amount > 0 ? '+' : ''}{formatCurrency(Math.abs(transaction.amount), userRegion.currency)}
              </p>
              {transaction.transaction_currency && card?.currency && transaction.transaction_currency !== card.currency && (
                <p className="text-[10px] text-gray-400">in {transaction.transaction_currency}</p>
              )}
              <p className="text-sm text-gray-500">{transaction.date}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
};
