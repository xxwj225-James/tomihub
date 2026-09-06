import { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useProjectStore } from '@/stores/projectStore';
import { sprintApi, type SprintData } from '@/api/sprintApi';
import { useT } from '@/i18n/useT';
import http from '@/lib/http';

interface IssueBrief {
  id: string; issueNumber: number; title: string; status: string;
  priority: string; assigneeName?: string;
}

export function SprintsPage() {
  const navigate = useNavigate();
  const { currentProject } = useProjectStore();
  const reset = useProjectStore((s) => s.reset);
  const projectId = currentProject?.id || '';
  const [sprints, setSprints] = useState<SprintData[]>([]);
  const [sprintIssues, setSprintIssues] = useState<Record<string, IssueBrief[]>>({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [expandedSprint, setExpandedSprint] = useState<string | null>(null);
  const t = useT();

  const loadSprints = () => {
    if (!projectId) return;
    setLoading(true);
    sprintApi.list(projectId).then((res) => {
      const list = res.data.data?.items || [];
      setSprints(list);
      // Load issues for each sprint
      list.forEach((s: SprintData) => {
        http.get(`/issues?projectId=${projectId}&sprintId=${s.id}`).then((res2) => {
          const pr = res2.data as { data?: { items?: IssueBrief[] } };
          setSprintIssues(prev => ({ ...prev, [s.id]: pr?.data?.items || [] }));
        }).catch(() => {});
      });
    }).catch(() => setError(t.sprint.loadFail))
    .finally(() => setLoading(false));
  };

  // loadSprints recreated each render — only run on projectId change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadSprints(); }, [projectId]);

  useEffect(() => { return () => reset(); }, [reset]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true); setError('');
    try {
      await sprintApi.create({
        projectId, name: name.trim(),
        goal: goal.trim(), startDate, endDate,
      });
      setName(''); setGoal(''); setStartDate(''); setEndDate('');
      setShowCreate(false);
      loadSprints();
    } catch { setError(t.sprint.createFail); }
    finally { setSaving(false); }
  };

  const handleStart = async (id: string) => {
    await sprintApi.start(id);
    loadSprints();
  };

  const handleComplete = async (id: string) => {
    await sprintApi.complete(id);
    loadSprints();
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'planning': return 'bg-surface-hover text-ink-muted';
      case 'active': return 'bg-brand-soft text-brand-main';
      case 'completed': return 'bg-success-soft text-success';
      default: return 'bg-surface-hover text-ink-muted';
    }
  };

  return (
    <div>
      <div className="ch">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-ink-primary">{t.sprint.title}</h2>
            {currentProject && <span className="text-xs text-ink-muted">{currentProject.name} (Scrum)</span>}
          </div>
          <button className="btn-brand btn-xs" onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? t.sprint.cancel : t.sprint.newSprint}
          </button>
        </div>
      </div>

      <div className="p-6" style={{ maxWidth: '800px' }}>
        {error && <div className="card bg-danger-soft text-danger p-3 mb-4 text-sm">{error}</div>}

        {/* Create Sprint Form */}
        {showCreate && (
          <div className="card mb-4 p-4 border-2 border-brand-main bg-brand-soft">
            <h3 className="text-sm font-semibold text-brand-main mb-3">{t.sprint.createSprint}</h3>
            <div className="flex gap-3 mb-3">
              <div className="flex-1">
                <label className="form-label">{t.sprint.sprintName}</label>
                <input className="form-input text-sm" placeholder={t.sprint.sprintNamePlaceholder}
                  value={name} onChange={e => setName(e.target.value)} />
              </div>
            </div>
            <div className="form-grp mb-3">
              <label className="form-label">{t.sprint.goalOptional}</label>
              <input className="form-input text-sm" placeholder={t.sprint.goalPlaceholder}
                value={goal} onChange={e => setGoal(e.target.value)} />
            </div>
            <div className="flex gap-3 mb-3">
              <div className="flex-1">
                <label className="form-label">{t.sprint.startDate}</label>
                <input type="date" className="form-input text-sm"
                  value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div className="flex-1">
                <label className="form-label">{t.sprint.endDate}</label>
                <input type="date" className="form-input text-sm"
                  value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>
            <button className="btn-brand" onClick={handleCreate} disabled={saving || !name.trim()}>
              {saving ? t.sprint.creating : t.sprint.createSprint}
            </button>
          </div>
        )}

        {/* Sprint List */}
        {loading ? (
          <p className="text-sm text-ink-muted py-8 text-center">{t.sprint.loading}</p>
        ) : sprints.length === 0 ? (
          <div className="card p-8 text-center text-sm text-ink-muted">
            <p className="text-2xl mb-2">🏃</p>
            <p>{t.sprint.noSprints}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sprints.map(s => {
              const start = new Date(s.startDate);
              const end = new Date(s.endDate);
              const days = Math.ceil((end.getTime() - start.getTime()) / 86400000);
              const now = new Date();
              const progress = Math.min(100, Math.max(0, Math.round((now.getTime() - start.getTime()) / (end.getTime() - start.getTime()) * 100)));
              const issues = sprintIssues[s.id] || [];
              const todoCount = issues.filter(i => i.status !== 'done' && i.status !== 'cancelled').length;
              const doneCount = issues.filter(i => i.status === 'done').length;
              return (
                <div key={s.id} className="card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-semibold text-ink-primary">{s.name}</h3>
                      {s.goal && <p className="text-xs text-ink-muted mt-0.5">{s.goal}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {issues.length > 0 && (
                        <span className="text-[0.625rem] text-ink-muted">{todoCount} {t.sprint.open} · {doneCount} {t.sprint.done}</span>
                      )}
                      <span className={`badge text-xs ${statusBadge(s.status)}`}>{s.status}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-ink-muted mb-2">
                    <span>{s.startDate} → {s.endDate} ({days} {t.sprint.days})</span>
                  </div>
                  {s.status !== 'completed' && (
                    <div className="mb-2">
                      <div className="progress" style={{ height: '4px' }}>
                        <div className="progress-bar brand" style={{ width: `${s.status === 'planning' ? 0 : progress}%` }} />
                      </div>
                    </div>
                  )}

                  {/* Sprint Issues */}
                  {issues.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-edge">
                      <button className="text-[0.625rem] text-ink-muted hover:text-ink-primary mb-1.5"
                        onClick={() => setExpandedSprint(expandedSprint === s.id ? null : s.id)}>
                        {expandedSprint === s.id ? '▼' : '▶'} {t.sprint.issues} ({issues.length})
                      </button>
                      {expandedSprint === s.id && (
                        <div className="space-y-1">
                          {issues.map(iss => (
                            <div key={iss.id} className="flex items-center gap-2 text-[0.625rem] py-0.5 px-2 rounded bg-surface-hover cursor-pointer hover:bg-edge"
                              onClick={() => navigate({ to: `/issues/${iss.id}` })}>
                              <span className="text-ink-muted w-12 shrink-0">#{iss.issueNumber}</span>
                              <span className="flex-1 text-ink-primary truncate">{iss.title}</span>
                              <span className={`shrink-0 ${iss.priority === 'critical' || iss.priority === 'high' ? 'text-danger' : 'text-ink-muted'}`}>{iss.priority}</span>
                              <span className="text-ink-muted shrink-0">{iss.status?.replace(/_/g, ' ')}</span>
                              {iss.assigneeName && <span className="text-ink-muted shrink-0">{iss.assigneeName}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 mt-3">
                    <button className="btn-ghost btn-xs" onClick={() => navigate({ to: '/issues/new', search: { sprint: s.id } })}>
                      {t.sprint.newIssue}
                    </button>
                    {s.status === 'planning' && (
                      <button className="btn-brand btn-xs" onClick={() => handleStart(s.id)}>▶ {t.sprint.start}</button>
                    )}
                    {s.status === 'active' && (
                      <button className="btn-secondary btn-xs" onClick={() => handleComplete(s.id)}>✓ {t.sprint.complete}</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
