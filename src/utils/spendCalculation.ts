import type { Card, MonthlyData, Transaction, TransactionFilter, TransactionSort } from '../types';
import { isETransfer } from './eTransfer';
import { REFUND_KEYWORDS, WASH_REVERSAL_KEYWORDS } from './transactionPatterns';

// Match tolerances. Cross-bank posting can introduce small rounding / FX drift,
// so allow $0.05 or 0.5% of the amount, whichever is larger. The date window
// covers weekend + holiday posting delays between the two sides of a transfer.
const AMOUNT_BUCKET = 0.05; // also the tolerance floor
// Widened from 5 to 7 to cover weekend + statutory-holiday settlement delays
// (e.g. Fri→Mon + Thanksgiving). Slightly higher false-positive risk for two
// unrelated same-amount transactions, mitigated by requiring a different card.
const MAX_DAY_DIFF = 7;

const INVESTMENT_KEYWORDS = ['wealthsimple', 'questrade', 'robinhood', 'interactive brokers'];

function isInvestmentContribution(desc: string): boolean {
  return INVESTMENT_KEYWORDS.some(k => desc.includes(k));
}

function isCardCredit(card: Card | undefined): boolean {
  if (!card) return false;
  return card.category === 'credit' || card.type === 'credit';
}

function getCardId(t: Transaction): number | undefined {
  return t.cardId ?? (t as unknown as { card_id?: number }).card_id;
}

function dayDiff(d1: string, d2: string): number {
  return Math.abs((new Date(d1).getTime() - new Date(d2).getTime()) / 86_400_000);
}

function amountTolerance(a: number): number {
  return Math.max(AMOUNT_BUCKET, a * 0.005);
}

function sortTransactions(txs: Transaction[], sort: TransactionSort): Transaction[] {
  const sorted = [...txs];
  switch (sort) {
    case 'oldest':
      sorted.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      break;
    case 'highest':
      sorted.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
      break;
    case 'lowest':
      sorted.sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount));
      break;
    default:
      sorted.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }
  return sorted;
}

interface MatchIndex {
  byCard: Map<number, Transaction[]>;
}

// One-time pass over the candidate transactions to bucket positive entries by
// owning card. The matching helpers then iterate only the small per-card list
// instead of the full filteredTransactions array, replacing the O(n²) inner
// loops with O(n) total work for typical month-sized inputs.
function buildPositiveIndex(txs: Transaction[]): MatchIndex {
  const byCard = new Map<number, Transaction[]>();
  for (const t of txs) {
    if (t.amount <= 0) continue;
    const cardId = getCardId(t);
    if (cardId === undefined) continue;
    if (!byCard.has(cardId)) byCard.set(cardId, []);
    byCard.get(cardId)!.push(t);
  }
  return { byCard };
}

function hasMatchingPositive(
  index: MatchIndex,
  cards: Card[],
  excludeTxId: number,
  excludeCardId: number | undefined,
  amount: number,
  date: string,
  predicate: (card: Card | undefined) => boolean
): boolean {
  const tolerance = amountTolerance(amount);
  for (const [cardId, list] of index.byCard) {
    if (cardId === excludeCardId) continue;
    const otherCard = cards.find(c => c.id === cardId);
    if (!predicate(otherCard)) continue;
    for (const other of list) {
      if (other.id === excludeTxId) continue;
      if (Math.abs(other.amount - amount) > tolerance) continue;
      if (dayDiff(other.date, date) > MAX_DAY_DIFF) continue;
      return true;
    }
  }
  return false;
}

function isCreditCardPaymentByDescription(t: Transaction): boolean {
  const desc = (t.description ?? '').toLowerCase();
  const hasPaymentKeyword =
    desc.includes('payment') || desc.includes('pymt') || desc.includes('autopay') ||
    desc.includes('bill pay') || desc.includes('pay bill');
  const hasIssuerKeyword =
    desc.includes('amex') || desc.includes('american express') ||
    desc.includes('visa') || desc.includes('mastercard') ||
    desc.includes('chase') || desc.includes('citi') || desc.includes('discover') ||
    desc.includes('capital one') || desc.includes('capitalone') ||
    desc.includes('credit card') || desc.includes('creditcard') ||
    desc.includes('cc pmt') || desc.includes('ccd') || desc.includes('amex cards');
  return (
    (hasPaymentKeyword && hasIssuerKeyword) ||
    (desc.includes('ach') && hasIssuerKeyword) ||
    (t.category === 'Bills' && hasPaymentKeyword) ||
    desc.includes('amex cards') // BMO-style "[CW]AMEX CARDS"
  );
}

// Bracket-prefix code at the start of bank descriptions: "[SC]", "[CW]", etc.
// Many Canadian banks (BMO, RBC) use these as classification codes; same-code
// pairs with opposite signs on the same day are almost always wash transactions.
function bracketCode(desc: string | undefined): string | null {
  if (!desc) return null;
  const m = desc.match(/^\[([A-Z]+)\]/);
  return m ? m[1] : null;
}

// Build the set of "washed" transaction ids — same-card same-day same-amount
// opposite-sign pairs where the description signals a fee/rebate/reversal
// relationship. Both sides get excluded from spend, cash outflow, and income.
//
// Triggered by ANY of:
//   - the positive side's description contains "rebate" / "refund" / "reversal"
//   - both sides share an opening bracket-code (e.g. both "[SC]…"), strong
//     signal they're the same bank-categorized event
//
// Exported so other dashboard pieces (e.g. recurring detection) can apply the
// same exclusion without re-implementing the rules.
export function findWashedTransactionIds(txs: Transaction[]): Set<number> {
  const washed = new Set<number>();
  // Group by card+date for cheap lookup.
  const byCardDate = new Map<string, Transaction[]>();
  for (const t of txs) {
    const cardId = getCardId(t);
    if (cardId === undefined) continue;
    const key = `${cardId}|${t.date}`;
    if (!byCardDate.has(key)) byCardDate.set(key, []);
    byCardDate.get(key)!.push(t);
  }

  for (const list of byCardDate.values()) {
    if (list.length < 2) continue;
    for (const a of list) {
      if (a.amount >= 0 || washed.has(a.id)) continue;
      const absA = Math.abs(a.amount);
      const tol = amountTolerance(absA);
      for (const b of list) {
        if (b.id === a.id || b.amount <= 0 || washed.has(b.id)) continue;
        if (Math.abs(b.amount - absA) > tol) continue;
        const looksLikeReversal = WASH_REVERSAL_KEYWORDS.test(b.description ?? '');
        const aCode = bracketCode(a.description);
        const bCode = bracketCode(b.description);
        const sharedCode = aCode && bCode && aCode === bCode;
        if (looksLikeReversal || sharedCode) {
          washed.add(a.id);
          washed.add(b.id);
          break;
        }
      }
    }
  }
  return washed;
}

function countAsIncome(t: Transaction): boolean {
  const desc = (t.description ?? '').toLowerCase();
  // Hard-no overrides: descriptions that obviously represent inter-account
  // movement should never count as income, even if Plaid (or a user rule)
  // mis-tagged them as category='Income'. Plaid's INCOME signal is
  // unreliable for credit-card payment rows where the receiving side is on
  // a CC ("PAYMENT RECEIVED - THANK YOU"), so we backstop here.
  if (/\bpayment received\b|\bcc pmt\b|\bcredit card payment\b|\bautopay\b/.test(desc)) return false;
  if (t.category === 'Income') return true;
  const isTransferOrPayment =
    t.category === 'Other' ||
    desc.includes('transfer') ||
    desc.includes('payment');
  return !isTransferOrPayment;
}

export interface CalcOptions {
  transactions: Transaction[];
  cards: Card[];
  currentMonth: string; // 'YYYY-MM'
  transactionFilter: TransactionFilter;
  transactionSort: TransactionSort;
}

/**
 * Pure spend-and-income calculation for the dashboard. Splits credit-card
 * spending from deposit-account spending, detects same-user internal transfers
 * (deposit↔deposit, deposit↔credit, deposit↔investment) and excludes them so
 * "monthly spend" reflects consumption rather than money moving between the
 * user's own pockets.
 *
 * Returns the filtered+sorted transaction list plus aggregate fields used by
 * the dashboard. Exported as a pure function so it can be unit-tested
 * independently of the React component.
 */
export function calculateMonthlyData({
  transactions,
  cards,
  currentMonth,
  transactionFilter,
  transactionSort
}: CalcOptions): MonthlyData {
  let filtered = transactions.filter(t => t.date.startsWith(currentMonth));
  if (transactionFilter !== 'all') {
    filtered = filtered.filter(t => t.category === transactionFilter);
  }
  filtered = sortTransactions(filtered, transactionSort);

  const positiveIndex = buildPositiveIndex(filtered);

  // Pre-pass: detect bank-fee/rebate pairs (e.g. BMO "[SC]PREMIUM PLAN" charge
  // + "[SC]FULL PLAN FEE REBATE" credit on the same day) so both sides are
  // excluded entirely from the spend/income aggregates.
  const washedIds = findWashedTransactionIds(filtered);

  // Reimbursement index. A reimbursement only reduces the current month's
  // spending headline if BOTH the purchase and the reimbursement fall inside
  // the visible month — otherwise the subtraction below has nothing to bite
  // against and we'd show a "Net of $X reimbursements" hint that doesn't
  // match the actual change in `spending`. So only count reimbursements
  // whose target is in `filtered`. Out-of-month reimbursements still get
  // their Reimburse badge in the transaction list (handled by the UI), they
  // just don't move the headline number for this month.
  const idsInFiltered = new Set(filtered.map(t => t.id));
  const txById = new Map(filtered.map(t => [t.id, t]));
  const reimbursementByTarget = new Map<number, number>();
  for (const t of filtered) {
    if (t.amount > 0 && typeof t.reimburses_id === 'number' && idsInFiltered.has(t.reimburses_id)) {
      reimbursementByTarget.set(
        t.reimburses_id,
        (reimbursementByTarget.get(t.reimburses_id) || 0) + t.amount
      );
    }
  }
  // Cap each target's effective reimbursement at the absolute purchase amount.
  // Without this, a $200 reimbursement on a $100 purchase shows "Net of $200
  // reimbursements" on the Spending tile even though the headline only dropped
  // by $100 (clamp in the per-row branch). reimbursementsApplied is sum of
  // capped values so the hint reads true.
  let reimbursementsApplied = 0;
  for (const [targetId, reimbAmount] of reimbursementByTarget) {
    const target = txById.get(targetId);
    if (!target) continue;
    const cap = Math.abs(target.amount);
    const effective = Math.min(reimbAmount, cap);
    reimbursementsApplied += effective;
  }

  let creditCardSpending = 0;
  let depositAccountSpending = 0;
  let depositAccountCashOutflow = 0;
  let income = 0;
  let eTransfersIn = 0;
  let eTransfersOut = 0;
  // Counts of rows that actually contributed to the headline numbers above.
  // The dashboard tile captions use these instead of the raw visible-row
  // count so "N transactions" matches what the spending/income totals
  // actually came from (excludes pending, transfers, washes, etc.).
  let spendingTxnCount = 0;
  let incomeTxnCount = 0;
  // Id sets surfaced for drill-down: clicking the Spending or Income tile
  // filters the transaction list to EXACTLY these ids, so the user sees
  // only the rows that contributed to the headline number — no Transfer /
  // Deposit / wash / pending noise.
  const spendingContributorIds = new Set<number>();
  const incomeContributorIds = new Set<number>();

  // Replaces the old "raw" byCategory that summed every negative txn — that
  // version included pending / washed / transfers / e-transfers / etc. and
  // therefore did NOT reconcile with the Spending tile. This version is
  // populated alongside the headline aggregates so byCategory sums match the
  // Spending number that's actually displayed. Refunds subtract; clamp to 0.
  const byCategory: Record<string, number> = {};
  function addToByCategory(category: string, delta: number) {
    const next = (byCategory[category] || 0) + delta;
    byCategory[category] = Math.max(0, next);
  }

  for (const t of filtered) {
    // Pending transactions can be modified or removed by Plaid before they
    // post — exclude them from spend/income aggregates to avoid double-counting
    // when they later settle.
    if (t.pending) continue;
    // Wash pairs are net-zero events — neither side counts as spending or income.
    if (washedIds.has(t.id)) continue;
    // "Transfer" is a user-controlled marker (set via the edit modal or a
    // categorization rule) for transactions that move money between the user's
    // own accounts and should be excluded from spend, cash outflow, and income.
    if (t.category === 'Transfer') continue;
    // "Deposit" is the generic inbound bucket (PayPal cashout, "INTERNET
    // DEPOSIT", branch cash deposit). It's not income — the user can reclass
    // a specific deposit to Income if it actually represents earnings.
    if (t.category === 'Deposit' && t.amount > 0) continue;

    const cardId = getCardId(t);
    const card = cards.find(c => c.id === cardId);
    const isCC = isCardCredit(card);

    // Reimbursements (a positive entry linked to a purchase) are already
    // accounted for against their target below. Skip them here BEFORE the
    // e-transfer check so a friend's Interac payback doesn't show up in
    // eTransfersIn AND reduce the purchase — that would double-count.
    if (t.amount > 0 && typeof t.reimburses_id === 'number') continue;

    // Refund check BEFORE e-Transfer detection: a refund-via-Interac (e.g.
    // a Lyft refund issued as an e-Transfer) should reduce the original
    // purchase, NOT inflate eTransfersIn. We only route refunds here when
    // they're on a credit card — debit-card refunds get handled later in
    // the positive-amount branch so we don't double-route.
    const lowerDescEarly = (t.description ?? '').toLowerCase();
    const looksLikeRefundEarly = t.amount > 0 && REFUND_KEYWORDS.test(t.description ?? '');

    // E-Transfers get tallied into their own bucket and DON'T touch spending
    // or income. They show up in their own dashboard panel so the user can see
    // net Interac flow without it polluting headline numbers. Refunds routed
    // via Interac fall through to the refund handling below instead.
    if (isETransfer(t) && !looksLikeRefundEarly) {
      if (t.amount > 0) eTransfersIn += t.amount;
      else eTransfersOut += Math.abs(t.amount);
      continue;
    }

    if (t.amount < 0) {
      if (isCC) {
        const reimbursed = reimbursementByTarget.get(t.id) || 0;
        const net = Math.max(0, Math.abs(t.amount) - reimbursed);
        creditCardSpending += net;
        addToByCategory(t.category, net);
        spendingTxnCount++;
        spendingContributorIds.add(t.id);
        continue;
      }
      const amount = Math.abs(t.amount);

      // Method 1: matching positive on a credit card = paying off own debt.
      const isCCPayment = hasMatchingPositive(
        positiveIndex,
        cards,
        t.id,
        cardId,
        amount,
        t.date,
        c => isCardCredit(c)
      );
      if (isCCPayment) continue;

      // Internal transfer between own deposit/investment accounts. Must be a
      // DIFFERENT card — otherwise unrelated same-amount events on one card
      // (e.g. $100 incoming transfer + $100 coffee) would falsely match.
      const isInternalTransfer = hasMatchingPositive(
        positiveIndex,
        cards,
        t.id,
        cardId,
        amount,
        t.date,
        c => !!c && !isCardCredit(c)
      );
      if (isInternalTransfer) continue;

      // Method 2: description-based CC payment fallback for when the receiving
      // card isn't in our DB or the posting window missed Method 1.
      if (isCreditCardPaymentByDescription(t)) continue;

      // Wealthsimple / Questrade / etc. — money moves to user's brokerage,
      // not consumption.
      const lowerDesc = lowerDescEarly;
      if (isInvestmentContribution(lowerDesc)) continue;

      // Generic "Transfer out" / "Transfer" descriptions are how Plaid surfaces
      // movements to investment accounts that don't appear in the depository
      // transaction feed (Plaid only returns investment activity via the
      // separate /investments/transactions API). If the source card has any
      // investment / TFSA / RRSP sibling at the same institution, assume the
      // money went there.
      const trimmedDesc = (t.description ?? '').trim();
      const isGenericTransfer = /^transfer(\s+out)?$/i.test(trimmedDesc);
      if (isGenericTransfer && card && card.institution_name) {
        const hasInvestmentSibling = cards.some(c =>
          c.id !== card.id &&
          c.institution_name === card.institution_name &&
          (c.category === 'investment' || c.category === 'tfsa' || c.category === 'rrsp')
        );
        if (hasInvestmentSibling) continue;
      }

      const reimbursed = reimbursementByTarget.get(t.id) || 0;
      const net = Math.max(0, amount - reimbursed);
      depositAccountCashOutflow += amount;
      depositAccountSpending += net;
      addToByCategory(t.category, net);
      spendingTxnCount++;
      spendingContributorIds.add(t.id);
    } else if (t.amount > 0) {
      // Credit-card positives split into two kinds:
      //   "PAYMENT RECEIVED" / generic positive  → debt reduction, ignore
      //   merchant refund (description contains "refund"/"reversal"/"return")
      //     → reduces the original purchase, so subtract from creditCardSpending.
      // Same shape applies on deposit accounts for debit-card refunds.
      // Clamp at 0 so a big-refund / small-purchase month can't push the
      // spending total negative.
      const looksLikeRefund = looksLikeRefundEarly;
      if (isCC) {
        // Don't clamp during the loop — sort can put the refund BEFORE the
        // purchase, in which case a transient negative is necessary for the
        // final sum to come out right. Clamp at return time.
        if (looksLikeRefund) {
          creditCardSpending -= t.amount;
          addToByCategory(t.category, -t.amount);
        }
        continue;
      }
      if (looksLikeRefund) {
        depositAccountSpending -= t.amount;
        depositAccountCashOutflow -= t.amount;
        addToByCategory(t.category, -t.amount);
        continue;
      }
      if (countAsIncome(t)) {
        income += t.amount;
        incomeTxnCount++;
        incomeContributorIds.add(t.id);
      }
    }
  }

  // Clamp the spend buckets at zero on the way out. Refunds can exceed
  // purchases in the visible window (sort order may put refund first, or
  // a real big-refund month genuinely outpaces purchases) and a negative
  // headline number would confuse users — show 0 spent instead.
  const ccFinal = Math.max(0, creditCardSpending);
  const depFinal = Math.max(0, depositAccountSpending);
  const cashFinal = Math.max(0, depositAccountCashOutflow);

  return {
    transactions: filtered,
    spending: ccFinal + depFinal,
    creditCardSpending: ccFinal,
    depositAccountSpending: depFinal,
    depositAccountCashOutflow: cashFinal,
    income,
    byCategory,
    eTransfersIn,
    eTransfersOut,
    reimbursementsApplied,
    spendingTxnCount,
    incomeTxnCount,
    spendingContributorIds,
    incomeContributorIds
  };
}
