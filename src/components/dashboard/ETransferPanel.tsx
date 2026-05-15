import React from 'react';
import { Send } from 'lucide-react';
import type { Transaction, UserRegion } from '../../types';
import { summarizeETransfers, groupETransfersByCounterparty } from '../../utils/eTransfer';
import { formatCurrency } from '../../utils/currency';

interface Props {
  transactions: Transaction[]; // current-month transactions
  userRegion: UserRegion;
  // Called with the counterparty name when the user clicks a row; parent
  // should drop it into the transactions search and scroll there.
  onItemClick?: (query: string) => void;
}

// Surfaces Interac e-Transfer activity in its own widget. The amounts here are
// NOT counted in monthly spending or income (calculateMonthlyData routes them
// into their own bucket) so the dashboard headline stays clean and the user
// still gets a clear picture of inter-person money movement.
export const ETransferPanel: React.FC<Props> = ({ transactions, userRegion, onItemClick }) => {
  const summary = React.useMemo(() => summarizeETransfers(transactions), [transactions]);
  const groups = React.useMemo(() => groupETransfersByCounterparty(transactions), [transactions]);

  if (summary.countIn === 0 && summary.countOut === 0) return null;

  const c = userRegion.currency;

  return (
    <div className="bg-white rounded-xl p-4 sm:p-6 shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Send className="text-emerald-600" size={20} />
          <h3 className="text-lg font-semibold text-gray-900">E-Transfers</h3>
        </div>
        <span className={`text-sm font-medium ${summary.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
          net {summary.net >= 0 ? '+' : ''}{formatCurrency(summary.net, c)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-emerald-50 rounded-lg p-3">
          <div className="text-xs text-emerald-700 uppercase tracking-wide">Received</div>
          <div className="text-lg font-semibold text-emerald-900">{formatCurrency(summary.totalIn, c)}</div>
          <div className="text-xs text-emerald-700">{summary.countIn} txn{summary.countIn !== 1 ? 's' : ''}</div>
        </div>
        <div className="bg-rose-50 rounded-lg p-3">
          <div className="text-xs text-rose-700 uppercase tracking-wide">Sent</div>
          <div className="text-lg font-semibold text-rose-900">{formatCurrency(summary.totalOut, c)}</div>
          <div className="text-xs text-rose-700">{summary.countOut} txn{summary.countOut !== 1 ? 's' : ''}</div>
        </div>
      </div>

      <p className="text-xs text-gray-500 mb-2">
        Not counted in monthly spending or income. Link an incoming e-Transfer
        to its original purchase from the transaction's edit menu to offset
        that spend.
      </p>

      <div className="space-y-1.5 sm:space-y-2 max-h-56 overflow-auto">
        {groups.slice(0, 10).map(g => {
          const clickable = !!onItemClick;
          const Row = clickable ? 'button' : 'div';
          return (
            <Row
              key={g.counterparty}
              type={clickable ? 'button' : undefined}
              onClick={clickable ? () => onItemClick!(g.counterparty) : undefined}
              className={`w-full text-left flex items-center justify-between text-sm rounded px-1.5 py-1 ${
                clickable ? 'hover:bg-emerald-50 cursor-pointer transition-colors' : ''
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-gray-900 truncate">{g.counterparty}</div>
                <div className="text-xs text-gray-500">
                  {g.count}× · last {g.lastDate}
                </div>
              </div>
              <div className="text-right ml-3">
                {g.totalIn > 0 && (
                  <div className="text-xs text-emerald-700">+{formatCurrency(g.totalIn, c)}</div>
                )}
                {g.totalOut > 0 && (
                  <div className="text-xs text-rose-700">-{formatCurrency(g.totalOut, c)}</div>
                )}
              </div>
            </Row>
          );
        })}
      </div>
    </div>
  );
};
