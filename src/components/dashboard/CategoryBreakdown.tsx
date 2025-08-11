import React from 'react';
import type { MonthlyData, UserRegion } from '../../types';
import { getCategoryColor } from '../../constants/categories';
import { formatCurrency } from '../../utils/currency';

interface CategoryBreakdownProps {
  monthlyData: MonthlyData;
  userRegion: UserRegion;
  selectedFilter: string;
  onCategoryClick: (category: string) => void;
}

export const CategoryBreakdown: React.FC<CategoryBreakdownProps> = ({
  monthlyData,
  userRegion,
  selectedFilter,
  onCategoryClick
}) => {
  const categories = Object.entries(monthlyData.byCategory)
    .sort(([, a], [, b]) => b - a);

  if (categories.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No spending data for this month
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {categories.map(([category, amount]) => (
        <button 
          key={category} 
          onClick={() => onCategoryClick(category)}
          className={`w-full flex items-center justify-between p-3 rounded-lg transition-all hover:bg-gray-100 ${
            selectedFilter === category ? 'bg-indigo-50 border-2 border-indigo-200' : 'bg-gray-50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-4 h-4 rounded-full ${getCategoryColor(category)}`} />
            <span className="font-medium text-gray-900">{category}</span>
          </div>
          <div className="text-right">
            <div className="font-semibold text-gray-900">
              {formatCurrency(amount as number, userRegion.currency)}
            </div>
            <div className="text-sm text-gray-500">
              {monthlyData.spending > 0 ? ((amount / monthlyData.spending) * 100).toFixed(1) : 0}%
            </div>
          </div>
        </button>
      ))}
    </div>
  );
};