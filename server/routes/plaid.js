const express = require('express');
const logger = require('../utils/logger');

// Mounted at /api/plaid. Owns the Plaid Link lifecycle (create, exchange,
// update-mode reauth, sync) plus the recategorize endpoint that re-pulls
// transactions to refresh their category labels.
module.exports = function makePlaidRoutes(deps) {
  const {
    db,
    authenticateToken,
    plaidClient,
    encryptSecret,
    decryptSecret,
    smartCategorizeAccount,
    mapPlaidCategoryToUserFriendly,
    CARD_CATEGORIES,
    REAUTH_ERROR_CODES,
    markCardsNeedReauth,
    clearCardsReauth,
    reconcileRemovedTransactions,
    sendServerError,
    sendClientError,
    loadRules,
    applyRules,
    loadSplitRules,
    findMatchingRule,
    applySplit,
    plaidItems
  } = deps;

  // After inserting a Plaid transaction, check if it triggers any split rule.
  // If yes, mutate the just-inserted row to its grocery-only amount and add
  // a sibling -$N row with the user-chosen split category (e.g. Transfer).
  async function maybeSplitInsertedTransaction(txnId, originalAmount, userId, cardId, date, splitRules, description) {
    if (!splitRules || splitRules.length === 0) return;
    const rule = findMatchingRule(splitRules, { amount: originalAmount, description, card_id: cardId });
    if (!rule) return;
    await applySplit(db, txnId, originalAmount, userId, cardId, date, rule);
  }

  // Categorize a Plaid transaction taking user-defined merchant overrides
  // into account. Falls back to the standard Plaid mapping.
  function categorizeWithRules(transaction, rules) {
    const override = applyRules(transaction.name, rules);
    return override || mapPlaidCategoryToUserFriendly(transaction);
  }

  const router = express.Router();

  router.post('/create-link-token', authenticateToken, async (req, res) => {
    try {
      const userPrefs = await new Promise((resolve, reject) => {
        db.get('SELECT country, preferred_currency FROM users WHERE id = ?', [req.user.userId],
          (err, user) => err ? reject(err) : resolve(user));
      });

      const country = (userPrefs && userPrefs.country) || 'US';
      const countryCodes = country === 'CA' ? ['CA'] : ['US'];

      const response = await plaidClient.linkTokenCreate({
        user: { client_user_id: req.user.userId.toString() },
        client_name: 'Card Manager',
        products: ['transactions'],
        country_codes: countryCodes,
        language: 'en'
      });

      res.json({
        link_token: response.data.link_token,
        country,
        currency: (userPrefs && userPrefs.preferred_currency) || (country === 'CA' ? 'CAD' : 'USD')
      });
    } catch (error) {
      sendServerError(res, error, 'Failed to create link token');
    }
  });

  // Update-mode link token. Used when Plaid returns ITEM_LOGIN_REQUIRED etc.; the Link SDK
  // skips institution selection and walks the user through re-verifying credentials for a
  // specific existing item. access_token must be included in the request; no `products` array.
  router.post('/create-link-token-update', authenticateToken, async (req, res) => {
    try {
      const itemId = req.body && req.body.item_id ? String(req.body.item_id) : null;
      if (!itemId) return sendClientError(res, 'item_id is required');

      const row = await new Promise((resolve, reject) => {
        db.get(
          'SELECT access_token FROM cards WHERE item_id = ? AND user_id = ? AND access_token IS NOT NULL LIMIT 1',
          [itemId, req.user.userId],
          (err, r) => err ? reject(err) : resolve(r)
        );
      });
      if (!row || !row.access_token) return sendClientError(res, 'Item not found', 404);

      const userPrefs = await new Promise((resolve, reject) => {
        db.get('SELECT country FROM users WHERE id = ?', [req.user.userId],
          (err, user) => err ? reject(err) : resolve(user));
      });
      const country = (userPrefs && userPrefs.country) || 'US';

      const response = await plaidClient.linkTokenCreate({
        user: { client_user_id: req.user.userId.toString() },
        client_name: 'Card Manager',
        country_codes: country === 'CA' ? ['CA'] : ['US'],
        language: 'en',
        access_token: decryptSecret(row.access_token)
      });

      res.json({ link_token: response.data.link_token, item_id: itemId });
    } catch (error) {
      sendServerError(res, error, 'Failed to create update link token');
    }
  });

  // After the user finishes Link update mode, Plaid still returns the same access_token
  // so we just clear the reauth flag. The next sync will re-verify.
  router.post('/update-complete', authenticateToken, async (req, res) => {
    try {
      const itemId = req.body && req.body.item_id ? String(req.body.item_id) : null;
      if (!itemId) return sendClientError(res, 'item_id is required');

      const rows = await new Promise((resolve, reject) => {
        db.all(
          'SELECT id FROM cards WHERE item_id = ? AND user_id = ?',
          [itemId, req.user.userId],
          (err, r) => err ? reject(err) : resolve(r)
        );
      });
      if (!rows || rows.length === 0) return sendClientError(res, 'Item not found', 404);

      await clearCardsReauth(rows.map(r => r.id));
      res.json({ message: 'Reauthentication cleared', itemsUpdated: rows.length });
    } catch (error) {
      sendServerError(res, error, 'Failed to clear reauth state');
    }
  });

  router.post('/exchange-public-token', authenticateToken, async (req, res) => {
    try {
      const { public_token, institution } = req.body;
      const exchangeResponse = await plaidClient.itemPublicTokenExchange({ public_token });
      const access_token = exchangeResponse.data.access_token;
      const item_id = exchangeResponse.data.item_id;

      const accountsResponse = await plaidClient.accountsGet({ access_token });
      const accounts = accountsResponse.data.accounts;

      const userCurrency = await new Promise((resolve, reject) => {
        db.get('SELECT preferred_currency FROM users WHERE id = ?', [req.user.userId],
          (err, user) => err ? reject(err) : resolve((user && user.preferred_currency) || 'USD'));
      });

      // Persist the Plaid item itself before the cards so each card row can FK
      // to its plaid_items.id. Sync iterates plaid_items, so skipping this would
      // leave the new connection invisible to incremental sync.
      const encryptedToken = encryptSecret(access_token);
      const itemPk = await plaidItems.upsertItem(db, req.user.userId, {
        item_id,
        institution_name: institution.name,
        access_token: encryptedToken
      });

      const insertPromises = accounts.map(account => new Promise((resolve, reject) => {
        const accountName = `${institution.name} ${account.subtype || account.type}`;
        const category = smartCategorizeAccount(accountName, institution.name, account.type, account.subtype);

        db.run(
          'INSERT INTO cards (user_id, name, type, last_four, balance, currency, plaid_id, connected, access_token, item_id, plaid_item_pk, category, institution_name, account_subtype) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            req.user.userId,
            accountName,
            account.type === 'credit' ? 'credit' : 'debit',
            account.mask || '0000',
            account.balances.current || 0,
            userCurrency,
            account.account_id,
            true,
            encryptedToken,
            item_id,
            itemPk,
            category,
            institution.name,
            account.subtype
          ],
          function (err) {
            if (err) return reject(err);
            resolve({
              id: this.lastID,
              name: accountName,
              type: account.type === 'credit' ? 'credit' : 'debit',
              last_four: account.mask || '0000',
              balance: account.balances.current || 0,
              currency: userCurrency,
              plaid_id: account.account_id,
              connected: true,
              item_id,
              category,
              institution_name: institution.name,
              account_subtype: account.subtype,
              categoryInfo: CARD_CATEGORIES[category] || CARD_CATEGORIES.other
            });
          }
        );
      }));

      const savedAccounts = await Promise.all(insertPromises);

      const transactionsResponse = await plaidClient.transactionsGet({
        access_token,
        start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0]
      });

      const rules = await loadRules(db, req.user.userId);

      const transactionPromises = transactionsResponse.data.transactions.map(transaction => {
        const matchingAccount = savedAccounts.find(acc => acc.plaid_id === transaction.account_id);
        if (!matchingAccount) return Promise.resolve();
        return new Promise((resolve, reject) => {
          db.run(
            `INSERT INTO transactions
               (user_id, card_id, amount, description, category, date, source,
                plaid_transaction_id, pending, transaction_currency, original_amount)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              req.user.userId,
              matchingAccount.id,
              -transaction.amount, // Plaid uses positive for outgoing, we use negative
              transaction.name,
              categorizeWithRules(transaction, rules),
              transaction.date,
              'plaid',
              transaction.transaction_id,
              transaction.pending ? 1 : 0,
              transaction.iso_currency_code || transaction.unofficial_currency_code || null,
              transaction.amount
            ],
            function (err) {
              if (err && !err.message.includes('UNIQUE constraint failed')) reject(err);
              else resolve();
            }
          );
        });
      });

      await Promise.all(transactionPromises);

      res.json({
        accounts: savedAccounts,
        message: 'Successfully connected accounts and imported transactions'
      });
    } catch (error) {
      sendServerError(res, error, 'Failed to connect accounts');
    }
  });

  // Shared per-item sync work used by both /sync-transactions (last 30 days) and
  // /sync-all-transactions (configurable window). All inserts run inside one
  // DB transaction; reconcileRemovedTransactions only fires if pagination is
  // complete so we never falsely delete on a partial response.
  async function syncWindow({ userId, cards, accessToken, startDateStr, endDateStr, rules = [] }) {
    const transactionsResponse = await plaidClient.transactionsGet({
      access_token: accessToken,
      start_date: startDateStr,
      end_date: endDateStr
    });
    const transactions = transactionsResponse.data.transactions;
    const totalAvailable = transactionsResponse.data.total_transactions || transactions.length;

    let newTransactions = 0;
    let totalSynced = 0;

    await new Promise((resolve, reject) =>
      db.run('BEGIN IMMEDIATE', err => err ? reject(err) : resolve()));
    try {
      for (const transaction of transactions) {
        const matchingCard = cards.find(c => c.plaid_id === transaction.account_id);
        if (!matchingCard) continue;

        const existing = await new Promise((resolve, reject) => {
          db.get(
            'SELECT id FROM transactions WHERE plaid_transaction_id = ?',
            [transaction.transaction_id],
            (err, row) => err ? reject(err) : resolve(row)
          );
        });

        if (!existing) {
          await new Promise((resolve, reject) => {
            db.run(
              `INSERT INTO transactions
                 (user_id, card_id, amount, description, category, date, source,
                  plaid_transaction_id, pending, transaction_currency, original_amount)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                userId,
                matchingCard.id,
                -transaction.amount,
                transaction.name,
                categorizeWithRules(transaction, rules),
                transaction.date,
                'plaid',
                transaction.transaction_id,
                transaction.pending ? 1 : 0,
                transaction.iso_currency_code || transaction.unofficial_currency_code || null,
                transaction.amount
              ],
              function (err) { err ? reject(err) : resolve(); }
            );
          });
          newTransactions++;
        }
        totalSynced++;
      }

      if (transactions.length >= totalAvailable) {
        const returnedIds = new Set(transactions.map(t => t.transaction_id));
        const cardIds = cards.map(c => c.id);
        const removedCount = await reconcileRemovedTransactions(
          userId, cardIds, startDateStr, endDateStr, returnedIds
        );
        if (removedCount > 0) logger.info('reconciled removed transactions', { count: removedCount });
      }

      await new Promise((resolve, reject) =>
        db.run('COMMIT', err => err ? reject(err) : resolve()));
    } catch (txErr) {
      await new Promise(resolve => db.run('ROLLBACK', () => resolve()));
      throw txErr;
    }

    const accountsResponse = await plaidClient.accountsGet({ access_token: accessToken });
    for (const account of accountsResponse.data.accounts) {
      const matchingCard = cards.find(c => c.plaid_id === account.account_id);
      if (matchingCard) {
        await new Promise((resolve, reject) => {
          db.run(
            'UPDATE cards SET balance = ? WHERE id = ?',
            [account.balances.current || 0, matchingCard.id],
            err => err ? reject(err) : resolve()
          );
        });
      }
    }

    await clearCardsReauth(cards.map(c => c.id));

    // Stamp the successful sync time so the UI can show "synced X min ago".
    const cardIdsSql = cards.map(() => '?').join(',');
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE cards SET last_synced_at = CURRENT_TIMESTAMP, last_sync_attempt_at = CURRENT_TIMESTAMP, last_sync_error = NULL WHERE id IN (${cardIdsSql})`,
        cards.map(c => c.id),
        err => err ? reject(err) : resolve()
      );
    });

    return { totalSynced, newTransactions };
  }

  // Cursor-based sync via Plaid's transactionsSync API. Replaces the
  // window-based syncWindow for incremental refreshes: Plaid returns added,
  // modified, and removed deltas natively so we don't need to reconcile a
  // window ourselves. Cursor + reauth state live on the plaid_items table
  // (one row per Plaid item); cards mirror those fields only for legacy
  // compatibility — sync reads and writes through `plaidItems.*` helpers.
  async function syncIncremental({ userId, cards, accessToken, itemPk, cursor, rules = [], splitRules = [] }) {
    const added = [];
    const modified = [];
    const removed = [];
    let nextCursor = cursor || null;
    let hasMore = true;
    let pageGuard = 0;

    while (hasMore) {
      if (++pageGuard > 200) {
        logger.warn('transactionsSync paging guard reached', { pages: pageGuard, userId, itemPk });
        break;
      }
      const req = { access_token: accessToken, count: 500 };
      if (nextCursor) req.cursor = nextCursor;
      const resp = await plaidClient.transactionsSync(req);
      const d = resp.data;
      added.push(...d.added);
      modified.push(...d.modified);
      removed.push(...d.removed);
      hasMore = !!d.has_more;
      nextCursor = d.next_cursor || nextCursor;
    }

    if (added.length > 10000) {
      logger.warn('large backfill', { added: added.length, userId, itemPk });
    }

    let newTransactions = 0;
    let updated = 0;
    let removedCount = 0;

    await new Promise((resolve, reject) =>
      db.run('BEGIN IMMEDIATE', err => err ? reject(err) : resolve()));
    try {
      for (const t of added) {
        const matchingCard = cards.find(c => c.plaid_id === t.account_id);
        if (!matchingCard) continue;
        const storedAmount = -t.amount;
        const inserted = await new Promise((resolve, reject) => {
          db.run(
            `INSERT INTO transactions
               (user_id, card_id, amount, description, category, date, source,
                plaid_transaction_id, pending, transaction_currency, original_amount)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              userId, matchingCard.id, storedAmount, t.name,
              categorizeWithRules(t, rules), t.date, 'plaid', t.transaction_id,
              t.pending ? 1 : 0,
              t.iso_currency_code || t.unofficial_currency_code || null,
              t.amount
            ],
            function (err) {
              if (err && err.message.includes('UNIQUE constraint failed')) return resolve({ inserted: false, id: null });
              if (err) return reject(err);
              resolve({ inserted: true, id: this.lastID });
            }
          );
        });
        if (inserted.inserted) {
          newTransactions++;
          await maybeSplitInsertedTransaction(inserted.id, storedAmount, userId, matchingCard.id, t.date, splitRules, t.name);
        }
      }

      for (const t of modified) {
        // Update fields that Plaid may change: amount, description, category, date.
        const matchingCard = cards.find(c => c.plaid_id === t.account_id);
        if (!matchingCard) continue;
        await new Promise((resolve, reject) => {
          db.run(
            'UPDATE transactions SET amount = ?, description = ?, category = ?, date = ?, card_id = ?, pending = ?, transaction_currency = ?, original_amount = ? WHERE plaid_transaction_id = ? AND user_id = ?',
            [
              -t.amount, t.name, categorizeWithRules(t, rules), t.date,
              matchingCard.id,
              t.pending ? 1 : 0,
              t.iso_currency_code || t.unofficial_currency_code || null,
              t.amount,
              t.transaction_id, userId
            ],
            function (err) { if (err) return reject(err); updated += this.changes; resolve(); }
          );
        });
      }

      for (const r of removed) {
        await new Promise((resolve, reject) => {
          db.run(
            'DELETE FROM transactions WHERE plaid_transaction_id = ? AND user_id = ?',
            [r.transaction_id, userId],
            function (err) { if (err) return reject(err); removedCount += this.changes; resolve(); }
          );
        });
      }

      // Persist the new cursor on plaid_items. Skip if we never got a cursor
      // (initial empty response with !has_more on a brand-new item).
      if (nextCursor && itemPk) {
        await plaidItems.updateCursor(db, itemPk, nextCursor);
      }

      await new Promise((resolve, reject) =>
        db.run('COMMIT', err => err ? reject(err) : resolve()));
    } catch (txErr) {
      await new Promise(resolve => db.run('ROLLBACK', () => resolve()));
      throw txErr;
    }

    // Balances + reauth-clear + last-synced timestamp — unchanged from window sync.
    const accountsResponse = await plaidClient.accountsGet({ access_token: accessToken });
    for (const account of accountsResponse.data.accounts) {
      const matchingCard = cards.find(c => c.plaid_id === account.account_id);
      if (matchingCard) {
        await new Promise((resolve, reject) => {
          db.run('UPDATE cards SET balance = ? WHERE id = ?',
            [account.balances.current || 0, matchingCard.id],
            err => err ? reject(err) : resolve());
        });
      }
    }
    await clearCardsReauth(cards.map(c => c.id));
    const placeholders = cards.map(() => '?').join(',');
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE cards SET last_synced_at = CURRENT_TIMESTAMP, last_sync_attempt_at = CURRENT_TIMESTAMP, last_sync_error = NULL WHERE id IN (${placeholders})`,
        cards.map(c => c.id),
        err => err ? reject(err) : resolve()
      );
    });

    return { added: newTransactions, modified: updated, removed: removedCount };
  }

  async function handleSyncTokenError(tokenError, cards, itemPk) {
    const code = tokenError.response?.data?.error_code;
    const errMsg = code || tokenError.message || 'unknown';
    logger.error('sync error', {
      errorCode: code || 'unknown',
      upstream: tokenError.response?.data,
      message: tokenError.message
    });

    // Record the failure on every card sharing this item so the UI can show
    // "last attempt 5m ago — ITEM_LOGIN_REQUIRED" instead of stale "synced 5d ago".
    const placeholders = cards.map(() => '?').join(',');
    await new Promise(resolve => db.run(
      `UPDATE cards SET last_sync_attempt_at = CURRENT_TIMESTAMP, last_sync_error = ? WHERE id IN (${placeholders})`,
      [errMsg, ...cards.map(c => c.id)],
      () => resolve()
    ));

    if (code === 'INVALID_ACCESS_TOKEN') {
      // Item gone — token wiped, user must reconnect from scratch via full Link flow.
      for (const card of cards) {
        await new Promise((resolve, reject) => {
          db.run(
            'UPDATE cards SET connected = FALSE, access_token = NULL, item_id = NULL, needs_reauth = 0, reauth_error_code = NULL WHERE id = ?',
            [card.id],
            err => err ? reject(err) : resolve()
          );
        });
      }
      if (itemPk) {
        await new Promise((r, j) =>
          db.run('DELETE FROM plaid_items WHERE id = ?', [itemPk], e => e ? j(e) : r()));
      }
    } else if (REAUTH_ERROR_CODES.has(code)) {
      // Recoverable: user needs Link update mode. Keep access_token intact.
      await markCardsNeedReauth(cards.map(c => c.id), code);
      if (itemPk) await plaidItems.markItemReauth(db, itemPk, code);
    }
  }

  async function loadDecryptedPlaidCards(userId) {
    const cards = await new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM cards WHERE user_id = ? AND plaid_id IS NOT NULL AND access_token IS NOT NULL',
        [userId],
        (err, rows) => err ? reject(err) : resolve(rows)
      );
    });
    cards.forEach(c => { c.access_token = decryptSecret(c.access_token); });
    return cards;
  }

  router.post('/sync-transactions', authenticateToken, async (req, res) => {
    try {
      const items = await plaidItems.loadItemsForUser(db, req.user.userId);
      if (items.length === 0) {
        return res.status(400).json({ error: 'No Plaid-connected accounts found. Please connect your bank account first.' });
      }

      const allPlaidCards = await loadDecryptedPlaidCards(req.user.userId);
      const rules = await loadRules(db, req.user.userId);
      const splitRules = await loadSplitRules(db, req.user.userId);

      let totalAdded = 0;
      let totalModified = 0;
      let totalRemoved = 0;

      for (const item of items) {
        if (item.needs_reauth) continue;
        const itemCards = allPlaidCards.filter(c => c.item_id === item.item_id);
        if (itemCards.length === 0) continue;
        const accessToken = decryptSecret(item.access_token);
        try {
          const result = await syncIncremental({
            userId: req.user.userId, cards: itemCards, accessToken,
            itemPk: item.id, cursor: item.sync_cursor, rules, splitRules
          });
          await plaidItems.recordItemSyncSuccess(db, item.id);
          totalAdded += result.added;
          totalModified += result.modified;
          totalRemoved += result.removed;
        } catch (tokenError) {
          const code = tokenError.response?.data?.error_code;
          await plaidItems.recordItemSyncFailure(db, item.id, code || tokenError.message);
          await handleSyncTokenError(tokenError, itemCards, item.id);
        }
      }

      res.json({
        message: 'Transaction sync completed successfully',
        newTransactions: totalAdded,
        modifiedTransactions: totalModified,
        removedTransactions: totalRemoved,
        cardsProcessed: allPlaidCards.length
      });
    } catch (error) {
      sendServerError(res, error, 'Failed to sync transactions');
    }
  });

  router.post('/sync-all-transactions', authenticateToken, async (req, res) => {
    try {
      const { startDate, endDate, months = 3 } = req.body;
      const end = endDate ? new Date(endDate) : new Date();
      const start = startDate ? new Date(startDate) : new Date(end.getTime() - (months * 30 * 24 * 60 * 60 * 1000));
      const startDateStr = start.toISOString().split('T')[0];
      const endDateStr = end.toISOString().split('T')[0];

      const plaidCards = await loadDecryptedPlaidCards(req.user.userId);
      if (plaidCards.length === 0) {
        return res.status(400).json({ error: 'No Plaid-connected accounts found. Please connect your bank account first.' });
      }

      const rules = await loadRules(db, req.user.userId);

      let totalSynced = 0;
      let newTransactions = 0;
      const processedTokens = new Set();

      const cardsByToken = plaidCards.reduce((acc, card) => {
        (acc[card.access_token] = acc[card.access_token] || []).push(card);
        return acc;
      }, {});

      for (const [accessToken, cards] of Object.entries(cardsByToken)) {
        if (processedTokens.has(accessToken)) continue;
        processedTokens.add(accessToken);
        try {
          const result = await syncWindow({
            userId: req.user.userId, cards, accessToken, startDateStr, endDateStr, rules
          });
          totalSynced += result.totalSynced;
          newTransactions += result.newTransactions;
        } catch (tokenError) {
          await handleSyncTokenError(tokenError, cards);
        }
      }

      res.json({
        message: 'Complete transaction history sync completed successfully',
        totalTransactions: totalSynced,
        newTransactions,
        cardsProcessed: plaidCards.length,
        dateRange: { startDate: startDateStr, endDate: endDateStr }
      });
    } catch (error) {
      sendServerError(res, error, 'Failed to sync transaction histories');
    }
  });

  // Webhook handler lives in app.js so it can run BEFORE express.json() and
  // see the raw request body (needed for the request_body_sha256 verification
  // claim Plaid signs).

  return router;
};
