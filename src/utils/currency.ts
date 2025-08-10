// Currency formatting utilities

interface CurrencyConfig {
  symbol: string;
  code: string;
  locale: string;
}

const currencies: Record<string, CurrencyConfig> = {
  USD: {
    symbol: '$',
    code: 'USD',
    locale: 'en-US'
  },
  CAD: {
    symbol: 'C$',
    code: 'CAD', 
    locale: 'en-CA'
  }
};

export const formatCurrency = (amount: number, currencyCode: string = 'USD'): string => {
  const config = currencies[currencyCode] || currencies.USD;
  
  try {
    return new Intl.NumberFormat(config.locale, {
      style: 'currency',
      currency: config.code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch (error) {
    // Fallback formatting
    return `${config.symbol}${Math.abs(amount).toFixed(2)}`;
  }
};

export const getCurrencySymbol = (currencyCode: string = 'USD'): string => {
  return currencies[currencyCode]?.symbol || '$';
};

export const getSupportedCurrencies = () => {
  return Object.entries(currencies).map(([code, config]) => ({
    code,
    symbol: config.symbol,
    locale: config.locale
  }));
};

export const getCountryCurrency = (countryCode: string): string => {
  const mapping: Record<string, string> = {
    US: 'USD',
    CA: 'CAD'
  };
  return mapping[countryCode] || 'USD';
};