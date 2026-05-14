import type { Card, Transaction } from '../types';

// Approximate historical net worth by walking transactions backwards from each
// card's current balance. For every month from the earliest transaction to now,
// we compute end-of-month balance per card by subtracting all transactions that
// happened AFTER that month-end from the current balance.
//
// Caveats:
//   * Credit cards: positive balance = debt owed → subtracted from net worth.
//   * Cards without transactions get a flat line at their current balance.
//   * This is an approximation; real account histories from Plaid would be
//     more accurate but require an extra API call.

export interface NetWorthPoint {
  month: string; // YYYY-MM
  total: number;
  byCard: Record<number, number>;
}

function endOfMonth(year: number, month: number): string {
  // month is 1-12. Use the first of next month minus 1ms → date is last day.
  const next = month === 12 ? new Date(year + 1, 0, 1) : new Date(year, month, 1);
  const last = new Date(next.getTime() - 86_400_000);
  return last.toISOString().split('T')[0];
}

function isCreditCard(card: Card): boolean {
  return card.category === 'credit' || card.type === 'credit';
}

export function computeNetWorthHistory(cards: Card[], transactions: Transaction[]): NetWorthPoint[] {
  if (cards.length === 0) return [];

  // Group txns by card for fast per-card filtering.
  const txByCard = new Map<number, Transaction[]>();
  for (const t of transactions) {
    const cardId = t.cardId ?? (t as unknown as { card_id?: number }).card_id;
    if (cardId === undefined) continue;
    if (!txByCard.has(cardId)) txByCard.set(cardId, []);
    txByCard.get(cardId)!.push(t);
  }

  // Earliest date determines history length. Cap at 24 months to keep chart readable.
  const allDates = transactions.map(t => t.date).sort();
  const earliest = allDates[0];
  const now = new Date();
  const start = earliest ? new Date(earliest) : new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const maxLookbackMonths = 24;
  const monthsBack = Math.min(
    maxLookbackMonths,
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1
  );

  const result: NetWorthPoint[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const target = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = target.getFullYear();
    const m = target.getMonth() + 1;
    const eom = endOfMonth(y, m);
    const monthStr = `${y}-${String(m).padStart(2, '0')}`;

    const byCard: Record<number, number> = {};
    let total = 0;
    for (const card of cards) {
      // Roll current balance backward by undoing every transaction posted AFTER eom.
      //
      // Direction depends on the account type. We store transactions with sign
      // flipped from Plaid's convention so for both kinds the per-card balance
      // moves opposite to t.amount:
      //   - Chequing: a -$50 purchase made today decreased today's balance
      //     by $50 → eom balance was $50 HIGHER  → eom = current + 50.
      //   - Credit card: a -$50 purchase today increased today's DEBT by $50
      //     (Plaid stores credit balance as positive debt) → eom debt was
      //     $50 LOWER → eom = current + (-50) = current - 50.
      // In both cases: `eom = current + undoSum` for credit, `current - undoSum`
      // for debit. Earlier code used `current - undoSum` uniformly which
      // produced wrong CC contributions to historical net worth.
      const list = txByCard.get(card.id) || [];
      const after = list.filter(t => t.date > eom);
      const undoSum = after.reduce((s, t) => s + t.amount, 0);
      const isCC = isCreditCard(card);
      const balanceAtEom = isCC ? card.balance + undoSum : card.balance - undoSum;
      byCard[card.id] = balanceAtEom;
      total += isCC ? -balanceAtEom : balanceAtEom;
    }

    result.push({ month: monthStr, total: Math.round(total * 100) / 100, byCard });
  }

  return result;
}
