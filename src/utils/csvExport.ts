import type { Card, Transaction } from '../types';

// Minimal CSV serializer for the transactions table. Escapes per RFC 4180:
// any field containing a comma, double-quote, or newline is wrapped in quotes
// and inner quotes are doubled.
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function transactionsToCsv(transactions: Transaction[], cards: Card[]): string {
  const cardById = new Map(cards.map(c => [c.id, c]));
  const header = ['date', 'description', 'amount', 'category', 'card', 'card_last_four'];
  const rows = transactions.map(t => {
    const cardId = t.cardId ?? (t as unknown as { card_id?: number }).card_id;
    const card = cardId !== undefined ? cardById.get(cardId) : undefined;
    return [
      t.date,
      t.description,
      t.amount,
      t.category,
      card?.name ?? '',
      card?.last_four ?? ''
    ].map(csvCell).join(',');
  });
  const meta = [
    `# Exported: ${new Date().toISOString()}`,
    `# Rows: ${transactions.length}`,
    `# Source: card-manager`
  ].join('\r\n');
  return meta + '\r\n' + [header.join(','), ...rows].join('\r\n');
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
