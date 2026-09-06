import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useProjectStore } from '@/stores/projectStore';
import { useAuthStore } from '@/stores/authStore';
import { projectApi, type ProjectData } from '@/api/projectApi';
import { masterDataApi } from '@/api/masterDataApi';
import { issueApi, type MemberInfo, type IssueData } from '@/api/issueApi';
import { aiApi, type HealthResult } from '@/api/aiApi';
import { HotspotWarnings } from '@/components/ai/HotspotWarnings';
import { RadarChart } from '@/components/ai/RadarChart';
import { IssueCountChip } from '@/components/ai/IssueCountChip';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { HealthGauge } from '@/components/ai/HealthGauge';
import { FeedbackRow } from '@/components/ai/FeedbackRow';
import { DonutChart } from '@/components/chart/DonutChart';
import { ProjectDescriptionEdit } from '@/components/project/ProjectDescriptionEdit';
import { aiEnabled } from '@/lib/aiGate';
import { isDemoUser as isDemoUserEmail } from '@/lib/demoUser';
import http from '@/lib/http';
import { getLlmErrorMessage } from '@/lib/errors';
import type { ApiResponse } from '@/types/auth';
import { useT } from '@/i18n/useT';

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ─── Risk result normalization (docs/55 §8) ───
// Legacy cache rows carry plain-string risks, missing source and issue_ids.
// All shapes converge here so the card JSX never branches on data vintage.
interface NormalizedRisk {
  level: string;
  category: string;
  signal?: string;
  title?: string;
  description: string;
  impact?: string;
  mitigation?: string;
  /** Numeric value of the triggering signal (e.g. 7 overdue tasks) — P2-5 */
  metric?: number;
  issue_ids: string[];
}
interface RiskResult {
  risk_score: number;
  risk_level: string;
  risks: NormalizedRisk[];
  source: string;
  cached_at?: string;
  stale?: boolean;
  llm_error?: string;
}

function normalizeRiskData(raw: unknown): RiskResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.risk_score !== 'number') return null;
  const risks: NormalizedRisk[] = (Array.isArray(r.risks) ? r.risks : []).map(item => {
    if (typeof item === 'string') {
      return { level: 'medium', category: 'delivery', description: item, issue_ids: [] };
    }
    const o = (item ?? {}) as Record<string, unknown>;
    return {
      level: typeof o.level === 'string' ? o.level : 'medium',
      category: typeof o.category === 'string' ? o.category : 'delivery',
      signal: typeof o.signal === 'string' ? o.signal : undefined,
      title: typeof o.title === 'string' ? o.title : undefined,
      description: typeof o.description === 'string' ? o.description : String(o.description ?? ''),
      impact: typeof o.impact === 'string' ? o.impact : undefined,
      mitigation: typeof o.mitigation === 'string' ? o.mitigation : undefined,
      metric: typeof o.metric === 'number' ? o.metric : (typeof o.metric === 'string' && !Number.isNaN(Number(o.metric)) ? Number(o.metric) : undefined),
      issue_ids: Array.isArray(o.issue_ids) ? o.issue_ids.filter((x): x is string => typeof x === 'string') : [],
    };
  });
  return {
    risk_score: r.risk_score,
    risk_level: typeof r.risk_level === 'string' ? r.risk_level : '',
    risks,
    source: typeof r.source === 'string' ? r.source : 'llm',
    cached_at: typeof r.cached_at === 'string' ? r.cached_at : undefined,
    stale: typeof r.stale === 'boolean' ? r.stale : undefined,
  };
}

// ─── Health risk normalization ───
// The AI health card risks arrive as structured objects (LLM: description +
// issue_ids) or legacy plain strings. Converge to one shape so the JSX never
// branches on data vintage (docs/55 §8).
interface NormalizedHealthRisk {
  description: string;
  issue_ids: string[];
}
function normalizeHealthRisks(raw: unknown): NormalizedHealthRisk[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(item => {
    if (typeof item === 'string') return { description: item, issue_ids: [] };
    const o = (item ?? {}) as Record<string, unknown>;
    return {
      description: typeof o.description === 'string' ? o.description : String(o.description ?? ''),
      issue_ids: Array.isArray(o.issue_ids) ? o.issue_ids.filter((x): x is string => typeof x === 'string') : [],
    };
  });
}

export function ProjectOverviewPage() {
  const navigate = useNavigate();
  const { currentProject, fetchProjects } = useProjectStore();
  const reset = useProjectStore((s) => s.reset);
  const projectId = currentProject?.id;

  // ─── Demo first-visit guided tour (/?tour=N) — highlights the AI value:
  // step 1 on Home (personal AI analysis), step 2 here = health radar,
  // step 3 here = AI Risk card, steps 4/5 = Reports & Wiki pages.
  // Demo account is shared, so the "seen" flag lives in this browser only.
  const tour = (useSearch({ strict: false }) as { tour?: string }).tour;
  const isDemoUser = useAuthStore((s) => isDemoUserEmail(s.user?.email));
  const [tourStep, setTourStep] = useState<number>(() => {
    if (aiEnabled && tour === '2' && isDemoUser) return 2;
    return 0;
  });
  // Tour highlight targets on this page:
  //   step 2 → AI health card (gauge + radar), step 3 → AI Risk card.
  //   (step 1 is on Home, steps 4/5 are Reports & Wiki pages.)
  const tourScoreRef = useRef<HTMLDivElement>(null);      // step 2: health gauge + radar
  const tourRiskCardRef = useRef<HTMLDivElement>(null);   // step 3: AI Risk card
  const tourBlockForStep = (step: number) =>
    step === 2 ? tourScoreRef.current
      : step === 3 ? tourRiskCardRef.current
      : null;
  useEffect(() => {
    const el = tourBlockForStep(tourStep);
    if (tourStep > 0 && el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [tourStep]);
  const finishTour = () => {
    setTourStep(0);
    try { localStorage.setItem('tomihub-demo-tour', 'done'); } catch { /* noop */ }
    navigate({ to: '/project-overview', search: {}, replace: true });
  };

  // Restore projects if cleared by previous page unmount (HomePage reset)
  useEffect(() => { if (!projectId) fetchProjects(); }, []);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [healthRefreshing, setHealthRefreshing] = useState(false);
  const [healthProgress, setHealthProgress] = useState('');
  const [healthError, setHealthError] = useState('');
  const [risk, setRisk] = useState<RiskResult | null>(null);
  const [riskCardOpen, setRiskCardOpen] = useState<number | null>(null);
  const [riskAllShown, setRiskAllShown] = useState(false);
  const [riskRefreshing, setRiskRefreshing] = useState(false);
  const [riskProgress, setRiskProgress] = useState('');
  const [riskError, setRiskError] = useState('');
  const [wikis, setWikis] = useState<Array<{ id: string; title: string; content?: string }>>([]);
  const [activities, setActivities] = useState<Array<{id:string; summary:string; event_type:string; actor:string; created_at:string}>>([]);
  // Issues for risk↔issue linking in the AI health monitor
  const [riskIssues, setRiskIssues] = useState<IssueData[]>([]);
  const [riskExpanded, setRiskExpanded] = useState<number | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [activityLimit, setActivityLimit] = useState(20);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descText, setDescText] = useState('');
  const [descSaving, setDescSaving] = useState(false);
  const [descError, setDescError] = useState('');
  const [phase, setPhase] = useState<string>(currentProject?.phase || 'development');
  const userId = useAuthStore(s => s.user?.id);
  // Workspace Owner has full project control regardless of project role
  const tenantRole = useAuthStore(s => s.currentTenant?.role);
  // Only Project Owner (or Workspace Owner) can refresh AI analysis
  const [ownerRoleIds, setOwnerRoleIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    issueApi.listRoles('project').then(({ data: resp }) => {
      const ids = (resp.data || []).filter(r => r.name === 'Project Owner').map(r => r.id);
      setOwnerRoleIds(new Set(ids));
    }).catch(() => {});
  }, [projectId]);
  const isOwner = tenantRole === 'owner' || (Array.isArray(members) && members.some(m => m.userId === userId && (
    (m.roleId && ownerRoleIds.has(m.roleId)) || m.role === 'Project Owner'
  )));
  const isLead = currentProject?.leadId === userId;
  const isClosed = currentProject?.status === 'closed';
  const t = useT();

  useEffect(() => { setDescText(currentProject?.description || ''); }, [currentProject?.description]);

  const loadWikis = () => {
    if (!projectId) return;
    projectApi.getWiki(projectId)
      .then(r => setWikis(Array.isArray(r.data.data) ? r.data.data : [])).catch(() => {});
  };
  // currentProject is a stable ref; complex expression is intentional
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setPhase(currentProject?.phase || 'development'); }, [currentProject?.phase]);

  const saveDescription = async () => {
    if (!projectId) return;
    setDescSaving(true);
    try {
      await projectApi.update(projectId, { description: descText, phase });
      // Update Zustand store so view mode reflects the new description
      if (currentProject) {
        useProjectStore.getState().setCurrentProject({ ...currentProject, description: descText });
      }
      setEditingDesc(false);
    } catch { /* noop */ }
    finally { setDescSaving(false); }
  };

  const handleAiOptimizeDesc = async (prompt: string) => {
    if (!aiEnabled || !descText.trim()) return;
    setDescError('');
    try {
      const token = localStorage.getItem('access_token') || '';
      const resp = await fetch('/api/v1/ai/generate-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
        body: JSON.stringify({
          prompt: prompt || 'Optimize and improve this project description',
          context: descText,
        }),
      });
      const result = await resp.json();
      if (result?.description && result.description !== descText) {
        setDescText(result.description);
      } else {
        setDescError('AI returned unchanged content. Try adding specific instructions.');
      }
    } catch { setDescError('AI optimize failed. Check network or LLM config.'); }
  };

  useEffect(() => {
    if (!projectId) return;
    // Clear AI data on project switch — prevent showing stale project's results
    setHealth(null);
    setRisk(null);
    setRiskCardOpen(null);
    http.get<ApiResponse<MemberInfo[] | { items: MemberInfo[] }>>(`/projects/${projectId}/members`)
      .then(r => {
        // Paged endpoint — response is PageResult { items: [...] }
        const d = r.data.data as MemberInfo[] | { items: MemberInfo[] } | undefined;
        setMembers(Array.isArray(d) ? d : (d?.items || []));
      }).catch(() => {});
    projectApi.getStats(projectId)
      .then(r => setStats(r.data.data || {})).catch(() => {});
    // Load from DB cache only — no auto-generation (nightly batch handles that)
    // ai-brain returns either a bare object or an ApiResponse wrapper — accept both
    if (aiEnabled) {
      aiApi.getHealthCache(projectId).then((res) => {
        const wrapped = res.data as unknown as { data?: HealthResult };
        const d = (wrapped.data ?? res.data) as HealthResult | undefined;
        if (d?.health_score !== undefined) {
          setHealth(d);
          setHealthError(d.llm_error ? getLlmErrorMessage(d.llm_error, t.app) : '');
        }
      }).catch(() => {});
      const token = useAuthStore.getState().accessToken;
      fetch(`/api/v1/ai/cache/risk/${projectId}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          const n = normalizeRiskData(data);
          if (n) setRisk(n);
          const e = (data as { llm_error?: string } | null)?.llm_error;
          setRiskError(e ? getLlmErrorMessage(e, t.app) : '');
        })
        .catch(() => {});
    }
    loadWikis();
    issueApi.list(projectId).then(({ data: resp }) => setRiskIssues(resp.data?.items || [])).catch(() => {});
    projectApi.getActivity(projectId)
      .then(r => setActivities((r.data.data || []) as Array<{id:string; summary:string; event_type:string; actor:string; created_at:string}>)).catch(() => {});
    // loadWikis is a stable ref — only run on projectId change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => { return () => reset(); }, [reset]);

  const healthAbortRef = useRef<AbortController | null>(null);
  const riskAbortRef = useRef<AbortController | null>(null);

  const refreshSection = async (section: 'health' | 'risk') => {
    if (!projectId || !aiEnabled) return;
    const isHealth = section === 'health';
    // Cancel previous refresh of same type if still running
    const prev = isHealth ? healthAbortRef.current : riskAbortRef.current;
    if (prev) prev.abort();
    const controller = new AbortController();
    if (isHealth) healthAbortRef.current = controller; else riskAbortRef.current = controller;

    if (isHealth) { setHealthRefreshing(true); setHealthError(''); setHealthProgress(t.projectOverview.gatherHealth); }
    else { setRiskRefreshing(true); setRiskError(''); setRiskProgress(t.projectOverview.scanRisk); }
    // AI output language — separate from UI language, never falls back to UI
    const lang = useAuthStore.getState().user?.aiLanguage || 'en';
    const token = useAuthStore.getState().accessToken;
    const tenantId = useAuthStore.getState().currentTenant?.id;
    const endpoint = isHealth ? 'project-health' : 'project-risk';
    try {
    const resp = await fetch(`/api/v1/ai/${endpoint}?project_id=${projectId}&refresh=true&stream=true&lang=${lang}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(tenantId && { 'X-Tenant-Id': tenantId }),
      },
      signal: controller.signal,
    });
    if (!resp.ok || !resp.body) { if (isHealth) setHealthRefreshing(false); else setRiskRefreshing(false); return; }
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('text/event-stream')) {
      const data = await resp.json();
      if (data) {
        if (isHealth) { setHealth(data); const e = (data as { llm_error?: string }).llm_error; setHealthError(e ? getLlmErrorMessage(e, t.app) : ''); }
        else { setRisk(normalizeRiskData(data)); const e = (data as { llm_error?: string }).llm_error; setRiskError(e ? getLlmErrorMessage(e, t.app) : ''); }
      }
      if (isHealth) setHealthRefreshing(false); else setRiskRefreshing(false);
      return;
    }
    const reader = resp.body.getReader(); const decoder = new TextDecoder();
    let buffer = '', pendingEvent = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) { if (isHealth) setHealthRefreshing(false); else setRiskRefreshing(false); break; }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n'); buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('event: ')) { pendingEvent = line.slice(7).trim(); continue; }
        if (line.startsWith('data: ')) {
          const d = JSON.parse(line.slice(6));
          if (pendingEvent === 'progress') { if (isHealth) setHealthProgress(d.text || ''); else setRiskProgress(d.text || ''); }
          if (pendingEvent === 'error') {
            if (isHealth) setHealthError(d.code ? getLlmErrorMessage(d.code, t.app) : ''); else setRiskError(d.code ? getLlmErrorMessage(d.code, t.app) : '');
          }
          if (pendingEvent === 'result') {
            if (isHealth) { setHealth(d); setHealthError(d.llm_error ? getLlmErrorMessage(d.llm_error, t.app) : ''); setHealthRefreshing(false); setHealthProgress(''); }
            else { setRisk(normalizeRiskData(d)); setRiskError(d.llm_error ? getLlmErrorMessage(d.llm_error, t.app) : ''); setRiskRefreshing(false); setRiskProgress(''); }
          }
          pendingEvent = '';
        }
      }
    }
    } catch (err: unknown) {
      if (!(err instanceof Error && err.name === 'AbortError')) {
        if (isHealth) setHealthRefreshing(false); else setRiskRefreshing(false);
      }
    }
  };

  const memberRoles = (role: string) => {
    if (role === 'Project Lead' || role === 'project_lead') return 'PM';
    if (role === 'developer') return 'Dev';
    if (role === 'viewer') return 'Viewer';
    return role || 'Member';
  };

  // Match an AI risk text to the concrete issues it refers to (same approach as Board insights).
  // Filters must match the backend statistics used by the LLM prompt:
  //  - unassigned_critical counts priority IN (critical, high) AND no assignee
  //  - bug counts only OPEN bugs (done/cancelled excluded)
  const matchRiskIssues = (riskText: string): IssueData[] => {
    const t2 = riskText.toLowerCase();
    const filters: Array<(i: IssueData) => boolean> = [];
    if (t2.includes('unassigned')) filters.push(i => !i.assigneeId);
    if (t2.includes('critical')) filters.push(i => i.priority === 'critical' || i.priority === 'high');
    if (t2.includes('bug')) filters.push(i => i.type === 'bug' && i.status !== 'done' && i.status !== 'cancelled');
    if (t2.includes('overdue') || t2.includes('due date') || t2.includes('past due')) {
      filters.push(i => !!i.dueDate && new Date(i.dueDate) < new Date());
    }
    if (t2.includes('high priority')) filters.push(i => i.priority === 'high');
    if (t2.includes('stuck') || t2.includes('stagnat') || t2.includes('no update') || t2.includes('without update')) {
      filters.push(i => {
        const d = Math.floor((Date.now() - new Date(i.updatedAt || i.createdAt).getTime()) / 86400000);
        return (i.priority === 'critical' && d >= 1) || (i.priority === 'high' && d >= 3) || d >= 7;
      });
    }
    // "all issues are open" / "stalled progress" / "no active execution" → all open issues
    if (t2.includes('stalled') || t2.includes('no active execution')
      || (t2.includes('issues are open')) || t2.includes('no progress')) {
      filters.push(i => i.status !== 'done' && i.status !== 'cancelled');
    }
    if (filters.length === 0) return [];
    return riskIssues.filter(i => filters.every(f => f(i)));
  };

  // Map a risk text to Issues-page filter params (priority/type supported there).
  // "critical" risks map to critical,high — matching the backend unassigned_critical scope.
  const riskFilterParams = (riskText: string): Record<string, string> => {
    const t2 = riskText.toLowerCase();
    const p: Record<string, string> = {};
    if (t2.includes('critical')) p.priority = 'critical,high';
    else if (t2.includes('high priority')) p.priority = 'high';
    if (t2.includes('bug')) p.type = 'bug';
    if (t2.includes('unassigned')) p.assignee = 'unassigned';
    return p;
  };

  // PM 6-dimension framework labels (legacy keys fall back to raw key text)
  const DIM_LABELS: Record<string, string> = {
    schedule: t.projectOverview.dimSchedule,
    quality: t.projectOverview.dimQuality,
    delivery: t.projectOverview.dimDelivery,
    resources: t.projectOverview.dimResources,
    scope: t.projectOverview.dimScope,
    collaboration: t.projectOverview.dimCollaboration,
  };

  // Baseline weights (percentage points) — matches PROJECT_DIM_WEIGHTS on the
  // backend; used to highlight which dimensions a suggestion would change.
  const BASE_DIM_WEIGHTS: Record<string, number> = {
    schedule: 25, quality: 25, delivery: 15, resources: 15, scope: 10, collaboration: 10,
  };

  // L3a weight suggestion dismiss/apply state. Apply persists via the L2
  // dim-weights API (docs/health-dim-weights-design.md) then refreshes health.
  const [weightSuggestionApplied, setWeightSuggestionApplied] = useState(false);
  const [weightSuggestionDismissed, setWeightSuggestionDismissed] = useState(false);
  const [weightApplying, setWeightApplying] = useState(false);
  const [weightSuggestionError, setWeightSuggestionError] = useState('');

  const applyWeightSuggestion = async () => {
    if (!aiEnabled || !projectId || !health?.suggested_weights) return;
    setWeightApplying(true);
    setWeightSuggestionError('');
    try {
      await http.put(`/projects/${projectId}/dim-weights`, health.suggested_weights);
      setWeightSuggestionApplied(true);
      // Weights changed → cached health is invalidated on the backend; refresh
      // the card so it reflects the new weighted score immediately.
      refreshSection('health');
    } catch (err) {
      const apiErr = err as { response?: { data?: { message?: string; code?: number } } };
      setWeightSuggestionError(
        apiErr?.response?.data?.message
        || (apiErr?.response?.data?.code === 40303 || apiErr?.response?.data?.code === 40300
          ? t.projectOverview.weightSuggestionDenied
          : t.projectOverview.weightSuggestionFail));
    } finally {
      setWeightApplying(false);
    }
  };

  const statusRows = [
    { label: t.projectOverview.statusOpen, key: 'open', color: 'text-ink-primary' },
    { label: t.projectOverview.statusInProgress, key: 'in_progress', color: 'text-warning' },
    { label: t.projectOverview.statusInReview, key: 'in_review', color: 'text-brand-main' },
    { label: t.projectOverview.statusDone, key: 'done', color: 'text-success' },
    { label: t.projectOverview.statusCancelled, key: 'cancelled', color: 'text-ink-muted' },
  ];

  return (
    <div>
      {/* Header */}
      <div className="ch">
        <div>
          <h2 className="text-base font-semibold text-ink-primary">
            {currentProject?.name || t.projectOverview.title}
          </h2>
          <p className="text-xs text-ink-muted mt-0.5 flex items-center gap-3">
            <span className="font-mono">{currentProject?.key}</span>
            <span className={`badge ${currentProject?.status === 'active' ? 'tag-b' : 'tag-lo'}`}>
              {currentProject?.status || 'N/A'}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          {currentProject?.status !== 'closed' && currentProject?.status !== 'closed' && (
            <button className="btn-brand" onClick={() => navigate({ to: '/issues/new' })}>+ New Issue</button>
          )}
        </div>
      </div>

      <div className="p-6" style={{ maxWidth: '1400px' }}>

      <div style={{ maxWidth: '1400px' }}>
        {/* ═══ PHASE SELECTOR ═══ */}
        <PhaseBar projectId={projectId} currentPhase={(currentProject?.phase) || 'development'} isOwner={isOwner} />

        {/* Project Status Toggle (Owner only) */}
        {isOwner && !!(currentProject?.status) && (
          <div className="flex items-center gap-2 mb-4 text-xs">
            <span className="text-ink-muted">{t.projectOverview.statusLabel}</span>
            <span className={`badge ${currentProject?.status === 'active' ? 'bg-status-success-soft text-status-success' : 'bg-warning-soft text-warning'}`}>{currentProject?.status}</span>
            <button className="btn-ghost text-brand-main" style={{ fontSize: '0.7rem', padding: '2px 8px' }}
              onClick={() => setConfirmClose(true)}>
              {currentProject?.status === 'active' ? t.projectOverview.closeProject : t.projectOverview.reopenProject}
            </button>
            <ConfirmDialog
              open={confirmClose}
              title={currentProject?.status === 'active' ? t.projectOverview.closeProject : t.projectOverview.reopenProject}
              message={currentProject?.status === 'active' ? t.projectOverview.confirmClose : t.projectOverview.confirmReopen}
              confirmLabel={currentProject?.status === 'active' ? t.projectOverview.closeProject : t.projectOverview.reopenProject}
              confirmClass={currentProject?.status === 'active' ? 'bg-danger text-white px-4 py-2 rounded-btn text-sm font-medium' : 'btn-brand'}
              onConfirm={async () => {
                setConfirmClose(false);
                const newStatus = currentProject?.status === 'active' ? 'closed' : 'active';
                await http.put(`/projects/${projectId}/status`, { status: newStatus });
                // Update project in store without page reload
                useProjectStore.getState().setCurrentProject({ ...currentProject as ProjectData, status: newStatus });
              }}
              onCancel={() => setConfirmClose(false)}
            />
          </div>
        )}

        {/* ═══ STAT CARDS ROW ═══ */}
        <div className="grid grid-cols-5 gap-3 mb-4">
          {statusRows.map(s => (
            <div key={s.key} className="card p-4 cursor-pointer"
              onClick={() => navigate({ to: '/issues', search: { status: s.key } })}>
              <p className="text-[0.625rem] font-bold uppercase tracking-widest text-ink-muted flex items-center gap-2">
                {s.label}
                <span className="text-[0.6875rem] text-ink-muted">▶</span>
              </p>
              <p className={`text-2xl font-bold mt-1 ${s.color}`}>{Number(stats[s.key]) || 0}</p>
            </div>
          ))}
        </div>

        <div className="grid mb-4" style={{ gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: '16px' }}>
          {/* ── Left Column ── */}
          <div className="flex flex-col gap-5">

            <ProjectDescriptionEdit
              descText={descText}
              setDescText={setDescText}
              editingDesc={editingDesc}
              setEditingDesc={setEditingDesc}
              descSaving={descSaving}
              descError={descError}
              phase={phase}
              setPhase={setPhase}
              isOwner={isOwner}
              isLead={isLead}
              isClosed={isClosed}
              projectId={projectId}
              onSave={saveDescription}
              onAiOptimize={handleAiOptimizeDesc}
            />

            {/* Team */}
            <div className="card">
              <div className="card-hd flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink-primary">{t.projectOverview.teamAndRoles} ({members.length})</h3>
                <span className="text-xs font-medium text-brand-main cursor-pointer" onClick={() => navigate({ to: '/settings', search: { tab: 'members' } })}>{t.projectOverview.viewAll}</span>
              </div>
              <div className="card-bd p-3">
                {members.length === 0 ? (
                  <p className="text-xs text-ink-muted">{t.projectOverview.noMembers}</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {members.slice(0, 6).map(m => (
                      <div key={m.id} className="flex items-center gap-2 p-2 rounded-card bg-surface-hover" style={{ minWidth: '140px' }}>
                        <div className="av">{m.displayName?.charAt(0) || '?'}</div>
                        <div>
                          <p className="text-sm font-medium text-ink-primary">{m.displayName}</p>
                          <p className="text-[0.625rem] text-ink-muted">{memberRoles(m.role || '')}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── AI Health ── */}
            {aiEnabled && (
            <div className="card ai-glow">
              <div className="card-hd flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink-primary">
                  {t.projectOverview.projectHealth}
                </h3>
                {isOwner && (
                  <button
                    className="btn-ghost text-base px-1"
                    onClick={() => refreshSection('health')}
                    disabled={healthRefreshing}
                    title="Refresh"
                  >
                    {healthRefreshing ? (
                      <span className="w-3.5 h-3.5 rounded-full border-2 border-brand-main border-t-transparent animate-spin inline-block" />
                    ) : (
                      '\u{1F504}'
                    )}
                  </button>
                )}
              </div>
              <div className="card-bd p-3">
                {healthRefreshing && healthProgress && (
                  <div className="mb-3 p-2 bg-brand-soft rounded-card">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-4 h-4 rounded-full border-2 border-brand-main border-t-transparent animate-spin inline-block" />
                      <span className="text-xs text-brand-main">{healthProgress}</span>
                    </div>
                    <div className="progress" style={{ height: '3px' }}>
                      <div
                        className="progress-bar brand animate-pulse"
                        style={{
                          width: healthProgress.includes('Gathering')
                            ? '33%'
                            : healthProgress.includes('Analyzing')
                              ? '66%'
                              : '90%',
                        }}
                      />
                    </div>
                    <p className="mt-1.5 text-[0.65rem] text-ink-muted">
                      {t.projectOverview.healthReasoningHint}
                    </p>
                  </div>
                )}
                {healthError && (
                  <div className="mb-3 p-2 rounded-card bg-warning-soft border border-warning/30">
                    <p className="text-[0.65rem] text-warning font-medium">⚠️ {healthError}</p>
                  </div>
                )}
                {health && health.health_score > 0 ? (
                  <div>
                    {/* Step 1 tour target — health gauge + radar */}
                    <div
                      ref={tourScoreRef}
                      className={`rounded-card transition-shadow ${tourStep === 2 ? 'ring-2 ring-brand-main bg-brand-soft/20' : ''}`}
                    >
                    <div className="flex items-center gap-4 mb-3">
                      <HealthGauge score={health.health_score} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-ink-primary leading-snug">
                          {health.summary ||
                            `${health.health_level?.replace(/_/g, ' ')} — ${health.health_score}/100`}
                        </p>
                      </div>
                    </div>

                    {/* Dimensions — 6-dimension PM framework radar */}
                    {Object.keys(health.dimensions || {}).length > 0 && (
                      <div className="mb-3">
                        <p className="text-[0.625rem] font-semibold text-ink-muted uppercase tracking-wider mb-1.5">
                          {t.projectOverview.dimensions}
                        </p>
                        <div className="flex justify-center">
                          <RadarChart dimensions={health.dimensions} labels={DIM_LABELS} size={230} />
                        </div>
                      </div>
                    )}
                    </div>

                    {/* Recommendations */}
                    {health.recommendations && health.recommendations.length > 0 && (
                      <div className="mb-3">
                        <p className="text-[0.625rem] font-semibold text-success uppercase tracking-wider mb-1.5">
                          {t.projectOverview.recommendations}
                        </p>
                        {health.recommendations.slice(0, 4).map((r, i) => (
                          <p
                            key={i}
                            className="text-[0.625rem] text-ink-muted mb-0.5 pl-3 relative before:content-['•'] before:absolute before:left-1 before:text-success"
                          >
                            {r}
                          </p>
                        ))}
                      </div>
                    )}

                    {/* L3a weight suggestion (docs/health-dim-weights-design.md) —
                        deterministic rule-based suggestion; apply flow needs the
                        L2 settings backend, so "apply" here only previews. */}
                    {health.suggested_weights && health.weight_reasons && health.weight_reasons.length > 0 && !weightSuggestionDismissed && (
                      <div className="mb-3 p-2.5 rounded-card bg-brand-soft/40 border border-brand-main/20">
                        <p className="text-[0.625rem] font-semibold text-ink-primary mb-1">
                          ⚖ {t.projectOverview.weightSuggestion}
                          {health.suggestion_source === 'rules' && (
                            <span className="ml-1.5 text-[0.55rem] font-medium text-brand-main bg-brand-soft px-1.5 py-0.5 rounded-full">
                              {t.projectOverview.weightSuggestionRuleLabel}
                            </span>
                          )}
                        </p>
                        <p className="text-[0.625rem] text-ink-secondary mb-1.5">
                          {t.projectOverview.weightSuggestionRule}
                        </p>
                        {health.weight_reasons.slice(0, 3).map((reason, i) => (
                          <p key={i} className="text-[0.625rem] text-ink-muted mb-0.5 pl-3 relative before:content-['•'] before:absolute before:left-1 before:text-brand-main">
                            {reason}
                          </p>
                        ))}
                        {/* Changed dimensions preview */}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {Object.entries(health.suggested_weights).map(([k, v]) => {
                            const base = BASE_DIM_WEIGHTS[k];
                            if (base === undefined || base === v) return null;
                            return (
                              <span key={k} className="text-[0.6rem] font-medium bg-surface-card border border-edge rounded-full px-1.5 py-0.5 text-ink-primary">
                                {DIM_LABELS[k] || k}: {base}% → <span className="text-brand-main">{v}%</span>
                              </span>
                            );
                          })}
                        </div>
                        <div className="flex gap-2 mt-2">
                          <button
                            className="text-[0.6rem] font-semibold text-brand-text bg-brand-main hover:bg-brand-hover rounded-btn px-2 py-1 transition-colors cursor-pointer"
                            onClick={() => applyWeightSuggestion()}
                            disabled={weightSuggestionApplied || weightApplying}
                          >
                            {weightSuggestionApplied ? '✓' : ''} {weightApplying ? '...' : t.projectOverview.weightSuggestionApply}
                          </button>
                          <button
                            className="text-[0.6rem] font-semibold text-ink-muted hover:text-ink-primary rounded-btn px-2 py-1 transition-colors cursor-pointer"
                            onClick={() => setWeightSuggestionDismissed(true)}
                          >
                            {t.projectOverview.weightSuggestionDismiss}
                          </button>
                        </div>
                        {weightSuggestionApplied && (
                          <p className="text-[0.6rem] text-ink-muted mt-1.5">
                            {t.projectOverview.weightSuggestionApplied}
                          </p>
                        )}
                        {weightSuggestionError && (
                          <p className="text-[0.6rem] text-danger mt-1.5">⚠️ {weightSuggestionError}</p>
                        )}
                      </div>
                    )}

                    {/* Risks — each risk links to the concrete issues it refers to */}
                    {health.risks && health.risks.length > 0 && (
                      <div className="mb-3">
                        <p className="text-[0.625rem] font-semibold text-danger uppercase tracking-wider mb-1.5">
                          {t.projectOverview.risks}
                        </p>
                        {normalizeHealthRisks(health.risks).slice(0, 4).map((r, i) => {
                          const matched = r.issue_ids.length > 0
                            ? riskIssues.filter(x => r.issue_ids.includes(x.id))
                            : matchRiskIssues(r.description);
                          return (
                            <div key={i} className="mb-0.5">
                              <p className="text-[0.625rem] text-ink-muted pl-3 relative before:content-['•'] before:absolute before:left-1 before:text-danger">
                                {r.description}
                              </p>
                              {matched.length > 0 && (
                                <div className="pl-3">
                                  <div className="flex items-center gap-2">
                                    <button
                                      className="text-[0.6rem] font-semibold text-brand-main bg-brand-soft hover:bg-brand-soft/60 rounded-full px-2 py-0.5 cursor-pointer transition-colors"
                                      onClick={() => setRiskExpanded(riskExpanded === i ? null : i)}>
                                      {t.projectOverview.viewIssues.replace('{n}', String(matched.length))} {riskExpanded === i ? '▴' : '▾'}
                                    </button>
                                  </div>
                                  {riskExpanded === i && (
                                    <div className="mt-1.5 space-y-0.5 border-l-2 border-edge pl-2.5">
                                      {matched.slice(0, 20).map(iss => (
                                        <button key={iss.id}
                                          className="block w-full text-left rounded px-1.5 py-0.5 hover:bg-surface-hover transition-colors cursor-pointer"
                                          onClick={() => navigate({ to: '/issues/$id', params: { id: iss.id }, search: { from: 'overview' } })}>
                                          <span className="font-mono font-semibold text-brand-main">
                                            {currentProject?.key || '?'}-{iss.issueNumber}
                                          </span>{' '}
                                          <span className="text-xs text-ink-primary">{iss.title}</span>{' '}
                                          <span className="text-brand-main/60">↗</span>
                                        </button>
                                      ))}
                                      {matched.length > 20 && (
                                        <p className="text-[0.6rem] text-ink-muted pl-1.5">…{t.projectOverview.moreIssues.replace('{n}', String(matched.length - 20))}</p>
                                      )}
                                      {/* Unified jump style: count badge → filtered list */}
                                      {Object.keys(riskFilterParams(r.description)).length > 0 && (
                                        <div className="pl-1.5">
                                          <IssueCountChip count={matched.length} label={t.projectOverview.viewInIssues}
                                            search={{ ...riskFilterParams(r.description), status: 'open' }} />
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {health.trend && (
                      <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-edge">
                        <span className="text-[0.625rem] text-ink-muted">
                          {t.projectOverview.trend}
                        </span>
                        <span
                          className={`text-[0.625rem] font-semibold ${
                            health.trend === 'improving'
                              ? 'text-success'
                              : health.trend === 'declining'
                                ? 'text-danger'
                                : 'text-warning'
                          }`}
                        >
                          {health.trend === 'improving'
                            ? `↑ ${t.projectOverview.improving}`
                            : health.trend === 'declining'
                              ? `↓ ${t.projectOverview.declining}`
                              : `→ ${t.projectOverview.stable}`}
                        </span>
                      </div>
                    )}

                    {/* Feedback */}
                    <div className="mt-3 pt-3 border-t border-edge">
                      <FeedbackRow
                        analysisType="project_health"
                        llmScore={health.health_score}
                        llmLevel={health.health_level || 'unknown'}
                        projectId={projectId}
                      />
                    </div>
                    <div className="flex items-center justify-end mt-2 pt-2 border-t border-edge">
                      <span className="text-[0.625rem] text-ink-muted">
                        {t.projectOverview.aiGenerated}:{' '}
                        {health.cached_at
                          ? new Date(health.cached_at).toLocaleString()
                          : t.projectOverview.justNow}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-ink-muted">{t.projectOverview.healthNoData}</p>
                )}
              </div>
            </div>
            )}

            {/* ── AI Risk ── */}
            {aiEnabled && (
            <div
              ref={tourRiskCardRef}
              className={`card transition-shadow ${tourStep === 3 ? 'ring-2 ring-brand-main shadow-card-hover' : ''}`}
            >
              <div className="card-hd flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink-primary">
                  {t.projectOverview.projectRisk}
                </h3>
                {isOwner && (
                  <button
                    className="btn-ghost text-base px-1"
                    onClick={() => refreshSection('risk')}
                    disabled={riskRefreshing}
                    title="Refresh"
                  >
                    {riskRefreshing ? (
                      <span className="w-3.5 h-3.5 rounded-full border-2 border-brand-main border-t-transparent animate-spin inline-block" />
                    ) : (
                      '\u{1F504}'
                    )}
                  </button>
                )}
              </div>
              <div className="card-bd p-3">
                {riskRefreshing && riskProgress && (
                  <div className="mb-3 p-2 bg-brand-soft rounded-card">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-4 h-4 rounded-full border-2 border-brand-main border-t-transparent animate-spin inline-block" />
                      <span className="text-xs text-brand-main">{riskProgress}</span>
                    </div>
                    <div className="progress" style={{ height: '3px' }}>
                      <div
                        className="progress-bar brand animate-pulse"
                        style={{
                          width: riskProgress.includes('Scanning')
                            ? '33%'
                            : riskProgress.includes('Analyzing')
                              ? '66%'
                              : '90%',
                        }}
                      />
                    </div>
                  </div>
                )}
                {riskError && (
                  <div className="mb-3 p-2 rounded-card bg-warning-soft border border-warning/30">
                    <p className="text-[0.65rem] text-warning font-medium">⚠️ {riskError}</p>
                  </div>
                )}
                {risk && risk.risk_score > 0 ? (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className={`badge ${
                          risk.risk_level === 'critical' || risk.risk_level === 'high'
                            ? 'tag-hi'
                            : 'tag-med'
                        }`}
                      >
                        {risk.risk_level}
                      </span>
                      <span className="text-xs font-semibold text-ink-primary">
                        {risk.risk_score}/100
                      </span>
                    </div>
                    {/* P1-3: severity summary strip — high/medium/low counts */}
                    {risk.risks.length > 0 && (
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        {(() => {
                          const hi = risk.risks.filter(r => r.level === 'critical' || r.level === 'high').length;
                          const md = risk.risks.filter(r => r.level === 'medium').length;
                          const lo = risk.risks.filter(r => r.level === 'low').length;
                          return (
                            <>
                              {hi > 0 && <span className="text-[0.6rem] font-semibold text-danger">🔴 {t.projectOverview.riskHigh} {hi}</span>}
                              {md > 0 && <span className="text-[0.6rem] font-semibold text-warning">🟡 {t.projectOverview.riskMedium} {md}</span>}
                              {lo > 0 && <span className="text-[0.6rem] font-semibold text-success">🟢 {t.projectOverview.riskLow} {lo}</span>}
                              <span className="text-[0.6rem] text-ink-muted ml-auto">{risk.risks.length} {t.projectOverview.risks}</span>
                            </>
                          );
                        })()}
                      </div>
                    )}
                    {/* P1-1: distinguish "no risks" from degraded / no-data */}
                    {risk.risks.length === 0 && !risk.llm_error && (
                      <p className="text-xs text-success">✅ {t.projectOverview.riskNoRisks}</p>
                    )}
                    {risk.risks.length === 0 && risk.llm_error && (
                      <p className="text-xs text-ink-muted">{t.projectOverview.riskNoRisksDegraded}</p>
                    )}
                    {risk.risks.slice(0, riskAllShown ? risk.risks.length : 5).map((r, i) => {
                      const linkedIds = r.issue_ids;
                      const matched = linkedIds.length > 0
                        ? riskIssues.filter(x => linkedIds.includes(x.id))
                        : matchRiskIssues(r.description);
                      const open = riskCardOpen === i;
                      const catClass: Record<string, string> = {
                        delivery: 'bg-brand-soft text-brand-main',
                        quality: 'bg-success-soft text-success',
                        execution: 'bg-warning-soft text-warning',
                        tech: 'bg-surface-hover text-ink-muted',
                      };
                      const catLabel: Record<string, string> = {
                        delivery: t.projectOverview.riskCatDelivery,
                        quality: t.projectOverview.riskCatQuality,
                        execution: t.projectOverview.riskCatExecution,
                        tech: t.projectOverview.riskCatTech,
                      };
                      return (
                        <div key={i} className="mb-1.5 rounded-card bg-surface-hover overflow-hidden">
                          <button type="button"
                            className="w-full text-left px-2 py-1.5 flex items-center gap-1.5 cursor-pointer hover:bg-surface-hover transition-colors"
                            onClick={() => setRiskCardOpen(open ? null : i)}>
                            <span
                              className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                                r.level === 'critical' || r.level === 'high'
                                  ? 'bg-danger'
                                  : r.level === 'low'
                                    ? 'bg-success'
                                    : 'bg-warning'
                              }`}
                            />
                            <span className={`text-[0.6rem] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${catClass[r.category] || 'bg-surface-hover text-ink-muted'}`}>
                              {catLabel[r.category] || r.category}
                            </span>
                            <span className="text-xs font-semibold text-ink-primary flex-1 min-w-0 truncate">
                              {r.title || r.description.slice(0, 60)}
                            </span>
                            {typeof r.metric === 'number' && r.metric > 0 && (
                              <span
                                className="text-[0.55rem] font-bold px-1.5 py-0.5 rounded-full shrink-0 bg-surface-hover text-ink-muted"
                                title={t.projectOverview.riskMetricTip}>
                                {t.projectOverview.riskMetricPrefix}{r.metric}
                              </span>
                            )}
                            <span className="text-[0.6rem] text-ink-muted shrink-0">{open ? '▴' : '▾'}</span>
                          </button>
                          {open && (
                            <div className="px-2 pb-2 space-y-1">
                              {r.description && (
                                <p className="text-xs text-ink-primary leading-snug">{r.description}</p>
                              )}
                              {r.impact && (
                                <p className="text-[0.625rem] text-ink-muted leading-snug">
                                  {t.projectOverview.riskImpact}: {r.impact}
                                </p>
                              )}
                              {r.mitigation && (
                                <p className="text-[0.625rem] text-ink-muted leading-snug">
                                  {t.projectOverview.riskMitigation}: {r.mitigation}
                                </p>
                              )}
                              {matched.length > 0 && (
                                <div className="pt-1">
                                  <div className="flex items-center gap-2">
                                    <button
                                      className="text-[0.6rem] font-semibold text-brand-main hover:underline"
                                      onClick={() => navigate({ to: '/issues/$id', params: { id: matched[0].id }, search: { from: 'overview' } })}>
                                      {t.projectOverview.viewIssues.replace('{n}', String(matched.length))}
                                    </button>
                                  </div>
                                  <div className="mt-1 space-y-0.5 max-h-32 overflow-y-auto border-l-2 border-brand-soft pl-2">
                                    {matched.slice(0, 20).map(iss => (
                                      <button key={iss.id}
                                        className="block w-full text-left rounded px-1.5 py-0.5 hover:bg-surface-hover transition-colors cursor-pointer"
                                        onClick={() => navigate({ to: '/issues/$id', params: { id: iss.id }, search: { from: 'overview' } })}>
                                        <span className="font-mono font-semibold text-brand-main">
                                          {currentProject?.key || '?'}-{iss.issueNumber}
                                        </span>{' '}
                                        <span className="text-xs text-ink-primary">{iss.title}</span>{' '}
                                        <span className="text-brand-main">↗</span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {/* P1-2: show-all toggle when more than 5 risks */}
                    {risk.risks.length > 5 && (
                      <button
                        className="w-full text-center text-[0.625rem] font-medium text-brand-main hover:underline py-1 mt-0.5 cursor-pointer"
                        onClick={() => setRiskAllShown(v => !v)}>
                        {riskAllShown
                          ? t.projectOverview.riskCollapse
                          : t.projectOverview.riskShowAll.replace('{n}', String(risk.risks.length - 5))}
                      </button>
                    )}
                    <div className="mt-3 pt-3 border-t border-edge">
                      <FeedbackRow
                        analysisType="project_risk"
                        llmScore={risk.risk_score}
                        llmLevel={risk.risk_level || 'unknown'}
                        projectId={projectId}
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-edge">
                      {risk.source === 'rules' && (
                        <span className="text-[0.625rem] text-warning">{t.projectOverview.riskDegradedNote}</span>
                      )}
                      <span className="text-[0.625rem] text-ink-muted">
                        {risk.source === 'rules' ? t.projectOverview.riskSourceRules : t.projectOverview.riskSourceAi}
                        {risk.cached_at ? ` · ${new Date(risk.cached_at).toLocaleString()}` : ''}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-ink-muted">{t.projectOverview.riskNoData}</p>
                )}
              </div>
            </div>
            )}

          </div>

          {/* ── Right Column ── */}
          <div className="flex flex-col gap-4">

            {/* Issue Distribution Donut */}
            <div className="card">
              <div className="card-hd">
                <h3 className="text-sm font-semibold text-ink-primary">{t.projectOverview.issueDistribution}</h3>
              </div>
              <div className="card-bd flex justify-center py-2">
                {(() => {
                  // Real data only — never render a fake/sample distribution
                  const total = Object.values(stats).reduce((s: number, v) => s + Number(v), 0);
                  if (total <= 0) {
                    return (
                      <div className="py-10 text-center">
                        <p className="text-xs text-ink-muted">{t.projectOverview.issueDistEmpty}</p>
                      </div>
                    );
                  }
                  const data = [
                    { name: 'Open', value: Number(stats.open) || 0 },
                    { name: 'In Progress', value: Number(stats.in_progress) || 0 },
                    { name: 'In Review', value: Number(stats.in_review) || 0 },
                    { name: 'Done', value: Number(stats.done) || 0 },
                    { name: 'Cancelled', value: Number(stats.cancelled) || 0 },
                  ].filter(d => d.value > 0);
                  return data.length > 0 ? (
                    <DonutChart height={240} data={data} width={200} />
                  ) : (
                    <div className="py-10 text-center">
                      <p className="text-xs text-ink-muted">{t.projectOverview.issueDistEmpty}</p>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* AI Hotspot Warnings */}
            {aiEnabled && projectId && <HotspotWarnings projectId={projectId} />}

            {/* Knowledge Base */}
            <div className="card">
              <div className="card-hd flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink-primary">{t.projectOverview.knowledgeBase}</h3>
                <span className="text-xs font-medium text-brand-main cursor-pointer" onClick={() => navigate({ to: '/wiki' })}>View All →</span>
              </div>
              <div className="card-bd p-3">
                <p className="text-xs text-ink-muted">
                  {wikis.length > 0 ? `${wikis.length} page${wikis.length !== 1 ? 's' : ''} · ` : ''}
                  <span className="text-brand-main cursor-pointer" onClick={() => navigate({ to: '/wiki', search: { new: 'true' } })}>{t.projectOverview.createFirstWiki} →</span>
                </p>
              </div>
            </div>
            {/* Recent Activity */}
            <div className="card">
              <div className="card-hd flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink-primary">{t.projectOverview.recentActivity}</h3>
                <span className="text-xs font-medium text-brand-main cursor-pointer" onClick={() => navigate({ to: '/activity-log' })}>View All →</span>
              </div>
              <div className="card-bd-nopad">
                {activities.length === 0 ? (
                  <p className="text-center text-xs text-ink-muted py-6">{t.projectOverview.noActivity}</p>
                ) : (
                  <>
                    {activities.slice(0, activityLimit).map((a, i) => {
                      const typeMap: Record<string, { icon: string; label: string }> = {
                        issue_created: { icon: '📝', label: 'created' },
                        status_change: { icon: '🔄', label: 'changed' },
                        comment: { icon: '💬', label: 'commented' },
                        phase_change: { icon: '📊', label: 'changed phase of' },
                        desc_change: { icon: '📋', label: 'updated description of' },
                        wiki_change: { icon: '📖', label: 'edited' },
                      };
                      const tm = typeMap[a.event_type] || { icon: '📌', label: 'updated' };
                      const timeAgo = getTimeAgo(a.created_at);
                      return (
                        <div key={`${a.id}-${i}`} className="hover-row flex items-start gap-3 px-3 py-2">
                          <span className="text-xs shrink-0 mt-0.5">{tm.icon}</span>
                          <span className="flex-1" style={{ minWidth: 0, overflow: 'visible', wordBreak: 'break-word' }}>
                            <span className="text-xs text-ink-primary font-medium">{a.actor}</span>
                            <span className="text-xs text-ink-muted"> {tm.label} </span>
                            <span className="text-xs text-ink-primary">{a.summary}</span>
                          </span>
                          <span className="text-[0.6rem] text-ink-muted shrink-0" title={new Date(a.created_at).toLocaleString()}>{timeAgo}</span>
                        </div>
                      );
                    })}
                    {activities.length > activityLimit && (
                      <div className="text-center py-2 border-t border-edge">
                        <span className="text-xs text-brand-main cursor-pointer font-medium"
                          onClick={() => setActivityLimit(prev => prev + 20)}>
                          {t.projectOverview.showNext} ({activities.length - activityLimit} {t.projectOverview.remaining}) ↓
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* ─── Demo first-visit AI highlights tour ─── */}
      {tourStep > 0 && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-end justify-center" onClick={finishTour}>
          <div
            className="bg-surface-card border border-edge rounded-card shadow-card p-4 mb-8 w-full max-w-md mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-ink-primary">✨ {t.projectOverview.tourTitle}</p>
              <button className="text-[0.65rem] text-ink-muted hover:text-ink-primary" onClick={finishTour}>✕</button>
            </div>
            <p className="text-sm font-semibold text-ink-primary mb-1">
              {tourStep === 2 && `2. ${t.projectOverview.tourStep2Title}`}
              {tourStep === 3 && `3. ${t.projectOverview.tourStep3Title}`}
            </p>
            <p className="text-xs text-ink-secondary mb-3 leading-relaxed">
              {tourStep === 2 && t.projectOverview.tourStep2Body}
              {tourStep === 3 && t.projectOverview.tourStep3Body}
            </p>
            {/* Step indicator — 5-step journey: home → health radar → risk → reports → wiki */}
            <div className="flex items-center gap-1.5 mb-3">
              {[1, 2, 3, 4, 5].map(n => (
                <span key={n} className={`h-1.5 rounded-full transition-all ${n === tourStep ? 'w-6 bg-brand-main' : n < tourStep ? 'w-3 bg-brand-main/40' : 'w-3 bg-edge'}`} />
              ))}
              <span className="ml-auto text-[0.6rem] text-ink-muted font-medium">{tourStep}/5</span>
            </div>
            <div className="flex items-center justify-between">
              <button
                className="text-xs text-ink-muted hover:text-ink-primary px-2 py-1"
                onClick={finishTour}
              >
                {t.projectOverview.tourDone}
              </button>
              <button
                className="btn-brand btn-xs"
                onClick={() => {
                  if (tourStep >= 3) {
                    // Step 4 → AI Reports (existing generated reports shown to
                    // the read-only demo account)
                    navigate({ to: '/reports', search: { tour: '4' }, replace: true });
                  } else {
                    setTourStep(prev => prev + 1);
                  }
                }}
              >
                {tourStep >= 3 ? t.projectOverview.tourNext : t.projectOverview.tourNext}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PhaseBar({ projectId, currentPhase, isOwner }: { projectId: string | undefined; currentPhase: string | undefined; isOwner: boolean }) {
  const [val, setVal] = useState(currentPhase || 'development');
  const [committed, setCommitted] = useState(currentPhase || 'development');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savingRef = useRef(false);
  const [phaseList, setPhaseList] = useState<Array<{key:string;value:string;icon?:string;color?:string}>>([]);
  const t = useT();

  useEffect(() => {
    masterDataApi.list('project_phase').then((res) => {
      setPhaseList((res.data.data || []) as Array<{key:string;value:string;icon?:string;color?:string}>);
    }).catch(() => {});
  }, []);

  useEffect(() => { setVal(currentPhase || 'development'); setCommitted(currentPhase || 'development'); }, [currentPhase]);

  const save = async () => {
    if (!projectId || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await projectApi.update(projectId, { phase: val });
      setCommitted(val);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { // Log error to monitoring service when available
    } finally { setSaving(false); savingRef.current = false; }
  };

  const currentIdx = phaseList.findIndex(p => p.key === committed);

  return (
    <div className="card mb-4">
      <div className="card-bd p-4">
        <div className="flex items-center">
          {phaseList.map((p, i) => {
            const isPast = i < currentIdx;
            const isCurrent = i === currentIdx;
            const isLast = i === phaseList.length - 1;

            return (
              <div key={p.key} className="flex items-center" style={{ flex: 1 }}>
                {/* Node + Label */}
                <div className={`flex flex-col items-center ${isOwner ? 'cursor-pointer' : 'cursor-default'}`}
                  onClick={() => isOwner && setVal(p.key)}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    isPast ? 'bg-success-soft text-success border-2 border-success' :
                    isCurrent ? 'bg-danger-soft text-danger border-2 border-danger' :
                    'bg-surface-hover text-ink-muted border-2 border-edge'
                  }`}>
                    {isPast ? '✓' : isCurrent ? '🚩' : i + 1}
                  </div>
                  <span className={`text-[0.625rem] mt-1.5 whitespace-nowrap font-medium ${
                    isCurrent ? 'text-danger font-semibold' : isPast ? 'text-success' : 'text-ink-muted'
                  }`}>
                    {p.value}
                  </span>
                </div>
                {/* Connector line */}
                {!isLast && (
                  <div className="flex-1 mx-1" style={{ height: '2px', marginBottom: '18px' }}>
                    <div className={`w-full h-full ${isPast ? 'bg-success' : 'border-t-2 border-dashed border-edge'}`} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {saved ? (
          <p className="text-xs text-success mt-2">✓ {t.projectOverview.phaseUpdated}</p>
        ) : val !== committed && (
          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-edge">
            <span className="text-xs text-ink-muted">{t.projectOverview.changePhase} <strong>{val}</strong>?</span>
            <button className="btn-brand btn-xs" onClick={save} disabled={saving}>{saving ? t.projectOverview.saving : t.projectOverview.save}</button>
            <button className="btn-secondary btn-xs" onClick={() => setVal(committed)}>{t.projectOverview.cancel}</button>
          </div>
        )}
      </div>
    </div>
  );
}
