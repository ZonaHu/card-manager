import type { Transaction } from '../types';

// Given the full transaction history, find refunds that pair to a purchase
// posted in a different calendar month. Returns the matched pairs so the UI
// can show "Refunds a purchase from <month>" beneath the refund row — without
// that hint, a refund that lands in April for a March charge looks like free
// money in April's totals.

const REFUND_KEYWORDS = /\brefund\b|\breversal\b|\breversed\b|merchandise return/i;

export interface CrossMonthRefund {
  refundId: number;
  purchaseId: number;
  purchaseMonth: string;
}

export function findCrossMonthRefunds(transactions: Transaction[]): CrossMonthRefund[] {
  const out: CrossMonthRefund[] = [];
  const purchasesByKey = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (t.amount >= 0) continue;
    const cardId = (t as any).cardId ?? (t as any).card_id;
    const key = `${cardId}|${Math.round(Math.abs(t.amount))}`;
    if (!purchasesByKey.has(key)) purchasesByKey.set(key, []);
    purchasesByKey.get(key)!.push(t);
  }
  for (const r of transactions) {
    if (r.amount <= 0) continue;
    if (!REFUND_KEYWORDS.test(r.description || '')) continue;
    const cardId = (r as any).cardId ?? (r as any).card_id;
    const candidates = purchasesByKey.get(`${cardId}|${Math.round(r.amount)}`) || [];
    const match = candidates.find(p =>
      p.date <= r.date && p.date.slice(0, 7) !== r.date.slice(0, 7));
    if (match) {
      out.push({ refundId: r.id, purchaseId: match.id, purchaseMonth: match.date.slice(0, 7) });
    }
  }
  return out;
}
