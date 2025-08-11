import React from 'react';
import type { TransactionFilter, TransactionSort } from '../../types';
import { CATEGORIES } from '../../constants/categories';

interface TransactionFiltersProps {
  transactionFilter: TransactionFilter;
  transactionSort: TransactionSort;
  onFilterChange: (filter: TransactionFilter) => void;
  onSortChange: (sort: TransactionSort) => void;
}

export const TransactionFilters: React.FC<TransactionFiltersProps> = ({
  transactionFilter,
  transactionSort,
  onFilterChange,
  onSortChange
}) => {
  return (
    <div className="flex items-center gap-2">
      <select
        value={transactionSort}
        onChange={(e) => onSortChange(e.target.value as TransactionSort)}
        className="bg-gray-50 border border-gray-300 rounded-lg px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
      >
        <option value="newest">Newest First</option>
        <option value="oldest">Oldest First</option>
        <option value="highest">Highest Amount</option>
        <option value="lowest">Lowest Amount</option>
      </select>
      
      <select
        value={transactionFilter}
        onChange={(e) => onFilterChange(e.target.value)}
        className="bg-gray-50 border border-gray-300 rounded-lg px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
      >
        <option value="all">All Categories</option>
        {CATEGORIES.map(category => (
          <option key={category} value={category}>{category}</option>
        ))}
      </select>
    </div>
  );
};