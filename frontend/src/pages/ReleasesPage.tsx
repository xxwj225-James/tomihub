import { useState, useEffect } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { cn } from '@/lib/cn';
import http from '@/lib/http';
import { useT } from '@/i18n/useT';

interface VersionData {
  id: string; name: string; description?: string;
  startDate?: string; releaseDate?: string;
  status: string; category: string;
  sortOrder?: number; createdAt: string;
}

interface VersionWithProgress extends VersionData {
  totalIssues: number; doneIssues: number; progress: number;
}

const STATUS_OPTIONS = ['planned', 'in_progress', 'released', 'cancelled'] as const;

export function ReleasesPage() {
  const t = useT();
  const { currentProject } = useProjectStore();
  const reset = useProjectStore((s) => s.reset);
  const projectId = currentProject?.id || '';

  const [versions, setVersions] = useState<VersionWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [startDate, setStartDate] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [status, setStatus] = useState('planned');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiNotes, setAiNotes] = useState('');

  useEffect(() => { return () => reset(); }, [reset]);

  const loadVersions = () => {
    if (!projectId) return;
    setLoading(true);
    http.get(`/projects/${projectId}/versions`).then(({ data }: { data: Record<string, unknown> }) => {
      const list = (data.data || []) as VersionData[];
      // Calculate progress from issue statuses
      Promise.all(list.map(v =>
        http.get(`/issues?projectId=${projectId}&versionId=${v.id}`).then(r => {
          const issues = ((r.data as { data?: { items?: Array<{status: string}> } }).data?.items || []) as Array<{status: string}>;
          const total = issues.length;
          const done = issues.filter(i => i.status === 'done' || i.status === 'cancelled').length;
          return { ...v, totalIssues: total, doneIssues: done, progress: total > 0 ? Math.round(done / total * 100) : 0 };
        }).catch(() => ({ ...v, totalIssues: 0, doneIssues: 0, progress: 0 }))
      )).then(setVersions).finally(() => setLoading(false));
    }).catch(() => setLoading(false));
  };

  // loadVersions is stable — only run on projectId change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadVersions(); }, [projectId]);

  const resetForm = () => {
    setName(''); setDesc(''); setStartDate(''); setReleaseDate('');
    setStatus('planned'); setEditId(null); setError('');
  };

  const openCreate = () => { resetForm(); setShowForm(true); };
  const openEdit = (v: VersionData) => {
    setName(v.name); setDesc(v.description || '');
    setStartDate(v.startDate || ''); setReleaseDate(v.releaseDate || '');
    setStatus(v.status); setEditId(v.id); setShowForm(true);
  };

  const save = async () => {
    if (!name.trim()) { setError(t.releases.nameRequired); return; }
    setSaving(true); setError('');
    try {
      const payload = { name: name.trim(), description: desc, startDate: startDate || null, releaseDate: releaseDate || null, status };
      if (editId) await http.put(`/projects/${projectId}/versions/${editId}`, payload);
      else await http.post(`/projects/${projectId}/versions`, payload);
      setShowForm(false); resetForm(); loadVersions();
    } catch { setError(t.releases.saveFailed); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t.releases.deleteConfirm)) return;
    await http.delete(`/projects/${projectId}/versions/${id}`);
    loadVersions();
  };

  const generateReleaseNotes = async (v: VersionWithProgress) => {
    setAiGenerating(true); setAiNotes('');
    try {
      const token = localStorage.getItem('ai-pm-auth');
      const resp = await fetch('/api/v1/ai/reports/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${JSON.parse(token).state?.accessToken || ''}` } : {}) },
        body: JSON.stringify({ reportType: 'sprint_review', projectId, customPrompt: `Generate release notes for version ${v.name}. Include changes, fixes, and new features.`, lang: 'en' }),
      });
      if (!resp.ok) throw new Error('Failed');
      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
        }
      }
      setAiNotes(buffer);
    } catch { setAiNotes('AI generation failed. Write notes manually.'); }
    finally { setAiGenerating(false); }
  };

  if (!projectId) return <div className="p-6 text-ink-muted text-sm">{t.releases.selectProject}</div>;

  return (
    <div>
      <div className="ch">
        <h2 className="text-base font-semibold text-ink-primary">{t.releases.title}</h2>
        <button className="btn-brand btn-xs" onClick={openCreate}>{t.releases.newVersion}</button>
      </div>

      <div className="p-6" style={{ maxWidth: '900px' }}>
        {/* Form */}
        {showForm && (
          <div className="card mb-4 p-4 border-2 border-brand-main bg-brand-soft">
            <h3 className="text-sm font-semibold text-brand-main mb-3">{editId ? t.releases.editVersion : t.releases.title}</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="form-grp">
                <label className="form-label">{t.releases.name}</label>
                <input className="form-input text-sm" value={name} onChange={e => setName(e.target.value)} placeholder={t.releases.namePlaceholder} />
              </div>
              <div className="form-grp">
                <label className="form-label">{t.releases.status}</label>
                <select className="form-select text-sm" value={status} onChange={e => setStatus(e.target.value)}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-grp">
                <label className="form-label">{t.releases.startDate}</label>
                <input type="date" className="form-input text-sm" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div className="form-grp">
                <label className="form-label">{t.releases.releaseDate}</label>
                <input type="date" className="form-input text-sm" value={releaseDate} onChange={e => setReleaseDate(e.target.value)} />
              </div>
            </div>
            <div className="form-grp mb-3">
              <label className="form-label">{t.releases.description}</label>
              <textarea className="form-input text-sm" rows={2} value={desc} onChange={e => setDesc(e.target.value)} />
            </div>
            {error && <p className="text-xs text-danger mb-2">{error}</p>}
            <div className="flex gap-2">
              <button className="btn-brand btn-xs" onClick={save} disabled={saving}>{saving ? t.releases.saving : t.releases.save}</button>
              <button className="btn-secondary btn-xs" onClick={() => { setShowForm(false); resetForm(); }}>{t.releases.cancel}</button>
            </div>
          </div>
        )}

        {/* List */}
        {loading ? (
          <p className="text-sm text-ink-muted text-center py-12">{t.releases.loading}</p>
        ) : versions.length === 0 ? (
          <div className="card p-8 text-center text-sm text-ink-muted">
            <p className="text-2xl mb-2"></p>
            <p>{t.releases.empty}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {versions.map(v => (
              <div key={v.id} className="card">
                <div className="card-hd flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-ink-primary">{v.name}</span>
                    <span className={cn('badge text-xs',
                      v.status === 'released' ? 'bg-status-success-soft text-status-success' :
                      v.status === 'in_progress' ? 'bg-brand-soft text-brand-main' :
                      v.status === 'cancelled' ? 'bg-surface-hover text-ink-muted' : 'bg-surface-hover text-ink-muted'
                    )}>{v.status.replace('_', ' ')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="btn-ghost text-[0.6rem] text-brand-main" onClick={() => generateReleaseNotes(v)} disabled={aiGenerating}>
                      {aiGenerating ? t.releases.generating : t.releases.aiNotes}
                    </button>
                    <button className="btn-ghost text-[0.6rem]" onClick={() => openEdit(v)}>{t.releases.edit}</button>
                    <button className="btn-ghost text-[0.6rem] text-danger" onClick={() => handleDelete(v.id)}>{t.releases.delete}</button>
                  </div>
                </div>
                <div className="card-bd p-3">
                  {/* Progress bar */}
                  {v.totalIssues > 0 && (
                    <div className="mb-2">
                      <div className="flex items-center justify-between text-[0.65rem] text-ink-muted mb-1">
                        <span>{t.releases.issuesDone(v.doneIssues, v.totalIssues)}</span>
                        <span>{v.progress}%</span>
                      </div>
                      <div className="progress" style={{ height: '6px' }}>
                        <div className={cn('progress-bar', v.progress >= 80 ? 'success' : v.progress >= 40 ? 'brand' : 'danger')}
                          style={{ width: `${v.progress}%`, transition: 'width 0.5s' }} />
                      </div>
                    </div>
                  )}
                  {v.description && <p className="text-xs text-ink-secondary">{v.description}</p>}
                  {v.startDate && <span className="text-[0.6rem] text-ink-muted">{v.startDate} → {v.releaseDate || 'TBD'}</span>}
                  {/* AI Notes */}
                  {aiNotes && (
                    <div className="mt-3 p-3 bg-surface-hover rounded-card text-xs text-ink-primary whitespace-pre-wrap">{aiNotes}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
