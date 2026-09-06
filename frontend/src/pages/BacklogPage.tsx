import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useProjectStore } from '@/stores/projectStore';
import { issueApi, type IssueData } from '@/api/issueApi';
import { sprintApi } from '@/api/sprintApi';
import { DndContext, DragOverlay, closestCenter, useSensor, useSensors, PointerSensor, type DragStartEvent, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/cn';
import { useT } from '@/i18n/useT';

const ISSUE_TYPES = ['All Types', 'Bug', 'Task', 'Story', 'Epic'] as const;
const PRIORITIES = ['All Priority', 'Critical', 'High', 'Medium', 'Low'] as const;

// ─── Sortable Issue Row ───
function BacklogIssueRow({ issue, projectKey, sprints, onAddToSprint, dragEnabled }: {
  issue: IssueData;
  projectKey: string;
  sprints: Array<{ id: string; name: string; status: string }>;
  onAddToSprint: (issueId: string, sprintId: string) => void;
  dragEnabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: issue.id, disabled: !dragEnabled });
  const navigate = useNavigate();
  const t = useT();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.6 : undefined,
  };

  const handleClick = () => {
    if (!isDragging) navigate({ to: '/issues/$id', params: { id: issue.id } });
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}
      className={cn('hover-row flex items-center gap-3 px-4 py-2.5 border-b border-edge text-sm cursor-pointer')}
      onClick={handleClick}
    >
      {dragEnabled ? (
        <span {...listeners} className="cursor-grab text-ink-muted select-none shrink-0">≡</span>
      ) : (
        <span className="text-ink-muted shrink-0 w-5 text-center select-none text-[0.6rem]">·</span>
      )}
      <span className="text-xs text-ink-muted font-mono shrink-0 w-16">{projectKey}-{issue.issueNumber}</span>
      <span className="flex-1 truncate font-medium text-ink-primary">{issue.title}</span>
      <span className={cn('badge shrink-0 w-14 text-center text-xs px-1.5 py-0.5 rounded truncate',
        issue.type === 'bug' ? 'bg-danger/10 text-danger' :
        issue.type === 'epic' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' :
        issue.type === 'story' ? 'bg-brand-main/10 text-brand-main' : 'bg-surface-card text-ink-muted'
      )}>{issue.type || 'task'}</span>
      <span className={cn('badge shrink-0 w-20 text-center text-xs px-1.5 py-0.5 rounded truncate',
        issue.priority === 'critical' ? 'bg-danger/10 text-danger font-semibold' :
        issue.priority === 'high' ? 'bg-danger/10 text-danger' :
        issue.priority === 'low' ? 'bg-surface-card text-ink-muted' : 'bg-warning/10 text-amber-700'
      )}>{issue.priority || 'medium'}</span>
      <span className="text-xs shrink-0 w-8 text-right font-semibold text-ink-primary">
        {issue.storyPoints != null ? `${issue.storyPoints}` : '-'}
      </span>
      <span className="text-xs shrink-0 w-20 truncate text-ink-muted">{issue.assigneeName || issue.assigneeId || '—'}</span>
      {sprints.length > 0 && (
        <select className="form-select text-xs shrink-0" style={{ padding: '2px 6px', width: '120px' }}
          value=""
          onChange={e => { if (e.target.value) onAddToSprint(issue.id, e.target.value); }}
        >
          <option value="">{t.backlog.addSprint}</option>
          {sprints.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
    </div>
  );
}

// ─── Inline Create Row ───
function InlineCreateRow({ projectId, onCreate }: {
  projectId: string;
  onCreate: () => void;
}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('Task');
  const [creating, setCreating] = useState(false);
  const t = useT();

  const handleCreate = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      await issueApi.create({ projectId, title: title.trim(), type: type.toLowerCase() });
      setTitle('');
      onCreate();
    } catch { /* ignore */ }
    finally { setCreating(false); }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-edge bg-surface-hover/50">
      <span className="text-ink-muted shrink-0 w-5 text-center">+</span>
      <input className="form-input flex-1 text-sm" style={{ padding: '6px 10px' }}
        placeholder={t.backlog.quickCreatePlaceholder}
        value={title} onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }} autoFocus />
      <select className="form-select text-xs shrink-0" style={{ padding: '4px 8px', width: '80px' }}
        value={type} onChange={e => setType(e.target.value)}>
        {['Task', 'Bug', 'Story'].map(t => <option key={t}>{t}</option>)}
      </select>
      <button className="btn-brand btn-xs" onClick={handleCreate} disabled={creating || !title.trim()}>
        {creating ? '...' : t.backlog.create}
      </button>
    </div>
  );
}

// ─── Main Page ───
export function BacklogPage() {
  const navigate = useNavigate();
  const { currentProject } = useProjectStore();
  const reset = useProjectStore((s) => s.reset);
  const projectId = currentProject?.id;
  const projectKey = currentProject?.key || '?';
  const isScrum = (() => { try { return JSON.parse(currentProject?.settings || '{}').methodology === 'scrum'; } catch { return false; } })();
  const t = useT();

  const [issues, setIssues] = useState<IssueData[]>([]);
  const [sprints, setSprints] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All Types');
  const [priorityFilter, setPriorityFilter] = useState('All Priority');
  const [showCreate, setShowCreate] = useState(false);

  // Drag state
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // Column sorting — while a column sort is active, drag ordering is disabled
  const [sortKey, setSortKey] = useState<'key' | 'title' | 'type' | 'priority' | 'points' | 'assignee' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const sortBy = (key: 'key' | 'title' | 'type' | 'priority' | 'points' | 'assignee') => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const fetchIssues = useCallback(() => {
    if (!projectId) return;
    issueApi.list(projectId).then(({ data: resp }) => {
      const all = resp.data?.items || [];
      // Sort by sortOrder for backlog, then filter for backlog (no sprint)
      const sorted = [...all].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      setIssues(sorted.filter(i => !i.sprintId));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { fetchIssues(); }, [fetchIssues]);

  useEffect(() => {
    if (!projectId) return;
    sprintApi.list(projectId).then((res) => {
      setSprints(res.data.data?.items || []);
    }).catch(() => {});
  }, [projectId]);

  useEffect(() => { return () => reset(); }, [reset]);

  // Filter
  const filtered = issues.filter(i => {
    if (typeFilter !== 'All Types' && i.type !== typeFilter.toLowerCase()) return false;
    if (priorityFilter !== 'All Priority' && i.priority !== priorityFilter.toLowerCase()) return false;
    if (search && !i.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Column sorting (applied on top of filters; null = natural sortOrder for drag)
  const sortedFiltered = (() => {
    if (!sortKey) return filtered;
    const dir = sortDir === 'asc' ? 1 : -1;
    const prioWeight = (p?: string) => p === 'critical' ? 4 : p === 'high' ? 3 : p === 'medium' ? 2 : 1;
    return [...filtered].sort((a, b) => {
      let va: string | number, vb: string | number;
      if (sortKey === 'key') { va = a.issueNumber; vb = b.issueNumber; }
      else if (sortKey === 'title') { va = a.title.toLowerCase(); vb = b.title.toLowerCase(); }
      else if (sortKey === 'type') { va = a.type || ''; vb = b.type || ''; }
      else if (sortKey === 'priority') { va = prioWeight(a.priority); vb = prioWeight(b.priority); }
      else if (sortKey === 'points') { va = a.storyPoints ?? -1; vb = b.storyPoints ?? -1; }
      else { va = (a.assigneeName || a.assigneeId || '').toLowerCase(); vb = (b.assigneeName || b.assigneeId || '').toLowerCase(); }
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return 0;
    });
  })();

  // Drag handlers
  const handleDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id));
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortedFiltered.findIndex(i => i.id === active.id);
    const newIndex = sortedFiltered.findIndex(i => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    // Determine beforeId/afterId for rank API
    let beforeId: string | undefined;
    let afterId: string | undefined;

    if (newIndex < oldIndex) {
      // Moving up: place before the over item
      const overItem = sortedFiltered[newIndex];
      beforeId = overItem.id;
      const prevItem = sortedFiltered[newIndex - 1];
      if (prevItem) afterId = prevItem.id;
    } else {
      // Moving down: place after the over item
      const overItem = sortedFiltered[newIndex];
      afterId = overItem.id;
      const nextItem = filtered[newIndex + 1];
      if (nextItem) beforeId = nextItem.id;
    }

    issueApi.updateRank(String(active.id), beforeId, afterId).then(() => fetchIssues()).catch(() => fetchIssues());
  };

  const handleAddToSprint = async (issueId: string, sprintId: string) => {
    await issueApi.update(issueId, { sprintId } as Record<string, unknown>);
    fetchIssues();
  };

  const activeIssue = activeId ? issues.find(i => i.id === activeId) : null;

  if (!projectId) return <div className="p-6 text-sm text-ink-muted">{t.backlog.noProject}</div>;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="ch">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-ink-primary">{t.backlog.title}</h1>
          <span className="text-xs text-ink-muted">{filtered.length} {t.backlog.issues}</span>
        </div>
        <div className="flex items-center gap-2">
          {isScrum && (
            <button className="btn-ghost btn-xs" onClick={() => navigate({ to: '/sprints/planning' })}>
              {t.backlog.sprintPlanning} →
            </button>
          )}
          <button className="btn-brand btn-xs" onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? t.backlog.cancel : t.backlog.newIssue}
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-edge bg-surface-card/50">
        <input className="form-input text-sm" style={{ padding: '6px 10px', width: '220px' }}
          placeholder={t.backlog.searchPlaceholder} value={search} onChange={e => setSearch(e.target.value)} />
        <select className="form-select text-xs" style={{ padding: '6px 8px', width: '120px' }}
          value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          {ISSUE_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        <select className="form-select text-xs" style={{ padding: '6px 8px', width: '120px' }}
          value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
          {PRIORITIES.map(p => <option key={p}>{p}</option>)}
        </select>
      </div>

      {/* Inline Create */}
      {showCreate && <InlineCreateRow projectId={projectId} onCreate={fetchIssues} />}

      {/* Backlog List */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-8 text-center text-ink-muted text-sm">{t.backlog.loading}</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-ink-muted text-sm">
            {issues.length === 0 ? t.backlog.emptyNoIssues : t.backlog.emptyNoMatch}
          </div>
        ) : (
          <>
            {/* Column headers — click to sort */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-edge bg-surface-card/60 text-[0.6rem] font-semibold uppercase tracking-wider text-ink-muted sticky top-0 z-10">
              <span className="w-5 shrink-0" />
              <button className="text-left hover:text-brand-main transition-colors shrink-0 w-16" onClick={() => sortBy('key')}>
                {t.backlog.colKey}{sortKey === 'key' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
              </button>
              <button className="text-left hover:text-brand-main transition-colors flex-1 truncate" onClick={() => sortBy('title')}>
                {t.backlog.colTitle}{sortKey === 'title' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
              </button>
              <button className="text-left hover:text-brand-main transition-colors shrink-0 w-14" onClick={() => sortBy('type')}>
                {t.backlog.colType}{sortKey === 'type' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
              </button>
              <button className="text-left hover:text-brand-main transition-colors shrink-0 w-20" onClick={() => sortBy('priority')}>
                {t.backlog.colPriority}{sortKey === 'priority' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
              </button>
              <button className="text-right hover:text-brand-main transition-colors shrink-0 w-8" onClick={() => sortBy('points')}>
                {t.backlog.colPoints}{sortKey === 'points' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
              </button>
              <button className="text-left hover:text-brand-main transition-colors shrink-0 w-20" onClick={() => sortBy('assignee')}>
                {t.backlog.colAssignee}{sortKey === 'assignee' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
              </button>
              {sortKey && (
                <button className="shrink-0 text-ink-muted hover:text-danger transition-colors normal-case tracking-normal" title={t.backlog.clearSort}
                  onClick={() => setSortKey(null)}>✕</button>
              )}
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter}
              onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <SortableContext items={sortedFiltered.map(i => i.id)} strategy={verticalListSortingStrategy}>
                {sortedFiltered.map(issue => (
                  <BacklogIssueRow key={issue.id} issue={issue} projectKey={projectKey}
                    sprints={sprints} onAddToSprint={handleAddToSprint} dragEnabled={!sortKey} />
                ))}
              </SortableContext>
              <DragOverlay>
                {activeIssue && (
                  <div className="flex items-center gap-3 px-4 py-2.5 bg-surface-card border border-edge shadow-lg rounded opacity-90 text-sm">
                    <span className="text-ink-muted">≡</span>
                    <span className="text-xs text-ink-muted font-mono">{projectKey}-{activeIssue.issueNumber}</span>
                    <span className="flex-1 truncate">{activeIssue.title}</span>
                    <span className="text-xs">{activeIssue.storyPoints != null ? `${activeIssue.storyPoints}sp` : '-'}</span>
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          </>
        )}
      </div>
    </div>
  );
}
