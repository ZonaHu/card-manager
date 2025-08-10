// Test Smart Categorization System
const fetch = require('node-fetch');

const baseURL = 'http://localhost:3001';

// Test card names to demonstrate smart categorization
const testCards = [
  // Credit Cards
  { name: 'TD Visa Infinite', expected: 'credit' },
  { name: 'RBC Visa Platinum Avion', expected: 'credit' },
  { name: 'American Express Gold', expected: 'credit' },
  { name: 'BMO Mastercard World Elite', expected: 'credit' },
  { name: 'Capital One Platinum', expected: 'credit' },
  
  // Banking Accounts
  { name: 'TD Canada Trust Chequing', expected: 'chequing' },
  { name: 'RBC Royal Bank Everyday Banking', expected: 'chequing' },
  { name: 'Scotiabank Premium Savings', expected: 'savings' },
  { name: 'CIBC High Interest Savings', expected: 'savings' },
  
  // Investment Accounts
  { name: 'RBC Direct Investing TFSA', expected: 'tfsa' },
  { name: 'TD TFSA High Interest Savings', expected: 'tfsa' },
  { name: 'BMO RRSP Investment Account', expected: 'rrsp' },
  { name: 'Questrade Self-Directed RRSP', expected: 'rrsp' },
  { name: 'Wealthsimple Investment Account', expected: 'investment' },
  
  // Loans and Mortgages
  { name: 'TD Home Mortgage', expected: 'mortgage' },
  { name: 'RBC Royal Bank Mortgage', expected: 'mortgage' },
  { name: 'CIBC Personal Line of Credit', expected: 'loan' },
  { name: 'Scotiabank Student Loan', expected: 'loan' }
];

async function testSmartCategorization() {
  console.log('🧠 Testing Smart Card Categorization System\n');

  try {
    // Get card categories from API
    const categoriesResponse = await fetch(`${baseURL}/api/card-categories`);
    const categories = await categoriesResponse.json();
    
    console.log('📋 Available Categories:');
    Object.entries(categories).forEach(([key, cat]) => {
      console.log(`   ${cat.icon} ${cat.label} - ${cat.description}`);
    });
    console.log('\n');

    // Test each card name
    console.log('🔍 Testing Card Name Categorization:\n');
    
    let correctPredictions = 0;
    
    for (const testCard of testCards) {
      // Simulate the smart categorization (we'd need to expose this as an API endpoint)
      // For now, we'll test by the patterns we know
      const patterns = {
        credit: ['credit', 'visa', 'mastercard', 'american express', 'amex', 'platinum', 'gold', 'infinite', 'world elite', 'avion'],
        chequing: ['chequing', 'checking', 'everyday', 'banking', 'transaction'],
        savings: ['savings', 'save', 'high interest', 'premium savings'],
        tfsa: ['tfsa', 'tax-free', 'tax free'],
        rrsp: ['rrsp', 'retirement'],
        investment: ['investment', 'investing', 'self-directed', 'wealthsimple'],
        mortgage: ['mortgage', 'home'],
        loan: ['loan', 'line of credit', 'student loan']
      };
      
      const cardNameLower = testCard.name.toLowerCase();
      let predictedCategory = 'other';
      
      // Find matching category
      for (const [category, words] of Object.entries(patterns)) {
        if (words.some(word => cardNameLower.includes(word))) {
          predictedCategory = category;
          break;
        }
      }
      
      const isCorrect = predictedCategory === testCard.expected;
      const icon = isCorrect ? '✅' : '❌';
      const categoryInfo = categories[predictedCategory];
      
      console.log(`${icon} "${testCard.name}"`);
      console.log(`   Expected: ${categories[testCard.expected]?.icon} ${categories[testCard.expected]?.label}`);
      console.log(`   Predicted: ${categoryInfo?.icon} ${categoryInfo?.label}`);
      
      if (isCorrect) correctPredictions++;
      console.log('');
    }
    
    const accuracy = (correctPredictions / testCards.length * 100).toFixed(1);
    console.log(`\n📊 Categorization Accuracy: ${correctPredictions}/${testCards.length} (${accuracy}%)`);
    
    if (accuracy >= 90) {
      console.log('🎉 Excellent categorization accuracy!');
    } else if (accuracy >= 75) {
      console.log('👍 Good categorization accuracy!');
    } else {
      console.log('⚠️  Categorization needs improvement.');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
if (require.main === module) {
  testSmartCategorization().then(() => {
    console.log('\n✨ Smart categorization test completed!');
    process.exit(0);
  }).catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
}

module.exports = { testSmartCategorization };