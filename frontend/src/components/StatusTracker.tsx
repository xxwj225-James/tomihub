import { useMemo, useId } from 'react';

interface Props {
  currentStatus: string;
  interactive?: boolean;
  onChangeStatus?: (newStatus: string) => void;
  statusList?: Array<{key:string; value:string; color?:string}>;
}

export function StatusTracker({ currentStatus, interactive, onChangeStatus, statusList: propList }: Props) {
  const uid = useId();
  const statuses = useMemo(() =>
    (propList && propList.length > 0 ? propList : [
      { key: 'todo', value: 'Todo', color: 'hsl(var(--ink-muted))' },
      { key: 'in_progress', value: 'In Progress', color: 'hsl(var(--warning))' },
      { key: 'in_review', value: 'In Review', color: 'hsl(var(--brand))' },
      { key: 'done', value: 'Done', color: 'hsl(var(--success))' },
    ]), [propList]);

  const currentIdx = statuses.findIndex(s => s.key === currentStatus);

  const handleClick = (key: string) => {
    if (interactive && onChangeStatus && key !== currentStatus) {
      onChangeStatus(key);
    }
  };

  if (currentIdx < 0) {
    // Status not in defined list — show as text badge
    return (
      <div className="py-2">
        <span className="text-xs font-semibold text-ink-muted bg-surface-hover px-2 py-1 rounded-full">
          {currentStatus?.replace(/_/g, ' ') || 'Unknown'}
        </span>
      </div>
    );
  }

  return (
    <div className="py-2">
      <div className="flex items-center">
        {statuses.map((s, i) => {
          const isPast = i < currentIdx;
          const isCurrent = i === currentIdx;
          const isLast = i === statuses.length - 1;

          return (
            <div key={`${uid}-${s.key}`} className="flex items-center" style={{ flex: 1 }}>
              {/* Node */}
              <div className={`flex flex-col items-center ${interactive ? 'cursor-pointer hover:scale-110 transition-transform' : ''}`}
                onClick={() => handleClick(s.key)}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  isPast ? 'bg-success-soft text-success border-2 border-success' :
                  isCurrent ? 'bg-brand-soft text-brand-main border-2 border-brand-main ring-2 ring-brand-main/20' :
                  'bg-surface-hover text-ink-muted border-2 border-edge'
                } ${interactive ? 'hover:border-brand-main' : ''}`}>
                  {isPast ? '✓' : isCurrent ? '●' : i + 1}
                </div>
                <span className={`text-[0.6rem] mt-1 whitespace-nowrap font-medium ${
                  isCurrent ? 'text-brand-main font-semibold' : isPast ? 'text-success' : 'text-ink-muted'
                }`}>{s.value}</span>
              </div>
              {/* Connector line */}
              {!isLast && (
                <div className="flex-1 mx-1" style={{ height: 2, marginTop: -20 }}>
                  <div className={`h-full rounded ${i < currentIdx ? 'bg-success' : 'bg-edge'}`} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
