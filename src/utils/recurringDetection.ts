import type { RecurringTransaction, Transaction } from '../types';

// Heuristic recurring-transaction detector. We group by (normalized description,
// amount bucket) across the full transaction set and surface any group with at
// least MIN_OCCURRENCES entries whose successive postings are ~30 days apart.
//
// "Normalized description" strips reference numbers and dynamic suffixes (long
// digit strings, dates) so e.g. "NETFLIX 38291" and "NETFLIX 89172" collapse.
// Amount buckets allow small price changes (annual increase) to still cluster.

const MIN_OCCURRENCES = 3;
const TARGET_INTERVAL_DAYS = 30;
const INTERVAL_TOLERANCE_DAYS = 7;

function normalize(desc: string): string {
  return (desc || '')
    .toLowerCase()
    .replace(/\b\d{4,}\b/g, '') // long ids
    .replace(/\d{1,2}[\/-]\d{1,2}([\/-]\d{2,4})?/g, '') // dates
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function amountKey(amount: number): string {
  // Round to the nearest dollar so small price changes (e.g. a $9.99
  // subscription becoming $10.49) still share a bucket. We accept the
  // occasional false-positive (two different ~$10 charges) in exchange for
  // catching real subscription drift.
  return String(Math.round(Math.abs(amount)));
}

function daysBetween(a: string, b: string): number {
  return Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);
}

// Adjacent amount-buckets with the same normalized description that differ by
// at most 15% get glued into one recurring group. Catches subscriptions that
// drift in price (e.g. $9.99 → $10.49) which would otherwise split into two
// separate recurring entries with under-threshold counts.
function mergeBuckets(groups: Map<string, Transaction[]>): Map<string, Transaction[]> {
  const byDesc = new Map<string, Map<string, Transaction[]>>();
  for (const [key, list] of groups) {
    const sep = key.lastIndexOf('|');
    const desc = key.slice(0, sep);
    const amt = key.slice(sep + 1);
    if (!byDesc.has(desc)) byDesc.set(desc, new Map());
    byDesc.get(desc)!.set(amt, list);
  }
  const out = new Map<string, Transaction[]>();
  for (const [desc, amountMap] of byDesc) {
    const sortedBuckets = Array.from(amountMap.entries())
      .map(([k, l]) => ({ amount: Number(k), list: l }))
      .sort((a, b) => a.amount - b.amount);
    let acc: { amount: number; list: Transaction[] } | null = null;
    for (const b of sortedBuckets) {
      if (!acc) { acc = { amount: b.amount, list: [...b.list] }; continue; }
      // Glue if b is within 15% of acc.amount; bump acc.amount to the larger
      // so subsequent buckets can chain (e.g. 10 → 11 → 12.5).
      if (b.amount <= acc.amount * 1.15) {
        acc.list.push(...b.list);
        acc.amount = b.amount;
      } else {
        out.set(`${desc}|${acc.amount}`, acc.list);
        acc = { amount: b.amount, list: [...b.list] };
      }
    }
    if (acc) out.set(`${desc}|${acc.amount}`, acc.list);
  }
  return out;
}

export function detectRecurringTransactions(transactions: Transaction[]): RecurringTransaction[] {
  // Only consider outflows — recurring revenue (subscriptions where YOU are paid)
  // is rare and we want this surfacing subscription costs to the user. Skip
  // pending: they often get replaced by a posted row with a different
  // amount/date, which would either inflate occurrence count or break the
  // ±15% bucket merge.
  const outflows = transactions.filter(t => t.amount < 0 && !t.pending);
  const groups = new Map<string, Transaction[]>();

  for (const t of outflows) {
    const key = `${normalize(t.description)}|${amountKey(t.amount)}`;
    if (!key.split('|')[0]) continue; // empty normalized desc → skip
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const merged = mergeBuckets(groups);
  const results: RecurringTransaction[] = [];
  for (const [, list] of merged) {
    if (list.length < MIN_OCCURRENCES) continue;
    const sorted = [...list].sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime());

    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      intervals.push(daysBetween(sorted[i - 1].date, sorted[i].date));
    }
    const avgInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length;
    if (Math.abs(avgInterval - TARGET_INTERVAL_DAYS) > INTERVAL_TOLERANCE_DAYS) continue;

    const amounts = sorted.map(t => Math.abs(t.amount));
    const minAmount = Math.min(...amounts);
    const maxAmount = Math.max(...amounts);
    const last = sorted[sorted.length - 1];
    results.push({
      description: last.description,
      amount: Math.abs(last.amount),
      minAmount,
      maxAmount,
      category: last.category,
      occurrences: sorted.length,
      lastSeen: last.date,
      averageIntervalDays: Math.round(avgInterval)
    });
  }

  results.sort((a, b) => b.amount * b.occurrences - a.amount * a.occurrences);
  return results;
}
