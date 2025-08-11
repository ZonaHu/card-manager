export const CATEGORIES = [
  'Food',
  'Shopping', 
  'Transport',
  'Bills',
  'Entertainment',
  'Health',
  'Travel',
  'Income',
  'Other'
] as const;

export type CategoryType = typeof CATEGORIES[number];

export const CATEGORY_COLORS: Record<CategoryType, string> = {
  'Food': 'bg-orange-500',
  'Shopping': 'bg-purple-500',
  'Transport': 'bg-blue-500',
  'Bills': 'bg-red-500',
  'Entertainment': 'bg-pink-500',
  'Health': 'bg-teal-500',
  'Travel': 'bg-indigo-500',
  'Income': 'bg-emerald-500',
  'Other': 'bg-gray-400'
};

export const getCategoryColor = (category: string): string => {
  return CATEGORY_COLORS[category as CategoryType] || CATEGORY_COLORS.Other;
};