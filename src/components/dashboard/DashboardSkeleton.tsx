// src/components/dashboard/DashboardSkeleton.tsx
import React from 'react';

/**
 * Visual placeholder that matches the real dashboard layout so the first
 * paint feels less jarring than a centered spinner. All animation is CSS
 * (Tailwind's animate-pulse) — no JS, no shimmer libraries.
 */
const Bar: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`bg-gray-200 rounded ${className}`} />
);

export const DashboardSkeleton: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4 sm:p-6 animate-pulse" aria-busy="true" aria-label="Loading dashboard">
      {/* Header bar */}
      <div className="flex items-center justify-between mb-6">
        <Bar className="h-8 w-48" />
        <Bar className="h-10 w-10" />
      </div>

      {/* Financial overview tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-xl p-4 sm:p-6 shadow-lg">
            <Bar className="h-5 w-24 mb-3" />
            <Bar className="h-7 w-32 mb-2" />
            <Bar className="h-3 w-20" />
          </div>
        ))}
      </div>

      {/* Insights row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {[0, 1, 2].map(i => (
          <div key={i} className="bg-white rounded-xl p-6 shadow-lg space-y-3">
            <Bar className="h-5 w-32" />
            <Bar className="h-32 w-full" />
          </div>
        ))}
      </div>

      {/* Transactions list rows */}
      <div className="bg-white rounded-xl p-6 shadow-lg">
        <Bar className="h-5 w-40 mb-4" />
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
              <div className="flex items-center gap-3">
                <Bar className="h-3 w-3 rounded-full" />
                <div className="space-y-1">
                  <Bar className="h-4 w-40" />
                  <Bar className="h-3 w-28" />
                </div>
              </div>
              <Bar className="h-5 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
