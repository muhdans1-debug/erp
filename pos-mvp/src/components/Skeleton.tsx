import React from 'react';

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Base animated pulse rectangle
 */
export function Skeleton({ className = '', style }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-slate-200/80 rounded-md ${className}`}
      style={style}
    />
  );
}

/**
 * High-density Data Table Skeleton
 * Used in Manager Dashboard, Stock Management, Khata Ledgers
 */
export function TableSkeleton({
  rows = 6,
  columns = 5,
  hasHeader = true,
}: {
  rows?: number;
  columns?: number;
  hasHeader?: boolean;
}) {
  return (
    <div className="w-full bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      {hasHeader && (
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-20 ml-auto" />
        </div>
      )}
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, rIdx) => (
          <div
            key={rIdx}
            className={`px-6 py-4.5 flex items-center gap-6 ${
              rIdx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'
            }`}
          >
            <div className="flex items-center gap-3 flex-1 min-w-[140px]">
              <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-4 w-3/4 max-w-[200px]" />
                <Skeleton className="h-3 w-1/2 max-w-[130px] opacity-70" />
              </div>
            </div>
            {Array.from({ length: Math.max(1, columns - 2) }).map((_, cIdx) => (
              <div key={cIdx} className="hidden sm:block flex-1">
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
            <div className="flex flex-col items-end gap-1 shrink-0 min-w-[90px]">
              <Skeleton className="h-5 w-20 rounded" />
              <Skeleton className="h-3 w-12 opacity-60" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Metric KPI Card Skeleton with generous padding (p-6/p-8)
 * Designed for the Windows PC Manager Dashboard F-pattern
 */
export function KpiCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-${count} gap-6 mb-8`}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white p-6 lg:p-8 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between"
        >
          <div className="space-y-2.5 flex-1">
            <Skeleton className="h-3.5 w-28 uppercase" />
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-3 w-20 opacity-70" />
          </div>
          <Skeleton className="h-14 w-14 rounded-xl shrink-0" />
        </div>
      ))}
    </div>
  );
}
