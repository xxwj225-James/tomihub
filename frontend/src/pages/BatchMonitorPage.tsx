import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useT } from '@/i18n/useT';
import { cn } from '@/lib/cn';

interface BatchRun {
  id: string;
  status: 'running' | 'success' | 'failed';
  startedAt: string;
  completedAt: string;
  errorMessage: string;
  resultSummary: string;
  logs: string;
}

interface BatchTask {
  taskName: string;
  label: string;
  latestRun: BatchRun | null;
  recentRuns: BatchRun[];
}

const SHORT_NAMES: Record<string, string> = {
  'tasks.analysis_tasks.run_daily_health_check': 'health-check',
  'tasks.analysis_tasks.run_nightly_project_analysis': 'project-analysis',
  'tasks.analysis_tasks.run_memory_compression': 'memory-compress',
  'tasks.analysis_tasks.run_vector_cleanup': 'vector-cleanup',
  'tasks.analysis_tasks.run_personal_health_check': 'personal-health',
  'tasks.analysis_tasks.run_knowledge_map_cache': 'knowledge-map',
  'tasks.reflection_tasks.run_nightly_reflection': 'reflection',
};

export function BatchMonitorPage() {
  const t = useT();
  const [tasks, setTasks] = useState<BatchTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [logModal, setLogModal] = useState<{ taskName: string; run: BatchRun } | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const token = useAuthStore.getState().accessToken;
      const resp = await fetch('/api/v1/ai/admin/batch/status', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (resp.ok) {
        const { data } = await resp.json();
        setTasks(data || []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Auto-refresh every 30s
  useEffect(() => {
    const timer = setInterval(fetchStatus, 30_000);
    return () => clearInterval(timer);
  }, [fetchStatus]);

  const triggerTask = async (taskName: string) => {
    setTriggering(taskName);
    try {
      const token = useAuthStore.getState().accessToken;
      const resp = await fetch('/api/v1/ai/admin/batch/trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ taskName }),
      });
      if (!resp.ok) {
        // Surface permission/backend errors via the global notice (read-only users get 403 here)
        window.dispatchEvent(new CustomEvent('tl-permission-denied', {
          detail: { message: resp.status === 403 ? '' : (t.batchMonitor.runFailed || `Run failed (HTTP ${resp.status})`) },
        }));
        return;
      }
      setTimeout(fetchStatus, 3000);
    } catch { /* network error — ignore */ }
    finally { setTriggering(null); }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      running: 'bg-warning/10 text-warning',
      success: 'bg-success/10 text-status-success',
      failed: 'bg-danger/10 text-status-danger',
      interrupted: 'bg-danger/10 text-status-danger',
      pending: 'bg-surface-hover text-ink-muted',
    };
    return cn('badge text-[0.6rem] font-medium', map[status] || map.pending);
  };

  return (
    <div>
      <div className="ch">
        <h2 className="text-base font-semibold text-ink-primary">{t.batchMonitor.title}</h2>
        <div className="flex items-center gap-2">
          <span className="text-[0.6rem] text-ink-muted">{t.batchMonitor.autoRefresh}</span>
          <button className="btn-ghost text-base px-1" onClick={fetchStatus} title={t.batchMonitor.refresh}>&#x21bb;</button>
        </div>
      </div>

      <div className="p-4" style={{ maxWidth: '1100px' }}>
        {loading && tasks.length === 0 && (
          <p className="text-sm text-ink-muted text-center py-12">{t.batchMonitor.loading}</p>
        )}

        <div className="card">
          <div className="card-bd-nopad overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface-hover text-left">
                  <th className="p-3 font-semibold text-ink-primary w-32">{t.batchMonitor.task}</th>
                  <th className="p-3 font-semibold text-ink-primary w-16">{t.batchMonitor.status}</th>
                  <th className="p-3 font-semibold text-ink-primary w-36">{t.batchMonitor.lastRun}</th>
                  <th className="p-3 font-semibold text-ink-primary">{t.batchMonitor.summary}</th>
                  <th className="p-3 font-semibold text-ink-primary w-16">{t.batchMonitor.log}</th>
                  <th className="p-3 font-semibold text-ink-primary w-20">{t.batchMonitor.action}</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map(task => {
                  const run = task.latestRun;
                  return (
                    <tr key={task.taskName} className="border-t border-edge hover:bg-surface-hover/50">
                      <td className="p-3">
                        <div className="font-semibold text-ink-primary text-[0.7rem]">{task.label}</div>
                        <div className="text-[0.6rem] text-ink-muted font-mono">{SHORT_NAMES[task.taskName] || task.taskName}</div>
                      </td>
                      <td className="p-3">
                        {run ? <span className={statusBadge(run.status)}>{(t.batchMonitor as any)[run.status] || run.status}</span> : <span className={statusBadge('pending')}>{t.batchMonitor.pending}</span>}
                      </td>
                      <td className="p-3 text-[0.65rem] text-ink-muted">
                        {run?.startedAt ? new Date(run.startedAt).toLocaleString() : '—'}
                      </td>
                      <td className="p-3 text-[0.65rem] text-ink-muted max-w-xs truncate">
                        {run?.status === 'failed' ? (
                          <span className="text-danger">{run.errorMessage?.slice(0, 120) || t.batchMonitor.unknownError}</span>
                        ) : (
                          run?.resultSummary?.slice(0, 120) || '—'
                        )}
                      </td>
                      <td className="p-3">
                        {run?.logs ? (
                          <button
                            className="text-brand-main text-[0.65rem] font-medium hover:underline"
                            onClick={() => setLogModal({ taskName: task.taskName, run })}
                          >{t.batchMonitor.view}</button>
                        ) : <span className="text-[0.6rem] text-ink-muted">—</span>}
                      </td>
                      <td className="p-3">
                        <button
                          className="btn btn-xs text-[0.65rem] whitespace-nowrap text-status-success border-status-success/30 hover:bg-success/10"
                          style={{ background: 'hsl(var(--success)/0.1)' }}
                          onClick={() => triggerTask(task.taskName)}
                          disabled={triggering === task.taskName || task.latestRun?.status === 'running'}
                        >
                          {triggering === task.taskName ? '…' : t.batchMonitor.run}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Log Modal */}
      {logModal && (
        <>
          <div className="fixed inset-0 z-50 bg-black/30" onClick={() => setLogModal(null)} />
          <div className="fixed inset-4 z-50 flex items-center justify-center pointer-events-none">
            <div className="bg-surface-card rounded-xl shadow-dialog pointer-events-auto flex flex-col" style={{ maxWidth: '800px', width: '100%', maxHeight: '80vh' }}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-edge shrink-0">
                <h3 className="text-sm font-semibold text-ink-primary">
                  {t.batchMonitor.execLog(SHORT_NAMES[logModal.taskName] || logModal.taskName)}
                </h3>
                <button className="btn-ghost p-1" onClick={() => setLogModal(null)}>✕</button>
              </div>
              <div className="overflow-y-auto p-4 flex-1">
                <div className="text-[0.65rem] text-ink-muted mb-3">
                  Status: <span className={statusBadge(logModal.run.status)}>{logModal.run.status}</span>
                  {logModal.run.startedAt && <> · Started: {new Date(logModal.run.startedAt).toLocaleString()}</>}
                  {logModal.run.completedAt && <> · Completed: {new Date(logModal.run.completedAt).toLocaleString()}</>}
                </div>
                {logModal.run.errorMessage && (
                  <div className="mb-3 p-3 rounded-btn bg-danger/5 border border-danger/20">
                    <p className="text-[0.65rem] font-semibold text-danger mb-1">{t.batchMonitor.error}</p>
                    <pre className="text-[0.6rem] text-danger whitespace-pre-wrap">{logModal.run.errorMessage}</pre>
                  </div>
                )}
                <div>
                  <p className="text-[0.65rem] font-semibold text-ink-primary mb-1">{t.batchMonitor.fullLog}</p>
                  <pre className="text-[0.6rem] text-ink-muted bg-surface-hover rounded-btn p-3 whitespace-pre-wrap overflow-x-auto" style={{ maxHeight: '400px' }}>
                    {logModal.run.logs || '{t.batchMonitor.noLog}'}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
