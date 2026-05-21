// Apply user-defined category overrides. Rules match by substring on the
// transaction description (lowercased on both sides). First match wins; the
// caller is expected to order rules by id (oldest first) or another priority
// so behavior is deterministic.

function loadRules(db, userId) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT id, pattern, category FROM categorization_rules WHERE user_id = ? ORDER BY id',
      [userId],
      (err, rows) => err ? reject(err) : resolve(rows || [])
    );
  });
}

function applyRules(description, rules) {
  if (!description || !rules || rules.length === 0) return null;
  const lower = description.toLowerCase();
  for (const r of rules) {
    if (!r.pattern) continue;
    if (lower.includes(String(r.pattern).toLowerCase())) {
      return r.category;
    }
  }
  return null;
}

module.exports = { loadRules, applyRules };
