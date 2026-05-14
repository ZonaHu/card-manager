import React from 'react';
import { DollarSign, TrendingUp, Calendar } from 'lucide-react';
import type { MonthlyData, UserRegion } from '../../types';
import { formatCurrency } from '../../utils/currency';

interface FinancialOverviewProps {
  monthlyData: MonthlyData;
  userRegion: UserRegion;
  currentMonth: string;
  onMonthChange: (month: string) => void;
  onScrollToTransactions?: () => void;
}

export const FinancialOverview: React.FC<FinancialOverviewProps> = ({
  monthlyData,
  userRegion,
  currentMonth,
  onMonthChange,
  onScrollToTransactions
}) => {
  // Net cash flow = income - total cash out of deposit accounts (includes CC payments,
  // excludes credit card spending since that's debt, not cash).
  // Falls back to (spending - income) if the calculation wasn't split by account type.
  const cashOutflow = monthlyData.depositAccountCashOutflow ?? monthlyData.spending;
  const netSpending = cashOutflow - monthlyData.income;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      {/* Month Selector */}
      <div className="bg-white rounded-xl p-6 shadow-lg">
        <div className="flex items-center gap-3 mb-2">
          <Calendar className="text-indigo-600" size={24} />
          <h3 className="text-lg font-semibold text-gray-900">Period</h3>
        </div>
        <input
          type="month"
          value={currentMonth}
          onChange={(e) => onMonthChange(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>

      {/* Total Spending */}
      <button 
        onClick={onScrollToTransactions}
        className="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-all cursor-pointer text-left w-full"
      >
        <div className="flex items-center gap-3 mb-2">
          <DollarSign className="text-red-600" size={24} />
          <h3 className="text-lg font-semibold text-gray-900">Spending</h3>
        </div>
        <p className="text-2xl font-bold text-red-600">
          {formatCurrency(monthlyData.spending, userRegion.currency)}
        </p>
        <p className="text-sm text-gray-500">{monthlyData.transactions.filter(t => t.amount < 0).length} transactions</p>
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

      {/* Total Income */}
      <button 
        onClick={onScrollToTransactions}
        className="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-all cursor-pointer text-left w-full"
      >
        <div className="flex items-center gap-3 mb-2">
          <TrendingUp className="text-green-600" size={24} />
          <h3 className="text-lg font-semibold text-gray-900">Income</h3>
        </div>
        <p className="text-2xl font-bold text-green-600">
          +{formatCurrency(monthlyData.income, userRegion.currency)}
        </p>
        <p className="text-sm text-gray-500">{monthlyData.transactions.filter(t => t.amount > 0).length} transactions</p>
      </button>

      {/* Net Change */}
      <button 
        onClick={onScrollToTransactions}
        className="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-all cursor-pointer text-left w-full"
      >
        <div className="flex items-center gap-3 mb-2">
          <TrendingUp className={netSpending <= 0 ? "text-green-600" : "text-red-600"} size={24} />
          <h3 className="text-lg font-semibold text-gray-900">Net</h3>
        </div>
        <p className={`text-2xl font-bold ${netSpending <= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {netSpending > 0 ? '-' : '+'}{formatCurrency(Math.abs(netSpending), userRegion.currency)}
        </p>
        <p className="text-sm text-gray-500">
          {netSpending <= 0 ? 'Positive cash flow' : 'Net spending'}
        </p>
      </button>
    </div>
  );
};