import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  error: Error;
  reset: () => void;
  title?: string;
}

/**
 * Compact inline "this widget crashed" card. Used by inner ErrorBoundaries
 * around individual dashboard panels so a render error in one chart doesn't
 * take down the entire dashboard. Clicking Retry resets the boundary; if the
 * underlying data is still bad it'll re-throw, which is fine.
 */
export const WidgetErrorFallback: React.FC<Props> = ({ error, reset, title }) => {
  return (
    <div className="bg-white rounded-xl p-6 shadow-lg border border-rose-100">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="text-rose-500" size={18} />
        <h3 className="text-sm font-semibold text-rose-700">
          {title || 'This widget crashed'}
        </h3>
      </div>
      <p className="text-xs text-gray-500 mb-3 break-words">{error.message}</p>
      <button
        onClick={reset}
        className="text-xs flex items-center gap-1 bg-rose-50 text-rose-700 px-2 py-1 rounded hover:bg-rose-100"
      >
        <RefreshCw size={12} /> Retry
      </button>
    </div>
  );
};
