// src/components/dashboard/UndoDeleteBanner.tsx
import React from 'react';
import { Trash2 } from 'lucide-react';

interface Props {
  description: string;
  onUndo: () => void;
  onDismiss: () => void;
  ttlMs?: number;
}

/**
 * Shown briefly after a transaction soft-delete. Clicking Undo restores;
 * otherwise the banner self-dismisses after ttlMs so the dashboard
 * doesn't clutter. The soft-delete row stays in the DB (deleted_at set)
 * regardless — the banner only manages the visible affordance.
 */
export const UndoDeleteBanner: React.FC<Props> = ({ description, onUndo, onDismiss, ttlMs = 30_000 }) => {
  React.useEffect(() => {
    const t = setTimeout(onDismiss, ttlMs);
    return () => clearTimeout(t);
  }, [onDismiss, ttlMs]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white rounded-full px-4 py-2 shadow-xl flex items-center gap-3"
    >
      <Trash2 size={14} className="text-rose-300" />
      <span className="text-sm truncate max-w-[220px]">
        Deleted "{description}"
      </span>
      <button
        onClick={onUndo}
        className="text-sm font-medium text-indigo-300 hover:text-white"
      >
        Undo
      </button>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-sm text-gray-400 hover:text-gray-200"
      >
        ×
      </button>
    </div>
  );
};
