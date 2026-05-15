import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import { TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import type { Card, Transaction, UserRegion } from '../../types';
import { computeNetWorthHistory } from '../../utils/netWorthHistory';
import { computeBreakdown } from '../../utils/netWorthBreakdown';
import { formatCurrency } from '../../utils/currency';

interface NetWorthChartProps {
  cards: Card[];
  transactions: Transaction[];
  snapshots?: Array<{ card_id: number; date: string; balance: number }>;
  userRegion: UserRegion;
}

/**
 * Net-worth time series approximated by walking current balances backwards
 * through historical transactions. See utils/netWorthHistory for details on
 * limitations.
 */
export const NetWorthChart: React.FC<NetWorthChartProps> = ({ cards, transactions, snapshots, userRegion }) => {
  const data = React.useMemo(
    () => computeNetWorthHistory(cards, transactions, snapshots),
    [cards, transactions, snapshots]
  );

  if (data.length < 2) {
    return (
      <div className="bg-white rounded-xl p-4 sm:p-6 shadow-lg">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="text-emerald-600" size={20} />
          <h3 className="text-lg font-semibold text-gray-900">Net Worth</h3>
        </div>
        <div className="text-center py-8">
          <p className="text-sm text-gray-700 font-medium mb-1">Not enough history yet</p>
          <p className="text-xs text-gray-500">
            Sync your accounts a few times — once there's at least one prior month of
            transactions or snapshots, the chart line will populate.
          </p>
        </div>
        <NetWorthBreakdown cards={cards} userRegion={userRegion} />
      </div>
    );
  }

  const latest = data[data.length - 1].total;
  const earliest = data[0].total;
  const change = latest - earliest;
  const changePct = earliest !== 0 ? (change / Math.abs(earliest)) * 100 : 0;

  return (
    <div className="bg-white rounded-xl p-4 sm:p-6 shadow-lg">
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
      <div className="h-44 sm:h-52">
      <ResponsiveContainer width="100%" height="100%">
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
      </div>
      <p className="text-xs text-gray-400 mt-2 leading-snug">
        Approximate. Cash + credit lines roll backward through transactions.
        Investment / TFSA / RRSP accounts use end-of-day balance snapshots from
        each sync — so backfill grows with the number of syncs you've done.
      </p>
      {/* Breakdown reflects CURRENT balances (today's Plaid sync), not the
          rolled-back/snapshotted last-eom point — users want "what's in my
          accounts right now," not "what was in them on May 31." */}
      <NetWorthBreakdown cards={cards} userRegion={userRegion} />
    </div>
  );
};

interface BreakdownProps {
  cards: Card[];
  userRegion: UserRegion;
}

const NetWorthBreakdown: React.FC<BreakdownProps> = ({ cards, userRegion }) => {
  const [open, setOpen] = React.useState(false);
  // Build the byCard map from card.balance directly (current sync values)
  // so the breakdown matches the headline tiles + the actual account screen.
  const currentByCard = React.useMemo(() => {
    const m: Record<number, number> = {};
    for (const c of cards) m[c.id] = c.balance;
    return m;
  }, [cards]);
  const breakdown = React.useMemo(() => computeBreakdown(cards, currentByCard), [cards, currentByCard]);
  const c = userRegion.currency;

  if (breakdown.entries.length === 0) return null;

  return (
    <div className="mt-4 border-t border-gray-100 pt-3">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between text-sm text-gray-700 hover:text-gray-900"
      >
        <span className="font-medium">Account breakdown</span>
        <span className="text-xs text-gray-500 flex items-center gap-1">
          {breakdown.entries.length} account{breakdown.entries.length !== 1 ? 's' : ''}
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-emerald-50 rounded p-2">
              <div className="text-emerald-700 uppercase tracking-wide">Assets</div>
              <div className="text-sm font-semibold text-emerald-900">
                {formatCurrency(breakdown.totalAssets, c)}
              </div>
            </div>
            <div className="bg-rose-50 rounded p-2">
              <div className="text-rose-700 uppercase tracking-wide">Liabilities</div>
              <div className="text-sm font-semibold text-rose-900">
                {formatCurrency(breakdown.totalLiabilities, c)}
              </div>
            </div>
          </div>

          <div className="space-y-1.5 max-h-64 overflow-auto">
            {breakdown.entries.map(e => {
              const isAsset = e.kind === 'asset';
              const pct = (e.share * 100).toFixed(1);
              return (
                <div key={e.card_id} className="flex items-center gap-2 text-xs">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-gray-900">{e.name}</span>
                      <span className={`whitespace-nowrap font-medium ${isAsset ? 'text-gray-900' : 'text-rose-700'}`}>
                        {isAsset ? '' : '-'}{formatCurrency(Math.abs(e.balance), c)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded overflow-hidden">
                        <div
                          className={`h-full ${isAsset ? 'bg-emerald-400' : 'bg-rose-400'}`}
                          style={{ width: `${e.share * 100}%` }}
                        />
                      </div>
                      <span className="text-gray-500 whitespace-nowrap w-12 text-right">{pct}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-[10px] text-gray-400">
            Percentages are share of gross net worth (assets + |liabilities|).
            Bar lengths and percentages always sum to 100%.
          </p>
        </div>
      )}
    </div>
  );
};
