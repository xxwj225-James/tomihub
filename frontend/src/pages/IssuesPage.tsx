import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useProjectStore } from '@/stores/projectStore';
import { useAuthStore } from '@/stores/authStore';
import { issueApi, type IssueData, type MemberInfo } from '@/api/issueApi';
import http from '@/lib/http';
import { useT } from '@/i18n/useT';
import { cn, safeArray } from '@/lib/cn';
import { RefreshCw } from 'lucide-react';
import { IssueFilterToolbar } from '@/components/issue/IssueFilterToolbar';
import { IssueTable, buildColumns, type SortField, type SortDir } from '@/components/issue/IssueTable';


export function IssuesPage() {
  const t = useT();
  const navigate = useNavigate();
  const { currentProject } = useProjectStore();
  const reset = useProjectStore((s) => s.reset);

  // ─── Filters ───
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All Types');
  const [priorityFilter, setPriorityFilter] = useState('All Priority');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [creatorFilter, setCreatorFilter] = useState('');
  const [members, setMembers] = useState<MemberInfo[]>([]);

  // ─── Data ───
  const [issues, setIssues] = useState<IssueData[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // ─── Sort ───
  const [sortField, setSortField] = useState<SortField>('issueNumber');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // ─── Columns ───
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() =>
    new Set(buildColumns(t).filter(c => c.defaultVisible).map(c => c.field)),
  );
  const toggleColumn = (field: string) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  };

  const routeSearch = useSearch({ strict: false }) as { view?: string; status?: string; type?: string; priority?: string; assignee?: string; creator?: string };
  const view = routeSearch.view || 'project';
  const statusFilter = routeSearch.status || '';
  // URL filters (e.g. from Board/Health risk links) — re-applied whenever the
  // search params change, because the page may already be mounted in SPA history.
  const initTypeFilter = routeSearch.type ? routeSearch.type.charAt(0).toUpperCase() + routeSearch.type.slice(1) : 'All Types';
  const initPriorityFilter = routeSearch.priority ? routeSearch.priority.charAt(0).toUpperCase() + routeSearch.priority.slice(1) : 'All Priority';
  const user = useAuthStore((s) => s.user);
  // assignee=me (from Home "my tasks" links) maps to the current user's id,
  // so the toolbar dropdown shows their name like a normal member selection.
  const initAssigneeFilter = routeSearch.assignee === 'unassigned' ? 'unassigned'
    : routeSearch.assignee === 'me' ? (user?.id || '')
    : (routeSearch.assignee || '');
  // creator=me (from the Home "Created by Me" card) fills the creator filter with my name
  const initCreatorFilter = routeSearch.creator === 'me' ? (user?.displayName || '') : '';
  useEffect(() => {
    setTypeFilter(initTypeFilter);
    setPriorityFilter(initPriorityFilter);
    setAssigneeFilter(initAssigneeFilter);
    setCreatorFilter(initCreatorFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSearch.type, routeSearch.priority, routeSearch.assignee, routeSearch.creator]);
  const projectId = currentProject?.id;
  const projectKey = currentProject?.key || '?';
  const methodology = (() => { try { return JSON.parse(currentProject?.settings || '{}').methodology || ''; } catch { return ''; } })();
  const isScrum = methodology === 'scrum';

  // Sprint list for Scrum sidebar
  interface SprintData { id: string; name: string; status: string; startDate: string; endDate: string; }
  const [sprints, setSprints] = useState<SprintData[]>([]);
  const [selectedSprint, setSelectedSprint] = useState<string>('');
  const [showNewSprint, setShowNewSprint] = useState(false);
  const [sprintName, setSprintName] = useState('');
  const [sprintGoal, setSprintGoal] = useState('');
  const [sprintStart, setSprintStart] = useState('');
  const [sprintEnd, setSprintEnd] = useState('');
  const [sprintSaving, setSprintSaving] = useState(false);

  const handleCreateSprint = async () => {
    if (!sprintName.trim()) return;
    setSprintSaving(true);
    try {
      await http.post('/sprints', { projectId, name: sprintName.trim(), goal: sprintGoal.trim(), startDate: sprintStart, endDate: sprintEnd });
      const { data } = await http.get(`/sprints?projectId=${projectId}`);
      const sprintsPr = data as { data?: { items?: SprintData[] } };
      setSprints(sprintsPr?.data?.items || []);
      setShowNewSprint(false); setSprintName(''); setSprintGoal(''); setSprintStart(''); setSprintEnd('');
    } catch { /* */ }
    finally { setSprintSaving(false); }
  };

  useEffect(() => {
    if (!isScrum || !projectId) return;
    http.get(`/sprints?projectId=${projectId}`).then((resp) => {
      const sprintsPr = resp.data as { data?: { items?: SprintData[] } };
      setSprints(sprintsPr?.data?.items || []);
    }).catch(() => {});
  }, [projectId, isScrum]);

  const fetchIssues = useCallback(() => {
    setRefreshing(true);
    if (view === 'my-tasks') {
      issueApi.listMyTasks()
        .then(({ data: resp }) => setIssues(resp.data?.items || []))
        .finally(() => { setRefreshing(false); setLoading(false); });
    } else if (view === 'created-by-me') {
      issueApi.listCreatedByMe()
        .then(({ data: resp }) => setIssues(resp.data?.items || []))
        .finally(() => { setRefreshing(false); setLoading(false); });
    } else if (view === 'in-progress') {
      issueApi.listMyTasks()
        .then(({ data: resp }) => setIssues((resp.data?.items || []).filter(i => i.status === 'in_progress')))
        .finally(() => { setRefreshing(false); setLoading(false); });
    } else if (view === 'completed') {
      issueApi.listMyTasks()
        .then(({ data: resp }) => setIssues((resp.data?.items || []).filter(i => i.status === 'done')))
        .finally(() => { setRefreshing(false); setLoading(false); });
    } else if (projectId) {
      issueApi.list(projectId)
        .then(({ data: resp }) => setIssues(resp.data?.items || []))
        .finally(() => { setRefreshing(false); setLoading(false); });
    } else { setLoading(false); setRefreshing(false); }
  }, [projectId, view]);

  useEffect(() => {
    setLoading(true);
    fetchIssues();
  }, [fetchIssues]);

  useEffect(() => { return () => reset(); }, [reset]);

  // Tenant-level members — needed for the assignee dropdown even without a
  // current project (cross-project "my tasks" views opened from Home)
  useEffect(() => {
    issueApi.listMembers().then(({ data: resp }) => setMembers(safeArray(resp.data))).catch(() => {});
  }, []);

  // ─── Filter + Sort ───
  const filtered = issues.filter(i => {
    // status=open is a virtual filter: everything not done/cancelled (matches AI count scopes)
    if (statusFilter === 'open') {
      if (i.status === 'done' || i.status === 'cancelled') return false;
    } else if (statusFilter === 'todo') {
      // Home "TODO" card scope: active but not started (no progress/review state)
      if (i.status === 'done' || i.status === 'cancelled' || i.status === 'in_progress' || i.status === 'in_review') return false;
    } else if (statusFilter && i.status !== statusFilter) return false;
    // Assignee filter: 'unassigned' is a virtual filter; otherwise match by member id
    if (assigneeFilter === 'unassigned') { if (i.assigneeId) return false; }
    else if (assigneeFilter) { if (i.assigneeId !== assigneeFilter) return false; }
    if (typeFilter !== 'All Types' && i.type !== typeFilter.toLowerCase()) return false;
    // Multi-value priority filter (e.g. "critical,high" from AI risk links)
    if (priorityFilter !== 'All Priority') {
      const wanted = priorityFilter.toLowerCase().split(',').map(p => p.trim());
      if (!wanted.includes(i.priority)) return false;
    }
    if (search && !i.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (creatorFilter) {
      const member = members.find(m => m.displayName === creatorFilter || m.email === creatorFilter);
      if (member && i.reporterId !== member.id) return false;
    }
    // Sprint filter
    if (selectedSprint === '__backlog') { if (i.sprintId) return false; }
    else if (selectedSprint) { if (i.sprintId !== selectedSprint) return false; }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortField === 'issueNumber') return sortDir === 'asc' ? (a.issueNumber - b.issueNumber) : (b.issueNumber - a.issueNumber);
    if (sortField === 'storyPoints') {
      const sa = a.storyPoints ?? 0; const sb = b.storyPoints ?? 0;
      return sortDir === 'asc' ? (sa - sb) : (sb - sa);
    }
    if (sortField === 'assignee') {
      const va = a.assigneeName || ''; const vb = b.assigneeName || '';
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    if (sortField === 'reporter') {
      const va = a.reporterId || ''; const vb = b.reporterId || '';
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    if (sortField === 'createdAt') {
      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return sortDir === 'asc' ? (da - db) : (db - da);
    }
    const va = ((a as unknown as Record<string, unknown>)[sortField] ?? '').toString().toLowerCase();
    const vb = ((b as unknown as Record<string, unknown>)[sortField] ?? '').toString().toLowerCase();
    return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const visibleColDefs = buildColumns(t).filter(c => visibleColumns.has(c.field));

  // Human-readable label for the assignee URL param (member id / 'unassigned' / 'me')
  const assigneeBadge = routeSearch.assignee
    ? (routeSearch.assignee === 'unassigned' ? t.issues.unassigned
      : routeSearch.assignee === 'me' ? (user?.displayName || t.issues.assignedToMe)
      : (members.find(m => m.id === routeSearch.assignee)?.displayName || routeSearch.assignee))
    : '';

  return (
    <div className="flex flex-col h-full">
      {/* ═══ HEADER ═══ */}
      <div className="ch">
        <div>
          <h2 className="text-base font-semibold text-ink-primary">
            {view === 'my-tasks' ? t.issues.myTasks : view === 'created-by-me' ? t.issues.createdByMe : view === 'in-progress' ? t.home.inProgress : view === 'completed' ? t.home.completed : t.nav.issues}
          </h2>
          {statusFilter || priorityFilter.includes(',') || (routeSearch.type ? true : false) || assigneeBadge || creatorFilter ? (
            <p className="text-xs text-ink-muted mt-0.5">
              Filtered by:{' '}
              {statusFilter && <span className="badge tag-b">{statusFilter}</span>}
              {priorityFilter.includes(',') && <span className="badge tag-b ml-1">⚠ {priorityFilter}</span>}
              {routeSearch.type && <span className="badge tag-b ml-1">{initTypeFilter}</span>}
              {assigneeBadge && <span className="badge tag-b ml-1">{assigneeBadge}</span>}
              {creatorFilter && <span className="badge tag-b ml-1">👤 {creatorFilter}</span>}
              <span className="text-brand-main cursor-pointer ml-2" onClick={() => navigate({ to: '/issues' })}>{t.issues.clearFilter}</span>
            </p>
          ) : view !== 'project' ? (
            <p className="text-xs text-ink-muted mt-0.5">
              Across all projects · <span className="text-brand-main cursor-pointer" onClick={() => navigate({ to: '/issues' })}>← {t.issues.backToProject}</span>
            </p>
          ) : currentProject ? (
            <p className="text-xs text-ink-muted mt-0.5">{currentProject.name} ({currentProject.key})</p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost px-2" title={t.issues.refresh} onClick={fetchIssues} disabled={refreshing}>
            <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
          </button>
          {(useProjectStore.getState().currentProject as unknown as Record<string, unknown> | null)?.status !== 'closed' && (
            <button className="btn-brand" onClick={() => navigate({ to: '/issues/new' })}>{t.issues.newIssue}</button>
          )}
        </div>
      </div>

      {/* ═══ SPRINT + ISSUE LAYOUT ═══ */}
      <div className="flex-1 flex overflow-hidden" style={{ display: 'grid', gridTemplateColumns: isScrum ? '220px 1fr' : '1fr' }}>

        {/* ── Sprint Sidebar (Scrum only) ── */}
        {isScrum && (
          <div className="border-r border-edge bg-surface-card overflow-y-auto p-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[0.6875rem] font-semibold text-ink-muted uppercase tracking-wider">{t.issues.sprints}</h4>
              <button className="btn-ghost text-[0.65rem] text-brand-main px-1" onClick={() => setShowNewSprint(true)}>+ {t.issues.newSprint}</button>
            </div>
            <div
              className={`py-2 px-2.5 rounded-card text-xs mb-1 cursor-pointer ${!selectedSprint ? 'bg-brand-soft/20 text-brand-main font-medium' : 'hover:bg-surface-hover text-ink-primary'}`}
              onClick={() => setSelectedSprint('')}>
              {t.issues.allIssues} ({issues.length})
            </div>
            <div
              className={`py-2 px-2.5 rounded-card text-xs mb-1 cursor-pointer ${selectedSprint === '__backlog' ? 'bg-brand-soft/20 text-brand-main font-medium' : 'hover:bg-surface-hover text-ink-primary'}`}
              onClick={() => setSelectedSprint('__backlog')}>
              {t.issues.noSprint}
            </div>
            {sprints.map(s => {
              const sprintIssues = issues.filter(i => i.sprintId === s.id);
              const doneCount = sprintIssues.filter(i => i.status === 'done').length;
              const total = sprintIssues.length;
              const progress = total > 0 ? Math.round(doneCount / total * 100) : 0;
              return (
              <div key={s.id}
                className={`py-2 px-2.5 rounded-card text-xs mb-1 cursor-pointer group ${selectedSprint === s.id ? 'bg-brand-soft/20 text-brand-main font-medium' : 'hover:bg-surface-hover text-ink-primary'}`}
                onClick={() => setSelectedSprint(s.id)}>
                <div className="flex items-center justify-between">
                  <span className="truncate">{s.name}</span>
                  <span className="text-[0.55rem] text-ink-muted ml-1">{s.status === 'planning' ? t.issues.plan : s.status === 'active' ? t.issues.active : t.issues.done}</span>
                </div>
                {total > 0 && (
                  <div className="mt-1 flex items-center gap-1">
                    <div className="flex-1 progress" style={{ height: '3px' }}>
                      <div className="progress-bar brand" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="text-[0.55rem] text-ink-muted">{doneCount}/{total}</span>
                  </div>
                )}
                <div className="flex gap-1 mt-1">
                  {s.status === 'planning' && (
                    <button className="text-[0.55rem] text-success hover:underline" onClick={e => {
                      e.stopPropagation();
                      http.post(`/sprints/${s.id}/start`).then(() => {
                        http.get(`/sprints?projectId=${projectId}`).then((resp) => {
      const sprintsPr = resp.data as { data?: { items?: SprintData[] } };
      setSprints(sprintsPr?.data?.items || []);
    }).catch(() => {});
                      }).catch(() => {});
                    }}>▶ {t.issues.startSprint}</button>
                  )}
                  {s.status === 'active' && (
                    <button className="text-[0.55rem] text-success font-medium hover:underline" onClick={e => {
                      e.stopPropagation();
                      http.post(`/sprints/${s.id}/complete`).then(() => {
                        http.get(`/sprints?projectId=${projectId}`).then((resp) => {
      const sprintsPr = resp.data as { data?: { items?: SprintData[] } };
      setSprints(sprintsPr?.data?.items || []);
    }).catch(() => {});
                      }).catch(() => {});
                    }}>✓ {t.issues.completeSprint}</button>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        )}

        {/* ── Issue List ── */}
        <div className="flex flex-col overflow-hidden">
          <IssueFilterToolbar
            search={search}
            setSearch={setSearch}
            filters={{
              typeFilter,
              // Multi-value priority from AI links ("critical,high") — the dropdown
              // shows "All Priority" while the list filter still applies both values.
              priorityFilter: priorityFilter.includes(',') ? 'All Priority' : priorityFilter,
              assigneeFilter,
              creatorFilter, selectedSprint,
            }}
            setFilters={(partial) => {
              if (partial.typeFilter !== undefined) setTypeFilter(partial.typeFilter);
              if (partial.priorityFilter !== undefined) setPriorityFilter(partial.priorityFilter);
              if (partial.assigneeFilter !== undefined) setAssigneeFilter(partial.assigneeFilter);
              if (partial.creatorFilter !== undefined) setCreatorFilter(partial.creatorFilter);
              if (partial.selectedSprint !== undefined) setSelectedSprint(partial.selectedSprint);
            }}
            sortBy={{ field: sortField, dir: sortDir }}
            setSortBy={(sort) => { setSortField(sort.field as SortField); setSortDir(sort.dir); }}
            viewMode={visibleColumns}
            setViewMode={toggleColumn}
            allColumns={buildColumns(t)}
            members={members}
            isScrum={isScrum}
            sprints={sprints}
          />

          <IssueTable
            issues={sorted}
            unfilteredCount={issues.length}
            onRowClick={(issue) => navigate({ to: '/issues/$id', params: { id: issue.id } })}
            columns={visibleColDefs}
            sortField={sortField}
            sortDir={sortDir}
            onSort={handleSort}
            loading={loading}
            projectId={projectId}
            refreshing={refreshing}
            projectKey={projectKey}
          />
        </div>
      </div>

      {/* Sprint Create Modal */}
      {showNewSprint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setShowNewSprint(false); }}>
          <div className="card shadow-dialog" style={{ width: '420px' }}>
            <div className="card-hd flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t.sprint.createSprint}</h3>
              <button className="btn-ghost text-lg px-1" onClick={() => setShowNewSprint(false)}>✕</button>
            </div>
            <div className="card-bd flex flex-col gap-3" style={{ padding: '20px' }}>
              <div className="form-grp">
                <label className="form-label">{t.sprint.sprintName}</label>
                <input className="form-input text-sm" placeholder={t.sprint.sprintNamePlaceholder} value={sprintName} onChange={e => setSprintName(e.target.value)} />
              </div>
              <div className="form-grp">
                <label className="form-label">{t.sprint.goal}</label>
                <input className="form-input text-sm" placeholder={t.sprint.goalPlaceholder} value={sprintGoal} onChange={e => setSprintGoal(e.target.value)} />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="form-label">{t.sprint.startDate}</label>
                  <input type="date" className="form-input text-sm" value={sprintStart} onChange={e => setSprintStart(e.target.value)} />
                </div>
                <div className="flex-1">
                  <label className="form-label">{t.sprint.endDate}</label>
                  <input type="date" className="form-input text-sm" value={sprintEnd} onChange={e => setSprintEnd(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-edge">
              <button className="btn-ghost" onClick={() => setShowNewSprint(false)}>{t.sprint.cancel}</button>
              <button className="btn-brand" onClick={handleCreateSprint} disabled={sprintSaving || !sprintName.trim()}>
                {sprintSaving ? t.sprint.creating : t.sprint.confirmCreate}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
