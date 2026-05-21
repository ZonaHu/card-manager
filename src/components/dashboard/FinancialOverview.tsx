import React from 'react';
import { DollarSign, TrendingUp, Calendar } from 'lucide-react';
import type { MonthlyData, UserRegion } from '../../types';
import { formatCurrency } from '../../utils/currency';

interface FinancialOverviewProps {
  monthlyData: MonthlyData;
  userRegion: UserRegion;
  currentMonth: string;
  onMonthChange: (month: string) => void;
  // Generic "scroll without filtering" — used by the Period + Net tiles.
  onScrollToTransactions?: () => void;
  // Drill-down: clicking Spending/Income should filter the list to the rows
  // that actually contributed to that number, not just scroll to an
  // unfiltered view (which is misleading).
  onShowSpendingTransactions?: () => void;
  onShowIncomeTransactions?: () => void;
}

export const FinancialOverview: React.FC<FinancialOverviewProps> = ({
  monthlyData,
  userRegion,
  currentMonth,
  onMonthChange,
  onScrollToTransactions,
  onShowSpendingTransactions,
  onShowIncomeTransactions
}) => {
  // Net cash flow = income - total cash out of deposit accounts (includes CC
  // payments, excludes credit card spending since that's debt, not cash).
  // When the spend calc didn't expose the depository split (older callers),
  // show "—" rather than falling back to total spending — that fallback
  // double-counted credit-card purchases that haven't been paid yet.
  const cashOutflow = monthlyData.depositAccountCashOutflow;
  const netSpending = cashOutflow !== undefined ? cashOutflow - monthlyData.income : null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8">
      {/* Month Selector */}
      <div className="bg-white rounded-xl p-4 sm:p-6 shadow-lg">
        <div className="flex items-center gap-3 mb-2">
          <Calendar className="text-indigo-600 w-5 h-5 sm:w-6 sm:h-6" />
          <h3 className="text-lg font-semibold text-gray-900">Period</h3>
        </div>
        <input
          type="month"
          value={currentMonth}
          onChange={(e) => onMonthChange(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>

      {/* Total Spending — clicking filters the txn list to spending-only rows
          (negative, not pending, not Transfer/Deposit/e-Transfer) so the user
          sees exactly the rows that contributed to the headline number. */}
      <button
        onClick={onShowSpendingTransactions ?? onScrollToTransactions}
        className="bg-white rounded-xl p-4 sm:p-6 shadow-lg hover:shadow-xl transition-all cursor-pointer text-left w-full"
      >
        <div className="flex items-center gap-3 mb-2">
          <DollarSign className="text-red-600 w-5 h-5 sm:w-6 sm:h-6" />
          <h3 className="text-lg font-semibold text-gray-900">Spending</h3>
        </div>
        <p className="text-xl sm:text-2xl font-bold text-red-600">
          {formatCurrency(monthlyData.spending, userRegion.currency)}
        </p>
        <p className="text-sm text-gray-500">
          {monthlyData.spendingTxnCount ?? monthlyData.transactions.filter(t => t.amount < 0).length} transactions
        </p>
        {(monthlyData.reimbursementsApplied ?? 0) > 0 && (
          <p className="text-xs text-emerald-700 mt-1">
            Net of {formatCurrency(monthlyData.reimbursementsApplied!, userRegion.currency)} reimbursements
          </p>
        )}
        {((monthlyData.eTransfersIn ?? 0) + (monthlyData.eTransfersOut ?? 0)) > 0 && (
          <p className="text-xs text-gray-500 mt-0.5">
            E-Transfers excluded — see panel below
          </p>
        )}
      </button>

      {/* Total Income — clicking filters the txn list to category=Income so
          the user sees the rows that actually contributed (mostly payroll +
          tax refunds). Fallback to plain scroll if the parent didn't wire
          the drill-down. */}
      <button
        onClick={onShowIncomeTransactions ?? onScrollToTransactions}
        className="bg-white rounded-xl p-4 sm:p-6 shadow-lg hover:shadow-xl transition-all cursor-pointer text-left w-full"
      >
        <div className="flex items-center gap-3 mb-2">
          <TrendingUp className="text-green-600 w-5 h-5 sm:w-6 sm:h-6" />
          <h3 className="text-lg font-semibold text-gray-900">Income</h3>
        </div>
        <p className="text-xl sm:text-2xl font-bold text-green-600">
          +{formatCurrency(monthlyData.income, userRegion.currency)}
        </p>
        <p className="text-sm text-gray-500">
          {monthlyData.incomeTxnCount ?? monthlyData.transactions.filter(t => t.amount > 0).length} transactions
        </p>
      </button>

      {/* Net Change */}
      <button
        onClick={onScrollToTransactions}
        className="bg-white rounded-xl p-4 sm:p-6 shadow-lg hover:shadow-xl transition-all cursor-pointer text-left w-full"
      >
        <div className="flex items-center gap-3 mb-2">
          <TrendingUp className={`w-5 h-5 sm:w-6 sm:h-6 ${netSpending !== null && netSpending <= 0 ? "text-green-600" : "text-red-600"}`} />
          <h3 className="text-lg font-semibold text-gray-900">Net</h3>
        </div>
        {netSpending === null ? (
          <>
            <p className="text-xl sm:text-2xl font-bold text-gray-400">—</p>
            <p className="text-sm text-gray-500">No depository data</p>
          </>
        ) : (
          <>
            <p className={`text-xl sm:text-2xl font-bold ${netSpending <= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {netSpending > 0 ? '-' : '+'}{formatCurrency(Math.abs(netSpending), userRegion.currency)}
            </p>
            <p className="text-sm text-gray-500">
              {netSpending <= 0 ? 'Positive cash flow' : 'Net spending'}
            </p>
          </>
        )}
      </button>
    </div>
  );
};