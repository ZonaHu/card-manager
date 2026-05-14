import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';
import type { Card, Transaction, UserRegion } from '../../types';
import { computeNetWorthHistory } from '../../utils/netWorthHistory';
import { formatCurrency } from '../../utils/currency';

interface NetWorthChartProps {
  cards: Card[];
  transactions: Transaction[]; // full history, not month-filtered
  userRegion: UserRegion;
}

/**
 * Net-worth time series approximated by walking current balances backwards
 * through historical transactions. See utils/netWorthHistory for details on
 * limitations.
 */
export const NetWorthChart: React.FC<NetWorthChartProps> = ({ cards, transactions, userRegion }) => {
  const data = React.useMemo(
    () => computeNetWorthHistory(cards, transactions),
    [cards, transactions]
  );

  if (data.length < 2) {
    return null;
  }

  const latest = data[data.length - 1].total;
  const earliest = data[0].total;
  const change = latest - earliest;
  const changePct = earliest !== 0 ? (change / Math.abs(earliest)) * 100 : 0;

  return (
    <div className="bg-white rounded-xl p-6 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="text-emerald-600" size={20} />
          <h3 className="text-lg font-semibold text-gray-900">Net Worth</h3>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold text-gray-900">
            {formatCurrency(latest, userRegion.currency)}
          </div>
          <div className={`text-xs ${change >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {change >= 0 ? '+' : ''}{formatCurrency(change, userRegion.currency)} ({changePct.toFixed(1)}%)
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#9ca3af" />
          <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af"
            tickFormatter={(v) => Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v)} />
          <Tooltip
            formatter={(v: number) => formatCurrency(v, userRegion.currency)}
            contentStyle={{ fontSize: 12 }}
          />
          <Line type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-xs text-gray-400 mt-2 leading-snug">
        Approximate. Cash + credit lines are reasonably accurate (current
        balance rolled backward through transactions). Investment / TFSA /
        RRSP accounts show today's balance as a flat line — Plaid's
        <code className="px-1">/investments/transactions</code> API isn't called
        yet, so market-driven changes don't appear in the history.
      </p>
    </div>
  );
};
