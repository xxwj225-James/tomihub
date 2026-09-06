import { cn } from '@/lib/cn';
import type { CSSProperties } from 'react';

interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
}

/** Gray placeholder block with pulse animation — use in loading states instead of "Loading..." text */
export function Skeleton({ className, style }: SkeletonProps) {
  return (
    <div className={cn('rounded-md bg-surface-hover animate-pulse', className)} style={style} />
  );
}

/** Card-style skeleton for list items */
export function SkeletonCard({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('card p-4 space-y-3', className)}>
      <Skeleton className="h-4 w-3/4" />
      {Array.from({ length: lines - 1 }, (_, i) => (
        <Skeleton key={i} className="h-3 w-full" />
      ))}
    </div>
  );
}

/** Table-row skeleton for list views */
export function SkeletonRow({ cols = 5, className }: { cols?: number; className?: string }) {
  return (
    <div className={cn('flex gap-4 px-4 py-3 border-b border-edge', className)}>
      {Array.from({ length: cols }, (_, i) => (
        <Skeleton key={i} className="h-4" style={{ width: `${60 + Math.random() * 80}px` }} />
      ))}
    </div>
  );
}
