// Account-type categorization. Combines name/institution/Plaid hints to pick
// one of the user-facing categories (credit, chequing, savings, tfsa, rrsp,
// investment, mortgage, loan, other). Pure module — no db, no env.

const CARD_CATEGORIES = {
  credit:     { label: 'Credit Card',        icon: '', color: 'blue',    description: 'Credit cards and lines of credit' },
  chequing:   { label: 'Chequing Account',   icon: '', color: 'green',   description: 'Primary banking and spending account' },
  savings:    { label: 'Savings Account',    icon: '', color: 'emerald', description: 'Savings and high-interest accounts' },
  tfsa:       { label: 'TFSA',               icon: '', color: 'purple',  description: 'Tax-Free Savings Account' },
  rrsp:       { label: 'RRSP',               icon: '', color: 'indigo',  description: 'Registered Retirement Savings Plan' },
  investment: { label: 'Investment Account', icon: '', color: 'violet',  description: 'Brokerage and investment accounts' },
  mortgage:   { label: 'Mortgage',           icon: '', color: 'orange',  description: 'Home mortgage and property loans' },
  loan:       { label: 'Loan',               icon: '', color: 'red',     description: 'Personal loans and credit lines' },
  other:      { label: 'Other',              icon: '', color: 'gray',    description: 'Other financial accounts' }
};

const CATEGORIZATION_PATTERNS = {
  credit: [
    'credit card', 'credit', 'mastercard', 'visa', 'american express', 'amex',
    'discover', 'capital one', 'chase', 'citi', 'cibc visa', 'td visa', 'rbc visa',
    'bmo mastercard', 'scotiabank visa', 'aeroplan', 'rewards', 'cashback',
    'platinum', 'gold', 'black', 'infinite', 'world elite', 'signature'
  ],
  chequing: [
    'chequing', 'checking', 'current', 'everyday', 'daily', 'operating',
    'primary', 'main account', 'transaction', 'debit', 'spending',
    'plus account', 'advantage', 'premium chequing', 'performance chequing'
  ],
  savings: [
    'savings', 'save', 'high interest', 'premium savings', 'esavings',
    'money market', 'reserve', 'growth', 'accumulator', 'builder',
    'momentum savings', 'high yield', 'interest plus'
  ],
  tfsa: [
    'tfsa', 'tax-free savings', 'tax free savings', 'tfs account',
    'tfsa savings', 'tfsa investment', 'tfsa high interest'
  ],
  rrsp: [
    'rrsp', 'retirement savings', 'registered retirement', 'retirement plan',
    'pension', 'retirement income', 'retirement investment'
  ],
  investment: [
    'investment', 'brokerage', 'trading', 'portfolio', 'mutual fund',
    'etf', 'stocks', 'bonds', 'securities', 'wealth management',
    'self-directed', 'margin', 'cash account', 'investorline', 'direct investing'
  ],
  mortgage: [
    'mortgage', 'home loan', 'property loan', 'real estate loan',
    'housing loan', 'home equity', 'heloc', 'line of credit secured'
  ],
  loan: [
    'personal loan', 'line of credit', 'loc', 'overdraft', 'student loan',
    'auto loan', 'car loan', 'vehicle loan', 'unsecured loan', 'term loan',
    'installment loan', 'personal line'
  ]
};

function categorizeAccountByPlaid(plaidType, plaidSubtype) {
  const type = plaidType && plaidType.toLowerCase();
  const subtype = plaidSubtype && plaidSubtype.toLowerCase();
  if (type === 'credit' || (subtype && subtype.includes('credit'))) return 'credit';
  if (type === 'investment') {
    if (subtype && (subtype.includes('tfsa') || subtype.includes('tax free'))) return 'tfsa';
    if (subtype && (subtype.includes('rrsp') || subtype.includes('retirement'))) return 'rrsp';
    return 'investment';
  }
  if (type === 'depository') {
    if (subtype && (subtype.includes('savings') || subtype.includes('money market'))) return 'savings';
    if (subtype && (subtype.includes('checking') || subtype.includes('chequing'))) return 'chequing';
    return 'chequing';
  }
  if (type === 'loan') {
    if (subtype && (subtype.includes('mortgage') || subtype.includes('home'))) return 'mortgage';
    return 'loan';
  }
  return 'other';
}

function smartCategorizeAccount(accountName, institutionName, plaidType, plaidSubtype) {
  const fullText = [accountName || '', institutionName || '', plaidSubtype || ''].join(' ').toLowerCase();
  for (const [category, patterns] of Object.entries(CATEGORIZATION_PATTERNS)) {
    for (const pattern of patterns) {
      if (fullText.includes(pattern.toLowerCase())) return category;
    }
  }
  return categorizeAccountByPlaid(plaidType, plaidSubtype);
}

module.exports = {
  CARD_CATEGORIES,
  CATEGORIZATION_PATTERNS,
  smartCategorizeAccount,
  categorizeAccountByPlaid
};
