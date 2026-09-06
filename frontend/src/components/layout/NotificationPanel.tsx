import { useState } from 'react';
import { cn } from '@/lib/cn';
import { useT } from '@/i18n/useT';

export interface NotifItem {
  id: string;
  type: 'approval' | 'task' | 'report' | 'ai' | 'comment';
  title: string;
  detail?: string;
  projectName?: string;
  time: string;
  autoDenyIn?: string;
  read?: boolean;
  status?: string;
  toolName?: string;
  arguments?: string;
  hitlTaskId?: string;
  agentName?: string;
}

interface Props {
  items: NotifItem[];
  sidebarWidth: number;
  onClose: () => void;
  onMarkAllRead: () => void;
  onRead?: (id: string) => void;
  onApprove?: (taskId: string) => void;
  onDeny?: (taskId: string) => void;
}

const typeIcon: Record<string, string> = {
  approval: '🤖',
  task: '📋',
  report: '📊',
  ai: '🧠',
  comment: '💬',
};

export function NotificationPanel({ items, sidebarWidth, onClose, onMarkAllRead, onRead, onApprove, onDeny }: Props) {
  const t = useT();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (item: NotifItem) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.add(item.id);
        // Auto-mark as read when expanded
        if (!item.read) onRead?.(item.id);
      }
      return next;
    });
  };

  const pendingApprovals = items.filter(i => i.type === 'approval');
  const rest = items.filter(i => i.type !== 'approval');

  const renderItem = (item: NotifItem, showActions: boolean) => {
    const isExpanded = expanded.has(item.id);
    return (
      <div key={item.id}
        onClick={() => toggleExpand(item)}
        className={cn(
          'px-4 py-3 border-b border-edge cursor-pointer hover:bg-surface-hover transition-colors',
          showActions && 'bg-warning-soft/40',
          item.read && !isExpanded && 'opacity-60',
        )}>
        {/* Concise view: always visible */}
        <div className="flex items-start gap-3">
          <span className="text-lg shrink-0">{typeIcon[item.type]}</span>
          <div className="flex-1 min-w-0">
            {item.projectName && <p className="text-xs font-semibold" style={{ color: 'hsl(var(--warning))' }}>{item.projectName}</p>}
            <p className="text-sm font-semibold text-ink-primary">{item.title}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-ink-muted">{item.time}</p>
              {item.status && item.status !== 'pending' && (
                <span className={`text-[0.625rem] font-medium ${item.status === 'approved' ? 'text-success' : item.status === 'denied' ? 'text-danger' : 'text-ink-muted'}`}>
                  {item.status === 'approved' ? t.nav.approved : item.status === 'denied' ? t.nav.denied : item.status}
                </span>
              )}
              {item.read && <span className="text-[0.625rem] text-ink-muted">{t.nav.readStatus}</span>}
              {!item.read && <span className="w-1.5 h-1.5 rounded-full bg-brand-main shrink-0" />}
            </div>
          </div>
          <span className="text-xs text-ink-muted shrink-0 mt-0.5 transition-transform" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            ▾
          </span>
        </div>

        {/* Expanded view: full details */}
        {isExpanded && (
          <div className="mt-2 pt-2 border-t border-edge" onClick={e => e.stopPropagation()}>
            {item.detail && (
              <div className="mb-2">
                <p className="text-[0.625rem] font-semibold text-ink-muted uppercase tracking-wider mb-0.5">{t.nav.details}</p>
                <p className="text-xs text-ink-primary leading-relaxed">{item.detail}</p>
              </div>
            )}
            {item.agentName && (
              <p className="text-[0.625rem] text-ink-muted mb-1">{t.nav.source} {item.agentName}</p>
            )}
            {item.toolName && (
              <p className="text-[0.625rem] text-ink-muted mb-1">{t.nav.tool} {item.toolName}</p>
            )}
            {showActions && (
              <div className="flex gap-2 mt-2">
                <button className="btn-brand text-xs" style={{ padding: '3px 10px', fontSize: '11px' }}
                  onClick={() => onApprove?.(item.id)}>{t.nav.approve}</button>
                <button className="btn-secondary text-xs" style={{ padding: '3px 10px', fontSize: '11px' }}
                  onClick={() => onDeny?.(item.id)}>{t.nav.deny}</button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div
        className="fixed z-50 card overflow-hidden"
        style={{
          top: '12px',
          left: `${sidebarWidth + 12}px`,
          width: '420px',
          maxHeight: '560px',
          overflowY: 'auto',
          boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
        }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
          <h3 className="text-sm font-semibold text-ink-primary">{t.nav.notifications}</h3>
          <div className="flex gap-2">
            <button className="btn-ghost text-xs" onClick={onMarkAllRead}>{t.nav.markAllRead}</button>
            <button className="btn-ghost text-xs text-ink-muted hover:text-ink-primary" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="card-bd-nopad">
          {items.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-2xl mb-2">🔔</p>
              <p className="text-sm text-ink-muted">{t.nav.noNotifications}</p>
            </div>
          )}

          {pendingApprovals.length > 0 && (
            <div className="px-4 py-2 text-xs font-semibold border-b border-edge"
              style={{ background: 'hsl(var(--warning-soft))', color: 'hsl(var(--warning))' }}>
              {t.nav.approvals}
            </div>
          )}
          {pendingApprovals.map((item) => renderItem(item, true))}

          {rest.length > 0 && (
            <div className="px-4 py-2 text-xs font-medium border-b border-edge"
              style={{ background: 'hsl(var(--surface-hover))', color: 'hsl(var(--ink-muted))' }}>
              {t.nav.earlier}
            </div>
          )}
          {rest.map((item) => renderItem(item, false))}
        </div>
      </div>
    </>
  );
}
