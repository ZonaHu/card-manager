import type { Card, Transaction, TransactionFilter, TransactionSort } from '../types';
import { calculateMonthlyData } from './spendCalculation';

export interface MonthlyComparison {
  current: { month: string; spending: number; income: number };
  prevMonth: { month: string; spending: number; income: number };
  prevYear: { month: string; spending: number; income: number };
  momPct: number | null; // percent change vs last month, null if no baseline
  yoyPct: number | null;
}

function shiftMonth(yyyyMm: string, deltaMonths: number): string {
  const [y, m] = yyyyMm.split('-').map(Number);
  const total = y * 12 + (m - 1) + deltaMonths;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

function pctChange(current: number, baseline: number): number | null {
  if (baseline === 0) return null;
  return ((current - baseline) / Math.abs(baseline)) * 100;
}

/**
 * Spend/income for the given month plus the previous month and the same
 * month a year ago. Uses calculateMonthlyData under the hood so the same
 * transfer/CC-payment/investment exclusions apply consistently.
 */
export function computeMonthlyComparison(
  transactions: Transaction[],
  cards: Card[],
  currentMonth: string
): MonthlyComparison {
  const opts = {
    transactions,
    cards,
    transactionFilter: 'all' as TransactionFilter,
    transactionSort: 'newest' as TransactionSort
  };
  const cur = calculateMonthlyData({ ...opts, currentMonth });
  const prevMonth = shiftMonth(currentMonth, -1);
  const prevYear = shiftMonth(currentMonth, -12);
  const pm = calculateMonthlyData({ ...opts, currentMonth: prevMonth });
  const py = calculateMonthlyData({ ...opts, currentMonth: prevYear });

  return {
    current:   { month: currentMonth, spending: cur.spending, income: cur.income },
    prevMonth: { month: prevMonth,    spending: pm.spending,  income: pm.income },
    prevYear:  { month: prevYear,     spending: py.spending,  income: py.income },
    momPct: pctChange(cur.spending, pm.spending),
    yoyPct: pctChange(cur.spending, py.spending)
  };
}
