import type { Transaction } from '../types';

// Detect e-Transfer / Interac transactions across the various description
// formats Canadian banks emit. Centralized so the dashboard panel, spend calc,
// and any future reporting all use the same definition.

// Matches:
//   "E-TRANSFER 011645645599 Yier Cao"
//   "INTERAC E-TRANSFER SEND simon"
//   "INTERAC E-TRANSFER RECEIVE DAN TAM THUY HOANG"
//   "Yutang Yang - INTERAC e-Transfer®"
//   "[CW]INTERAC ETRNSFR SENT TD 20260991049TCCJZE"
const ETRANSFER_RE = /\b(e-transfer|etransfer|interac e-transfer|interac etrnsfr|e-tfr)\b/i;

export function isETransfer(t: Transaction): boolean {
  return ETRANSFER_RE.test(t.description ?? '');
}

// Best-effort counterparty extraction. Used for grouping in the panel; we
// accept "unknown" rather than guessing badly when the format doesn't expose
// a name.
export function extractCounterparty(desc: string | undefined): string {
  if (!desc) return 'unknown';
  let s = desc.trim();

  // "Name - INTERAC e-Transfer®" (Wealthsimple format) — name comes first.
  const wsMatch = s.match(/^(.+?)\s*-\s*INTERAC e-Transfer/i);
  if (wsMatch) return wsMatch[1].trim();

  // "INTERAC E-TRANSFER SEND|RECEIVE NAME" (Simplii) — name follows verb.
  // Check BEFORE the bare "INTERAC ETRNSFR" branch so a mixed-format string
  // like "INTERAC ETRNSFR RECEIVED Jane Doe" still surfaces the name.
  const simpliiMatch = s.match(/INTERAC E-?TRANSFER\s+(?:SEND|RECEIVE|RECEIVED|SENT)\s+(.+)$/i);
  if (simpliiMatch) return simpliiMatch[1].trim();
  const etrnsfrMatch = s.match(/INTERAC ETRNSFR\s+(?:SENT|RECEIVED)\s+(.+)$/i);
  if (etrnsfrMatch) {
    // BMO's "[CW]INTERAC ETRNSFR SENT TD 20260991049TCCJZE" — the suffix is
    // an institution code + reference, no counterparty name. Detect by the
    // shape (single short word followed by an all-caps reference) and fall
    // back to a generic label.
    const rest = etrnsfrMatch[1].trim();
    if (/^[A-Z]{2,4}\s+[A-Z0-9]{10,}$/.test(rest)) return 'Interac transfer';
    return rest;
  }

  // "E-TRANSFER <ref-number> NAME" (CIBC) — ref number then name. Ref is all
  // digits, name is the rest.
  const cibcMatch = s.match(/^E-TRANSFER\s+\d+\s+(.+)$/i);
  if (cibcMatch) return cibcMatch[1].trim();

  // Fallback — strip the leading bank-style E-TRANSFER token and return what's
  // left so the user at least sees something readable.
  s = s.replace(/^E-TRANSFER\s+/i, '').replace(/^INTERAC\s+E-TRANSFER\s+/i, '').trim();
  return s || 'unknown';
}

export interface ETransferAggregate {
  totalIn: number;
  totalOut: number;
  net: number; // totalIn - totalOut (positive = net received)
  countIn: number;
  countOut: number;
}

export function summarizeETransfers(transactions: Transaction[]): ETransferAggregate {
  let totalIn = 0, totalOut = 0, countIn = 0, countOut = 0;
  for (const t of transactions) {
    if (!isETransfer(t)) continue;
    if (t.amount > 0) { totalIn += t.amount; countIn += 1; }
    else if (t.amount < 0) { totalOut += Math.abs(t.amount); countOut += 1; }
  }
  return { totalIn, totalOut, net: totalIn - totalOut, countIn, countOut };
}

export interface ETransferGroup {
  counterparty: string;
  totalIn: number;
  totalOut: number;
  net: number;
  count: number;
  lastDate: string;
}

export function groupETransfersByCounterparty(transactions: Transaction[]): ETransferGroup[] {
  const groups = new Map<string, ETransferGroup>();
  for (const t of transactions) {
    if (!isETransfer(t)) continue;
    const cp = extractCounterparty(t.description).toLowerCase();
    const g = groups.get(cp) ?? {
      counterparty: extractCounterparty(t.description),
      totalIn: 0, totalOut: 0, net: 0, count: 0, lastDate: t.date
    };
    if (t.amount > 0) g.totalIn += t.amount;
    else g.totalOut += Math.abs(t.amount);
    g.net = g.totalIn - g.totalOut;
    g.count += 1;
    if (t.date > g.lastDate) g.lastDate = t.date;
    groups.set(cp, g);
  }
  // Sort by absolute total volume (in + out) so the most-active counterparties
  // surface first regardless of direction.
  return Array.from(groups.values())
    .sort((a, b) => (b.totalIn + b.totalOut) - (a.totalIn + a.totalOut));
}
