import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useProjectStore } from '@/stores/projectStore';
import { useAuthStore } from '@/stores/authStore';
import { useLanguageStore } from '@/stores/languageStore';
import { cn } from '@/lib/cn';
import { getLlmErrorMessage } from '@/lib/errors';
import { RefreshCw, Users, TrendingUp, TrendingDown, Minus, BookOpen, Lightbulb, AlertCircle, Clock } from 'lucide-react';
import { useT } from '@/i18n/useT';
import { marked } from 'marked';
import { sanitize } from '@/lib/sanitize';
import { aiEnabled } from '@/lib/aiGate';

interface KnowledgeMap {
  project?: { name: string; key: string; phase: string; status: string; description: string };
  members?: Array<{ name: string; role: string }>;
  stats?: Record<string, number>;
  health?: { score: number; summary: string };
  summary?: string;
  teamOverview?: string;
  progress?: string;
  architecture?: string;
  teamExpertise?: string;
  missingKnowledge?: string;
  keyDecisions?: Array<string | Record<string, unknown>>;
  knowledgeBase?: Array<{ title: string; category: string; covers: string; wikiId?: string | null }>;
  recommendedReading?: Array<{ title: string; wikiId?: string; reason: string }>;
  onboardingPath?: Array<{ step: number; action: string; resource: string | null }>;
  onboardingTips?: string;
  complexIssues?: Array<{ title: string; key: string; changeCount: number; reopenCount: number; history: string | Array<{ field: string; from: string; to: string; time: string }> }>;
  aiGenerated?: boolean;
  generatedAt?: string;
}

interface TimelineEvent {
  type: string; title: string; summary: string; actor: string;
  resourceType: string; importance: number; time: string;
}

interface HealthTrend {
  snapshots: Array<{ score: number; time: string }>;
  current?: { score: number };
  trend: 'improving' | 'declining' | 'stable';
}

interface HistoryEntry { field: string; from: string; to: string; time: string }

/** Issue revision history arrives as a string (LLM synthesis) OR as the raw
 *  changelog object array [{field, from, to, time}] on the degraded path.
 *  Normalize both to readable text so React never renders an object child. */
function formatHistory(history: string | Array<HistoryEntry> | null | undefined): string {
  if (!history) return '';
  if (typeof history === 'string') return history;
  if (Array.isArray(history)) {
    return history.map(h =>
      `${h.time ? `${String(h.time).slice(0, 10)} ` : ''}${h.field}: ${h.from} → ${h.to}`
    ).join('\n');
  }
  return String(history);
}

export function ProjectKnowledgePage() {
  const navigate = useNavigate();
  const { currentProject } = useProjectStore();
  const reset = useProjectStore((s) => s.reset);
  const [data, setData] = useState<KnowledgeMap | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [healthTrend, setHealthTrend] = useState<HealthTrend | null>(null);
  const [loading, setLoading] = useState(false);
  const [gen, setGen] = useState({ step: 0, text: '' });
  const [error, setError] = useState('');
  const projectId = currentProject?.id;
  const userId = useAuthStore(s => s.user?.id);
  // Project Owner (lead) — OR any Workspace Owner/Admin. The demo project has
  // no lead_id set, so without this a Workspace Owner (e.g. JamesW in the demo
  // tenant) could never refresh the knowledge map.
  const tenantRole = useAuthStore(s => s.currentTenant?.role);
  const isOwner = userId && (
    currentProject?.leadId === userId
    || tenantRole === 'owner'
    || tenantRole === 'admin'
  );
  const t = useT();

  const apiHeaders = () => {
    const token = useAuthStore.getState().accessToken;
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  };

  // Load cached knowledge map on page open
  const loadCached = useCallback(async () => {
    if (!projectId || !aiEnabled) return false;
    try {
      const headers = apiHeaders();
      const resp = await fetch(`/api/v1/ai/cache/knowledge-map/${projectId}`, { headers });
      if (resp.ok) {
        const d = await resp.json();
        // Require a substantive summary — older caches lack it or hold a stub
        if (typeof d.summary === 'string' && d.summary.trim().length > 30) { setData(d); return true; }
      }
    } catch { /* no cache */ }
    return false;
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !aiEnabled) return;
    setLoading(true);
    const t = setTimeout(() => {
      loadCached().then((cached) => {
        if (!cached && isOwner) fetchKnowledgeMap();
        else setLoading(false);
      });
    }, 300);
    return () => clearTimeout(t);
    // callbacks are stable refs — only run on projectId change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => { return () => reset(); }, [reset]);

  const fetchKnowledgeMap = useCallback(async () => {
    if (!projectId || !aiEnabled) return;
    setLoading(true);
    setError('');
    setGen({ step: 0, text: 'Starting...' });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const headers = apiHeaders();
      const lang = useAuthStore.getState().user?.aiLanguage || useLanguageStore.getState().lang || 'en';

      // Fire timeline + health-trend in parallel with knowledge-map SSE
      const fetchOpts = (body: Record<string, unknown>) => ({ method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
      const tlPromise = fetch('/api/v1/ai/project-timeline', fetchOpts({ projectId, limit: 20 }));
      const htPromise = fetch('/api/v1/ai/project-health-trend', fetchOpts({ projectId, days: 30 }));

      // Knowledge map via SSE with progress
      const kmResp = await fetch('/api/v1/ai/project-knowledge-map', {
        method: 'POST', headers, body: JSON.stringify({ projectId, lang }), signal: controller.signal,
      });
      if (!kmResp.ok) throw new Error(`Server returned ${kmResp.status}`);
      const reader = kmResp.body?.getReader();
      if (!reader) throw new Error('No response body');
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        let eventType = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) { eventType = line.slice(7).trim(); continue; }
          if (!line.startsWith('data: ')) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (eventType === 'progress') setGen({ step: d.step || 0, text: d.text || '' });
            else if (eventType === 'error') {
              // LLM unavailable (missing/invalid key, quota, ...) — surface the
              // localized reason (code → app.llmErrors) alongside the fallback.
              setError(getLlmErrorMessage(d.code, t.app));
            }
            else if (eventType === 'result') { setData(d); setError(''); }
          } catch { /* skip unparseable lines */ }
        }
      }

      // Resolve parallel fetches
      const [tlResp, htResp] = await Promise.all([tlPromise, htPromise]);
      if (tlResp.ok) { const j = await tlResp.json(); setTimeline(j.data || []); }
      if (htResp.ok) setHealthTrend(await htResp.json());
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') setError('Request timed out. The AI service may be busy.');
      else setError(e instanceof Error ? e.message : 'Failed to load knowledge map');
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }, [projectId]);

  // AI edition only — this page is entirely an AI knowledge-map feature.
  // When AI is disabled show a clean placeholder instead of the generator UI.
  if (!aiEnabled) {
    return (
      <div className="p-6 max-w-4xl">
        <div className="card">
          <div className="card-bd p-10 text-center">
            <p className="text-3xl mb-3">🧠</p>
            <h2 className="text-base font-semibold text-ink-primary mb-2">{t.projectKnowledge.title}</h2>
            <p className="text-sm text-ink-muted">{t.app.aiUnavailable}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!projectId) {
    return <div className="p-6 text-ink-muted text-sm">{t.projectKnowledge.selectProject}</div>;
  }

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-base font-semibold text-ink-primary">
            🧠 {t.projectKnowledge.title}
          </h2>
          <p className="text-xs text-ink-muted mt-1">
            {t.projectKnowledge.subtitle}
          </p>
        </div>
        {isOwner && (
          <button className="btn-ghost flex items-center gap-1.5" onClick={fetchKnowledgeMap} disabled={loading}>
            <RefreshCw className={cn("w-3.5 h-3.5", loading && data && "animate-spin")} />
            <span className="text-xs">{loading && data ? t.projectKnowledge.refreshing : t.projectKnowledge.refresh}</span>
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-card bg-status-danger-soft border border-danger/20">
          <p className="text-xs text-status-danger">{error}</p>
        </div>
      )}

      {loading && data && (
        <div className="card p-3 mb-4 ai-glow">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full border-2 border-brand-main border-t-transparent animate-spin" />
            <span className="text-xs text-brand-main font-medium">{gen.text || t.projectKnowledge.refreshing}</span>
          </div>
          <div className="progress mt-2" style={{ height: '3px' }}>
            <div className="progress-bar brand animate-pulse"
              style={{ width: gen.step >= 2 ? '90%' : gen.step >= 1 ? '45%' : '10%' }} />
          </div>
        </div>
      )}

      {loading && !data && (
        <div className="card p-4 mb-4 ai-glow">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full border-2 border-brand-main border-t-transparent animate-spin" />
            <span className="text-sm text-brand-main font-medium">{gen.text || t.projectKnowledge.starting}</span>
          </div>
          <div className="progress mt-3" style={{ height: '4px' }}>
            <div className="progress-bar brand animate-pulse"
              style={{ width: gen.step >= 2 ? '90%' : gen.step >= 1 ? '45%' : '10%' }} />
          </div>
        </div>
      )}
      {!loading && !data && !error && (
        <div className="text-center py-16">
          {isOwner ? (
            <>
              <p className="text-sm text-ink-muted">{t.projectKnowledge.noKnowledgeMap}</p>
              <p className="text-xs text-ink-muted mt-1">{t.projectKnowledge.clickRefresh}</p>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-muted">{t.projectKnowledge.notAvailable}</p>
              <p className="text-xs text-ink-muted mt-1">{t.projectKnowledge.generatedNightly}</p>
            </>
          )}
        </div>
      )}

      {data && (
        <div className="space-y-5">
          {/* Project Identity Card */}
          <div className="card">
            <div className="card-bd p-5">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl font-bold font-mono text-brand-main">{data.project?.key}</span>
                <div>
                  <h3 className="text-lg font-semibold text-ink-primary">{data.project?.name}</h3>
                  <div className="flex gap-2 mt-1">
                    <span className="badge tag-b">{data.project?.phase}</span>
                    <span className="badge tag-lo">{data.project?.status}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* AI Summary — includes the project description below the AI synthesis */}
          {(data.summary || data.project?.description) && (
            <div className="card">
              <div className="card-hd"><h3 className="text-sm font-semibold text-ink-primary">📋 {t.projectKnowledge.projectSummary}</h3></div>
              <div className="card-bd p-4">
                {data.summary && (
                  <div
                    className="text-sm text-ink-primary leading-relaxed prose"
                    dangerouslySetInnerHTML={{ __html: sanitize(marked.parse(data.summary as string) as string) }}
                  />
                )}
                {data.project?.description && data.summary !== data.project.description && (
                  <>
                    <div className="border-t border-edge my-3" />
                    <p className="text-[0.6rem] font-semibold text-ink-muted uppercase tracking-wider mb-1.5">{t.projectKnowledge.projectDescription}</p>
                    <div
                      className="text-sm text-ink-secondary leading-relaxed prose"
                      dangerouslySetInnerHTML={{ __html: sanitize(marked.parse(data.project.description) as string) }}
                    />
                  </>
                )}
                {data.aiGenerated === false && (
                  <span className="badge tag-lo mt-2 inline-block">{t.projectKnowledge.aiUnavailable}</span>
                )}
              </div>
            </div>
          )}

          {/* Architecture */}
          {data.architecture && (
            <div className="card">
              <div className="card-hd flex items-center gap-2">
                <span className="text-sm">🏗️</span>
                <h3 className="text-sm font-semibold text-ink-primary">{t.projectKnowledge.architecture}</h3>
              </div>
              <div className="card-bd p-4">
                <div
                  className="text-sm text-ink-primary leading-relaxed prose"
                  dangerouslySetInnerHTML={{ __html: sanitize(marked.parse(data.architecture) as string) }}
                />
              </div>
            </div>
          )}

          {/* Two-column grid */}
          <div className="grid gap-5" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {/* Team */}
            <div className="card">
              <div className="card-hd flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-brand-main" />
                <h3 className="text-sm font-semibold text-ink-primary">{t.projectKnowledge.team}</h3>
              </div>
              <div className="card-bd p-3">
                {data.teamOverview && (
                  <p className="text-xs text-ink-secondary mb-3">{data.teamOverview}</p>
                )}
                <div className="space-y-1.5">
                  {(data.members || []).slice(0, 8).map((m, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <div className="av w-6 h-6 text-[0.55rem]">{m.name?.charAt(0) || '?'}</div>
                      <span className="text-ink-primary font-medium">{String(m.name ?? '')}</span>
                      <span className="text-ink-muted">{String(m.role ?? '')}</span>
                    </div>
                  ))}
                </div>
                {data.teamExpertise && (
                  <p className="text-xs text-ink-secondary mt-3 pt-2 border-t border-edge leading-relaxed">{data.teamExpertise}</p>
                )}
              </div>
            </div>

            {/* Progress */}
            <div className="card">
              <div className="card-hd flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5 text-success" />
                <h3 className="text-sm font-semibold text-ink-primary">{t.projectKnowledge.progress}</h3>
              </div>
              <div className="card-bd p-3">
                {data.progress && (
                  <p className="text-xs text-ink-secondary mb-3">{data.progress}</p>
                )}
                {data.health && (
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-2xl font-bold text-ink-primary">{data.health.score}</span>
                    <span className="text-xs text-ink-muted">/100</span>
                    {healthTrend && (
                      <span className={cn('text-xs font-medium',
                        healthTrend.trend === 'improving' ? 'text-success' :
                        healthTrend.trend === 'declining' ? 'text-danger' : 'text-ink-muted')}>
                        {healthTrend.trend === 'improving' ? <TrendingUp className="w-3 h-3 inline" /> :
                         healthTrend.trend === 'declining' ? <TrendingDown className="w-3 h-3 inline" /> :
                         <Minus className="w-3 h-3 inline" />}
                        {' '}{healthTrend.trend}
                      </span>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(data.stats || {}).slice(0, 6).map(([k, v]) => (
                    <div key={k} className="bg-surface-hover rounded-card px-2 py-1.5">
                      <p className="text-[0.625rem] text-ink-muted uppercase">{k.replace(/_/g, ' ')}</p>
                      <p className="text-sm font-semibold text-ink-primary">{Number(v)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Key Decisions */}
          {data.keyDecisions && data.keyDecisions.length > 0 && (
            <div className="card">
              <div className="card-hd flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-warning" />
                <h3 className="text-sm font-semibold text-ink-primary">{t.projectKnowledge.keyDecisions}</h3>
              </div>
              <div className="card-bd p-3">
                <ul className="space-y-2">
                  {(data.keyDecisions || []).map((d, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-ink-primary">
                      <span className="text-warning mt-0.5 shrink-0">•</span>
                      <span>{typeof d === 'string' ? d : JSON.stringify(d)}</span>
                    </li>
                  ))}
                </ul>
                {data.keyDecisions?.length === 0 && (
                  <p className="text-xs text-ink-muted">{t.projectKnowledge.noDecisions}</p>
                )}
              </div>
            </div>
          )}

          {/* Knowledge Base — AI-organized wiki index (fallback: recommendedReading) */}
          {(() => {
            const kbItems = (data.knowledgeBase && data.knowledgeBase.length > 0)
              ? data.knowledgeBase.map(k => ({ title: k.title, wikiId: k.wikiId || null, reason: `${k.covers}${k.category && k.category !== 'general' ? ` · ${k.category}` : ''}` }))
              : (data.recommendedReading || []).map(r => ({ title: r.title, wikiId: r.wikiId || null, reason: r.reason }));
            return kbItems.length > 0 ? (
              <div className="card">
                <div className="card-hd flex items-center gap-2">
                  <BookOpen className="w-3.5 h-3.5 text-brand-main" />
                  <h3 className="text-sm font-semibold text-ink-primary">{t.projectKnowledge.knowledgeBaseTitle}</h3>
                </div>
                <div className="card-bd p-3">
                  <div className="space-y-2">
                    {kbItems.map((r, i) => (
                      <div key={i}
                        className={cn("flex items-start gap-2 p-2 rounded-card bg-surface-hover", r.wikiId && "cursor-pointer hover:bg-brand-soft/20")}
                        onClick={() => r.wikiId && navigate({ to: '/wiki/$id', params: { id: r.wikiId } })}>
                        <span className="text-xs text-ink-muted w-4">{i + 1}.</span>
                        <div>
                          <span className={cn("text-xs font-medium", r.wikiId ? "text-brand-main" : "text-ink-primary")}>{r.title}</span>
                          <p className="text-[0.625rem] text-ink-muted">{r.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null;
          })()}

          {/* Onboarding Path — step-by-step learning route */}
          {((data.onboardingPath && data.onboardingPath.length > 0) || data.onboardingTips) && (
            <div className="card bg-brand-soft/10 border-brand-soft/30">
              <div className="card-hd flex items-center gap-2">
                <Lightbulb className="w-3.5 h-3.5 text-brand-main" />
                <h3 className="text-sm font-semibold text-ink-primary">{t.projectKnowledge.gettingStarted}</h3>
              </div>
              <div className="card-bd p-4">
                {data.onboardingPath && data.onboardingPath.length > 0 ? (
                  <div className="space-y-2">
                    {(data.onboardingPath || []).map(s => (
                      <div key={s.step} className="flex items-start gap-2 text-xs">
                        <span className="badge tag-b shrink-0 mt-0.5">{s.step}</span>
                        <span className="text-ink-primary leading-relaxed">{String(s.action ?? '')}{s.resource && <span className="text-brand-main font-medium"> → {String(s.resource)}</span>}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-ink-primary leading-relaxed">{data.onboardingTips}</p>
                )}
              </div>
            </div>
          )}

          {/* Complex Issues — heavily revised/reopened issues and their history */}
          {data.complexIssues && data.complexIssues.length > 0 && (
            <div className="card">
              <div className="card-hd flex items-center gap-2">
                <span className="text-sm">🔄</span>
                <h3 className="text-sm font-semibold text-ink-primary">{t.projectKnowledge.complexIssues}</h3>
              </div>
              <div className="card-bd p-3">
                <div className="space-y-2">
                  {(data.complexIssues || []).map((ci, i) => (
                    <div key={i} className="p-2.5 rounded-card bg-surface-hover">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[0.6rem] font-semibold text-brand-main shrink-0">#{ci.key}</span>
                        <span className="text-xs font-medium text-ink-primary truncate">{ci.title}</span>
                        <span className="ml-auto text-[0.6rem] text-ink-muted shrink-0">{ci.changeCount} {t.projectKnowledge.changes} · {ci.reopenCount} {t.projectKnowledge.reopens}</span>
                      </div>
                      {ci.history && (
                        <p className="text-[0.7rem] text-ink-secondary mt-1.5 leading-relaxed">
                          {formatHistory(ci.history)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Missing Knowledge */}
          {data.missingKnowledge && (
            <div className="card border-warning/30">
              <div className="card-hd flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-warning" />
                <h3 className="text-sm font-semibold text-ink-primary">{t.projectKnowledge.missingKnowledge}</h3>
              </div>
              <div className="card-bd p-3">
                <p className="text-xs text-ink-secondary leading-relaxed">{data.missingKnowledge}</p>
              </div>
            </div>
          )}

          {/* Activity Timeline */}
          {timeline.length > 0 && (
            <div className="card">
              <div className="card-hd flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-ink-muted" />
                <h3 className="text-sm font-semibold text-ink-primary">{t.projectKnowledge.recentActivity}</h3>
                <span className="text-[0.625rem] text-ink-muted">{t.projectKnowledge.events}</span>
              </div>
              <div className="card-bd-nopad" style={{ maxHeight: '320px', overflowY: 'auto' }}>
                {timeline.map((e, i) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-2.5 border-b border-edge last:border-b-0 hover:bg-surface-hover transition-colors">
                    <div className={cn(
                      'w-1.5 h-1.5 rounded-full mt-1.5 shrink-0',
                      e.importance > 60 ? 'bg-danger' : e.importance > 30 ? 'bg-warning' : 'bg-ink-muted'
                    )} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-ink-primary truncate">{e.title}</p>
                      <p className="text-[0.625rem] text-ink-muted">{new Date(e.time).toLocaleString()}</p>
                    </div>
                    <span className="badge text-[0.5rem] shrink-0 tag-lo">{e.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Generation timestamp */}
          {data.generatedAt && (
            <p className="text-[0.625rem] text-ink-muted text-right">
              {data.aiGenerated === false ? t.projectKnowledge.dataSnapshot : t.projectKnowledge.aiGenerated}: {new Date(data.generatedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
