export function makeMockPlaid(scenario: {
  accounts: any[];
  transactionsSync: { added: any[]; modified?: any[]; removed?: any[]; next_cursor: string; has_more?: boolean };
}) {
  return {
    itemPublicTokenExchange: async () => ({ data: { access_token: 'enc-stub', item_id: 'IT_STUB' } }),
    accountsGet: async () => ({ data: { accounts: scenario.accounts } }),
    // Used by exchange-public-token to import initial transactions (returns empty list so
    // exchange completes without inserting duplicate txns that would affect the sync count).
    transactionsGet: async () => ({ data: { transactions: [], total_transactions: 0 } }),
    transactionsSync: async () => ({ data: {
      added: scenario.transactionsSync.added,
      modified: scenario.transactionsSync.modified || [],
      removed: scenario.transactionsSync.removed || [],
      has_more: scenario.transactionsSync.has_more || false,
      next_cursor: scenario.transactionsSync.next_cursor
    }})
  };
}
