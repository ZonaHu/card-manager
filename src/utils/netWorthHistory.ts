import type { Card, Transaction } from '../types';

export interface NetWorthPoint {
  month: string;
  total: number;
  byCard: Record<number, number>;
}

export interface BalanceSnapshot {
  card_id: number;
  date: string;   // YYYY-MM-DD
  balance: number;
}

function endOfMonth(year: number, month: number): string {
  const next = month === 12 ? new Date(year + 1, 0, 1) : new Date(year, month, 1);
  const last = new Date(next.getTime() - 86_400_000);
  return last.toISOString().split('T')[0];
}

function isCreditCard(card: Card): boolean {
  return card.category === 'credit' || card.type === 'credit';
}

function isInvestmentish(card: Card): boolean {
  return card.category === 'investment' || card.category === 'tfsa' || card.category === 'rrsp';
}

// Index snapshots by card_id → sorted ascending by date so we can do a single
// binary-friendly scan when picking the closest snapshot at-or-before a target.
function indexSnapshots(snaps: BalanceSnapshot[]): Map<number, BalanceSnapshot[]> {
  const m = new Map<number, BalanceSnapshot[]>();
  for (const s of snaps) {
    if (!m.has(s.card_id)) m.set(s.card_id, []);
    m.get(s.card_id)!.push(s);
  }
  for (const list of m.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  return m;
}

function snapshotAt(snaps: BalanceSnapshot[] | undefined, eom: string): number | null {
  if (!snaps || snaps.length === 0) return null;
  // Most recent snapshot whose date <= eom.
  let pick: BalanceSnapshot | null = null;
  for (const s of snaps) {
    if (s.date <= eom) pick = s;
    else break;
  }
  return pick ? pick.balance : null;
}

export function computeNetWorthHistory(
  cards: Card[],
  transactions: Transaction[],
  snapshots: BalanceSnapshot[] = []
): NetWorthPoint[] {
  if (cards.length === 0) return [];

  const txByCard = new Map<number, Transaction[]>();
  for (const t of transactions) {
    const cardId = t.cardId ?? (t as unknown as { card_id?: number }).card_id;
    if (cardId === undefined) continue;
    if (!txByCard.has(cardId)) txByCard.set(cardId, []);
    txByCard.get(cardId)!.push(t);
  }

  const snapsByCard = indexSnapshots(snapshots);

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
      // Investment-category cards prefer the snapshot at-or-before eom so
      // market movement is captured. Falls back to the rollback when no
      // snapshot exists yet (e.g. first sync, history older than first sync).
      let balanceAtEom: number | null = null;
      if (isInvestmentish(card)) {
        balanceAtEom = snapshotAt(snapsByCard.get(card.id), eom);
      }
      if (balanceAtEom === null) {
        const list = txByCard.get(card.id) || [];
        const after = list.filter(t => t.date > eom);
        const undoSum = after.reduce((s, t) => s + t.amount, 0);
        const isCC = isCreditCard(card);
        balanceAtEom = isCC ? card.balance + undoSum : card.balance - undoSum;
      }
      byCard[card.id] = balanceAtEom;
      total += isCreditCard(card) ? -balanceAtEom : balanceAtEom;
    }

    result.push({ month: monthStr, total: Math.round(total * 100) / 100, byCard });
  }

  return result;
}
