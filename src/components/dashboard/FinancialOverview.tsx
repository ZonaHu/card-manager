import React from 'react';
import { DollarSign, TrendingUp, Calendar } from 'lucide-react';
import type { MonthlyData, UserRegion } from '../../types';
import { formatCurrency } from '../../utils/currency';

interface FinancialOverviewProps {
  monthlyData: MonthlyData;
  userRegion: UserRegion;
  currentMonth: string;
  onMonthChange: (month: string) => void;
}

export const FinancialOverview: React.FC<FinancialOverviewProps> = ({
  monthlyData,
  userRegion,
  currentMonth,
  onMonthChange
}) => {
  const netSpending = monthlyData.spending - monthlyData.income;

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
      <div className="bg-white rounded-xl p-6 shadow-lg">
        <div className="flex items-center gap-3 mb-2">
          <DollarSign className="text-red-600" size={24} />
          <h3 className="text-lg font-semibold text-gray-900">Spending</h3>
        </div>
        <p className="text-2xl font-bold text-red-600">
          {formatCurrency(monthlyData.spending, userRegion.currency)}
        </p>
        <p className="text-sm text-gray-500">{monthlyData.transactions.filter(t => t.amount < 0).length} transactions</p>
      </div>

      {/* Total Income */}
      <div className="bg-white rounded-xl p-6 shadow-lg">
        <div className="flex items-center gap-3 mb-2">
          <TrendingUp className="text-green-600" size={24} />
          <h3 className="text-lg font-semibold text-gray-900">Income</h3>
        </div>
        <p className="text-2xl font-bold text-green-600">
          +{formatCurrency(monthlyData.income, userRegion.currency)}
        </p>
        <p className="text-sm text-gray-500">{monthlyData.transactions.filter(t => t.amount > 0).length} transactions</p>
      </div>

      {/* Net Change */}
      <div className="bg-white rounded-xl p-6 shadow-lg">
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
      </div>
    </div>
  );
};