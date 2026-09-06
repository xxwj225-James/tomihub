import { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useProjectStore } from '@/stores/projectStore';
import { useAuthStore } from '@/stores/authStore';
import { issueApi, type IssueData } from '@/api/issueApi';
import { masterDataApi } from '@/api/masterDataApi';
import { DndContext, DragOverlay, closestCorners, useSensor, useSensors, PointerSensor, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import http from '@/lib/http';
import { cn } from '@/lib/cn';
import { useT } from '@/i18n/useT';
import { Bug as BugIcon } from 'lucide-react';

interface StatusDef { key: string; value: string; color?: string; }
interface IssueMap { [statusKey: string]: IssueData[]; }

// ─── Status color palette ────────────────────────────────────────────────────
const STATUS_THEME: Record<string, { dot: string; soft: string; border: string; gradient: string }> = {
  open:       { dot: '#6b7280', soft: 'hsl(220,14%,96%)',  border: 'hsl(220,14%,85%)', gradient: 'linear-gradient(180deg, hsl(220,14%,98%) 0%, hsl(220,14%,94%) 100%)' },
  todo:       { dot: '#6b7280', soft: 'hsl(220,14%,96%)',  border: 'hsl(220,14%,85%)', gradient: 'linear-gradient(180deg, hsl(220,14%,98%) 0%, hsl(220,14%,94%) 100%)' },
  in_progress:{ dot: '#f59e0b', soft: 'hsl(38,92%,96%)',   border: 'hsl(38,92%,80%)',  gradient: 'linear-gradient(180deg, hsl(38,92%,97%) 0%, hsl(38,92%,92%) 100%)' },
  in_review:  { dot: '#3b82f6', soft: 'hsl(217,91%,97%)',  border: 'hsl(217,91%,82%)', gradient: 'linear-gradient(180deg, hsl(217,91%,98%) 0%, hsl(217,91%,93%) 100%)' },
  done:       { dot: '#10b981', soft: 'hsl(142,71%,96%)',  border: 'hsl(142,71%,82%)', gradient: 'linear-gradient(180deg, hsl(142,71%,98%) 0%, hsl(142,71%,93%) 100%)' },
  cancelled:  { dot: '#ef4444', soft: 'hsl(0,84%,96%)',    border: 'hsl(0,84%,85%)',   gradient: 'linear-gradient(180deg, hsl(0,84%,98%) 0%, hsl(0,84%,93%) 100%)' },
  blocked:    { dot: '#ef4444', soft: 'hsl(0,84%,96%)',    border: 'hsl(0,84%,85%)',   gradient: 'linear-gradient(180deg, hsl(0,84%,98%) 0%, hsl(0,84%,93%) 100%)' },
};
const DEFAULT_THEME = { dot: '#6b7280', soft: 'hsl(220,14%,96%)', border: 'hsl(220,14%,85%)', gradient: 'linear-gradient(180deg, hsl(220,14%,98%) 0%, hsl(220,14%,94%) 100%)' };

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#ef4444', high: '#f59e0b', medium: '#6b7280', low: '#94a3b8',
};

const TYPE_ICONS: Record<string, string> = {
  feature: '✨', story: '📖', task: '✅', epic: '⚡', improvement: '🔧',
};

// ─── Draggable Card ──────────────────────────────────────────────────────────

function IssueCard({ issue, metrics }: { issue: IssueData; metrics: Record<string, unknown> }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: issue.id, data: issue });
  const navigate = useNavigate();
  const t = useT();
  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: isDragging ? 50 : undefined }
    : undefined;

  const m = (metrics[issue.id] || {}) as Record<string, unknown>;
  const complexityScore = Number(m.complexity_score) || 0;
  const commentCount = Number(m.comment_count) || 0;
  const daysStuck = Math.floor((Date.now() - new Date(issue.updatedAt || issue.createdAt).getTime()) / 86400000);
  const showPanorama = complexityScore >= 0.40;
  const showDebate = commentCount > 15;
  const stagnationAlert = (issue.priority === 'critical' && daysStuck >= 1) || (issue.priority === 'high' && daysStuck >= 3) || (daysStuck >= 7);
  const assigneeInitial = (issue.assigneeName || '?').charAt(0).toUpperCase();
  const isOverdue = issue.dueDate && new Date(issue.dueDate) < new Date();

  const handleClick = () => {
    if (!isDragging) navigate({ to: '/issues/$id', params: { id: issue.id } });
  };

  return (
    <div ref={setNodeRef} {...listeners} {...attributes} onClick={handleClick}
      className={cn(
        'group relative rounded-xl bg-white mb-2 transition-all duration-200',
        'hover:shadow-md hover:-translate-y-0.5',
        'border border-slate-200/80',
        isDragging && 'opacity-40 shadow-lg',
        stagnationAlert && 'ring-1 ring-red-300/60',
      )}
      style={{
        ...style,
        boxShadow: isDragging
          ? '0 8px 30px rgba(0,0,0,0.12)'
          : '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)',
      }}>
      <div className="px-3 py-2.5">
        {/* Top row: key + badges */}
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[0.6rem] font-mono text-slate-400 tracking-tight">
            {useProjectStore.getState().currentProject?.key || '?'}-{issue.issueNumber}
          </span>
          <div className="flex items-center gap-1">
            {issue.type === 'bug' ? (
              <BugIcon className="w-3.5 h-3.5 text-red-500" aria-label="bug" />
            ) : issue.type && TYPE_ICONS[issue.type] ? (
              <span className="text-[0.6rem] opacity-70" title={issue.type}>{TYPE_ICONS[issue.type]}</span>
            ) : null}
            {showDebate && <span title={t.board.cardDebate.replace('{n}', String(commentCount))} className="text-[0.55rem] bg-amber-50 text-amber-600 px-1 rounded font-medium cursor-help">💬{commentCount}</span>}
            {showPanorama && <span title={t.board.cardComplex} className="text-[0.55rem] bg-blue-50 text-blue-500 px-1 rounded font-medium animate-pulse cursor-help">🧠</span>}
            {stagnationAlert && (
              <span className="text-[0.55rem] bg-red-50 text-red-500 px-1 rounded font-medium cursor-help"
                title={t.board.stuckTip.replace('{title}', issue.title).replace('{d}', String(daysStuck)).replace('{p}', issue.priority || 'medium')}>
                ⚠{daysStuck}d
              </span>
            )}
          </div>
        </div>

        {/* Title */}
        <p className="text-[0.72rem] font-medium text-slate-800 leading-snug mb-2.5 line-clamp-2">
          {issue.title}
        </p>

        {/* Bottom row: priority + assignee + meta */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {/* Priority pill */}
            <span className={cn(
              'text-[0.55rem] font-semibold px-1.5 py-0.5 rounded-full tracking-wide uppercase',
              issue.priority === 'critical' ? 'bg-red-50 text-red-600' :
              issue.priority === 'high' ? 'bg-amber-50 text-amber-600' :
              issue.priority === 'medium' ? 'bg-slate-100 text-slate-500' :
              'bg-slate-50 text-slate-400',
            )}>
              {issue.priority || 'med'}
            </span>
            {issue.storyPoints && (
              <span className="text-[0.55rem] text-slate-400 font-medium bg-slate-50 px-1 rounded">{issue.storyPoints}sp</span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Due date */}
            {issue.dueDate && (
              <span className={cn(
                'text-[0.55rem] font-medium',
                isOverdue ? 'text-red-500' : 'text-slate-400',
              )}>
                {isOverdue ? '⚠' : '📅'} {new Date(issue.dueDate).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
              </span>
            )}
            {/* Assignee avatar */}
            <div className={cn(
              'w-5 h-5 rounded-full flex items-center justify-center text-[0.55rem] font-bold text-white shrink-0',
              issue.assigneeId ? 'bg-slate-500' : 'bg-slate-300',
            )}
              title={issue.assigneeName || 'Unassigned'}>
              {assigneeInitial}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Droppable Column ────────────────────────────────────────────────────────

function Column({ status, issues, wipLimit, viewMode, metrics, dropFlashId }: {
  status: StatusDef; issues: IssueData[];
  wipLimit?: number; viewMode: string; metrics: Record<string, unknown>;
  dropFlashId?: string | null;
}) {
  const navigate = useNavigate();
  const t = useT();
  const { setNodeRef, isOver } = useDroppable({ id: status.key });
  const wipExceeded = wipLimit != null && issues.length > wipLimit;
  const wipPercent = wipLimit ? Math.min(100, Math.round((issues.length / wipLimit) * 100)) : 0;
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const theme = STATUS_THEME[status.key] || DEFAULT_THEME;

  // Per-column pagination — independent page state per status column
  const PAGE_SIZE = 15;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visibleIssues = issues.slice(0, visibleCount);

  // When an issue is dropped into this column, make sure it is visible
  useEffect(() => {
    if (dropFlashId) {
      const idx = issues.findIndex(i => i.id === dropFlashId);
      if (idx >= 0 && idx >= visibleCount) setVisibleCount(idx + 1);
    }
  }, [dropFlashId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={setNodeRef}
      className={cn(
        'flex flex-col rounded-2xl shrink-0 transition-all duration-200',
        'min-w-[272px] max-w-[288px]',
        isOver && 'ring-2 ring-blue-300/60 scale-[1.01] shadow-lg',
      )}
      style={{
        background: theme.gradient,
        boxShadow: isOver
          ? '0 4px 20px rgba(59,130,246,0.15)'
          : '0 1px 4px rgba(0,0,0,0.04)',
      }}>
      {/* Header */}
      <div className="px-3.5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-white/60"
            style={{ background: theme.dot }} />
          <span className="text-xs font-bold text-slate-700 tracking-tight">{status.value}</span>
          <span
            className={cn(
              'text-[0.65rem] font-bold px-1.5 py-0.5 rounded-full min-w-[22px] text-center cursor-help',
              wipExceeded ? 'bg-red-100 text-red-600' : 'bg-white/70 text-slate-500',
            )}
            title={wipLimit
              ? (wipExceeded
                ? t.board.wipExceededTip.replace('{over}', String(issues.length - wipLimit)).replace('{limit}', String(wipLimit))
                : t.board.wipInfoTip.replace('{count}', String(issues.length)).replace('{limit}', String(wipLimit)))
              : t.board.columnCountTip.replace('{count}', String(issues.length))}>
            {issues.length}{wipLimit ? `/${wipLimit}` : ''}
          </span>
          {wipExceeded && (
            <span className="text-[0.55rem] font-bold text-red-500 bg-red-50 rounded-full px-1.5 py-0.5"
              title={t.board.wipExceededTip.replace('{over}', String(issues.length - (wipLimit || 0))).replace('{limit}', String(wipLimit || 0))}>
              +{issues.length - (wipLimit || 0)}
            </span>
          )}
        </div>
        {wipLimit && (
          <div className="flex items-center gap-1">
            {/* Mini WIP bar */}
            <div className="w-10 h-1.5 bg-white/60 rounded-full overflow-hidden">
              <div className={cn(
                'h-full rounded-full transition-all duration-300',
                wipPercent >= 100 ? 'bg-red-400' : wipPercent >= 70 ? 'bg-amber-400' : 'bg-emerald-400',
              )} style={{ width: `${wipPercent}%` }} />
            </div>
            {wipExceeded && <span className="text-[0.55rem] text-red-500 font-bold">!</span>}
          </div>
        )}
      </div>

      {/* Card list */}
      <SortableContext items={visibleIssues.map(i => i.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 overflow-y-auto px-2 pb-1" style={{ minHeight: '80px', maxHeight: viewMode === 'status' ? 'calc(100vh - 300px)' : '400px' }}>
          {visibleIssues.map(i => <IssueCard key={i.id} issue={i} metrics={metrics} />)}
          {issues.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center opacity-40">
              <span className="text-2xl mb-1">📋</span>
              <span className="text-[0.6rem] text-slate-400">Drop issues here</span>
            </div>
          )}
        </div>
      </SortableContext>

      {/* Pagination bar — fixed at column bottom, always visible when column exceeds one page */}
      {issues.length > PAGE_SIZE && (
        <div className="flex items-center justify-between px-2 py-1.5 mx-2 mb-1 rounded-lg bg-white/60 border border-white/70 shrink-0">
          <button
            className="w-7 h-6 flex items-center justify-center rounded-md text-[0.7rem] font-bold text-slate-500 hover:text-blue-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            onClick={() => setVisibleCount(c => Math.max(PAGE_SIZE, c - PAGE_SIZE))}
            disabled={visibleCount <= PAGE_SIZE}
            title={t.board.prevPage}>◀</button>
          <span className="text-[0.62rem] font-semibold text-slate-500">
            {Math.min(visibleCount, issues.length)} / {issues.length}
          </span>
          <button
            className="w-7 h-6 flex items-center justify-center rounded-md text-[0.7rem] font-bold text-slate-500 hover:text-blue-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            onClick={() => setVisibleCount(c => Math.min(issues.length, c + PAGE_SIZE))}
            disabled={visibleCount >= issues.length}
            title={t.board.nextPage}>▶</button>
        </div>
      )}

      {/* Quick create */}
      <div className="px-2 pb-2.5 shrink-0">
        {showQuickCreate ? (
          <div className="flex gap-1.5">
            <input className="flex-1 text-[0.65rem] px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white/80 focus:bg-white focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-200 transition-all"
              placeholder={t.board.quickCreatePlaceholder}
              value={quickTitle} onChange={e => setQuickTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && quickTitle.trim()) {
                  // New issues start from the workflow's initial status (backend default) —
                  // only the typed title carries over to the create page.
                  navigate({ to: `/issues/new?title=${encodeURIComponent(quickTitle.trim())}` });
                  setQuickTitle(''); setShowQuickCreate(false);
                }
                if (e.key === 'Escape') { setShowQuickCreate(false); setQuickTitle(''); }
              }}
              autoFocus />
            <button className="text-[0.6rem] text-slate-400 hover:text-slate-600 px-1"
              onClick={() => { setShowQuickCreate(false); setQuickTitle(''); }}>✕</button>
          </div>
        ) : (
          <button className="w-full text-[0.6rem] text-slate-400 hover:text-blue-500 py-2 rounded-lg hover:bg-white/50 transition-all duration-150 font-medium"
            onClick={() => setShowQuickCreate(true)}>
            {t.board.createIssueAtColumn}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Reopen Feedback Modal ───────────────────────────────────────────────────

function ReopenModal({ issue, onClose, onSubmit }: { issue: IssueData | null; onClose: () => void; onSubmit: (reason: string, note: string) => void }) {
  const t = useT();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  if (!issue) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl" style={{ width: '440px' }}>
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-800">
            {t.board.reopenTitle} — {useProjectStore.getState().currentProject?.key || '?'}-{issue.issueNumber}
          </h3>
        </div>
        <div className="flex flex-col gap-3 px-5 py-4">
          <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded-lg">{t.board.reopenDesc}</p>
          <div>
            <label className="text-[0.65rem] font-semibold text-slate-600 mb-1 block">{t.board.reopenReason}</label>
            <select className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 focus:border-blue-300 focus:ring-1 focus:ring-blue-200 focus:outline-none"
              value={reason} onChange={e => setReason(e.target.value)}>
              <option value="">{t.board.selectReason}</option>
              <option value="requirement_changed">{t.board.reqChanged}</option>
              <option value="bug_found">{t.board.bugFound}</option>
              <option value="implementation_wrong">{t.board.implWrong}</option>
              <option value="ai_review_incorrect">{t.board.aiReviewIncorrect}</option>
              <option value="other">{t.board.other}</option>
            </select>
          </div>
          <div>
            <label className="text-[0.65rem] font-semibold text-slate-600 mb-1 block">{t.board.aiLearnPlaceholder}</label>
            <textarea className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 focus:border-blue-300 focus:ring-1 focus:ring-blue-200 focus:outline-none resize-none"
              rows={2} placeholder={t.board.aiLearnPlaceholder}
              value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button className="px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
            onClick={onClose}>{t.board.cancel}</button>
          <button className="px-4 py-2 text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors disabled:opacity-40"
            disabled={!reason} onClick={() => onSubmit(reason, note)}>{t.board.submitReopen}</button>
        </div>
      </div>
    </div>
  );
}

// ─── AI Insight Banner ───────────────────────────────────────────────────────
// Board-view reading: one-line summary + a plain-language note per issue + suggested actions.
// Each insight's issues are clickable: a single one opens its detail page; multiple expand into an ID + Title list.

function AIInsight({ issues, statusDefs, metrics, projectKey }: {
  issues: IssueData[]; statusDefs: StatusDef[]; metrics: Record<string, Record<string, unknown>>; projectKey: string;
}) {
  const t = useT();
  const navigate = useNavigate();
  const b = t.board as unknown as Record<string, string>;
  const key = (i: IssueData) => `${projectKey || '?'}-${i.issueNumber}`;
  const isDone = (i: IssueData) => i.status === 'done' || i.status === 'cancelled';
  const daysSince = (i: IssueData) => Math.floor((Date.now() - new Date(i.updatedAt || i.createdAt).getTime()) / 86400000);
  const fill = (tpl: string, vars: Record<string, string | number>) =>
    Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), tpl);

  type Insight = { id: string; severity: 'danger' | 'warn' | 'info'; text: string; items: IssueData[] };
  const insights: Insight[] = [];
  const seen = new Set<string>();

  // 1. Overdue — most urgent
  issues.filter(i => !isDone(i) && i.dueDate && new Date(i.dueDate) < new Date())
    .slice(0, 2).forEach(i => {
      seen.add(i.id);
      insights.push({ id: `overdue-${i.id}`, severity: 'danger', text: fill(b.overdueTip, { title: i.title }), items: [i] });
    });

  // 2. Stuck — high-priority cards without movement
  issues.filter(i => !isDone(i) && !seen.has(i.id) && (
    (i.priority === 'critical' && daysSince(i) >= 1) || (i.priority === 'high' && daysSince(i) >= 3) || daysSince(i) >= 7
  )).slice(0, 3).forEach(i => {
    seen.add(i.id);
    insights.push({
      id: `stuck-${i.id}`, severity: 'danger',
      text: fill(b.stuckTip, { title: i.title, d: daysSince(i), p: i.priority || 'medium' }),
      items: [i],
    });
  });

  // 3. Bottleneck column — where the flow piles up
  // (status 'open' legacy values render in the todo column — keep counts consistent)
  const colIssuesOf = (s: StatusDef) => issues.filter(i => i.status === s.key || (i.status === 'open' && s.key === 'todo'));
  const colCounts = statusDefs.map((s, idx) => ({ ...s, idx, count: colIssuesOf(s).length }));
  const avgCount = colCounts.reduce((s, c) => s + c.count, 0) / Math.max(1, colCounts.length);
  const worst = colCounts
    .filter(c => c.count > avgCount * 2 && c.count > 2)
    .sort((a, bcc) => bcc.count - a.count)[0];
  if (worst) {
    const next = statusDefs[worst.idx + 1];
    const nextCount = next ? colIssuesOf(next).length : 0;
    insights.push({
      id: `bottleneck-${worst.key}`, severity: 'warn',
      text: fill(b.bottleneckTip, { count: worst.count, column: worst.value, nextColumn: next?.value || '—', nextCount }),
      items: colIssuesOf(worst),
    });
  }

  // 4. Heated debate — lots of comments
  const debate = issues.find(i => Number((metrics[i.id] || {}).comment_count) > 15);
  if (debate) {
    insights.push({
      id: `debate-${debate.id}`, severity: 'info',
      text: fill(b.debateTip, { n: Number((metrics[debate.id] || {}).comment_count) }),
      items: [debate],
    });
  }

  // 5. Complex + reopened — AI complexity score with reopen history
  const complex = issues.find(i => {
    const m = metrics[i.id] || {};
    return Number(m.complexity_score) >= 0.4 && Number(m.reopen_count) > 0;
  });
  if (complex) {
    insights.push({
      id: `complex-${complex.id}`, severity: 'info',
      text: fill(b.complexTip, { n: Number((metrics[complex.id] || {}).reopen_count) }),
      items: [complex],
    });
  }

  const MAX = 5;
  const shown = insights.slice(0, MAX);
  const extra = insights.length - MAX;
  const dotColor = { danger: 'hsl(var(--danger))', warn: 'hsl(var(--warning))', info: 'hsl(var(--brand))' };
  const textColor = { danger: 'text-danger', warn: 'text-warning', info: 'text-brand-main' };
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const openIssue = (id: string) => navigate({ to: '/issues/$id', params: { id } });

  return (
    <div className="mb-4 p-4 rounded-2xl border border-edge bg-surface-hover">
      <div className="flex items-center gap-2 mb-2.5 flex-wrap">
        <span className="text-base">🧠</span>
        <span className="text-[0.7rem] font-bold text-ink-primary tracking-tight">{b.aiAnalysis}</span>
        <span className={`text-[0.65rem] font-medium rounded-full px-2 py-0.5 ${insights.length === 0 ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'}`}>
          {insights.length === 0 ? b.aiSummaryOk : fill(b.aiSummaryAttention, { n: insights.length })}
        </span>
      </div>
      {shown.length > 0 && (
        <div className="space-y-1.5">
          {shown.map(in_ => (
            <div key={in_.id} className="flex items-start gap-2 text-[0.7rem] leading-relaxed">
              <span className="mt-[0.4rem] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dotColor[in_.severity] }} />
              <div className="flex-1 min-w-0">
                <span className={textColor[in_.severity]}>{in_.text}</span>{' '}
                {in_.items.length === 1 && (
                  <button className="font-mono font-semibold text-brand-main hover:underline cursor-pointer"
                    onClick={() => openIssue(in_.items[0].id)}>
                    {key(in_.items[0])} ↗
                  </button>
                )}
                {in_.items.length > 1 && (
                  <button className="ml-1 text-[0.62rem] font-semibold text-brand-main bg-surface-card hover:bg-surface-hover border border-edge rounded-full px-2 py-0.5 cursor-pointer transition-colors"
                    onClick={() => setExpandedId(expandedId === in_.id ? null : in_.id)}>
                    {fill(b.viewIssues, { n: in_.items.length })} {expandedId === in_.id ? '▴' : '▾'}
                  </button>
                )}
                {expandedId === in_.id && in_.items.length > 1 && (
                  <div className="mt-1.5 space-y-0.5 border-l-2 border-edge pl-2.5">
                    {in_.items.map(i => (
                      <button key={i.id}
                        className="block w-full text-left rounded px-1.5 py-0.5 hover:bg-surface-hover transition-colors cursor-pointer"
                        onClick={() => openIssue(i.id)}>
                        <span className="font-mono font-semibold text-brand-main">{key(i)}</span>{' '}
                        <span className="text-ink-secondary">{i.title}</span>{' '}
                        <span className="text-brand-main/60">↗</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {extra > 0 && <div className="text-[0.65rem] text-ink-muted pl-3.5">{fill(b.moreInsights, { n: extra })}</div>}
        </div>
      )}
    </div>
  );
}

// ─── Sprint Burndown (SVG) ───────────────────────────────────────────────────

function SprintBurndown({ issues, sprints, t }: { issues: IssueData[]; sprints: Array<{id:string; name:string; startDate:string; endDate:string; status:string}>; t: Record<string,string> }) {
  const active = sprints.find(s => s.status === 'active');
  // null = current active sprint; user can switch to any sprint
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null);
  const current = selectedSprintId ? sprints.find(s => s.id === selectedSprintId) : active;
  if (!current) return null;

  const start = new Date(current.startDate);
  const end = new Date(current.endDate);
  const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
  const totalSP = issues.filter(i => i.sprintId === current.id).reduce((s, i) => s + (Number(i.storyPoints) || 0), 0);
  if (totalSP === 0) return <p className="p-6 text-xs text-slate-400 text-center">No story points to track this sprint.</p>;

  const doneSP = issues.filter(i => i.sprintId === current.id && (i.status === 'done' || i.status === 'cancelled'))
    .reduce((s, i) => s + (Number(i.storyPoints) || 0), 0);
  const elapsed = Math.min(totalDays, Math.max(1, Math.ceil((Date.now() - start.getTime()) / 86400000)));
  const remaining = Math.max(0, totalSP - doneSP);

  const W = 560, H = 200, pad = { t: 15, r: 30, b: 35, l: 44 };
  const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
  const maxY = totalSP * 1.15;
  const x = (d: number) => pad.l + (d / totalDays) * pw;
  const y = (sp: number) => pad.t + ph - (sp / maxY) * ph;
  const y0 = y(0);
  const ideal = (day: number) => pad.t + ph - ((totalSP * (1 - day / totalDays)) / maxY) * ph;
  const idealLine = `M${x(0)},${ideal(0)} L${x(totalDays)},${ideal(totalDays)}`;
  const fillPath = `M${x(0)},${y0} L${x(0)},${y(totalSP)} L${x(elapsed)},${y(remaining)} L${x(elapsed)},${y0} Z`;
  const actualLine = `M${x(0)},${y(totalSP)} L${x(elapsed)},${y(remaining)}`;

  return (
    <div className="p-5" style={{ background: 'linear-gradient(180deg, #fff 0%, hsl(217,91%,98%) 100%)' }}>
      {/* Sprint switcher — defaults to the active sprint */}
      <div className="flex items-center justify-between mb-3">
        <select className="form-select text-xs" style={{ padding: '4px 8px', width: 'auto' }}
          value={current.id}
          onChange={e => setSelectedSprintId(e.target.value || null)}>
          {sprints.map(s => (
            <option key={s.id} value={s.id}>
              {s.name}{s.status === 'active' ? ' ●' : s.status === 'done' ? ' ✓' : ''}
            </option>
          ))}
        </select>
        <span className="text-[0.6rem] text-slate-400">
          {current.startDate} → {current.endDate}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: `${W}px`, overflow: 'visible' }}>
        <defs>
          <linearGradient id="burn-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
          </linearGradient>
          <filter id="burn-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map(pct => (
          <g key={pct}>
            <line x1={pad.l} y1={y(maxY * pct)} x2={pad.l + pw} y2={y(maxY * pct)}
              stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="4 4" />
            <text x={pad.l - 6} y={y(maxY * pct) + 3} textAnchor="end"
              className="text-[0.5rem]" fill="#94a3b8">{Math.round(maxY * pct)}</text>
          </g>
        ))}
        <path d={fillPath} fill="url(#burn-grad)" />
        <path d={idealLine} fill="none" stroke="#cbd5e1" strokeWidth="1.2" strokeDasharray="5 4" />
        <path d={actualLine} fill="none" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" filter="url(#burn-glow)" />
        <circle cx={x(0)} cy={y(totalSP)} r="3.5" fill="#fff" stroke="#3b82f6" strokeWidth="2" />
        <circle cx={x(elapsed)} cy={y(remaining)} r="8" fill="none" stroke="#3b82f6" strokeWidth="1.5" opacity="0.25">
          <animate attributeName="r" from="8" to="14" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.25" to="0" dur="2s" repeatCount="indefinite" />
        </circle>
        <circle cx={x(elapsed)} cy={y(remaining)} r="5" fill="#3b82f6" stroke="#fff" strokeWidth="2" />
        <text x={x(elapsed)} y={y(remaining) - 12} textAnchor="middle"
          className="text-[0.55rem] font-bold" fill="#3b82f6">{remaining} SP</text>
        <text x={x(totalDays)} y={ideal(totalDays) - 6} textAnchor="end"
          className="text-[0.5rem]" fill="#94a3b8">{t.idealLine || 'Ideal'}</text>
        <text x={pad.l} y={H - 6} textAnchor="start"
          className="text-[0.5rem]" fill="#94a3b8">{t.dayZero || 'Day 0'}</text>
        <text x={pad.l + pw} y={H - 6} textAnchor="end"
          className="text-[0.5rem]" fill="#94a3b8">{t.dayLabel?.replace('{n}', String(totalDays)) || `Day ${totalDays}`}</text>
      </svg>
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3 mt-3">
        {[
          { label: t.totalSP || 'Total SP', value: totalSP, color: '#475569' },
          { label: t.done || 'Done', value: doneSP, color: '#10b981' },
          { label: t.remaining || 'Remaining', value: remaining, color: '#3b82f6' },
          { label: 'Day', value: `${elapsed}/${totalDays}`, color: '#475569' },
        ].map(({ label, value, color }) => (
          <div key={label} className="text-center p-2.5 rounded-xl bg-white/70 border border-slate-100">
            <p className="text-[0.55rem] text-slate-400 uppercase tracking-wider font-semibold">{label}</p>
            <p className="text-lg font-bold mt-0.5" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>
      {/* Plain-language burn-down verdict */}
      {(() => {
        const idealRemaining = totalSP * (1 - elapsed / totalDays);
        const diff = Math.round(idealRemaining - remaining);
        if (diff >= 1) {
          return <p className="mt-3 text-[0.68rem] font-medium text-emerald-600">{t.burnAhead?.replace('{sp}', String(diff))}</p>;
        }
        if (diff <= -1) {
          return <p className="mt-3 text-[0.68rem] font-medium text-red-500">{t.burnBehind?.replace('{sp}', String(-diff))}</p>;
        }
        return <p className="mt-3 text-[0.68rem] font-medium text-slate-500">{t.burnOnTrack}</p>;
      })()}
    </div>
  );
}

// ═══════════════ MAIN PAGE ═══════════════

export function BoardPage() {
  const t = useT();
  const { currentProject } = useProjectStore();
  const reset = useProjectStore((s) => s.reset);
  const navigate = useNavigate();
  const userId = useAuthStore(s => s.user?.id);
  const canWrite = useAuthStore(s => s.canWrite)();
  const projectId = currentProject?.id;
  const methodology = (() => { try { return JSON.parse(currentProject?.settings || '{}').methodology || 'scrum'; } catch { return 'scrum'; } })();

  const [issues, setIssues] = useState<IssueData[]>([]);
  const [metrics, setMetrics] = useState<Record<string, Record<string, unknown>>>({});
  const [statusDefs, setStatusDefs] = useState<StatusDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'status' | 'person' | 'phase'>('status');
  // Phase dictionary (project-custom overrides global defaults) — issue.phase
  // stores the KEY, this maps it to the display label.
  const [phaseList, setPhaseList] = useState<Array<{ key: string; value: string }>>([]);
  useEffect(() => {
    http.get('/master-data?category=project_phase').then(({ data }: { data: Record<string, unknown> }) => {
      setPhaseList((data.data || []) as Array<{ key: string; value: string }>);
    }).catch(() => {});
    if (projectId) {
      http.get(`/projects/${projectId}/phases`).then(({ data }: { data: Record<string, unknown> }) => {
        const list = (data.data || []) as Array<{ key: string; value: string }>;
        if (list.length > 0) setPhaseList(list);
      }).catch(() => {});
    }
  }, [projectId]);
  const phaseLabel = (key: string) => phaseList.find(p => p.key === key)?.value || key;
  const [myOnly, setMyOnly] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Flash id of the last dropped issue — the target column auto-expands to reveal it
  const [dropFlash, setDropFlash] = useState<string | null>(null);
  const [reopenIssue, setReopenIssue] = useState<IssueData | null>(null);
  const [reopenTarget, setReopenTarget] = useState('');
  const [sprints, setSprints] = useState<Array<{id:string; name:string; startDate:string; endDate:string; status:string}>>([]);
  const [burndownOpen, setBurndownOpen] = useState(false);
  const [collapsedLanes, setCollapsedLanes] = useState<Set<string>>(new Set());

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    Promise.all([
      masterDataApi.list('issue_status', methodology).then((res) => {
        // Dedupe by display value — legacy seeds contain duplicate rows per methodology
        const seen = new Set<string>();
        const unique = ((res.data.data || []) as StatusDef[]).filter(s => {
          const v = (s.value || s.key).trim();
          if (!v || seen.has(v)) return false;
          seen.add(v);
          return true;
        });
        setStatusDefs(unique);
      }).catch(() => setStatusDefs([
        { key: 'todo', value: 'Todo', color: '#6b7280' },
        { key: 'in_progress', value: 'In Progress', color: '#f59e0b' },
        { key: 'in_review', value: 'In Review', color: '#3b82f6' },
        { key: 'done', value: 'Done', color: '#10b981' },
      ])),
      issueApi.list(projectId).then(({ data: resp }) => setIssues(resp.data?.items || [])).catch(() => {}),
      http.get(`/sprints?projectId=${projectId}`).then(({ data: d }) => {
        setSprints((d.data?.items || d.data || []) as Array<{id:string; name:string; startDate:string; endDate:string; status:string}>);
      }).catch(() => {}),
      http.get(`/issues/board-metrics?projectId=${projectId}`).then((res) => {
        const map: Record<string, Record<string, unknown>> = {};
        ((res.data as { data?: Array<Record<string, unknown>> }).data || []).forEach((m: Record<string, unknown>) => { map[m.id as string] = m; });
        setMetrics(map);
      }).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [projectId, methodology]);

  useEffect(() => { return () => reset(); }, [reset]);

  const issueMap: IssueMap = {};
  statusDefs.forEach(s => { issueMap[s.key] = issues.filter(i => i.status === s.key || (i.status === 'open' && s.key === 'todo')); });

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || !projectId) return;
    const issueId = active.id as string;
    const newStatus = over.id as string;
    const issue = issues.find(i => i.id === issueId);
    if (!issue || issue.status === newStatus) return;

    if (issue.status === 'done' && newStatus !== 'done' && newStatus !== 'cancelled') {
      setReopenIssue(issue);
      setReopenTarget(newStatus);
      return;
    }

    setIssues(prev => prev.map(i => i.id === issueId ? { ...i, status: newStatus } : i));
    setDropFlash(issueId);
    setTimeout(() => setDropFlash(cur => cur === issueId ? null : cur), 2000);
    try { await issueApi.update(issueId, { status: newStatus }); } catch {
      setIssues(prev => prev.map(i => i.id === issueId ? { ...i, status: issue.status } : i));
    }
  };

  const handleReopenSubmit = async (reason: string, note: string) => {
    if (!reopenIssue) return;
    const newStatus = reopenTarget;
    setIssues(prev => prev.map(i => i.id === reopenIssue.id ? { ...i, status: newStatus } : i));
    setReopenIssue(null);
    try {
      await issueApi.update(reopenIssue.id, { status: newStatus });
      http.post('/ai/evolution/feedback', { issueId: reopenIssue.id, featureType: 'ISSUE_REOPEN', reason, note }).catch(() => {});
    } catch {
      setIssues(prev => prev.map(i => i.id === reopenIssue.id ? { ...i, status: 'done' } : i));
    }
  };

  const displayIssues = myOnly ? issues.filter(i => i.assigneeId === userId) : issues;

  const buildSwimlanes = () => {
    if (viewMode === 'status') return [{ key: '_', label: '', issues: displayIssues }];
    if (viewMode === 'person') {
      const assignees = [...new Set(displayIssues.map(i => i.assigneeId || 'unassigned'))];
      return assignees.map(aid => ({
        key: aid, label: displayIssues.find(i => i.assigneeId === aid)?.assigneeName || 'Unassigned',
        issues: displayIssues.filter(i => (i.assigneeId || 'unassigned') === aid),
      }));
    }
    if (viewMode === 'phase') {
      const phases = [...new Set(displayIssues.map(i => (i as unknown as Record<string, unknown>).phase || 'no-phase'))] as string[];
      return phases.map(ph => ({
        key: ph, label: ph === 'no-phase' ? t.board.noPhase : phaseLabel(ph),
        issues: displayIssues.filter(i => (i as unknown as Record<string, unknown>).phase === ph || (!(i as unknown as Record<string, unknown>).phase && ph === 'no-phase')),
      }));
    }
    return [{ key: '_', label: '', issues: displayIssues }];
  };

  const swimlanes = buildSwimlanes();
  // WIP limits are project settings (Project Settings → Workflow); defaults are conventional kanban values
  const WIP_LIMITS: Record<string, number> = (() => {
    const defaults: Record<string, number> = { in_progress: 5, in_review: 4 };
    try {
      const cfg = JSON.parse(currentProject?.settings || '{}');
      if (cfg.wipLimits && typeof cfg.wipLimits === 'object') {
        Object.entries(cfg.wipLimits as Record<string, unknown>).forEach(([k, v]) => {
          const n = Number(v);
          if (n > 0) defaults[k] = n;
        });
      }
    } catch { /* keep defaults */ }
    return defaults;
  })();

  return (
    <div className="flex flex-col h-full" style={{ background: 'linear-gradient(180deg, hsl(220,20%,98%) 0%, hsl(220,20%,96%) 100%)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 backdrop-blur-sm bg-white/70 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-base font-bold text-slate-800 tracking-tight">{t.board.title}</h2>
          {currentProject && (
            <span className="text-xs text-slate-400 font-medium bg-slate-100 px-2.5 py-1 rounded-full">
              {currentProject.name} <span className="text-slate-300">·</span> {currentProject.key}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          <div className="flex rounded-xl bg-slate-100 p-0.5 shadow-inner">
            {(['status', 'person', 'phase'] as const).map(m => (
              <button key={m}
                className={cn(
                  'text-[0.65rem] font-semibold px-3.5 py-1.5 rounded-[10px] transition-all duration-200',
                  viewMode === m
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-400 hover:text-slate-600',
                )}
                onClick={() => setViewMode(m)}>
                {m === 'status' ? t.board.byStatus : m === 'person' ? t.board.byPerson : t.board.byPhase}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-[0.65rem] text-slate-500 cursor-pointer select-none font-medium">
            <input type="checkbox" className="w-3 h-3 rounded accent-blue-500" checked={myOnly} onChange={e => setMyOnly(e.target.checked)} />
            {t.board.myIssues}
          </label>
          {canWrite && (useProjectStore.getState().currentProject as unknown as Record<string, unknown> | null)?.status !== 'closed' && (
            <button className="inline-flex items-center gap-1.5 px-4 py-1.5 text-[0.7rem] font-semibold text-white bg-blue-500 hover:bg-blue-600 rounded-xl shadow-sm hover:shadow transition-all"
              onClick={() => navigate({ to: '/issues/new' })}>
              {t.board.newIssue}
            </button>
          )}
        </div>
      </div>

      {/* Drag hint */}
      <div className="px-5 pt-2 pb-1 flex items-center gap-2 text-[0.65rem] text-slate-400 shrink-0">
        <span className="text-slate-400">↕</span>
        <span>{t.board.dragHint}</span>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="p-4">
          <AIInsight issues={displayIssues} statusDefs={statusDefs} metrics={metrics}
            projectKey={(currentProject as unknown as Record<string, string> | null)?.key || ''} />

          {/* Sprint Burndown */}
          {sprints.filter(s => s.status === 'active').length > 0 && (
            <div className="rounded-2xl border border-slate-200/80 bg-white mb-4 overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-slate-50/50 transition-colors"
                onClick={() => setBurndownOpen(!burndownOpen)}>
                <div className="flex items-center gap-2">
                  <span className="text-base">📈</span>
                  <span className="text-[0.72rem] font-bold text-slate-700">
                    Sprint Burndown — {sprints.find(s => s.status === 'active')?.name}
                  </span>
                </div>
                <span className="text-[0.6rem] font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded-full">
                  {burndownOpen ? '▲ Hide' : '▼ Show'}
                </span>
              </div>
              {burndownOpen && <SprintBurndown issues={displayIssues} sprints={sprints} t={t.board} />}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
              <p className="text-sm text-slate-400 font-medium">{t.board.loading}</p>
            </div>
          ) : swimlanes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 opacity-50">
              <span className="text-4xl">📋</span>
              <p className="text-sm text-slate-400 font-medium">{t.board.empty}</p>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCorners}
              onDragStart={e => setActiveId(e.active.id as string)} onDragEnd={handleDragEnd}>
              {swimlanes.map(sw => {
                const isCollapsed = collapsedLanes.has(sw.key);
                return (
                <div key={sw.key} className="mb-5">
                  {sw.label && (
                    <div className="flex items-center gap-2 mb-3 px-1 cursor-pointer select-none"
                      onClick={() => setCollapsedLanes(prev => { const n = new Set(prev); if (n.has(sw.key)) n.delete(sw.key); else n.add(sw.key); return n; })}>
                      <span className="text-[0.6rem] text-slate-400">{isCollapsed ? '▶' : '▼'}</span>
                      <span className="text-[0.7rem] font-bold text-slate-600 uppercase tracking-wide">{sw.label}</span>
                      <span className="text-[0.6rem] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full font-medium">{sw.issues.length}</span>
                    </div>
                  )}
                  {!isCollapsed && (
                    <div className="flex gap-4 overflow-x-auto pb-3" style={{ minHeight: '220px' }}>
                      {statusDefs.map(s => {
                        const colIssues = sw.issues.filter(i => i.status === s.key || (i.status === 'open' && s.key === 'todo'));
                        return <Column key={`${sw.label}-${s.key}`} status={s} issues={colIssues} metrics={metrics}
                          wipLimit={WIP_LIMITS[s.key]} viewMode={viewMode} dropFlashId={dropFlash} />;
                      })}
                    </div>
                  )}
                </div>
              )})}
              <DragOverlay dropAnimation={null}>
                {activeId && (() => {
                  const issue = issues.find(i => i.id === activeId);
                  if (!issue) return null;
                  return (
                    <div className="rounded-xl bg-white shadow-2xl border border-blue-200 ring-1 ring-blue-100"
                      style={{ width: '270px', transform: 'rotate(2deg)' }}>
                      <div className="px-3.5 py-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[0.6rem] font-mono text-slate-400">
                            {useProjectStore.getState().currentProject?.key || '?'}-{issue.issueNumber}
                          </span>
                          {issue.priority && (
                            <span className="text-[0.55rem] font-semibold px-1.5 py-0.5 rounded-full"
                              style={{
                                color: PRIORITY_COLORS[issue.priority] || '#6b7280',
                                background: `${PRIORITY_COLORS[issue.priority]}10` || '#f1f5f9',
                              }}>
                              {issue.priority}
                            </span>
                          )}
                        </div>
                        <p className="text-[0.72rem] font-semibold text-slate-800 leading-snug">{issue.title}</p>
                      </div>
                    </div>
                  );
                })()}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      </div>

      <ReopenModal issue={reopenIssue} onClose={() => setReopenIssue(null)} onSubmit={handleReopenSubmit} />
    </div>
  );
}
