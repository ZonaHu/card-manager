const { PlaidApi, Configuration, PlaidEnvironments } = require('plaid');
const { mapPlaidCategoryToUserFriendly } = require('../config/categories');

class PlaidService {
  constructor() {
    this.configuration = new Configuration({
      basePath: PlaidEnvironments.sandbox,
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
          'PLAID-SECRET': process.env.PLAID_SECRET,
        },
      },
    });
    this.client = new PlaidApi(this.configuration);
  }

  async createLinkToken(userId, countryCode = 'US') {
    console.log('Creating Plaid link token for user:', userId);
    console.log('Plaid environment:', PlaidEnvironments.sandbox);
    console.log('Plaid client ID configured:', !!process.env.PLAID_CLIENT_ID);

    const request = {
      user: {
        client_user_id: userId.toString(),
      },
      client_name: 'Card Manager',
      products: ['transactions'],
      country_codes: [countryCode],
      language: 'en',
    };

    console.log('Plaid request:', JSON.stringify(request, null, 2));

    try {
      const createTokenResponse = await this.client.linkTokenCreate(request);
      console.log('Plaid link token created successfully');
      return createTokenResponse.data.link_token;
    } catch (error) {
      console.error('Error creating Plaid link token:', error);
      throw error;
    }
  }

  async exchangePublicToken(publicToken) {
    const request = {
      public_token: publicToken,
    };

    const response = await this.client.linkTokenExchange(request);
    return {
      access_token: response.data.access_token,
      item_id: response.data.item_id
    };
  }

  async getAccounts(accessToken) {
    const request = {
      access_token: accessToken,
    };

    const response = await this.client.accountsGet(request);
    return response.data.accounts;
  }

  async getTransactions(accessToken, startDate, endDate, count = 500, offset = 0) {
    const request = {
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
      count,
      offset,
    };

    const response = await this.client.transactionsGet(request);
    return {
      transactions: response.data.transactions.map(transaction => ({
        ...transaction,
        mappedCategory: mapPlaidCategoryToUserFriendly(transaction)
      })),
      total_transactions: response.data.total_transactions
    };
  }

  async syncTransactionsForUser(db, userId, months = 3) {
    console.log('Syncing all transaction histories for user:', userId);
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(endDate.getMonth() - months);
    
    console.log(`Syncing transactions from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

    // Get all access tokens for this user
    const accessTokens = await new Promise((resolve, reject) => {
      db.all(
        'SELECT DISTINCT access_token FROM cards WHERE user_id = ? AND access_token IS NOT NULL',
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(row => row.access_token));
        }
      );
    });

    console.log(`Found ${accessTokens.length} Plaid-connected cards`);
    
    let totalSynced = 0;
    let newTransactions = 0;

    for (const accessToken of accessTokens) {
      try {
        // Get cards for this access token
        const cards = await new Promise((resolve, reject) => {
          db.all(
            'SELECT * FROM cards WHERE user_id = ? AND access_token = ?',
            [userId, accessToken],
            (err, rows) => {
              if (err) reject(err);
              else resolve(rows);
            }
          );
        });

        console.log(`Processing ${cards.length} accounts for access token`);

        // Get transactions from Plaid
        const { transactions } = await this.getTransactions(
          accessToken,
          startDate.toISOString().split('T')[0],
          endDate.toISOString().split('T')[0]
        );

        console.log(`Retrieved ${transactions.length} transactions from Plaid`);

        // Process each transaction
        for (const transaction of transactions) {
          console.log('Processing transaction:', {
            name: transaction.name,
            amount: transaction.amount,
            category: transaction.category,
            personal_finance_category: transaction.personal_finance_category,
            mappedCategory: transaction.mappedCategory
          });

          const matchingCard = cards.find(card => card.plaid_id === transaction.account_id);
          if (!matchingCard) continue;

          // Check if transaction already exists
          const existingTransaction = await new Promise((resolve, reject) => {
            db.get(
              'SELECT id FROM transactions WHERE plaid_transaction_id = ?',
              [transaction.transaction_id],
              (err, row) => {
                if (err) reject(err);
                else resolve(row);
              }
            );
          });

          // Only insert if transaction doesn't exist
          if (!existingTransaction) {
            await new Promise((resolve, reject) => {
              db.run(
                'INSERT INTO transactions (user_id, card_id, amount, description, category, date, source, plaid_transaction_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [
                  userId,
                  matchingCard.id,
                  -transaction.amount,
                  transaction.name,
                  transaction.mappedCategory,
                  transaction.date,
                  'plaid',
                  transaction.transaction_id
                ],
                function(err) {
                  if (err) reject(err);
                  else resolve();
                }
              );
            });
            newTransactions++;
          }
          totalSynced++;
        }
      } catch (error) {
        console.error('Error processing access token:', error);
      }
    }

    return {
      totalSynced,
      newTransactions,
      message: `Successfully synced ${newTransactions} new transactions (${totalSynced} total processed)`
    };
  }
}

module.exports = PlaidService;