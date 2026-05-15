import type { Card } from '../types';

// Per-account breakdown of the most recent net-worth point. Splits cards into
// assets (chequing, savings, investment, tfsa, rrsp) and liabilities (credit
// cards), each entry carrying its current balance + share of gross net worth
// (sum of absolute values), so percentages always sum to 100 regardless of
// sign mix.

export type AccountKind = 'asset' | 'liability';

export interface BreakdownEntry {
  card_id: number;
  name: string;
  category: string | undefined;
  kind: AccountKind;
  balance: number;     // signed: positive for assets, negative for liabilities (debt as -value)
  share: number;       // 0..1, fraction of gross net worth
}

export interface NetWorthBreakdown {
  entries: BreakdownEntry[];
  totalAssets: number;
  totalLiabilities: number; // positive number (sum of debts)
  netWorth: number;
  gross: number;            // totalAssets + totalLiabilities, used for share denominator
}

function isCreditCard(card: Card): boolean {
  return card.category === 'credit' || card.type === 'credit';
}

export function computeBreakdown(
  cards: Card[],
  byCard: Record<number, number>
): NetWorthBreakdown {
  let totalAssets = 0;
  let totalLiabilities = 0;
  const raw: Array<Omit<BreakdownEntry, 'share'>> = [];

  for (const card of cards) {
    const eomBalance = byCard[card.id];
    if (eomBalance === undefined) continue;
    const cc = isCreditCard(card);
    if (cc) {
      // Credit cards: positive eomBalance = debt owed. Net-worth contribution
      // is -balance. Expose as a liability with a signed-negative balance so
      // the UI can render it in the rose tone consistently.
      totalLiabilities += Math.max(0, eomBalance);
      raw.push({
        card_id: card.id,
        name: card.name,
        category: card.category,
        kind: 'liability',
        balance: -Math.max(0, eomBalance)
      });
    } else {
      totalAssets += eomBalance;
      raw.push({
        card_id: card.id,
        name: card.name,
        category: card.category,
        kind: 'asset',
        balance: eomBalance
      });
    }
  }

  const gross = totalAssets + totalLiabilities;
  const entries = raw
    .map(e => ({ ...e, share: gross > 0 ? Math.abs(e.balance) / gross : 0 }))
    // Assets first (largest → smallest), then liabilities (largest debt first).
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'asset' ? -1 : 1;
      return Math.abs(b.balance) - Math.abs(a.balance);
    });

  return {
    entries,
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    gross
  };
}
