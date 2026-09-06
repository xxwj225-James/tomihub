// @ts-nocheck
import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useT } from '@/i18n/useT';
import { aiApi, type Report, type ReportRequest } from '@/api/aiApi';
import { getErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/cn';

const REPORT_TYPES = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'sprint_review', label: 'Sprint Review' },
] as const;

const ARCHIVE_FILTERS = ['All', 'Daily', 'Weekly', 'Monthly', 'Sprint'] as const;

interface Props {
  projectId: string;
}

export function ReportsPage({ projectId }: Props) {
  const t = useT();
  const canWrite = useAuthStore(s => s.canWrite)();
  const TYPE_LABELS: Record<string, string> = {
    daily: t.report.daily, weekly: t.report.weekly, monthly: t.report.monthly, sprint_review: t.report.sprintReview,
  };
  const FILTER_LABELS: Record<string, string> = {
    All: t.report.all, Daily: t.report.daily, Weekly: t.report.weekly, Monthly: t.report.monthly, Sprint: t.report.sprintReview,
  };
  const [reportType, setReportType] = useState<string>('daily');
  const [content, setContent] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [archive, setArchive] = useState<Report[]>([]);
  const [archiveFilter, setArchiveFilter] = useState('All');

  const loadArchive = useCallback(async () => {
    try {
      const { data: resp } = await aiApi.listReports(projectId);
      setArchive(resp.data || []);
    } catch { /* noop */ }
  }, [projectId]);

  useEffect(() => { loadArchive(); }, [loadArchive]);

  const generate = async () => {
    setGenerating(true); setError('');
    try {
      const req: ReportRequest = { project_id: projectId, report_type: reportType as ReportRequest['report_type'] };
      if (prompt) req.prompt = prompt;
      const { data: resp } = await aiApi.generateReport(req);
      setShowPrompt(false);
      // Poll for result
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const { data: poll } = await aiApi.getReportTask(resp.data.task_id);
        if (poll.data.status === 'completed') {
          setContent(poll.data.result || '');
          break;
        }
      }
    } catch (err) {
      setError(getErrorMessage(err, t.ai || { errors: { default: 'Report generation failed' } }));
    } finally { setGenerating(false); }
  };

  const save = async () => {
    try {
      await aiApi.saveReport(content, reportType, projectId);
      loadArchive();
    } catch (err) {
      setError(getErrorMessage(err, t.ai || { errors: { default: 'Save failed' } }));
    }
  };

  const filteredArchive = archiveFilter === 'All'
    ? archive
    : archive.filter(r => r.type?.toLowerCase().includes(archiveFilter.toLowerCase()));

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-ink-primary mb-6">{t.report.title}</h2>

      {error && <div className="card bg-danger-soft text-danger p-3 mb-4 text-sm">{error}</div>}

      {/* Generate */}
      <div className="card ai-glow mb-4">
        <div className="card-hd">
          <div className="flex gap-2">
            {REPORT_TYPES.map(rt => (
              <button key={rt.key} className={cn('btn btn-s fs13', reportType === rt.key && 'bg-brand-soft text-brand-main font-semibold')}
                onClick={() => setReportType(rt.key)}>{TYPE_LABELS[rt.key] || rt.label}</button>
            ))}
          </div>
        </div>
        <div className="card-bd">
          {!content && !generating && (
            <div className="text-center py-8">
              <p className="text-3xl mb-3">🤖</p>
              <p className="text-ink-primary font-medium mb-2">{TYPE_LABELS[reportType]} {t.report.title}</p>
              <p className="text-sm text-ink-muted mb-4">{t.report.subtitle}</p>
              {canWrite && <button className="btn-b" onClick={() => setShowPrompt(true)}>{t.report.generateReport}</button>}
            </div>
          )}

          {generating && (
            <div className="text-center py-8 animate-pulse text-ink-muted">
              <p className="text-2xl mb-2">🤖</p>
              <p>{t.report.generating}</p>
            </div>
          )}

          {content && (
            <div>
              <div className="flex justify-between mb-4">
                <h3 className="font-semibold text-ink-primary">{TYPE_LABELS[reportType]} {t.report.title}</h3>
                {canWrite && <div className="flex gap-2">
                  <button className="btn-s btn-xs" onClick={() => setShowPrompt(true)}>{t.report.regenerate || '🤖 Regenerate'}</button>
                  <button className="btn-s btn-xs" onClick={save}>{t.report.save || '💾 Save'}</button>
                  <button className="btn-b btn-xs">{t.report.send || '📧 Send'}</button>
                </div>}
              </div>
              <textarea className="input w-full" style={{ minHeight: '300px', fontFamily: 'inherit', fontSize: '13px', lineHeight: 1.7 }}
                value={content} onChange={e => setContent(e.target.value)} />
            </div>
          )}
        </div>
      </div>

      {/* Archive */}
      <div className="card">
        <div className="card-hd"><h3>{t.report.myReports}</h3></div>
        <div className="card-bd-nopad">
          <div className="flex gap-2 p-3">
            {ARCHIVE_FILTERS.map(f => (
              <button key={f} className={cn('btn btn-s btn-xs', archiveFilter === f && 'bg-brand-soft text-brand-main font-semibold')}
                onClick={() => setArchiveFilter(f)}>{FILTER_LABELS[f] || f}</button>
            ))}
          </div>
          {filteredArchive.map(r => (
            <div key={r.id} className="hover-row flex items-center gap-4 px-4 py-2">
              <div className="av w-8 h-8 text-xs" style={{
                background: r.type === 'daily' ? 'hsl(var(--brand-soft))' : 'hsl(var(--warning-soft))',
                color: r.type === 'daily' ? 'hsl(var(--brand))' : 'hsl(var(--warning))'
              }}>{(r.type || 'R')[0].toUpperCase()}</div>
              <div className="flex-1">
                <p className="text-sm font-medium text-ink-primary">{r.title || `${r.type} report`}</p>
                <p className="text-xs text-ink-muted">{new Date(r.created_at).toLocaleDateString()}</p>
              </div>
              <button className="btn-s btn-xs">{t.report.view}</button>
            </div>
          ))}
          {filteredArchive.length === 0 && (
            <p className="text-center text-sm text-ink-muted py-6">{t.report.noReports}</p>
          )}
        </div>
      </div>

      {/* Prompt modal */}
      {showPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/20" onClick={() => setShowPrompt(false)} />
          <div className="card relative w-full max-w-md p-6 shadow-dialog">
            <h3 className="font-semibold mb-2 text-ink-primary">{t.report.custom}</h3>
            <p className="text-sm text-ink-muted mb-4">{t.report.customPromptPlaceholder}</p>
            <textarea className="input w-full mb-4" style={{ minHeight: '80px' }}
              placeholder={t.report.customPromptPlaceholder}
              value={prompt} onChange={e => setPrompt(e.target.value)} />
            <div className="flex justify-end gap-2">
              <button className="btn-s" onClick={() => setShowPrompt(false)}>{t.report.cancel || 'Cancel'}</button>
              <button className="btn-b" onClick={generate}>{t.report.generateReport}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
