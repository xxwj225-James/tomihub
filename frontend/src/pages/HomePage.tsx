import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useT } from '@/i18n/useT';
import { useProjectStore } from '@/stores/projectStore';
import { useAuthStore } from '@/stores/authStore';
import { issueApi, type IssueData } from '@/api/issueApi';
import { aiApi, type HealthResult, type AiSummaryResult } from '@/api/aiApi';
import { notificationApi } from '@/api/notificationApi';
import http from '@/lib/http';
import { aiEnabled } from '@/lib/aiGate';
import { isDemoUser as isDemoUserEmail } from '@/lib/demoUser';
import { getLlmErrorMessage } from '@/lib/errors';
import { HealthGauge } from '@/components/ai/HealthGauge';
import { CabinPanel } from '@/components/cabin/CabinPanel';
import { FeedbackRow } from '@/components/ai/FeedbackRow';
import { SparklineChart } from '@/components/chart/SparklineChart';
import { RadarChart } from '@/components/ai/RadarChart';
import { DonutChart } from '@/components/chart/DonutChart';
import { IssueCountChip } from '@/components/ai/IssueCountChip';

function priorityTag(p: string) {
  const lower = (p || '').toLowerCase();
  if (lower === 'critical' || lower === 'high') return 'tag-hi';
  if (lower === 'medium') return 'tag-med';
  return 'tag-lo';
}


function initial(name: string | null | undefined): string {
  return (name || '?').charAt(0).toUpperCase();
}

export function HomePage() {
  const t = useT();
  const navigate = useNavigate();
  const { projects, currentProject, loading, fetchProjects } = useProjectStore();
  const reset = useProjectStore((s) => s.reset);
  const [myIssues, setMyIssues] = useState<IssueData[]>([]);
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthRefreshing, setHealthRefreshing] = useState(false);
  const user = useAuthStore((s) => s.user);
  const tenantRole = useAuthStore((s) => s.currentTenant?.role);
  const canWrite = tenantRole !== 'viewer';
  // Demo account is read-only — health refresh would burn LLM tokens + write
  // cache, so the button is disabled and the backend refuses refresh anyway.
  const isDemoUser = useAuthStore((s) => isDemoUserEmail(s.user?.email));
  // Demo tour step 1 — personal AI analysis on Home (health score + summary).
  // Continues to Project Overview (?tour=2) for the health radar.
  // AI-only: the no-AI edition has no AI highlights to tour.
  const tour = (useSearch({ strict: false }) as { tour?: string }).tour;
  const showTour1 = tour === '1' && isDemoUser && aiEnabled;
  const homeTourRef = useRef<HTMLDivElement>(null);
  const nextTourStep = () => {
    try { localStorage.setItem('tomihub-demo-tour', 'in-progress'); } catch { /* noop */ }
    navigate({ to: '/project-overview', search: { tour: '2' }, replace: true });
  };
  const skipTour = () => {
    try { localStorage.setItem('tomihub-demo-tour', 'done'); } catch { /* noop */ }
    navigate({ to: '/home', search: {}, replace: true });
  };
  useEffect(() => {
    if (showTour1 && homeTourRef.current) {
      homeTourRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [showTour1]);
  // AI output language is a SEPARATE setting from the UI language — never fall back to UI
  const userAiLang = useAuthStore((s) => s.user?.aiLanguage);
  const lang = userAiLang || 'en';

  // Personal health dimension labels (radar chart) — reuse the home dim labels
  const MY_DIM_LABELS: Record<string, string> = {
    response_speed: t.home.dimResponse,
    resolution_efficiency: t.home.dimResolution,
    workload_balance: t.home.dimWorkload,
    completion_quality: t.home.dimQuality,
    collaboration: t.home.dimCollab,
  };

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  useEffect(() => { return () => reset(); }, [reset]);

  const [healthTrend, setHealthTrend] = useState<{ trend: string; snapshots: Array<{ score: number; time: string }> } | null>(null);
  // Summary-level health for every project the user participates in (Home cards)
  const [myProjects, setMyProjects] = useState<Array<{
    id: string; name: string; key: string; phase: string | null;
    myRole: string | null;
    healthScore: number | null;
    openIssues: number; doneIssues: number; totalIssues: number;
    completionPct: number; criticalOpen: number; highOpen: number; myOpen: number;
    analyzedAt: string | null;
  }>>([]);
  const [healthProgress, setHealthProgress] = useState('');
  const [healthProgressStep, setHealthProgressStep] = useState(0);
  const [healthError, setHealthError] = useState('');
  const [summary, setSummary] = useState<AiSummaryResult | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryRefreshing, setSummaryRefreshing] = useState(false);
  const [summaryProgress, setSummaryProgress] = useState('');
  const [summaryProgressStep, setSummaryProgressStep] = useState(0);
  const [summaryError, setSummaryError] = useState('');
  // Expandable task list under the tier-1 "View N issues" link
  const [tier1Expanded, setTier1Expanded] = useState(false);

  const loadHealth = async (forceRefresh = false) => {
    if (!user?.id) return;
    if (forceRefresh) {
      setHealthRefreshing(true);
      setHealthProgressStep(1);
      setHealthProgress('t.home.gatheringData');
    } else if (!health) setHealthLoading(true);
    try {
      const { data } = await aiApi.getMyHealthScore(user.id, undefined, forceRefresh);
      if (data) {
        setHealth(data); setHealthProgress('');
        // Only surface an error when the backend actually reports one — a
        // clean result must NOT map to the generic "AI unavailable" text.
        const errCode = (data as { llm_error?: string }).llm_error;
        setHealthError(errCode ? getLlmErrorMessage(errCode, t.app) : '');
      }
      if (!forceRefresh && data?.stale) loadHealth(true);
    } catch { /* noop */ }
    finally { setHealthLoading(false); setHealthRefreshing(false); setHealthProgress(''); }
  };

  const refreshHealth = async () => {
    if (!user?.id || healthRefreshing) return;
    setHealthRefreshing(true);
    setHealthError('');
    setHealthProgress('t.home.gatheringData');
    try {
      // SSE streaming for progress
      const token = useAuthStore.getState().accessToken;
      const tenantId = useAuthStore.getState().currentTenant?.id;
      const resp = await fetch(`/api/v1/ai/my-health-score?refresh=true&stream=true&lang=${lang}`, {
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': user.id,
          ...(token && { Authorization: `Bearer ${token}` }),
          ...(tenantId && { 'X-Tenant-Id': tenantId }),
        },
      });
      if (!resp.ok || !resp.body) { setHealthRefreshing(false); return; }
      // If response is not SSE (plain JSON for no-data fallback), parse directly
      const ct = resp.headers.get('content-type') || '';
      if (!ct.includes('text/event-stream')) {
        const data = await resp.json();
        if (data) {
          setHealth(data);
          const llmErr = (data as Record<string, unknown>).llm_error;
          setHealthError(llmErr ? getLlmErrorMessage(String(llmErr), t.app) : '');
        }
        setHealthRefreshing(false); setHealthProgress('');
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '', pendingEvent = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) { setHealthRefreshing(false); setHealthProgress(''); break; }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('event: ')) { pendingEvent = line.slice(7).trim(); continue; }
          if (line.startsWith('data: ')) {
            const d = JSON.parse(line.slice(6));
            if (pendingEvent === 'progress') {
              setHealthProgress(d.text || '');
              if (d.step) setHealthProgressStep(d.step);
            }
            if (pendingEvent === 'error') {
              setHealthError(getLlmErrorMessage(d.code, t.app));
            }
            if (pendingEvent === 'result') {
              setHealth(d);
              setHealthError(d.llm_error ? getLlmErrorMessage(d.llm_error, t.app) : '');
              setHealthRefreshing(false);
              setHealthProgress('');
              setHealthProgressStep(0);
            }
            pendingEvent = '';
          }
        }
      }
    } catch { setHealthRefreshing(false); setHealthProgress(''); setHealthProgressStep(0); }
  };

  // ─── AI Summary ───
  const loadSummary = async (forceRefresh = false) => {
    if (!user?.id) return;
    if (forceRefresh) {
      setSummaryRefreshing(true);
      setSummaryProgressStep(1);
      setSummaryProgress(t.home.gatheringData);
    } else if (!summary) setSummaryLoading(true);
    try {
      const { data } = await aiApi.getMySummary(user.id, forceRefresh);
      if (data) {
        setSummary(data); setSummaryProgress(''); setSummaryProgressStep(0);
        // Only surface an error when the backend actually reports one.
        const errCode = (data as { error_code?: string }).error_code;
        setSummaryError(errCode ? getLlmErrorMessage(errCode, t.app) : '');
      }
      if (!forceRefresh && data?.stale) loadSummary(true);
    } catch { /* noop */ }
    finally { setSummaryLoading(false); setSummaryRefreshing(false); setSummaryProgress(''); setSummaryProgressStep(0); }
  };

  const refreshSummary = async () => {
    if (!user?.id || summaryRefreshing) return;
    setSummaryRefreshing(true);
    setSummaryError('');
    setSummaryProgressStep(1);
    setSummaryProgress(t.home.gatheringData);
    try {
      const token = useAuthStore.getState().accessToken;
      const tenantId = useAuthStore.getState().currentTenant?.id;
      const resp = await fetch(`/api/v1/ai/my-summary?refresh=true&stream=true&lang=${lang}`, {
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': user.id,
          ...(token && { Authorization: `Bearer ${token}` }),
          ...(tenantId && { 'X-Tenant-Id': tenantId }),
        },
      });
      if (!resp.ok || !resp.body) { setSummaryRefreshing(false); return; }
      const ct = resp.headers.get('content-type') || '';
      if (!ct.includes('text/event-stream')) {
        const data = await resp.json();
        if (data) {
          setSummary(data);
          const errCode = (data as Record<string, unknown>).error_code;
          setSummaryError(errCode ? getLlmErrorMessage(String(errCode), t.app) : '');
        }
        setSummaryRefreshing(false); setSummaryProgress('');
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '', pendingEvent = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) { setSummaryRefreshing(false); setSummaryProgress(''); break; }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('event: ')) { pendingEvent = line.slice(7).trim(); continue; }
          if (line.startsWith('data: ')) {
            const d = JSON.parse(line.slice(6));
            if (pendingEvent === 'progress') {
              setSummaryProgress(d.text || '');
              if (d.step) setSummaryProgressStep(d.step);
            }
            if (pendingEvent === 'error') {
              setSummaryError(getLlmErrorMessage(d.code, t.app));
            }
            if (pendingEvent === 'result') {
              setSummary(d); setSummaryRefreshing(false);
              setSummaryProgress(''); setSummaryProgressStep(0);
              setSummaryError(d.error_code ? getLlmErrorMessage(d.error_code, t.app) : '');
            }
            pendingEvent = '';
          }
        }
      }
    } catch { setSummaryRefreshing(false); setSummaryProgress(''); setSummaryProgressStep(0); }
  };

  // loadHealth recreated each render — only run on user change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!aiEnabled) return; loadHealth(false); }, [user?.id]);
  // loadSummary recreated each render — only run on user change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!aiEnabled) return; loadSummary(false); }, [user?.id]);
  // Defer trend (not critical for first paint)
  useEffect(() => {
    if (!aiEnabled) return;
    const t = setTimeout(() => {
      if (!user?.id) return;
      aiApi.getMyHealthTrend(user.id, 30).then(({ data }) => { if (data) setHealthTrend(data); }).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [user?.id]);

  useEffect(() => {
    if (currentProject?.id) {
      issueApi.list(currentProject.id).then(({ data: resp }) => setMyIssues(resp.data?.items || []));
    }
  }, [currentProject?.id]);

  // Summary-level project health for the workspace cards
  useEffect(() => {
    if (!aiEnabled || !user?.id) return;
    aiApi.getMyProjectsHealth(user.id).then(({ data }) => {
      if (data?.projects) setMyProjects(data.projects);
    }).catch(() => {});
  }, [user?.id]);

  // ─── My Tasks: assigned TO ME only (Home cards are personal scope) ───
  const [myTasks, setMyTasks] = useState<IssueData[]>([]);
  // Tasks I created (reporter) — separate card count
  const [myCreated, setMyCreated] = useState<IssueData[]>([]);
  useEffect(() => {
    Promise.all([
      issueApi.listMyTasks().then(({ data: resp }) => resp.data?.items || []),
      issueApi.listCreatedByMe().then(({ data: resp }) => resp.data?.items || []),
    ]).then(([assigned, reported]) => {
      // Keep the two scopes SEPARATE — "My Tasks" counts only what is
      // assigned to me; "Created by Me" counts only what I reported.
      // Merging them inflated every card (the AI summary may merge them,
      // but these Home cards are personal task views).
      setMyTasks(assigned);
      setMyCreated(reported);
    }).catch(() => {});
  }, []);

  // ─── My Reports + pending MCP approvals (sidebar cards) ───
  const [recentReports, setRecentReports] = useState<Array<{ id: string; title: string; reportType?: string; generatedAt?: string; createdAt?: string }>>([]);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  useEffect(() => {
    http.get('/reports').then(({ data }) => {
      const items = ((data as Record<string, unknown>).data || []) as Array<Record<string, unknown>>;
      setRecentReports(items.slice(0, 5).map(r => ({
        id: String(r.id), title: String(r.title || ''),
        reportType: String(r.reportType || 'daily'),
        generatedAt: String(r.generatedAt || r.createdAt || ''),
      })));
    }).catch(() => {});
    notificationApi.list({ type: 'hitl_pending' }).then(({ data }) => {
      const resp = data as unknown as { data?: { items?: Array<{ status?: string }> } };
      const items = resp.data?.items || [];
      setPendingApprovals(items.filter(i => i.status === 'pending').length);
    }).catch(() => {});
  }, []);
  const myActive = myTasks.filter(i => i.status !== 'done' && i.status !== 'cancelled');
  const myInProgress = myTasks.filter(i => i.status === 'in_progress');
  const highCount = myActive.filter(i => i.priority === 'high' || i.priority === 'critical').length;
  // TODO = open but not started (no progress/review state)
  const myTodo = myActive.filter(i => i.status !== 'in_progress' && i.status !== 'in_review');

  return (
    <div>
      {/* ═══ HEADER BAR (mockup .ch) ═══ */}
      <div className="ch">
        <div>
          <h2 className="text-base font-semibold text-ink-primary">{t.home.title}</h2>
          <p className="text-xs text-ink-muted mt-0.5">{t.home.welcome}</p>
        </div>
        <div className="flex items-center gap-2">
          {canWrite && (
            <button className="btn-brand" onClick={() => navigate({ to: '/projects/new' })}>
              {t.home.newProject}
            </button>
          )}
        </div>
      </div>

      {/* ═══ CONTENT (mockup .cb) ═══ */}
      <div className="p-6" style={{ maxWidth: '1400px' }}>

      {/* Portfolio Sync Cabins — only PM/Owner can create */}
      <CabinPanel compact canCreate={Array.isArray(projects) && projects.some(p => p.leadId === user?.id)} />

      <div className="grid grid-cols-4 gap-3 mb-4 mt-4">
        {/* MY TASK — TODO + In Progress combined */}
        <div className="card p-4 cursor-pointer" onClick={() => navigate({ to: '/issues', search: { view: 'my-tasks', status: 'open', assignee: 'me' } })}>
          <p className="text-[0.625rem] font-bold uppercase tracking-widest text-ink-muted flex items-center gap-2">📋 {t.home.myTasks}
            <span className="text-[0.6875rem] text-ink-muted">▶</span>
          </p>
          <p className="text-2xl font-bold text-brand-main mt-1">{myTodo.length + myInProgress.length}</p>
          {highCount > 0 && (
            <p className="text-[0.6875rem] text-ink-muted mt-0.5">{highCount} high</p>
          )}
        </div>
        {/* TODO — my open tasks not started yet */}
        <div className="card p-4 cursor-pointer" onClick={() => navigate({ to: '/issues', search: { view: 'my-tasks', status: 'todo', assignee: 'me' } })}>
          <p className="text-[0.625rem] font-bold uppercase tracking-widest text-ink-muted flex items-center gap-2">📝 {t.home.todoLabel}
            <span className="text-[0.6875rem] text-ink-muted">▶</span>
          </p>
          <p className="text-2xl font-bold text-ink-primary mt-1">{myTodo.length}</p>
        </div>
        {/* IN PROGRESS — my tasks in progress */}
        <div className="card p-4 cursor-pointer" onClick={() => navigate({ to: '/issues', search: { view: 'my-tasks', status: 'in_progress', assignee: 'me' } })}>
          <p className="text-[0.625rem] font-bold uppercase tracking-widest text-ink-muted flex items-center gap-2">🔄 {t.home.inProgress}
            <span className="text-[0.6875rem] text-ink-muted">▶</span>
          </p>
          <p className="text-2xl font-bold text-warning mt-1">{myInProgress.length}</p>
        </div>
        {/* CREATED BY ME — tasks I created across all projects */}
        <div className="card p-4 cursor-pointer" onClick={() => navigate({ to: '/issues', search: { view: 'created-by-me', creator: 'me' } })}>
          <p className="text-[0.625rem] font-bold uppercase tracking-widest text-ink-muted flex items-center gap-2">✍️ {t.issues.createdByMe}
            <span className="text-[0.6875rem] text-ink-muted">▶</span>
          </p>
          <p className="text-2xl font-bold text-ink-primary mt-1">{myCreated.length}</p>
        </div>
      </div>

      {/* ═══ My Reports + MCP Audit — two cards ═══ */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* My Reports */}
        <div className="card">
          <div className="card-hd flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink-primary">📊 {t.report.myReports}</h3>
            <span className="text-xs font-medium text-brand-main cursor-pointer" onClick={() => navigate({ to: '/reports' })}>{t.home.viewAll}</span>
          </div>
          <div className="card-bd-nopad">
            {recentReports.length === 0 ? (
              <p className="text-center text-xs text-ink-muted py-6">{t.report.noReports}</p>
            ) : (
              recentReports.map(r => {
                const typeIcon = r.reportType === 'daily' ? '📅' : r.reportType === 'weekly' ? '📊' : r.reportType === 'sprint_review' ? '🔄' : r.reportType === 'monthly' ? '📈' : '📝';
                return (
                  <button key={r.id} className="w-full flex items-center gap-2 px-4 py-1.5 border-b border-edge last:border-b-0 hover:bg-surface-hover transition-colors text-left"
                    onClick={() => navigate({ to: '/reports' })}>
                    <span className="text-xs shrink-0">{typeIcon}</span>
                    <span className="flex-1 min-w-0 truncate text-xs text-ink-primary font-medium">{r.title}</span>
                    <span className="text-[0.625rem] text-ink-muted shrink-0">
                      {r.generatedAt ? new Date(r.generatedAt).toLocaleDateString() : ''}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* MCP Audit */}
        <div className="card">
          <div className="card-hd flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink-primary">🔐 {t.sidebar.mcpAudit}</h3>
            <span className="text-xs font-medium text-brand-main cursor-pointer" onClick={() => navigate({ to: '/mcp-audit' })}>{t.home.viewAll}</span>
          </div>
          <div className="card-bd-nopad">
            {pendingApprovals === 0 ? (
              <p className="text-center text-xs text-ink-muted py-6">{t.home.noPendingApprovals}</p>
            ) : (
              <button className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover transition-colors text-left"
                onClick={() => navigate({ to: '/mcp-audit' })}>
                <span className="text-sm">⏳</span>
                <span className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-warning block">{(t.home.pendingApprovals || '{count} pending').replace('{count}', String(pendingApprovals))}</span>
                  <span className="text-[0.625rem] text-ink-muted">{t.home.pendingApprovalsHint}</span>
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ═══ My Workspace AI Analysis — full width (AI gate) ═══ */}
      {aiEnabled && (
      <div
        ref={homeTourRef}
        className={`card ai-glow mb-4 transition-shadow ${showTour1 ? 'ring-2 ring-brand-main shadow-card-hover' : ''}`}
      >
            <div className="card-hd flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-main flex items-center gap-1.5">
                <span className="pulse" />My Workspace — {user?.displayName || 'You'}
              </p>
              <button className="btn-ghost text-base px-1"
                onClick={() => { refreshHealth(); refreshSummary(); }}
                disabled={healthRefreshing || summaryRefreshing}
                title="Refresh">
                {(healthRefreshing || summaryRefreshing) ? (
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-brand-main border-t-transparent animate-spin inline-block" />
                ) : '🔄'}
              </button>
            </div>
            <div className="card-bd p-3">
              {/* Progress bar */}
              {(healthRefreshing || summaryRefreshing) && (healthProgress || summaryProgress) && (
                <div className="mb-3 p-3 bg-brand-soft rounded-card">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-5 h-5 rounded-full border-2 border-brand-main border-t-transparent animate-spin" />
                    <span className="text-sm text-brand-main font-medium">{healthProgress || summaryProgress}</span>
                  </div>
                  <div className="progress" style={{ height: '4px' }}>
                    <div className="progress-bar brand animate-pulse"
                      style={{ width: (healthProgressStep || summaryProgressStep) === 1 ? '33%' : (healthProgressStep || summaryProgressStep) === 2 ? '66%' : '90%' }} />
                  </div>
                </div>
              )}
              {/* LLM unavailable (bad/expired API key, quota, ...) — surface the reason */}
              {(healthError || summaryError) && (
                <div className="mb-3 p-3 rounded-card bg-warning-soft border border-warning/30">
                  <p className="text-xs text-warning font-medium">⚠️ {healthError || summaryError}</p>
                </div>
              )}
              {healthLoading && summaryLoading ? (
                <p className="text-xs text-ink-muted py-4">{t.home.loadingWorkspace}</p>
              ) : (
                <>
                  {/* ═══ ① My Projects — one module, table layout; detail in Project Overview ═══ */}
                  {myProjects.length > 0 && (
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-semibold text-ink-primary">🗂 {t.home.myProjects}</p>
                        <span className="text-[0.6rem] text-ink-muted">{t.home.projectsOverviewHint}</span>
                      </div>
                      <div className="rounded-card bg-surface-hover overflow-hidden">
                        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-2.5 py-1.5 border-b border-edge text-[0.6rem] font-semibold text-ink-muted uppercase tracking-wide">
                          <span>{t.home.project}</span>
                          <span className="text-center w-14">{t.home.healthShort}</span>
                          <span className="text-center w-16">{t.home.progress}</span>
                          <span className="text-center w-16">{t.home.risk}</span>
                          <span className="text-right w-14">{t.home.action}</span>
                        </div>
                        {myProjects.map(p => {
                          const score = p.healthScore;
                          const scoreColor = score == null ? 'text-ink-muted'
                            : score >= 80 ? 'text-success'
                            : score >= 50 ? 'text-warning'
                            : 'text-danger';
                          const pct = Math.max(0, Math.min(100, p.completionPct || 0));
                          return (
                            <div key={p.id}
                              className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center px-2.5 py-1.5 hover:bg-edge transition-colors cursor-pointer border-b border-edge/50 last:border-b-0"
                              onClick={() => {
                                const store = useProjectStore.getState();
                                const full = store.projects.find(x => x.id === p.id);
                                if (full && full.id !== currentProject?.id) {
                                  store.setCurrentProject(full);
                                }
                                navigate({ to: '/project-overview' });
                              }}>
                              <span className="min-w-0">
                                <span className="text-xs font-semibold text-ink-primary block truncate">{p.key} · {p.name}</span>
                                <span className="text-[0.6rem] text-ink-muted">
                                  {p.myRole || '—'}{p.myOpen > 0 ? (
                                    <>
                                      {' · '}{t.home.myTasks}:{' '}
                                      <span className="inline-block" onClick={e => e.stopPropagation()}>
                                        <IssueCountChip count={p.myOpen}
                                          search={{ assignee: 'me', status: 'open' }}
                                          onBeforeJump={() => {
                                            const store = useProjectStore.getState();
                                            const full = store.projects.find(x => x.id === p.id);
                                            if (full && full.id !== currentProject?.id) store.setCurrentProject(full);
                                          }} />
                                      </span>
                                    </>
                                  ) : ''}{p.phase ? ` · ${p.phase}` : ''}
                                </span>
                              </span>
                              <span className={`text-center text-[0.7rem] font-bold w-14 ${scoreColor}`}>{score != null ? score : '—'}</span>
                              <span className="flex items-center justify-center gap-1 w-16" title={`${pct}% ${t.home.completed}`}>
                                <svg width="13" height="13" viewBox="0 0 44 44" style={{ transform: 'rotate(-90deg)' }}>
                                  <circle cx="22" cy="22" r="18" fill="none" stroke="hsl(var(--edge-default))" strokeWidth="6" />
                                  <circle cx="22" cy="22" r="18" fill="none" stroke="hsl(var(--success))"
                                    strokeWidth="6" strokeLinecap="round"
                                    strokeDasharray={`${(pct / 100) * (2 * Math.PI * 18)} ${2 * Math.PI * 18}`} />
                                </svg>
                                <span className="text-[0.65rem] text-ink-muted">{pct}%</span>
                              </span>
                              <span className="text-center w-16" onClick={e => e.stopPropagation()}>
                                {((p.criticalOpen || 0) + (p.highOpen || 0)) > 0 ? (
                                  <span className="inline-flex gap-1 text-[0.65rem] text-ink-muted">
                                    {t.home.criticalShort}{' '}
                                    <IssueCountChip count={p.criticalOpen || 0} tone="danger"
                                      search={{ priority: 'critical', status: 'open' }}
                                      title={t.home.riskIssuesTip}
                                      onBeforeJump={() => {
                                        const store = useProjectStore.getState();
                                        const full = store.projects.find(x => x.id === p.id);
                                        if (full && full.id !== currentProject?.id) store.setCurrentProject(full);
                                      }} />
                                    · {t.home.highShort}{' '}
                                    <IssueCountChip count={p.highOpen || 0} tone="warning"
                                      search={{ priority: 'high', status: 'open' }}
                                      title={t.home.riskIssuesTip}
                                      onBeforeJump={() => {
                                        const store = useProjectStore.getState();
                                        const full = store.projects.find(x => x.id === p.id);
                                        if (full && full.id !== currentProject?.id) store.setCurrentProject(full);
                                      }} />
                                  </span>
                                ) : (
                                  <span className="text-ink-muted">—</span>
                                )}
                              </span>
                              <span className="text-right text-[0.65rem] font-semibold text-brand-main w-14">{t.home.viewDetails} ↗</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ═══ ② My Work — personal perspective ═══ */}
                  <p className="text-xs font-semibold text-ink-primary mb-1.5">👤 {t.home.myWork}</p>
                  {health && health.health_score > 0 ? (
                    <div className="mb-4 p-3 rounded-card bg-surface-hover">
                      <div className="flex items-start gap-3">
                        <HealthGauge score={health.health_score} size="md" />
                        <div className="text-sm leading-relaxed flex-1 min-w-0">
                          <p className="text-xs text-ink-muted mt-0.5">{health.summary || t.home.healthScore}</p>
                        </div>
                      </div>
                      {/* Radar + trend side by side */}
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                        <div className="flex flex-col items-center">
                          <p className="text-[0.65rem] font-semibold text-ink-muted mb-1">{t.home.chartRadarTitle}</p>
                          {health.dimensions && Object.keys(health.dimensions).length >= 3 ? (
                            <RadarChart dimensions={health.dimensions} labels={MY_DIM_LABELS} size={190} />
                          ) : null}
                        </div>
                        <div className="flex flex-col items-center">
                          {healthTrend && healthTrend.snapshots.length >= 2 && (() => {
                            const pts = healthTrend.snapshots.slice(-14);
                            const trendUp = pts[pts.length-1].score > pts[0].score;
                            const sc = trendUp ? 'var(--success)' : 'var(--danger)';
                            return (
                              <>
                                <p className="text-[0.65rem] font-semibold text-ink-muted mb-1">{t.home.chartTrendTitle}</p>
                                <SparklineChart
                                  data={pts.map(x => x.score)}
                                  width={280}
                                  height={110}
                                  color={sc}
                                  showAxes
                                  labels={pts.map(x => new Date(x.time).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }))}
                                  formatter={(v: number) => `${t.home.healthScore}: ${v}`}
                                />
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-4 p-3 rounded-card bg-surface-hover text-center text-xs text-ink-muted">
                      {t.home.healthEmpty}
                    </div>
                  )}

                  {/* ═══ AI Summary — structured tiers ═══ */}

                  {/* Tier 1: My Work (tier1_my) — counts & list come from REAL data, LLM text is commentary */}
                  {summary?.tier1_my && (
                    <div className="mb-3 p-3 rounded-card bg-surface-hover">
                      <p className="text-xs font-semibold text-ink-primary mb-1.5">
                        📋 {summary.tier1_my.title || `My Work`}
                      </p>
                      {/* Real task data — expandable link, same interaction as Project Overview risks */}
                      {(() => {
                        const myActive = myTasks.filter(i => i.status !== 'done' && i.status !== 'cancelled');
                        const myHigh = myActive.filter(i => i.priority === 'critical' || i.priority === 'high');
                        return (
                          <>
                            <div className="flex items-center gap-2 mb-2">
                              {myActive.length > 0 && (
                                <button
                                  className="text-[0.65rem] font-semibold text-brand-main bg-brand-soft hover:bg-brand-soft/60 rounded-full px-2 py-0.5 cursor-pointer transition-colors"
                                  onClick={() => setTier1Expanded(!tier1Expanded)}>
                                  {t.projectOverview.viewIssues.replace('{n}', String(myActive.length))} {tier1Expanded ? '▴' : '▾'}
                                </button>
                              )}
                              {/* Priority distribution donut — legend shows color meaning + share */}
                              {myActive.length > 0 && (() => {
                                const pri = ['critical', 'high', 'medium', 'low'];
                                // Semantic priority colors (same hue as the priority badges)
                                const PRI_COLORS: Record<string, string> = {
                                  critical: 'var(--danger)',
                                  high: 'var(--warning)',
                                  medium: 'var(--brand)',
                                  low: 'var(--ink-muted)',
                                };
                                const PRI_LABELS: Record<string, string> = {
                                  critical: t.home.criticalShort,
                                  high: t.home.highShort,
                                  medium: t.home.mediumShort,
                                  low: t.home.lowShort,
                                };
                                const donut = pri
                                  .map(p => ({ name: p, value: myActive.filter(i => i.priority === p).length }))
                                  .filter(d => d.value > 0);
                                const total = donut.reduce((s, d) => s + d.value, 0);
                                return donut.length > 1 && (
                                  <div className="ml-auto flex items-center gap-2.5">
                                    <DonutChart data={donut} width={72} height={72} innerRadius="60%" showLegend={false} colors={PRI_COLORS} />
                                    <ul className="space-y-0.5">
                                      {donut.map(d => (
                                        <li key={d.name} className="flex items-center gap-1.5 text-[0.6rem] text-ink-muted">
                                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PRI_COLORS[d.name] }} />
                                          <span className="font-medium text-ink-secondary">{PRI_LABELS[d.name]}</span>
                                          <span>{d.value} · {total > 0 ? Math.round((d.value / total) * 100) : 0}%</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                );
                              })()}
                            </div>
                            {/* Expandable issue list */}
                            {tier1Expanded && myActive.length > 0 && (
                              <div className="space-y-0.5 mb-2 border-l-2 border-edge pl-2.5">
                                {[...myHigh, ...myActive.filter(i => !myHigh.includes(i))].slice(0, 20).map(i => {
                                  const projKey = projects.find(p => p.id === i.projectId)?.key || '';
                                  return (
                                  <button key={i.id}
                                    className="block w-full text-left rounded px-1.5 py-0.5 hover:bg-edge transition-colors cursor-pointer"
                                    onClick={() => navigate({ to: '/issues/$id', params: { id: i.id } })}>
                                    <span className="font-mono font-semibold text-brand-main">
                                      {projKey || '?'}-{i.issueNumber}
                                    </span>{' '}
                                    <span className="text-xs text-ink-primary">{i.title}</span>{' '}
                                    {i.priority === 'critical' || i.priority === 'high' ? (
                                      <span className="text-[0.6rem] text-danger">{i.priority}</span>
                                    ) : null}
                                  </button>
                                  );
                                })}
                                {myActive.length > 20 && (
                                  <span className="text-[0.6rem] text-ink-muted pl-1.5">…{t.projectOverview.moreIssues.replace('{n}', String(myActive.length - 20))}</span>
                                )}
                              </div>
                            )}
                          </>
                        );
                      })()}
                      {/* LLM commentary — skip when identical to the title (LLM occasionally repeats itself) */}
                      {summary.tier1_my.recommendation
                        && summary.tier1_my.recommendation !== summary.tier1_my.title
                        && (
                          <p className="text-[0.625rem] text-brand-main mt-1.5 pt-1.5 border-t border-edge">{summary.tier1_my.recommendation}</p>
                        )}
                    </div>
                  )}

                  {/* Tier 1: Team (PM only) */}
                  {summary?.tier1_team && (
                    <div className="mb-3 p-3 rounded-card bg-warning-soft/30">
                      <p className="text-xs font-semibold text-ink-primary mb-1.5">
                        👥 {summary.tier1_team.title || t.home.teamStatus}
                      </p>
                      <div className="flex gap-2 flex-wrap mb-1.5">
                        {summary.tier1_team.open_total !== undefined && (
                          <IssueCountChip count={summary.tier1_team.open_total} label={t.home.openChip}
                            search={{ status: 'open' }} />
                        )}
                        {summary.tier1_team.high_count > 0 && (
                          <IssueCountChip count={summary.tier1_team.high_count} label={t.home.highChip} tone="danger"
                            search={{ priority: 'critical,high', status: 'open' }} />
                        )}
                        {summary.tier1_team.unassigned > 0 && (
                          <IssueCountChip count={summary.tier1_team.unassigned} label={t.home.unassignedChip} tone="warning"
                            search={{ assignee: 'unassigned', status: 'open' }} />
                        )}
                        {summary.tier1_team.overdue > 0 && (
                          <span className="text-[0.625rem] bg-danger/10 px-1.5 py-0.5 rounded-full text-danger font-medium">{summary.tier1_team.overdue} {t.home.overdueChip}</span>
                        )}
                      </div>
                      {summary.tier1_team.recommendation && (
                        <p className="text-[0.625rem] text-warning/90">{summary.tier1_team.recommendation}</p>
                      )}
                    </div>
                  )}

                  {/* Tier 2: My Review */}
                  {summary?.tier2_my && (
                    <div className="mb-3 p-3 rounded-card bg-surface-hover">
                      <p className="text-xs font-semibold text-ink-primary mb-1.5">
                        📈 {summary.tier2_my.title || t.home.myReview}
                      </p>
                      <div className="flex gap-2 mb-1.5">
                        {summary.tier2_my.completed_count !== undefined && (
                          <span className="text-[0.625rem] bg-success/10 px-1.5 py-0.5 rounded-full text-success font-medium">{summary.tier2_my.completed_count} {t.home.completed}</span>
                        )}
                        {summary.tier2_my.story_points !== undefined && (
                          <span className="text-[0.625rem] bg-edge px-1.5 py-0.5 rounded-full text-ink-muted">{summary.tier2_my.story_points} {t.home.spLabel}</span>
                        )}
                      </div>
                      {(summary.tier2_my.strengths || []).slice(0, 2).map((s: string | Record<string, unknown>, i: number) => (
                        <p key={`str-${i}`} className="text-[0.625rem] text-success/80 mb-0.5 pl-2 relative before:content-['✓'] before:absolute before:left-0 before:text-success">
                          {typeof s === 'string' ? s : String(s?.title ?? s?.key ?? s)}
                        </p>
                      ))}
                      {(summary.tier2_my.improvements || []).slice(0, 2).map((s: string | Record<string, unknown>, i: number) => (
                        <p key={`imp-${i}`} className="text-[0.625rem] text-warning/80 mb-0.5 pl-2 relative before:content-['→'] before:absolute before:left-0 before:text-warning">
                          {typeof s === 'string' ? s : String(s?.title ?? s?.key ?? s)}
                        </p>
                      ))}
                      {summary.tier2_my.recommendation && (
                        <p className="text-[0.625rem] text-brand-main mt-1.5 pt-1.5 border-t border-edge">{summary.tier2_my.recommendation}</p>
                      )}
                    </div>
                  )}

                  {/* Tier 2: Team Review (PM only) */}
                  {summary?.tier2_team && (
                    <div className="mb-3 p-3 rounded-card bg-surface-hover">
                      <p className="text-xs font-semibold text-ink-primary mb-1.5">
                        🏆 {summary.tier2_team.title || t.home.teamReview}
                      </p>
                      <div className="flex gap-2 mb-1.5">
                        {summary.tier2_team.completed_count !== undefined && (
                          <span className="text-[0.625rem] bg-success/10 px-1.5 py-0.5 rounded-full text-success font-medium">{summary.tier2_team.completed_count} {t.home.completed}</span>
                        )}
                        {summary.tier2_team.story_points !== undefined && (
                          <span className="text-[0.625rem] bg-edge px-1.5 py-0.5 rounded-full text-ink-muted">{summary.tier2_team.story_points} {t.home.spLabel}</span>
                        )}
                      </div>
                      {(summary.tier2_team.strengths || []).slice(0, 2).map((s: string, i: number) => (
                        <p key={`ts-${i}`} className="text-[0.625rem] text-success/80 mb-0.5 pl-2 relative before:content-['✓'] before:absolute before:left-0 before:text-success">{s}</p>
                      ))}
                      {(summary.tier2_team.improvements || []).slice(0, 2).map((s: string, i: number) => (
                        <p key={`ti-${i}`} className="text-[0.625rem] text-warning/80 mb-0.5 pl-2 relative before:content-['→'] before:absolute before:left-0 before:text-warning">{s}</p>
                      ))}
                      {(summary.tier2_team.bottlenecks || []).slice(0, 2).map((s: string, i: number) => (
                        <p key={`tb-${i}`} className="text-[0.625rem] text-danger/80 mb-0.5 pl-2 relative before:content-['⚠'] before:absolute before:left-0 before:text-danger">{s}</p>
                      ))}
                    </div>
                  )}

                  {/* Tier 3: Portfolio (PM only) */}
                  {summary?.tier3 && (
                    <div className="mb-3 p-3 rounded-card bg-brand-soft/30">
                      <p className="text-xs font-semibold text-ink-primary mb-1.5">
                        📊 {summary.tier3.title || t.home.portfolio}
                      </p>
                      <div className="flex gap-2 mb-1.5">
                        {summary.tier3.project_count !== undefined && (
                          <span className="text-[0.625rem] bg-brand-main/20 px-1.5 py-0.5 rounded-full text-brand-main font-medium">{summary.tier3.project_count} {t.home.projects}</span>
                        )}
                      </div>
                      {(summary.tier3.summaries || []).slice(0, 3).map((s: Record<string, unknown>, i: number) => {
                        const name = String(s.name ?? s.key ?? '');
                        const status = s.status ? String(s.status) : null;
                        const health = s.health != null ? Number(s.health) : null;
                        return (
                        <p key={`ps-${i}`} className="text-[0.625rem] text-ink-muted mb-0.5">
                          <span className="font-medium text-ink-primary">{name}</span>
                          {status && <span className="ml-1">· {status}</span>}
                          {health != null && <span className={`ml-1 font-medium ${health >= 80 ? 'text-success' : health >= 50 ? 'text-warning' : 'text-danger'}`}>{health}</span>}
                        </p>
                        );
                      })}
                      {summary.tier3.recommendation && (
                        <p className="text-[0.625rem] text-brand-main mt-1.5 pt-1.5 border-t border-edge">{summary.tier3.recommendation}</p>
                      )}
                    </div>
                  )}

                  {/* Fallback when no summary data at all */}
                  {!summary?.tier1_my && !health && (
                    <p className="text-xs text-ink-muted mb-4">{t.home.noWorkspaceData}</p>
                  )}

                  {/* Risks + Recommendations — combined */}
                  {health && ((health.risks?.length || 0) > 0 || (health.recommendations?.length || 0) > 0) && (
                    <div className="mt-3 pt-3 border-t border-edge text-xs space-y-1.5">
                      {(health.risks || []).slice(0, 2).map((r, i) => (
                        <div key={`risk-${i}`} className="flex items-start gap-1.5"><span className="text-warning shrink-0">⚠</span><span className="text-ink-secondary">{typeof r === 'string' ? r : r.description}</span></div>
                      ))}
                      {(health.recommendations || []).slice(0, 2).map((r, i) => (
                        <div key={`rec-${i}`} className="flex items-start gap-1.5"><span className="text-brand-main shrink-0">→</span><span className="text-ink-secondary">{r}</span></div>
                      ))}
                    </div>
                  )}

                  {/* Feedback */}
                  {health && health.health_score > 0 && (
                    <FeedbackRow
                      analysisType="personal_health"
                      llmScore={health.health_score}
                      llmLevel={health.health_level || 'unknown'}
                    />
                  )}

                  {/* Timestamp + Refresh prompt */}
                  {(summary?.generated_at || health?.cached_at) && (
                    <div className="mt-3 pt-3 border-t border-edge text-right">
                      {(summary?.stale || health?.stale) && (
                        <span className="text-[0.625rem] text-warning font-medium">⚠ Data may be outdated</span>
                      )}
                      {summary?.generated_at && (
                        <p className="text-[0.625rem] text-ink-muted">
                          📋 Summary: {new Date(summary.generated_at).toLocaleString()}
                        </p>
                      )}
                      {health?.cached_at && (
                        <p className="text-[0.625rem] text-ink-muted">
                          ❤️ Health: {new Date(health.cached_at).toLocaleString()}
                        </p>
                      )}
                      <p className="text-[0.625rem] text-ink-muted mt-1.5 italic">
                        💡 {t.home.clickToRefresh}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
      )}

      {/* ═══ My Tasks + Created by Me — two columns ═══ */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* My Tasks */}
        <div className="card">
          <div className="card-hd flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink-primary">{t.home.myTasks}</h3>
            <span className="text-xs font-medium text-brand-main cursor-pointer" onClick={() => navigate({ to: '/issues', search: { view: 'my-tasks' } })}>{t.home.viewAll}</span>
          </div>
          <div className="card-bd-nopad">
            {myActive.length === 0 ? (
              <p className="text-center text-xs text-ink-muted py-6">{t.home.noTasks}</p>
            ) : (
              myActive.slice(0, 5).map(issue => (
                <div key={issue.id} className="hover-row flex items-center gap-3 cursor-pointer"
                  onClick={() => navigate({ to: '/issues/$id', params: { id: issue.id } })}>
                  <span className="font-mono text-xs text-ink-muted">{currentProject?.key}-{issue.issueNumber}</span>
                  <span className="flex-1 text-sm font-medium text-ink-primary truncate">{issue.title}</span>
                  <span className={`badge ${priorityTag(issue.priority)}`}>{issue.priority}</span>
                  <span className="av">{initial(issue.assigneeName)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Created by Me */}
        <div className="card">
          <div className="card-hd flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink-primary">{t.home.createdByMe}</h3>
            <span className="text-xs font-medium text-brand-main cursor-pointer" onClick={() => navigate({ to: '/issues', search: { view: 'created-by-me' } })}>{t.home.viewAll}</span>
          </div>
          <div className="card-bd-nopad">
            {myIssues.length === 0 ? (
              <p className="text-center text-xs text-ink-muted py-6">{t.home.noIssues}</p>
            ) : (
              myIssues.slice(0, 5).map(issue => (
                <div key={issue.id} className="hover-row flex items-center gap-3 cursor-pointer"
                  onClick={() => navigate({ to: '/issues/$id', params: { id: issue.id } })}>
                  <span className="font-mono text-xs text-ink-muted">{currentProject?.key}-{issue.issueNumber}</span>
                  <span className="flex-1 text-sm font-medium text-ink-primary truncate">{issue.title}</span>
                  <span className={`badge ${priorityTag(issue.priority)}`}>{issue.priority}</span>
                  <span className="text-xs text-ink-muted truncate max-w-[80px]">{issue.assigneeName || 'Unassigned'}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-hd">
          <h3 className="text-sm font-semibold text-ink-primary">{t.home.projects}</h3>
        </div>
        <div className="card-bd p-2">
          {loading ? (
            <p className="text-center text-xs text-ink-muted py-4">{t.home.loading}</p>
          ) : (projects || []).length === 0 ? (
            <p className="text-center text-xs text-ink-muted py-4">{t.home.noProjects}</p>
          ) : (
            projects.slice(0, 5).map(p => (
              <div key={p.id} className="hover-row flex items-center gap-3 rounded-card cursor-pointer"
                onClick={() => navigate({ to: '/home' })}>
                <div className="av w-8 h-8 text-[0.8125rem]">{(p.key || '?').charAt(0)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink-primary truncate">{p.name}</p>
                  <p className="text-xs text-ink-muted">{p.key} · {p.visibility}</p>
                </div>
                <span className={`badge ${p.status === 'active' ? 'tag-b' : 'tag-med'}`}>{p.status}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>

      {/* ─── Demo tour step 1 — Home personal AI analysis ─── */}
      {showTour1 && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-end justify-center" onClick={skipTour}>
          <div
            className="bg-surface-card border border-edge rounded-card shadow-card p-4 mb-8 w-full max-w-md mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-ink-primary">✨ {t.projectOverview.tourTitle}</p>
              <button className="text-[0.65rem] text-ink-muted hover:text-ink-primary" onClick={skipTour}>✕</button>
            </div>
            <p className="text-sm font-semibold text-ink-primary mb-1">
              1. {t.projectOverview.tourStep1Title}
            </p>
            <p className="text-xs text-ink-secondary mb-3 leading-relaxed">
              {t.projectOverview.tourStep1Body}
            </p>
            <div className="flex items-center gap-1.5 mb-3">
              {[1, 2, 3, 4, 5].map(n => (
                <span key={n} className={`h-1.5 rounded-full transition-all ${n === 1 ? 'w-6 bg-brand-main' : n < 1 ? 'w-3 bg-brand-main/40' : 'w-3 bg-edge'}`} />
              ))}
              <span className="ml-auto text-[0.6rem] text-ink-muted font-medium">1/5</span>
            </div>
            <div className="flex items-center justify-between">
              <button className="text-xs text-ink-muted hover:text-ink-primary px-2 py-1" onClick={skipTour}>
                {t.projectOverview.tourDone}
              </button>
              <button className="btn-brand btn-xs" onClick={nextTourStep}>
                {t.projectOverview.tourNext}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
