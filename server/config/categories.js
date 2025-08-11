// Shared category configuration between frontend and backend
const CATEGORIES = [
  'Food',
  'Shopping', 
  'Transport',
  'Bills',
  'Entertainment',
  'Health',
  'Travel',
  'Income',
  'Other'
];

const mapPlaidCategoryToUserFriendly = (transaction) => {
  // Prefer the newer personal_finance_category if available
  const personalFinanceCategory = transaction.personal_finance_category;
  const legacyCategories = transaction.category;

  // Handle personal_finance_category (newer format)
  if (personalFinanceCategory && personalFinanceCategory.primary) {
    const primary = personalFinanceCategory.primary;
    
    // Map personal finance categories to user-friendly names
    const personalFinanceMappings = {
      'FOOD_AND_DRINK': 'Food',
      'TRANSPORTATION': 'Transport',
      'GENERAL_MERCHANDISE': 'Shopping',
      'ENTERTAINMENT': 'Entertainment',
      'TRAVEL': 'Travel',
      'MEDICAL': 'Health',
      'PERSONAL_CARE': 'Health',
      'BANK_FEES': 'Bills',
      'LOAN_PAYMENTS': 'Bills',
      'RENT_AND_UTILITIES': 'Bills',
      'GENERAL_SERVICES': 'Bills',
      'INCOME': 'Income',
      'TRANSFER_IN': 'Other',
      'TRANSFER_OUT': 'Other',
      'DEPOSIT': 'Other'
    };

    const mappedCategory = personalFinanceMappings[primary];
    if (mappedCategory) {
      return mappedCategory;
    }

    // If no mapping found, use the primary category name cleaned up
    return primary.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  // Fallback to legacy category format
  if (!legacyCategories || legacyCategories.length === 0) {
    return 'Other';
  }

  // Get the most specific category (usually the last one)
  const specificCategory = legacyCategories[legacyCategories.length - 1];

  // Common legacy category mappings
  const legacyCategoryMappings = {
    // Food & Dining
    'Food and Drink': 'Food',
    'Restaurants': 'Food',
    'Fast Food': 'Food',
    'Coffee Shop': 'Food',
    'Bar': 'Food',
    'Nightlife': 'Entertainment',
    
    // Transportation
    'Transportation': 'Transport',
    'Gas Stations': 'Transport',
    'Parking': 'Transport',
    'Public Transportation': 'Transport',
    'Taxi': 'Transport',
    'Ride Share': 'Transport',
    
    // Shopping
    'Shops': 'Shopping',
    'Department Stores': 'Shopping',
    'Clothing and Accessories': 'Shopping',
    'Electronics': 'Shopping',
    'Home Improvement': 'Shopping',
    'Grocery': 'Food',
    'Supermarkets and Other Grocery Stores': 'Food',
    
    // Entertainment
    'Recreation': 'Entertainment',
    'Entertainment': 'Entertainment',
    'Movies and DVDs': 'Entertainment',
    'Music, Video and DVD': 'Entertainment',
    
    // Travel
    'Travel': 'Travel',
    'Airlines and Aviation Services': 'Travel',
    'Lodging': 'Travel',
    'Car Rental': 'Travel',
    
    // Bills & Utilities
    'Payment': 'Bills',
    'Credit Card': 'Bills',
    'Bank Fees': 'Bills',
    'Service Charges': 'Bills',
    'Utilities': 'Bills',
    'Internet and Cable': 'Bills',
    'Mobile Phone': 'Bills',
    'Insurance': 'Bills',
    
    // Health
    'Healthcare': 'Health',
    'Dentist': 'Health',
    'Doctor': 'Health',
    'Pharmacy': 'Health',
    
    // Transfer & Deposits
    'Deposit': 'Other',
    'Transfer In': 'Other',
    'Transfer Out': 'Other',
    'Payroll': 'Income',
    'Interest Earned': 'Income'
  };

  // Check specific category first, then general category
  return legacyCategoryMappings[specificCategory] || 
         legacyCategoryMappings[legacyCategories[0]] || 
         'Other';
};

module.exports = {
  CATEGORIES,
  mapPlaidCategoryToUserFriendly
};