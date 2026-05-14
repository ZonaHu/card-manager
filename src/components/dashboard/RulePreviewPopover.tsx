import React from 'react';
import type { Transaction } from '../../types';

interface Props {
  pattern: string;
  transactions: Transaction[];
}

export const RulePreviewPopover: React.FC<Props> = ({ pattern, transactions }) => {
  const p = pattern.trim().toLowerCase();
  if (!p) return null;
  const matches = transactions.filter(t =>
    (t.description ?? '').toLowerCase().includes(p)).slice(0, 5);
  return (
    <div className="text-xs bg-gray-50 border border-gray-200 rounded p-2 mt-1">
      {matches.length === 0
        ? <span className="text-gray-500">No existing transactions match this pattern.</span>
        : (
          <>
            <div className="text-gray-500 mb-1">{matches.length} match{matches.length > 1 ? 'es' : ''} (sample):</div>
            {matches.map(t => (
              <div key={t.id} className="truncate text-gray-700">{t.date} · {t.description}</div>
            ))}
          </>
        )}
    </div>
  );
};
