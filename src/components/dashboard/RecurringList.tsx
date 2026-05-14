import React from 'react';
import { Repeat } from 'lucide-react';
import type { Transaction, UserRegion } from '../../types';
import { detectRecurringTransactions } from '../../utils/recurringDetection';
import { findWashedTransactionIds } from '../../utils/spendCalculation';
import { formatCurrency } from '../../utils/currency';

interface RecurringListProps {
  transactions: Transaction[]; // pass the FULL history, not just current month
  userRegion: UserRegion;
}

/**
 * Surfaces likely subscriptions / recurring debits detected from the user's
 * full transaction history. Helps the user spot forgotten subs and budget the
 * fixed-cost portion of their spending.
 */
export const RecurringList: React.FC<RecurringListProps> = ({ transactions, userRegion }) => {
  const recurring = React.useMemo(() => {
    // Filter out fee/rebate wash pairs first so things like BMO's monthly
    // "[SC]PREMIUM PLAN" charge (canceled by "[SC]FULL PLAN FEE REBATE") don't
    // surface as a recurring subscription cost.
    const washed = findWashedTransactionIds(transactions);
    const clean = transactions.filter(t => !washed.has(t.id));
    return detectRecurringTransactions(clean);
  }, [transactions]);

  if (recurring.length === 0) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-lg">
        <div className="flex items-center gap-2 mb-2">
          <Repeat className="text-purple-600" size={20} />
          <h3 className="text-lg font-semibold text-gray-900">Recurring</h3>
        </div>
        <p className="text-sm text-gray-500">
          No recurring transactions detected yet. Subscriptions and other monthly debits will appear here after a few cycles.
        </p>
      </div>
    );
  }

  const total = recurring.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="bg-white rounded-xl p-6 shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Repeat className="text-purple-600" size={20} />
          <h3 className="text-lg font-semibold text-gray-900">Recurring</h3>
        </div>
        <span className="text-sm text-gray-600">
          ~{formatCurrency(total, userRegion.currency)}/mo
        </span>
      </div>

      <div className="space-y-2 max-h-72 overflow-auto">
        {recurring.map((r, idx) => (
          <div key={idx} className="flex items-center justify-between text-sm">
            <div className="min-w-0 flex-1">
              <div className="text-gray-900 truncate">{r.description}</div>
              <div className="text-xs text-gray-500">
                {r.category} · {r.occurrences}× · every ~{r.averageIntervalDays} days
                {r.minAmount !== r.maxAmount && (
                  <> · {formatCurrency(r.minAmount, userRegion.currency)}–{formatCurrency(r.maxAmount, userRegion.currency)}</>
                )}
              </div>
            </div>
            <div className="text-gray-900 font-medium ml-3">
              {formatCurrency(r.amount, userRegion.currency)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
