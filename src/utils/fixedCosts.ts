import type { Transaction } from '../types';

// Detection for "fixed monthly bills" — rent, utilities, internet, mobile.
// Distinct from the generic RecurringList: this surfaces the user's
// predictable housing/services costs in their own widget so they can see
// total fixed obligations at a glance and spot a vendor that drifted up.

interface VendorPattern {
  match: RegExp;
  label: string;
  bucket: 'Rent' | 'Utilities' | 'Internet' | 'Mobile';
}

// Patterns ordered specifically — the more-specific vendor strings come first
// so e.g. "ROGERS WIRELESS" doesn't get swallowed by a generic "ROGERS" rule.
const VENDORS: VendorPattern[] = [
  // Rent / housing platforms (Canada)
  { match: /\bchexy\b/i, label: 'Chexy (Rent)', bucket: 'Rent' },
  { match: /\brent\b/i, label: 'Rent', bucket: 'Rent' },
  // Utilities
  { match: /\bmetergy\b/i, label: 'Metergy (Utilities)', bucket: 'Utilities' },
  { match: /\benbridge\b/i, label: 'Enbridge (Gas)', bucket: 'Utilities' },
  { match: /\btoronto hydro\b/i, label: 'Toronto Hydro', bucket: 'Utilities' },
  { match: /\bhydro one\b/i, label: 'Hydro One', bucket: 'Utilities' },
  { match: /\butilit/i, label: 'Utilities', bucket: 'Utilities' },
  // Internet / cable
  { match: /\bbell canada\b/i, label: 'Bell (Internet)', bucket: 'Internet' },
  { match: /\brogers bk\b/i, label: 'Rogers (Internet)', bucket: 'Internet' },
  { match: /\bbell\b/i, label: 'Bell', bucket: 'Internet' },
  // Mobile
  { match: /\bfido\b/i, label: 'Fido (Mobile)', bucket: 'Mobile' },
  { match: /\bkoodo\b/i, label: 'Koodo (Mobile)', bucket: 'Mobile' },
  { match: /\btelus mobility\b/i, label: 'Telus (Mobile)', bucket: 'Mobile' },
  { match: /\brogers wireless\b/i, label: 'Rogers (Mobile)', bucket: 'Mobile' }
];

export type FixedCostBucket = VendorPattern['bucket'];

export interface FixedCostEntry {
  label: string;
  bucket: FixedCostBucket;
  currentAmount: number;     // sum of all matching txns in the current month (positive value)
  priorAmount: number;       // sum in the month immediately prior
  delta: number;             // currentAmount - priorAmount (positive = increase)
  count: number;
  lastDate: string;
}

function classify(desc: string | undefined): VendorPattern | null {
  if (!desc) return null;
  for (const v of VENDORS) {
    if (v.match.test(desc)) return v;
  }
  return null;
}

export function isFixedCost(t: Transaction): boolean {
  return t.amount < 0 && classify(t.description) !== null;
}

// Returns the prior YYYY-MM given a YYYY-MM string. Handles January → previous-
// year December.
function priorMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, '0')}`;
}

export interface FixedCostsSummary {
  entries: FixedCostEntry[];
  currentTotal: number;
  priorTotal: number;
  totalDelta: number;
}

export function summarizeFixedCosts(
  transactions: Transaction[],
  currentMonth: string // 'YYYY-MM'
): FixedCostsSummary {
  const prior = priorMonth(currentMonth);
  const grouped = new Map<string, FixedCostEntry>();

  for (const t of transactions) {
    if (t.amount >= 0) continue;
    // Skip pending — Plaid often replaces these with a posted row at a
    // slightly different amount/date, so showing pending here would inflate
    // the current-month total + show a misleading "+" delta vs prior month.
    if (t.pending) continue;
    const cls = classify(t.description);
    if (!cls) continue;
    const monthKey = t.date.slice(0, 7);
    const inCurrent = monthKey === currentMonth;
    const inPrior = monthKey === prior;
    if (!inCurrent && !inPrior) continue;

    const entry = grouped.get(cls.label) ?? {
      label: cls.label,
      bucket: cls.bucket,
      currentAmount: 0,
      priorAmount: 0,
      delta: 0,
      count: 0,
      lastDate: t.date
    };
    const amt = Math.abs(t.amount);
    if (inCurrent) {
      entry.currentAmount += amt;
      entry.count += 1;
      if (t.date > entry.lastDate) entry.lastDate = t.date;
    } else {
      entry.priorAmount += amt;
    }
    grouped.set(cls.label, entry);
  }

  const entries = Array.from(grouped.values()).map(e => ({
    ...e,
    delta: e.currentAmount - e.priorAmount
  }));
  // Sort by current-month amount descending — biggest fixed costs first.
  // Vendors with currentAmount=0 (only present last month) sink to the bottom
  // so the user sees what's actively billing now.
  entries.sort((a, b) => b.currentAmount - a.currentAmount);

  const currentTotal = entries.reduce((s, e) => s + e.currentAmount, 0);
  const priorTotal = entries.reduce((s, e) => s + e.priorAmount, 0);
  return { entries, currentTotal, priorTotal, totalDelta: currentTotal - priorTotal };
}
