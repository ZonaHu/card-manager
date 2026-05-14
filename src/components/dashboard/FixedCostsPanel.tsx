import React from 'react';
import { Home, Zap, Wifi, Smartphone, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { Transaction, UserRegion } from '../../types';
import { summarizeFixedCosts, type FixedCostBucket } from '../../utils/fixedCosts';
import { formatCurrency } from '../../utils/currency';

interface Props {
  transactions: Transaction[]; // pass the FULL history; util filters to current+prior month internally
  currentMonth: string;        // YYYY-MM
  userRegion: UserRegion;
  // Called with a search query (vendor label substring) when the user clicks a
  // row. Parent should drop the query into the transactions search and scroll
  // there so the drill-down is visible.
  onItemClick?: (query: string) => void;
}

const BUCKET_ICONS: Record<FixedCostBucket, React.ComponentType<{ size?: number; className?: string }>> = {
  Rent: Home,
  Utilities: Zap,
  Internet: Wifi,
  Mobile: Smartphone
};

const BUCKET_TONES: Record<FixedCostBucket, string> = {
  Rent: 'text-rose-700 bg-rose-50',
  Utilities: 'text-amber-700 bg-amber-50',
  Internet: 'text-indigo-700 bg-indigo-50',
  Mobile: 'text-emerald-700 bg-emerald-50'
};

// Summarizes predictable monthly obligations (rent, utilities, internet,
// mobile) with a MoM delta per vendor so the user can spot a bill that crept
// up. Hidden when none of the detection patterns match — keeps the dashboard
// quiet for users without any of these vendors.
// Map each vendor label back to the substring most likely to filter the
// transactions list well. e.g. "Chexy (Rent)" → "chexy"; the parenthetical
// is a UI affordance, not part of the description.
function searchKeyFor(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

export const FixedCostsPanel: React.FC<Props> = ({ transactions, currentMonth, userRegion, onItemClick }) => {
  const summary = React.useMemo(
    () => summarizeFixedCosts(transactions, currentMonth),
    [transactions, currentMonth]
  );

  if (summary.entries.length === 0) return null;

  const c = userRegion.currency;
  const totalDeltaTone =
    summary.totalDelta > 0 ? 'text-rose-700' :
    summary.totalDelta < 0 ? 'text-emerald-700' :
    'text-gray-500';

  return (
    <div className="bg-white rounded-xl p-6 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Home className="text-indigo-600" size={20} />
          <h3 className="text-lg font-semibold text-gray-900">Fixed monthly costs</h3>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-gray-900">
            {formatCurrency(summary.currentTotal, c)}
          </div>
          <div className={`text-xs font-medium ${totalDeltaTone}`}>
            {summary.totalDelta === 0 && 'same as last month'}
            {summary.totalDelta > 0 && `+${formatCurrency(summary.totalDelta, c)} vs last month`}
            {summary.totalDelta < 0 && `−${formatCurrency(Math.abs(summary.totalDelta), c)} vs last month`}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {summary.entries.map(e => {
          const Icon = BUCKET_ICONS[e.bucket];
          const TrendIcon =
            e.delta > 0 ? TrendingUp :
            e.delta < 0 ? TrendingDown :
            Minus;
          const trendTone =
            e.delta > 0 ? 'text-rose-600' :
            e.delta < 0 ? 'text-emerald-600' :
            'text-gray-400';
          const isMissing = e.currentAmount === 0 && e.priorAmount > 0;
          const clickable = !!onItemClick;
          const Row = clickable ? 'button' : 'div';
          return (
            <Row
              key={e.label}
              type={clickable ? 'button' : undefined}
              onClick={clickable ? () => onItemClick!(searchKeyFor(e.label)) : undefined}
              className={`w-full text-left flex items-center gap-3 p-3 rounded-lg border border-gray-100 ${
                clickable ? 'hover:bg-gray-50 hover:border-indigo-200 cursor-pointer transition-colors' : ''
              }`}
            >
              <div className={`p-2 rounded-lg ${BUCKET_TONES[e.bucket]}`}>
                <Icon size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{e.label}</div>
                <div className="text-xs text-gray-500">
                  {isMissing
                    ? <span className="text-rose-600">not billed yet this month</span>
                    : <>last charge {e.lastDate} · {e.count}× this month</>}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-gray-900">
                  {formatCurrency(e.currentAmount, c)}
                </div>
                <div className={`text-xs flex items-center gap-1 justify-end ${trendTone}`}>
                  <TrendIcon size={12} />
                  {e.delta === 0
                    ? 'flat'
                    : `${e.delta > 0 ? '+' : '−'}${formatCurrency(Math.abs(e.delta), c)}`}
                </div>
              </div>
            </Row>
          );
        })}
      </div>

      <p className="text-xs text-gray-500 mt-3">
        Auto-detected from transaction descriptions. These also show up in the
        regular Spending total — this card just groups them so you can see your
        baseline obligations at a glance.
      </p>
    </div>
  );
};
