// Auto-split helpers. See migrations/006_split_rules.js for the schema.
//
// A split rule fires when ABS(transaction.amount) > threshold AND the
// description contains `pattern` AND (rule.card_id is null OR matches the
// card the txn is on). On match, we mutate the just-inserted transaction's
// amount (reducing magnitude) and INSERT a sibling row with split_amount.

function loadSplitRules(db, userId) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT id, card_id, pattern, threshold, split_amount, split_category, split_description FROM split_rules WHERE user_id = ?',
      [userId],
      (err, rows) => err ? reject(err) : resolve(rows || [])
    );
  });
}

function findMatchingRule(rules, txn) {
  if (!rules || rules.length === 0) return null;
  const abs = Math.abs(txn.amount);
  const desc = (txn.description ?? '').toLowerCase();
  for (const r of rules) {
    if (r.card_id != null && r.card_id !== txn.card_id) continue;
    if (abs <= r.threshold) continue;
    if (!desc.includes(String(r.pattern).toLowerCase())) continue;
    return r;
  }
  return null;
}

// Applies a single rule against an already-inserted transaction. Updates the
// stored amount and inserts the sibling. Returns null if nothing to do.
function applySplit(db, txnId, originalAmount, userId, cardId, date, rule) {
  return new Promise((resolve, reject) => {
    const sign = originalAmount < 0 ? -1 : 1;
    const splitMagnitude = Math.abs(rule.split_amount);
    const newAmount = originalAmount - sign * splitMagnitude; // reduces magnitude
    const siblingAmount = sign * splitMagnitude;

    db.run('UPDATE transactions SET amount = ? WHERE id = ?', [newAmount, txnId], (err) => {
      if (err) return reject(err);
      db.run(
        'INSERT INTO transactions (user_id, card_id, amount, description, category, date, source) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [userId, cardId, siblingAmount, rule.split_description, rule.split_category, date, 'manual'],
        function (err2) {
          if (err2) return reject(err2);
          resolve({ siblingId: this.lastID, newAmount });
        }
      );
    });
  });
}

module.exports = { loadSplitRules, findMatchingRule, applySplit };
