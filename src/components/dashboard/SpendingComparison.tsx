import React from 'react';
import { BarChart3, ArrowUp, ArrowDown } from 'lucide-react';
import type { Card, Transaction, UserRegion } from '../../types';
import { computeMonthlyComparison } from '../../utils/monthlyComparison';
import { formatCurrency } from '../../utils/currency';

interface SpendingComparisonProps {
  transactions: Transaction[];
  cards: Card[];
  currentMonth: string;
  userRegion: UserRegion;
}

function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

/**
 * Quick MoM / YoY comparison strip so the user can see if "this month feels
 * expensive" is actually anomalous or just seasonal.
 */
export const SpendingComparison: React.FC<SpendingComparisonProps> = ({
  transactions, cards, currentMonth, userRegion
}) => {
  const cmp = React.useMemo(
    () => computeMonthlyComparison(transactions, cards, currentMonth),
    [transactions, cards, currentMonth]
  );

  const renderDelta = (pct: number | null) => {
    if (pct === null) return <span className="text-gray-400">—</span>;
    const up = pct > 0;
    const Icon = up ? ArrowUp : ArrowDown;
    // Spending UP is bad (red), DOWN is good (green).
    const color = up ? 'text-red-600' : 'text-emerald-600';
    return (
      <span className={`inline-flex items-center gap-0.5 ${color}`}>
        <Icon size={12} />
        {Math.abs(pct).toFixed(1)}%
      </span>
    );
  };

  return (
    <div className="bg-white rounded-xl p-6 shadow-lg">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="text-indigo-600" size={20} />
        <h3 className="text-lg font-semibold text-gray-900">Spending Trend</h3>
      </div>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-xs text-gray-500 mb-1">{monthLabel(cmp.prevYear.month)}</div>
          <div className="text-sm font-medium text-gray-900">
            {formatCurrency(cmp.prevYear.spending, userRegion.currency)}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">{monthLabel(cmp.prevMonth.month)}</div>
          <div className="text-sm font-medium text-gray-900">
            {formatCurrency(cmp.prevMonth.spending, userRegion.currency)}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">
            {monthLabel(cmp.current.month)} <span className="text-indigo-600">·</span> now
          </div>
          <div className="text-base font-semibold text-gray-900">
            {formatCurrency(cmp.current.spending, userRegion.currency)}
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-around text-sm">
        <div>
          <span className="text-gray-500 mr-1">vs last month:</span>
          {renderDelta(cmp.momPct)}
        </div>
        <div>
          <span className="text-gray-500 mr-1">vs last year:</span>
          {renderDelta(cmp.yoyPct)}
        </div>
      </div>
    </div>
  );
};
