import { useState, useEffect, useCallback } from 'react';
import { useSearch } from '@tanstack/react-router';
import { useProjectStore } from '@/stores/projectStore';
import { useAuthStore } from '@/stores/authStore';
import { useT } from '@/i18n/useT';
import { projectApi } from '@/api/projectApi';
import { cn } from '@/lib/cn';
import { getErrorMessage } from '@/lib/errors';
import http from '@/lib/http';
import { issueApi, type MemberInfo } from '@/api/issueApi';
import { aiEnabled } from '@/lib/aiGate';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ProjectMember { id: string; userId: string; displayName?: string; email?: string; role: string; joinedAt?: string; }

const METHODOLOGIES = ['kanban', 'scrum', 'waterfall'] as const;

const ISSUE_COLUMNS = [
  { id: 'issueNumber' }, { id: 'title' }, { id: 'type' }, { id: 'priority' },
  { id: 'status' }, { id: 'assignee' }, { id: 'reporter' }, { id: 'storyPoints' }, { id: 'createdAt' },
];

interface RolePermMatrix {
  roles: Array<{ name: string; description: string; isSystem: boolean; permissions: string[] }>;
  permissions: Array<{ code: string; description: string; dangerous: boolean }>;
  canEdit: boolean;
}

// ─── Draggable phase row ───
function PhaseRow({ phase, dragHint, onValueChange, onRemove }: {
  phase: { key: string; value: string }; dragHint: string;
  onValueChange: (v: string) => void; onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: phase.key });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}
      className="flex items-center gap-1.5 mb-1.5 bg-surface-card rounded-lg border border-edge px-1.5 py-1">
      <button type="button" {...attributes} {...listeners}
        className="cursor-grab active:cursor-grabbing text-ink-muted hover:text-ink-primary px-1.5 py-1 rounded hover:bg-surface-hover select-none"
        title={dragHint}>⋮⋮</button>
      <input className="form-input text-xs" style={{ padding: '4px 8px', flex: 1, border: 'none', boxShadow: 'none', background: 'transparent' }}
        value={phase.value} onChange={e => onValueChange(e.target.value)} />
      <button className="btn-ghost btn-xs text-danger" onClick={onRemove}>✕</button>
    </div>
  );
}

// ─── Draggable state row (workflow states) ───
function StateRow({ state, dragHint, onRemove }: { state: string; dragHint: string; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: state });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}
      className="flex items-center gap-2 bg-surface-card rounded-lg border border-edge px-2 py-1.5 mb-1.5">
      <button type="button" {...attributes} {...listeners}
        className="cursor-grab active:cursor-grabbing text-ink-muted hover:text-ink-primary px-1.5 py-1 rounded hover:bg-surface-hover select-none"
        title={dragHint}>⋮⋮</button>
      <span className="flex-1 text-sm text-ink-primary">{state}</span>
      <button className="btn-ghost btn-xs text-danger" onClick={onRemove}>✕</button>
    </div>
  );
}

export function SettingsPage() {
  const t = useT();
  const COL_LABELS: Record<string, string> = {
    issueNumber: '#', title: t.settings.title || 'Title', type: t.settings.type || 'Type',
    priority: t.settings.priority || 'Priority', status: t.settings.status || 'Status',
    assignee: t.settings.assignee || 'Assignee', reporter: t.settings.reporter || 'Creator',
    storyPoints: t.settings.sp || 'SP/Workload', createdAt: t.settings.created || 'Created',
  };
  const s = t.settings;
  const PERM_LABELS = (s as unknown as Record<string, unknown>).permCodes as Record<string, string> | undefined;
  const { currentProject } = useProjectStore();
  const reset = useProjectStore((s) => s.reset);
  const projectId = currentProject?.id;

  const routeSearch = useSearch({ strict: false }) as { tab?: string };
  // Health dimension weights are an AI feature — never land on that tab in a
  // no-AI build even if the URL carries ?tab=health.
  const [tab, setTab] = useState(
    !aiEnabled && routeSearch.tab === 'health' ? 'general' : routeSearch.tab || 'general'
  );

  // ─── Health dimension weights (L2, docs/health-dim-weights-design.md) ───
  const DIM_ORDER = ['schedule', 'quality', 'delivery', 'resources', 'scope', 'collaboration'];
  const DIM_DEFAULTS: Record<string, number> = {
    schedule: 25, quality: 25, delivery: 15, resources: 15, scope: 10, collaboration: 10,
  };
  const [dimWeights, setDimWeights] = useState<Record<string, number>>({ ...DIM_DEFAULTS });
  const loadDimWeights = () => {
    if (!projectId || !aiEnabled) return;
    http.get(`/projects/${projectId}/dim-weights`).then(({ data }) => {
      const dw = ((data as Record<string, unknown>).data || {}) as Record<string, number>;
      if (dw && Object.keys(dw).length === 6) setDimWeights({ ...DIM_DEFAULTS, ...dw });
    }).catch(() => {});
  };
  useEffect(() => { loadDimWeights(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps
  const dimSum = DIM_ORDER.reduce((acc, k) => acc + (Number(dimWeights[k]) || 0), 0);

  // ─── General ───
  const [name, setName] = useState('');
  const [methodology, setMethodology] = useState('scrum');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // ─── Project phases (customizable lifecycle stages) ───
  const [phases, setPhases] = useState<Array<{ key: string; value: string }>>([]);
  const loadPhases = () => {
    if (!projectId) return;
    http.get(`/projects/${projectId}/phases`).then(({ data }) => {
      setPhases(((data as Record<string, unknown>).data || []) as Array<{ key: string; value: string }>);
    }).catch(() => {});
  };
  useEffect(() => { loadPhases(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps
  const canManagePhases = () => {
    const auth = useAuthStore.getState();
    // Workspace owner/admin manage every project
    if (auth.currentTenant?.role === 'owner' || auth.currentTenant?.role === 'admin') return true;
    const myRole = members.find(m => m.userId === auth.user?.id)?.role || '';
    return myRole === 'Project Owner' || myRole === 'Project Lead' || myRole === 'Project Manager';
  };
  const addPhase = () => setPhases(prev => [...prev, { key: `phase_${Date.now()}`, value: '' }]);
  const removePhase = (idx: number) => setPhases(prev => prev.filter((_, i) => i !== idx));
  // Drag & drop reordering (replaces the old up/down arrow buttons)
  const phaseSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const handlePhaseDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setPhases(prev => {
      const oldIdx = prev.findIndex(p => p.key === active.id);
      const newIdx = prev.findIndex(p => p.key === over.id);
      if (oldIdx < 0 || newIdx < 0) return prev;
      return arrayMove(prev, oldIdx, newIdx);
    });
  };

  useEffect(() => {
    if (!currentProject) return;
    setName(currentProject.name);
    try {
      const cfg = JSON.parse(currentProject.settings || '{}');
      if (cfg.methodology) setMethodology(cfg.methodology);
      if (cfg.wipLimits) {
        if (Number(cfg.wipLimits.in_progress) > 0) setWipInProgress(String(cfg.wipLimits.in_progress));
        if (Number(cfg.wipLimits.in_review) > 0) setWipInReview(String(cfg.wipLimits.in_review));
      }
      if (Array.isArray(cfg.states) && cfg.states.length > 0) setStates(cfg.states);
    } catch {/*keep default*/}
  }, [currentProject]);

  const [saveError, setSaveError] = useState('');

  const saveAll = async () => {
    if (!projectId) return;
    setSaving(true); setSaveError('');
    // Guard: the Project Owner role must always keep PROJECT:ADMIN
    const ownerPerms = permOverrides['Project Owner'];
    if (roleMatrix && ownerPerms && !ownerPerms.has('PROJECT:ADMIN')) {
      setSaveError(s.ownerAdminRequired);
      setSaving(false);
      return;
    }
    try {
      const cfg: Record<string, unknown> = {
        methodology,
        columns: Array.from(colSettings),
        states: states.filter(st => st.trim()),
        phases: phases.filter(p => p.value.trim()).map(p => ({ key: p.key, value: p.value.trim() })),
        wipLimits: {
          in_progress: Number(wipInProgress) > 0 ? Number(wipInProgress) : 5,
          in_review: Number(wipInReview) > 0 ? Number(wipInReview) : 4,
        },
      };
      // Health dimension weights (L2, AI feature) — only persisted when AI is
      // enabled and the total is valid (100).
      if (aiEnabled && dimSum === 100) {
        cfg.dimWeights = { ...dimWeights };
      }
      // Only include role permissions once the matrix has been loaded —
      // an empty snapshot would wipe previously saved overrides.
      if (roleMatrix) {
        const rp: Record<string, string[]> = {};
        Object.entries(permOverrides).forEach(([role, codes]) => { rp[role] = Array.from(codes); });
        cfg.rolePermissions = rp;
      }
      await projectApi.update(projectId, { name, settings: JSON.stringify(cfg) });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      loadPhases(); loadRolePermissions();
    } catch (err) {
      const apiErr = err as { response?: { data?: { code?: number; message?: string } } };
      const code = apiErr?.response?.data?.code;
      if (code === 40303) setSaveError(s.ownerAdminRequired);
      else if (code === 40300) setSaveError(t.settings.saveFailed);
      else setSaveError(getErrorMessage(err, t.settings));
    } finally {
      setSaving(false);
    }
  };

  // ─── Roles (from roles table via API) ───
  const [roleNames, setRoleNames] = useState<string[]>([]);
  const [roleLabels, setRoleLabels] = useState<Record<string, string>>({});
  const FALLBACK_ROLES = ['Project Owner', 'Project Lead', 'Project Manager', 'Scrum Master', 'Release Manager', 'Developer', 'QA Engineer', 'Viewer'];
  useEffect(() => {
    // Project-scoped roles from the roles table
    http.get('/roles?scope=project').then((res) => {
      const items = (res.data.data || []) as Array<{ name: string }>;
      if (items.length) {
        setRoleNames(items.map(r => r.name));
        const labels: Record<string, string> = {};
        items.forEach(r => { labels[r.name] = r.name; });
        setRoleLabels(labels);
      } else {
        setRoleNames(FALLBACK_ROLES);
        const labels: Record<string, string> = {};
        FALLBACK_ROLES.forEach(r => { labels[r] = r; });
        setRoleLabels(labels);
      }
    }).catch(() => {
      setRoleNames(FALLBACK_ROLES);
      const labels: Record<string, string> = {};
      FALLBACK_ROLES.forEach(r => { labels[r] = r; });
      setRoleLabels(labels);
    });
  }, []);

  // ─── Members ───
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [tenantMembers, setTenantMembers] = useState<MemberInfo[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState('');

  const fetchMembers = useCallback(() => {
    if (!projectId) return;
    http.get(`/projects/${projectId}/members`).then(r => {
      // Paged endpoint — response is PageResult { items: [...] }
      const d = (r.data as { data?: { items?: ProjectMember[] } | ProjectMember[] }).data;
      const list = Array.isArray(d) ? d : (d?.items || []);
      setMembers(list);
    }).catch(()=>{});
  }, [projectId]);
  useEffect(() => { fetchMembers(); issueApi.listMembers().then(r => setTenantMembers(r.data.data || [])).catch(()=>{}); }, [projectId, fetchMembers]);

  useEffect(() => { return () => reset(); }, [reset]);

  const addMember = (userId: string) => {
    if (!projectId) return;
    http.post(`/projects/${projectId}/members`, { userId, role: 'developer' }).then(() => { fetchMembers(); setAddOpen(false); setSearch(''); });
  };
  const changeRole = (userId: string, role: string) => {
    if (!projectId) return;
    http.put(`/projects/${projectId}/members/${userId}`, { role }).then(fetchMembers);
  };
  const removeMember = (userId: string) => {
    if (!projectId) return;
    http.delete(`/projects/${projectId}/members/${userId}`).then(fetchMembers);
  };

  const addFiltered = Array.isArray(tenantMembers) ? tenantMembers.filter(m => !(Array.isArray(members) && members.find(pm => pm.userId === m.id)) && (!search || m.displayName.toLowerCase().includes(search.toLowerCase()) || m.email.toLowerCase().includes(search.toLowerCase()))) : [];

  // ─── Issues Display ───
  const [colSettings, setColSettings] = useState<Set<string>>(new Set(ISSUE_COLUMNS.slice(0, 6).map(c=>c.id)));
  useEffect(() => {
    if (!currentProject) return;
    try { const cfg = JSON.parse(currentProject.settings || '{}'); if (cfg.columns) setColSettings(new Set(cfg.columns.filter((c: string) => c !== 'storyPoints'))); } catch {/*keep default*/}
  }, [currentProject]);

  const toggleCol = (id: string) => {
    const next = new Set(colSettings);
    if (next.has(id)) next.delete(id); else next.add(id);
    setColSettings(next);
  };
  // ─── Workflow ───
  const DEFAULT_STATES = ['To Do', 'In Progress', 'In Review', 'Done'];
  const [states, setStates] = useState<string[]>(DEFAULT_STATES);
  const [newState, setNewState] = useState('');
  const addState = () => {
    const v = newState.trim();
    if (v && !states.includes(v)) { setStates([...states, v]); setNewState(''); }
  };
  const removeState = (idx: number) => setStates(states.filter((_, i) => i !== idx));
  const handleStateDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setStates(prev => {
      const oldIdx = prev.indexOf(active.id as string);
      const newIdx = prev.indexOf(over.id as string);
      if (oldIdx < 0 || newIdx < 0) return prev;
      return arrayMove(prev, oldIdx, newIdx);
    });
  };

  // ─── WIP limits (work-in-progress caps per column, shown on Board) ───
  const [wipInProgress, setWipInProgress] = useState('5');
  const [wipInReview, setWipInReview] = useState('4');

  // ─── Role & Permissions (real roles + per-project overrides) ───
  const [roleMatrix, setRoleMatrix] = useState<RolePermMatrix | null>(null);
  const [permOverrides, setPermOverrides] = useState<Record<string, Set<string>>>({});

  const loadRolePermissions = useCallback(() => {
    if (!projectId) return;
    http.get(`/projects/${projectId}/role-permissions`).then(({ data }) => {
      const d = (data as { data?: RolePermMatrix }).data;
      if (!d) return;
      // Canonical column order: Owner → Project Manager → Project Lead → others
      const ROLE_ORDER = ['Project Owner', 'Project Manager', 'Project Lead'];
      const sorted = [...(d.roles || [])].sort((a, b) => {
        const ia = ROLE_ORDER.indexOf(a.name);
        const ib = ROLE_ORDER.indexOf(b.name);
        if (ia >= 0 && ib >= 0) return ia - ib;
        if (ia >= 0) return -1;
        if (ib >= 0) return 1;
        return a.name.localeCompare(b.name);
      });
      setRoleMatrix({ ...d, roles: sorted });
      const ov: Record<string, Set<string>> = {};
      sorted.forEach(r => { ov[r.name] = new Set(r.permissions || []); });
      setPermOverrides(ov);
    }).catch(() => {});
  }, [projectId]);
  useEffect(() => { if (tab === 'roles') loadRolePermissions(); }, [tab, loadRolePermissions]);

  const togglePermCode = (role: string, code: string) => {
    setPermOverrides(prev => {
      const next = { ...prev, [role]: new Set(prev[role] || []) };
      if (next[role].has(code)) next[role].delete(code); else next[role].add(code);
      return next;
    });
  };

  if (!currentProject) return <div className="p-6 text-sm text-ink-muted">Select a project to configure settings.</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="ch">
        <div>
          <h2 className="text-base font-semibold text-ink-primary">{s.title}</h2>
          <p className="text-xs text-ink-muted mt-0.5">{currentProject.name} ({currentProject.key})</p>
        </div>
        <div className="flex gap-2 items-center">
          {saved && <span className="text-xs text-success">{s.saved}</span>}
          {saveError && <span className="text-xs text-danger">{saveError}</span>}
          <button className="btn-brand" onClick={saveAll} disabled={saving}>
            {saving ? 'Saving...' : s.save}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {/* ─── Tabs ─── */}
        <div className="flex gap-0 mb-6 border-b border-edge">
          {(['general','phases','members','issuesDisplay','workflow','roles','health'] as const)
            .filter(tk => aiEnabled || tk !== 'health')
            .map(tk => (
            <button key={tk} className={cn('px-4 py-2 text-sm font-medium border-b-2 transition-colors', tab === tk ? 'border-brand-main text-brand-main' : 'border-transparent text-ink-muted hover:text-ink-primary')} onClick={() => setTab(tk)}>
              {(s as Record<string,string>)[tk]}
            </button>
          ))}
        </div>

        {/* ═══ GENERAL ═══ */}
        {tab === 'general' && (
          <div>
            <p className="text-xs text-ink-muted mb-4">{s.saveTopHint}</p>
            <div className="form-grp mb-4">
              <label className="form-label">{s.projectName}</label>
              <input className="form-input" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="form-grp mb-4">
              <label className="form-label">{s.projectKey}</label>
              <input className="form-input" value={currentProject.key} disabled style={{ opacity: 0.6 }} />
            </div>
            <div className="form-grp mb-4">
              <label className="form-label">{s.methodology}</label>
              <select className="form-select" value={methodology} onChange={e => setMethodology(e.target.value)}>
                {METHODOLOGIES.map(m => <option key={m} value={m}>{(s as Record<string,string>)[m] || m}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* ═══ PHASES (issue lifecycle stages) ═══ */}
        {tab === 'phases' && (
          <div>
            <p className="text-sm text-ink-muted mb-4">{s.phasesDesc}</p>
            <div className="form-grp mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="form-label" style={{ marginBottom: 0 }}>{s.phasesTitle}</label>
                {canManagePhases() && (
                  <button className="btn-secondary btn-xs" onClick={addPhase}>＋ {s.addPhase}</button>
                )}
              </div>
              {phases.length === 0 && <p className="text-xs text-ink-muted">{s.noPhases}</p>}
              {canManagePhases() ? (
                <DndContext sensors={phaseSensors} collisionDetection={closestCenter} onDragEnd={handlePhaseDragEnd}>
                  <SortableContext items={phases.map(p => p.key)} strategy={verticalListSortingStrategy}>
                    {phases.map((p, i) => (
                      <PhaseRow key={p.key} phase={p} dragHint={s.dragToReorder}
                        onValueChange={v => setPhases(prev => prev.map((x, xi) => xi === i ? { ...x, value: v } : x))}
                        onRemove={() => removePhase(i)} />
                    ))}
                  </SortableContext>
                </DndContext>
              ) : (
                phases.map((p) => (
                  <div key={p.key} className="flex items-center gap-2 mb-1.5">
                    <span className="text-sm text-ink-primary">{p.value}</span>
                  </div>
                ))
              )}
              {canManagePhases() ? (
                <p className="text-[0.65rem] text-ink-muted mt-2">{s.saveTopHint}</p>
              ) : (
                <p className="text-[0.65rem] text-ink-muted mt-1">{s.phasesReadOnly}</p>
              )}
            </div>
          </div>
        )}

        {/* ═══ MEMBERS ═══ */}
        {tab === 'members' && (
          <div>
            <p className="text-xs text-ink-muted mb-4">{s.membersInstantHint}</p>
            <div className="flex items-center gap-2 mb-4">
              <div className="relative" style={{ flex: 1 }}>
                <input className="form-input w-full" placeholder="Search to add member..." value={search}
                  onChange={e => { setSearch(e.target.value); setAddOpen(true); }}
                  onFocus={() => setAddOpen(true)} onBlur={() => setTimeout(() => setAddOpen(false), 150)} />
                {addOpen && addFiltered.length > 0 && (
                  <div className="absolute left-0 top-full mt-0.5 z-20 card w-full max-h-40 overflow-y-auto shadow-dialog p-1">
                    {addFiltered.map(m => (
                      <button key={m.id} className="w-full text-left px-2 py-1.5 text-xs text-ink-primary hover:bg-surface-hover rounded"
                        onMouseDown={() => addMember(m.id)}>{m.displayName} <span className="text-ink-muted">{m.email}</span></button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="card"><div className="card-bd-nopad">
              {members.length === 0 ? (
                <p className="text-center text-sm text-ink-muted py-6">No members added yet.</p>
              ) : members.map(m => {
                const currentUserId = useAuthStore.getState().user?.id;
                const isSelf = m.userId === currentUserId;
                const currentUserRole = members.find(m2 => m2.userId === currentUserId)?.role || '';
                const isPM = currentUserRole === 'Project Owner' || currentUserRole === 'Project Lead' || currentUserRole === 'Project Manager';
                const isOwnerProtected = m.role === 'Project Owner' && currentUserRole !== 'Project Owner';
                const locked = isSelf || isOwnerProtected || !isPM;
                return (
                <div key={m.id} className="hover-row flex items-center gap-3 px-4 py-2">
                  <div className="av">{m.displayName?.charAt(0) || '?'}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-primary">{m.displayName || m.userId}</p>
                    <p className="text-xs text-ink-muted">{m.email}</p>
                  </div>
                  <select className="form-select text-xs" style={{ width: 'auto' }} value={m.role}
                    disabled={locked}
                    onChange={e => changeRole(m.userId, e.target.value)}>
                    {roleNames.map(r => <option key={r} value={r}>{roleLabels[r]}</option>)}
                  </select>
                  <button className="text-xs text-danger hover:underline disabled:text-ink-muted disabled:no-underline disabled:cursor-not-allowed"
                    onClick={() => removeMember(m.userId)}
                    disabled={locked}>{s.remove}</button>
                </div>
                );
              })}
            </div></div>
          </div>
        )}

        {/* ═══ ISSUES DISPLAY ═══ */}
        {tab === 'issuesDisplay' && (
          <div>
            <p className="text-xs text-ink-muted mb-3">{s.saveTopHint}</p>
            <p className="text-sm text-ink-muted mb-4">{s.columnSettings}</p>
            <div className="card p-4">
              {ISSUE_COLUMNS.map(c => (
                <label key={c.id} className="flex items-center gap-2 py-1.5 text-sm text-ink-primary cursor-pointer">
                  <input type="checkbox" checked={colSettings.has(c.id)} onChange={() => toggleCol(c.id)} className="w-4 h-4" />
                  {COL_LABELS[c.id] || c.id}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* ═══ WORKFLOW ═══ */}
        {tab === 'workflow' && (
          <div>
            <p className="text-xs text-ink-muted mb-3">{s.saveTopHint}</p>
            {/* WIP limits — per-column caps shown on the Board */}
            <p className="text-sm text-ink-muted mb-3">{s.wipDesc}</p>
            <div className="card p-4 mb-4">
              <div className="flex items-center gap-4">
                <div className="form-grp mb-0" style={{ flex: 1 }}>
                  <label className="form-label">{s.wipInProgress}</label>
                  <input className="form-input" type="number" min={1} max={99}
                    value={wipInProgress} onChange={e => setWipInProgress(e.target.value)} />
                </div>
                <div className="form-grp mb-0" style={{ flex: 1 }}>
                  <label className="form-label">{s.wipInReview}</label>
                  <input className="form-input" type="number" min={1} max={99}
                    value={wipInReview} onChange={e => setWipInReview(e.target.value)} />
                </div>
              </div>
              <p className="text-xs text-ink-muted mt-2">{s.wipSaveHint}</p>
            </div>
            <div className="flex gap-2 mb-2">
              <input className="form-input flex-1" placeholder={s.stateName} value={newState} onChange={e => setNewState(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addState()} />
              <button className="btn-secondary" onClick={addState}>{s.addState}</button>
            </div>
            <p className="text-xs text-ink-muted mb-3">{s.statesDesc}</p>
            <div className="card p-3">
              <DndContext sensors={phaseSensors} collisionDetection={closestCenter} onDragEnd={handleStateDragEnd}>
                <SortableContext items={states} strategy={verticalListSortingStrategy}>
                  {states.map((st, i) => (
                    <StateRow key={st} state={st} dragHint={s.dragToReorder} onRemove={() => removeState(i)} />
                  ))}
                </SortableContext>
              </DndContext>
              {states.length === 0 && <p className="text-xs text-ink-muted text-center py-3">{s.noStates}</p>}
            </div>
          </div>
        )}

        {/* ═══ ROLES ═══ */}
        {tab === 'roles' && (
          <div>
            {!roleMatrix ? (
              <p className="text-sm text-ink-muted">…</p>
            ) : (
              <>
                <div className="card" style={{ overflowX: 'auto' }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-edge">
                        <th className="text-left px-3 py-2 text-xs text-ink-muted uppercase">Permission</th>
                        {roleMatrix.roles.map(r => (
                          <th key={r.name} className="text-center px-3 py-2 text-xs text-ink-muted" title={r.description}>
                            {r.name}
                            {r.isSystem && <span className="ml-1 text-ink-faint">·</span>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {roleMatrix.permissions.map(p => (
                        <tr key={p.code} className="border-b border-edge hover:bg-surface-hover">
                          <td className="px-3 py-2 text-ink-primary">
                            {PERM_LABELS?.[p.code] || p.code}
                            {p.dangerous && <span className="ml-1 text-xs text-warning" title={s.rolePermDanger}>⚠</span>}
                          </td>
                          {roleMatrix.roles.map(role => (
                            <td key={role.name} className="text-center px-3 py-2">
                              <input type="checkbox"
                                checked={permOverrides[role.name]?.has(p.code) || false}
                                onChange={() => togglePermCode(role.name, p.code)}
                                disabled={!roleMatrix.canEdit}
                                className="w-4 h-4" />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {roleMatrix.canEdit ? (
                  <p className="text-[0.65rem] text-ink-muted mt-2">{s.saveTopHint}</p>
                ) : (
                  <p className="text-[0.65rem] text-ink-muted mt-2">{s.rolePermHint}</p>
                )}
              </>
            )}
          </div>
        )}

        {/* ═══ HEALTH WEIGHTS (L2, AI feature — only rendered when AI is enabled) ═══ */}
        {tab === 'health' && aiEnabled && (
          <div>
            <p className="text-xs text-ink-muted mb-3">{s.saveTopHint}</p>
            <p className="text-sm text-ink-muted mb-4">{s.healthDesc}</p>
            <div className="card p-4" style={{ maxWidth: '420px' }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-ink-primary">{s.health}</p>
                <button className="btn-secondary btn-xs" onClick={() => setDimWeights({ ...DIM_DEFAULTS })}>
                  {s.restoreDefaults}
                </button>
              </div>
              {DIM_ORDER.map(k => (
                <div key={k} className="flex items-center gap-3 py-1.5">
                  <span className="text-sm text-ink-primary flex-1">
                    {t.projectOverview[`dim${k.charAt(0).toUpperCase() + k.slice(1)}` as keyof typeof t.projectOverview] || k}
                  </span>
                  <input
                    className="form-input text-right"
                    type="number" min={0} max={100} style={{ width: '72px' }}
                    value={dimWeights[k] ?? 0}
                    onChange={e => setDimWeights(prev => ({ ...prev, [k]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }))}
                  />
                  <span className="text-xs text-ink-muted w-5">%</span>
                </div>
              ))}
              <div className="mt-3 pt-3 border-t border-edge flex items-center justify-between">
                <span className={cn('text-xs font-medium',
                  dimSum === 100 ? 'text-success' : 'text-danger')}>
                  {dimSum === 100 ? s.dimWeightsSumOk.replace('{n}', String(dimSum)) : s.dimWeightsSumBad.replace('{n}', String(dimSum))}
                </span>
                <button
                  className={cn('btn-brand', dimSum !== 100 && 'opacity-40 cursor-not-allowed')}
                  onClick={saveAll}
                  disabled={saving || dimSum !== 100}>
                  {saving ? 'Saving...' : s.save}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
