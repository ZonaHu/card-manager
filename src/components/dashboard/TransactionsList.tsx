import React from 'react';
import type { Transaction, Card, UserRegion } from '../../types';
import { getCategoryColor } from '../../constants/categories';
import { formatCurrency } from '../../utils/currency';
import { findWashedTransactionIds } from '../../utils/spendCalculation';
import { findCrossMonthRefunds } from '../../utils/refundCrossMonth';

interface TransactionsListProps {
  transactions: Transaction[];
  cards: Card[];
  userRegion: UserRegion;
  onTransactionClick: (transaction: Transaction) => void;
  limit?: number;
  // Full history. Needed so a refund visible in the current month can be paired
  // to a purchase posted in a prior month (which isn't in `transactions`).
  allTransactions?: Transaction[];
}

// Inline visual badges to make the dashboard self-explanatory: any
// transaction the spend calc treats specially gets a hint chip so the user
// can see at a glance why a particular row is or isn't affecting their totals.
const Badge: React.FC<{ tone: 'slate' | 'amber' | 'purple' | 'blue'; children: React.ReactNode; title?: string }> = ({ tone, children, title }) => {
  const palette: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700',
    amber: 'bg-amber-100 text-amber-800',
    purple: 'bg-purple-100 text-purple-800',
    blue: 'bg-blue-100 text-blue-800'
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
  allTransactions
}) => {
  // Cheap wash lookup over the visible window so we can badge net-zero pairs.
  const washedIds = React.useMemo(() => findWashedTransactionIds(transactions), [transactions]);
  const crossMonth = React.useMemo(
    () => new Map(findCrossMonthRefunds(allTransactions ?? transactions).map(x => [x.refundId, x])),
    [allTransactions, transactions]
  );
  const displayTransactions = transactions.slice(0, limit);

  if (transactions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No transactions for this month
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
          /\brefund\b|\breversal\b|\breversed\b|merchandise return/i.test(transaction.description || '');
        const isPending = !!transaction.pending;

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
                </div>
                <p className="text-sm text-gray-500">{card?.name} •••• {card?.last_four} • {transaction.category}</p>
                {crossMonth.has(transaction.id) && (
                  <p className="text-[10px] text-blue-600">
                    Refunds a purchase from {crossMonth.get(transaction.id)!.purchaseMonth}
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
