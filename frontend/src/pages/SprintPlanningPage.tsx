import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useProjectStore } from '@/stores/projectStore';
import { sprintApi } from '@/api/sprintApi';
import { issueApi, type IssueData } from '@/api/issueApi';
import { DndContext, DragOverlay, closestCorners, useSensor, useSensors, PointerSensor, useDraggable, useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/cn';
import { useT } from '@/i18n/useT';

// ─── Draggable Card ───
function IssueCard({ issue, projectKey }: { issue: IssueData; projectKey: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: issue.id, data: issue });
  const navigate = useNavigate();
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: isDragging ? 50 : undefined } : undefined;

  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      onClick={() => { if (!isDragging) navigate({ to: '/issues/$id', params: { id: issue.id } }); }}
      className={cn('p-2.5 rounded-card bg-surface-card border border-edge cursor-grab mb-1.5 transition-shadow hover:shadow-sm text-sm', isDragging && 'opacity-50')}
      style={style}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs text-ink-muted font-mono">{projectKey}-{issue.issueNumber}</span>
        <span className={cn('badge text-xs px-1 py-0.5 rounded',
          issue.priority === 'critical' ? 'bg-danger/10 text-danger' :
          issue.priority === 'high' ? 'bg-danger/10 text-danger' : 'bg-surface-card text-ink-muted'
        )}>{issue.priority || 'med'}</span>
      </div>
      <p className="text-ink-primary leading-snug line-clamp-2 mb-1.5">{issue.title}</p>
      <div className="flex items-center gap-2 text-xs text-ink-muted">
        <span className={cn('badge px-1 py-0.5 rounded',
          issue.type === 'bug' ? 'bg-danger/10 text-danger' : issue.type === 'epic' ? 'bg-purple-100 text-purple-700' : 'bg-brand-main/10 text-brand-main'
        )}>{issue.type || 'task'}</span>
        <span>{issue.storyPoints != null ? `${issue.storyPoints}sp` : '—'}</span>
        <span className="truncate">{issue.assigneeName || '—'}</span>
      </div>
    </div>
  );
}

// ─── Droppable Panel ───
function DroppablePanel({ id, title, count, points, children, className }: {
  id: string; title: string; count: number; points?: number; children: React.ReactNode; className?: string;
}) {
  const t = useT();
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef}
      className={cn('flex flex-col border border-edge rounded-card overflow-hidden transition-colors', isOver && 'bg-blue-50 dark:bg-blue-900/10 border-brand-main', className)}
    >
      <div className="flex items-center justify-between px-4 py-2.5 bg-surface-card border-b border-edge">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-ink-primary">{title}</h3>
          <span className="text-xs text-ink-muted">{count} {t.sprint.issues}</span>
        </div>
        {points !== undefined && <span className="text-xs font-semibold text-brand-main">{points} sp</span>}
      </div>
      <div className="flex-1 overflow-auto p-3">
        {children}
      </div>
    </div>
  );
}

// ─── Main Page ───
export function SprintPlanningPage() {
  const navigate = useNavigate();
  const { currentProject } = useProjectStore();
  const reset = useProjectStore((s) => s.reset);
  const projectId = currentProject?.id;
  const projectKey = currentProject?.key || '?';
  const t = useT();

  const [allIssues, setAllIssues] = useState<IssueData[]>([]);
  const [sprints, setSprints] = useState<Array<{ id: string; name: string; status: string; goal?: string }>>([]);
  const [selectedSprintId, setSelectedSprintId] = useState<string>('');

  // Create sprint inline
  const [showCreateSprint, setShowCreateSprint] = useState(false);
  const [newSprintName, setNewSprintName] = useState('');
  const [newSprintGoal, setNewSprintGoal] = useState('');
  const [newSprintStart, setNewSprintStart] = useState('');
  const [newSprintEnd, setNewSprintEnd] = useState('');

  // Drag state
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const fetchIssues = useCallback(() => {
    if (!projectId) return;
    issueApi.list(projectId).then(({ data: resp }) => setAllIssues(resp.data?.items || [])).catch(() => {});
  }, [projectId]);

  const fetchSprints = useCallback(() => {
    if (!projectId) return;
    sprintApi.list(projectId).then((res) => {
      const list = res.data.data?.items || [];
      setSprints(list);
      if (!selectedSprintId && list.length > 0) setSelectedSprintId(list[0].id);
    }).catch(() => {});
  }, [projectId, selectedSprintId]);

  useEffect(() => { fetchIssues(); fetchSprints(); }, [fetchIssues, fetchSprints]);

  useEffect(() => { return () => reset(); }, [reset]);

  // Filter issues
  const backlogIssues = allIssues.filter(i => !i.sprintId).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const sprintIssues = allIssues.filter(i => i.sprintId === selectedSprintId);
  const selectedSprint = sprints.find(s => s.id === selectedSprintId);
  const sprintPoints = sprintIssues.reduce((sum, i) => sum + (i.storyPoints || 0), 0);

  const handleDragEnd = async (event: unknown) => {
    setActiveId(null);
    const evt = event as { active: { id: unknown }; over?: { id: unknown } | null };
    const { active, over } = evt;
    if (!over) return;

    const issueId = String(active.id);
    const targetContainer = String(over.id); // "backlog" or "sprint"

    if (targetContainer === 'backlog') {
      // Move back to backlog
      await issueApi.update(issueId, { sprintId: '' } as Record<string, unknown>).catch(() => {});
    } else if (targetContainer === 'sprint' && selectedSprintId) {
      // Move to sprint
      await issueApi.update(issueId, { sprintId: selectedSprintId } as Record<string, unknown>).catch(() => {});
    }
    fetchIssues();
  };

  const handleCreateSprint = async () => {
    if (!newSprintName.trim() || !projectId) return;
    await sprintApi.create({
      projectId, name: newSprintName.trim(), goal: newSprintGoal.trim(),
      startDate: newSprintStart || new Date().toISOString().split('T')[0],
      endDate: newSprintEnd || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
    });
    setNewSprintName(''); setNewSprintGoal(''); setNewSprintStart(''); setNewSprintEnd('');
    setShowCreateSprint(false);
    fetchSprints();
  };

  const activeIssue = activeId ? allIssues.find(i => i.id === activeId) : null;

  if (!projectId) return <div className="p-6 text-sm text-ink-muted">Select a project to plan sprints.</div>;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="ch">
        <div className="flex items-center gap-3">
          <button className="btn-ghost p-2 -ml-2 text-sm" onClick={() => navigate({ to: '/backlog' })}>
            ← {t.sprint.backToBacklog}
          </button>
          <div>
            <h2 className="text-base font-semibold text-ink-primary">{t.sprint.planningTitle}</h2>
            <p className="text-xs text-ink-muted mt-0.5">{sprints.length} sprint{sprints.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <button className="btn-brand" onClick={() => setShowCreateSprint(!showCreateSprint)}>
          {t.sprint.newSprint}
        </button>
      </div>

      {/* Sprint selector bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-edge bg-surface-card/50">
        <label className="text-xs text-ink-muted">{t.sprint.sprint}:</label>
        <select className="form-select text-xs" style={{ padding: '5px 8px', width: '200px' }}
          value={selectedSprintId}
          onChange={e => setSelectedSprintId(e.target.value)}
        >
          <option value="">{t.sprint.noSprintsYet}</option>
          {sprints.map(s => <option key={s.id} value={s.id}>{s.name} ({s.status})</option>)}
        </select>
      </div>

      {/* Create Sprint Form */}
      {showCreateSprint && (
        <div className="flex items-center gap-3 px-4 py-3 bg-surface-hover/50 border-b border-edge">
          <input className="form-input text-sm flex-1" style={{ padding: '6px 10px' }}
            placeholder={t.sprint.namePlaceholder} value={newSprintName}
            onChange={e => setNewSprintName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreateSprint(); }} autoFocus />
          <input className="form-input text-sm" style={{ padding: '6px 10px', width: '200px' }}
            placeholder={t.sprint.goalOptional} value={newSprintGoal}
            onChange={e => setNewSprintGoal(e.target.value)} />
          <input type="date" className="form-input text-sm" style={{ padding: '6px 10px', width: '140px' }}
            value={newSprintStart} onChange={e => setNewSprintStart(e.target.value)} />
          <input type="date" className="form-input text-sm" style={{ padding: '6px 10px', width: '140px' }}
            value={newSprintEnd} onChange={e => setNewSprintEnd(e.target.value)} />
          <button className="btn-brand btn-xs" onClick={handleCreateSprint} disabled={!newSprintName.trim()}>{t.sprint.confirmCreate}</button>
        </div>
      )}

      {/* Dual Panels */}
      <div className="flex-1 grid p-4 gap-4 overflow-hidden" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <DndContext sensors={sensors} collisionDetection={closestCorners}
          onDragStart={e => setActiveId(e.active.id as string)}
          onDragEnd={handleDragEnd}>
          <DroppablePanel id="backlog" title={t.sprint.backlog} count={backlogIssues.length}>
            {backlogIssues.length === 0 ? (
              <p className="text-xs text-ink-muted text-center py-8">{t.sprint.allAssigned}</p>
            ) : (
              backlogIssues.map(issue => <IssueCard key={issue.id} issue={issue} projectKey={projectKey} />)
            )}
          </DroppablePanel>

          <DroppablePanel id="sprint" title={selectedSprint ? `${t.sprint.sprint}: ${selectedSprint.name}` : t.sprint.sprint} count={sprintIssues.length} points={sprintPoints}>
            {!selectedSprintId ? (
              <p className="text-xs text-ink-muted text-center py-8">{t.sprint.noSprintSelected}</p>
            ) : sprintIssues.length === 0 ? (
              <p className="text-xs text-ink-muted text-center py-8">{t.sprint.dropIssues}</p>
            ) : (
              sprintIssues.map(issue => <IssueCard key={issue.id} issue={issue} projectKey={projectKey} />)
            )}
          </DroppablePanel>

          <DragOverlay>
            {activeIssue && (
              <div className="p-2.5 rounded-card bg-surface-card border border-brand-main shadow-lg opacity-90 text-sm max-w-xs">
                <span className="text-xs text-ink-muted font-mono">{projectKey}-{activeIssue.issueNumber}</span>
                <p className="text-ink-primary leading-snug line-clamp-2">{activeIssue.title}</p>
                <span className="text-xs text-ink-muted">{activeIssue.storyPoints != null ? `${activeIssue.storyPoints}sp` : '—'}</span>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Summary Footer */}
      {selectedSprintId && (
        <div className="flex items-center gap-4 px-4 py-2 border-t border-edge bg-surface-card text-xs text-ink-muted">
          <span>{t.sprint.total}: <strong className="text-ink-primary">{sprintPoints} sp</strong> committed</span>
          <span>|</span>
          <span>{sprintIssues.filter(i => i.type === 'bug').length} {t.sprint.bugs}</span>
          <span>{sprintIssues.filter(i => i.type === 'story').length} {t.sprint.stories}</span>
          <span>{sprintIssues.filter(i => i.type === 'task').length} {t.sprint.tasks}</span>
          {sprintIssues.filter(i => !i.storyPoints).length > 0 && (
            <span className="text-warning">⚠ {sprintIssues.filter(i => !i.storyPoints).length} {t.sprint.unestimated}</span>
          )}
        </div>
      )}
    </div>
  );
}
