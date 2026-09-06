import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useProjectStore } from '@/stores/projectStore';
import { useAuthStore } from '@/stores/authStore';
import { useLanguageStore } from '@/stores/languageStore';
import http from '@/lib/http';
import { aiEnabled } from '@/lib/aiGate';
import { isDemoUser as isDemoUserEmail } from '@/lib/demoUser';
import { memberApi } from '@/api/memberApi';
import { useT } from '@/i18n/useT';
import { sanitize } from '@/lib/sanitize';
import { renderMarkdown } from '@/lib/renderMarkdown';
import { ReportHistoryPanel } from '@/components/report/ReportHistoryPanel';
import { ReportSendModal } from '@/components/report/ReportSendModal';
import { MarkdownEditor } from '@/components/MarkdownEditor';
import { exportExcel, exportWord, exportHtml, exportMarkdown } from '@/lib/reportExport';

type ReportType = 'daily' | 'weekly' | 'monthly' | 'sprint_review' | 'custom';
type ReportState = 'idle' | 'generating' | 'editing' | 'read_only';

interface HistoryItem {
  id: string; title: string; reportType: ReportType; status: string;
  projectId?: string; generatedAt: string; content?: string;
}

interface ReviewSuggestion {
  priority: string; section: string; issue: string;
  suggestion: string; before: string; after: string;
}

export function ReportPage() {
  const { projects } = useProjectStore();
  const reset = useProjectStore((s) => s.reset);
  const navigate = useNavigate();
  // Demo tour step 4 — AI Reports highlight (read-only demo: show existing
  // generated reports, don't trigger generation).
  const tour = (useSearch({ strict: false }) as { tour?: string }).tour;
  const isDemoUser = useAuthStore((s) => isDemoUserEmail(s.user?.email));
  const showTour = tour === '4' && isDemoUser && aiEnabled;
  const nextTourStep = () => {
    try { localStorage.setItem('tomihub-demo-tour', 'done'); } catch { /* noop */ }
    navigate({ to: '/wiki', search: { tour: '5' }, replace: true });
  };
  const skipTour = () => {
    try { localStorage.setItem('tomihub-demo-tour', 'done'); } catch { /* noop */ }
    navigate({ to: '/home', replace: true });
  };
  const token = useAuthStore(s => s.accessToken);
  const tenantId = useAuthStore(s => s.currentTenant?.id);
  const userId = useAuthStore(s => s.user?.id);
  const jobTitle = useAuthStore(s => s.user?.jobTitle || '');
  const userAiLang = useAuthStore(s => s.user?.aiLanguage);
  const uiLang = useLanguageStore(s => s.lang);
  const lang = userAiLang || uiLang || 'en';
  const t = useT();

  // Form
  const [reportType, setReportType] = useState<ReportType>('daily');
  const [style, setStyle] = useState('professional');
  const [projectId, setProjectId] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // State machine
  const [state, setState] = useState<ReportState>('idle');
  const [reportContent, setReportContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [currentReportId, setCurrentReportId] = useState<string | null>(null);
  const [_currentReportStatus, setCurrentReportStatus] = useState('draft');

  // Generation
  const [gen, setGen] = useState({ step: 0, text: '' });
  const [generating, setGenerating] = useState(false);

  // Editing
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // AI Review
  const [reviewing, setReviewing] = useState(false);
  const [reviewProgress, setReviewProgress] = useState('');
  const [reviewSuggestions, setReviewSuggestions] = useState<ReviewSuggestion[]>([]);
  const [reviewAssessment, setReviewAssessment] = useState('');
  const [error, setError] = useState('');
  const [confirmApply, setConfirmApply] = useState<number | null>(null);
  const [appliedSuggestions, setAppliedSuggestions] = useState<Set<number>>(new Set());

  // Send modal
  const [sendOpen, setSendOpen] = useState(false);
  const [sendTab, setSendTab] = useState<'email' | 'in_app'>('email');
  const [sendTo, setSendTo] = useState('');
  const [sendCC, setSendCC] = useState('');
  const [sendSubject, setSendSubject] = useState('');
  const [sendFeedback, setSendFeedback] = useState('');
  const [sending, setSending] = useState(false);
  const [workspaceMembers, setWorkspaceMembers] = useState<Array<{ userId: string; displayName: string; email: string }>>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  // History
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [reportTab, setReportTab] = useState<'my' | 'shared'>('my');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [colWidths, setColWidths] = useState({ title: 30, summary: 50, date: 20 }); // percentages
  const resizing = useRef<{ col: string; startX: number; startW: number } | null>(null);

  const onResizeStart = (col: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    resizing.current = { col, startX: e.clientX, startW: colWidths[col as keyof typeof colWidths] };
    const onMove = (ev: MouseEvent) => {
      if (!resizing.current) return;
      const dx = ev.clientX - resizing.current.startX;
      const containerW = (document.querySelector('.rpt-list-container') as HTMLElement)?.offsetWidth || 900;
      const dpct = Math.round((dx / containerW) * 100);
      const newW = Math.max(10, Math.min(70, resizing.current.startW + dpct));
      setColWidths(prev => {
        const next = { ...prev, [resizing.current!.col]: newW };
        // adjust summary column to keep total 100%
        if (resizing.current!.col === 'title') next.summary = Math.max(10, 100 - newW - prev.date);
        if (resizing.current!.col === 'summary') next.title = Math.max(10, 100 - newW - prev.date);
        return next;
      });
    };
    const onUp = () => { resizing.current = null; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const filteredHistory = (historyFilter === 'all'
    ? [...history]
    : history.filter(r => r.reportType === historyFilter)
  ).sort((a, b) => sortDir === 'desc'
    ? new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
    : new Date(a.generatedAt).getTime() - new Date(b.generatedAt).getTime()
  );

  const historyReqRef = useRef(0);

  const loadHistory = async () => {
    const reqId = ++historyReqRef.current;
    try {
      const params = reportTab === 'shared' ? { tab: 'shared' } : {};
      const { data } = await http.get('/reports', { params });
      if (reqId === historyReqRef.current) {  // ignore stale responses
        setHistory((data as Record<string, unknown>).data as HistoryItem[] || []);
      }
    } catch { /* noop */ }
  };

  // loadHistory recreated each render — only run on tab change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadHistory(); }, [reportTab]);

  useEffect(() => { return () => reset(); }, [reset]);

  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 360) + 'px'; }
  }, []);

  //  Generate (SSE streaming)

  const abortRef = useRef<AbortController | null>(null);

  const cancelGeneration = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setGenerating(false); setState('idle');
  };

  const generate = async () => {
    if (!aiEnabled || generating) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setGenerating(true); setState('generating'); setReportContent('');
    setReviewSuggestions([]); setGen({ step: 0, text: 'Starting...' });

    try {
      const resp = await fetch('/api/v1/ai/reports/generate', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
          ...(tenantId && { 'X-Tenant-Id': tenantId }),
          ...(userId && { 'X-User-Id': userId }),
        },
        body: JSON.stringify({
          report_type: reportType, project_id: projectId || null,
          prompt: customPrompt || undefined, lang, style,
          job_title: jobTitle || undefined,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        // Read-only demo accounts get a friendly, onboarding-style message
        // instead of a raw 403 error dump (backend returns code: "readonly").
        let friendly = '';
        try {
          const parsed = JSON.parse(errText) as { code?: string; error?: string };
          if (parsed?.code === 'readonly') friendly = t.report.readOnlyGenerate;
          else if (parsed?.error) friendly = parsed.error;
        } catch { /* not JSON — fall through to raw text */ }
        setReportContent(`Error: ${resp.status} — ${friendly || errText.slice(0, 200)}`);
        setState('editing');
        return;
      }
      const reader = resp.body?.getReader();
      if (!reader) { setGenerating(false); setState('idle'); return; }

      const decoder = new TextDecoder();
      let buffer = '', pendingEvent = '', fullContent = '', receivedDone = false;

      const finishGeneration = () => {
        if (!receivedDone) {
          receivedDone = true;
          setOriginalContent(fullContent);
          setCurrentReportId(null);
          setCurrentReportStatus('draft');
          setState('editing');
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.trim()) {
            const residual = buffer.trim().split('\n');
            for (const line of residual) {
              if (line.startsWith('event: ')) { pendingEvent = line.slice(7).trim(); continue; }
              if (line.startsWith('data: ')) {
                if (pendingEvent === 'done') finishGeneration();
              }
            }
          }
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('event: ')) { pendingEvent = line.slice(7).trim(); continue; }
          if (line.startsWith('data: ')) {
            try {
              const d = JSON.parse(line.slice(6));
              if (pendingEvent === 'progress') setGen({ step: d.step || 0, text: d.text || '' });
              if (pendingEvent === 'chunk') { fullContent += d.token; setReportContent(fullContent); }
              if (pendingEvent === 'done') finishGeneration();
            } catch { /* noop */ }
            pendingEvent = '';
          }
        }
      }
      // Fallback: got content but stream ended without explicit 'done' event
      if (!receivedDone && fullContent) finishGeneration();
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') { /* user cancelled — do nothing */ }
      else { // Log error to monitoring service when available
        setState('idle'); }
    }
    finally { setGenerating(false); setGen({ step: 0, text: '' }); abortRef.current = null; }
  };

  //  Save Draft

  const saveDraft = async (): Promise<boolean> => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        title: `${(t.report as Record<string, string>)[reportType === 'sprint_review' ? 'sprintReview' : reportType]} — ${new Date().toLocaleDateString()}`,
        reportType, projectId: projectId || null,
        content: reportContent, originalContent: originalContent || reportContent,
      };
      if (currentReportId) {
        await http.put(`/reports/${currentReportId}`, body);
      } else {
        const { data } = await http.post('/reports', body);
        const respData = (data as Record<string, unknown>).data as Record<string, unknown> | undefined;
        setCurrentReportId((respData?.id as string) ?? null);
        setCurrentReportStatus('draft');
      }
      loadHistory();
      return true;
    } catch { // Log error to monitoring service when available
      return false; } finally { setSaving(false); }
  };

  // ══════════════════════════════════════════
  //  AI Review
  // ══════════════════════════════════════════

  const aiReview = async () => {
    if (!aiEnabled) return;
    setReviewing(true); setReviewProgress(t.report.reviewProgress);
    setReviewSuggestions([]); setReviewAssessment('');
    setAppliedSuggestions(new Set()); setConfirmApply(null);
    setError('');

    try {
      const resp = await fetch('/api/v1/ai/reports/review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
          ...(tenantId && { 'X-Tenant-Id': tenantId }),
        },
        body: JSON.stringify({ report_id: currentReportId, current_content: reportContent, lang }),
      });

      // Non-2xx: surface a friendly reason (read-only demo, server error) —
      // without this the 403 JSON body was read as an SSE stream and the
      // button just flashed with zero feedback.
      if (!resp.ok) {
        let friendly = `Error: ${resp.status}`;
        try {
          const parsed = await resp.json() as { code?: string; error?: string };
          if (parsed?.code === 'readonly') friendly = t.report.readOnlyGenerate;
          else if (parsed?.error) friendly = parsed.error;
        } catch { /* non-JSON body */ }
        setError(friendly);
        setReviewing(false);
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) { setReviewing(false); return; }
      const decoder = new TextDecoder();
      let buffer = '', pendingEvent = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('event: ')) { pendingEvent = line.slice(7).trim(); continue; }
          if (line.startsWith('data: ')) {
            try {
              const d = JSON.parse(line.slice(6));
              if (pendingEvent === 'progress') setReviewProgress(d.text || '');
              if (pendingEvent === 'result') {
                setReviewSuggestions(d.suggestions || []);
                setReviewAssessment(d.overall_assessment || '');
                setError('');
              }
            } catch { /* noop */ }
            pendingEvent = '';
          }
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally { setReviewing(false); setReviewProgress(''); }
  };

  const applySuggestion = (idx: number) => {
    const s = reviewSuggestions[idx];
    if (!s?.before) return;
    setReportContent(prev => prev.replace(s.before, s.after));
    setAppliedSuggestions(prev => new Set(prev).add(idx));
    setConfirmApply(null);
  };

  // ══════════════════════════════════════════
  //  Send
  // ══════════════════════════════════════════

  const openSend = () => {
    setSendSubject(`${(t.report as Record<string, string>)[reportType === 'sprint_review' ? 'sprintReview' : reportType]} — ${(projects || []).find(p => p.id === projectId)?.name || 'Report'}`);
    setSendFeedback(''); setMemberSearch(''); setSelectedUserIds(new Set());
    setSendOpen(true);
    // Fetch workspace members for in-app share
    memberApi.listMembers().then((res) => {
      const payload = ((res?.data as unknown as Record<string, unknown>)?.data || res?.data || []) as Array<Record<string, unknown>>;
      setWorkspaceMembers(payload.map((m: Record<string, unknown>) => ({ userId: (m.userId || m.id) as string, displayName: m.displayName as string, email: m.email as string })).filter((m: Record<string, unknown>) => m.userId));
    }).catch(() => {});
  };

  const doSend = async () => {
    setSendFeedback(''); setSending(true);
    if (!currentReportId) {
      const saved = await saveDraft();
      if (!saved || !currentReportId) { setSendFeedback(t.report.failedToSave); setSending(false); return; }
    }
    try {
      const body: Record<string, unknown> = {};
      if (sendTab === 'email') {
        const to = sendTo.split(',').map(s => s.trim()).filter(Boolean);
        if (to.length === 0) { setSendFeedback(t.report.enterEmail); setSending(false); return; }
        const emailBody: { to: string[]; subject: string; cc?: string[] } = { to, subject: sendSubject };
        if (sendCC.trim()) emailBody.cc = sendCC.split(',').map(s => s.trim()).filter(Boolean);
        body.email = emailBody;
      } else {
        const uids = Array.from(selectedUserIds).filter(Boolean);
        if (uids.length === 0) { setSendFeedback(t.report.enterMembers); setSending(false); return; }
        body.inApp = { userIds: uids };
      }
      await http.post(`/reports/${currentReportId}/send`, body);
      setCurrentReportStatus('sent');
      setSendFeedback(`✅ ${t.report.reportSent}`);
      setTimeout(() => { setSendOpen(false); loadHistory(); }, 1500);
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { message?: string } } };
      setSendFeedback(`❌ ${apiErr?.response?.data?.message || t.report.sendFailed}`);
    } finally { setSending(false); }
  };

  // ══════════════════════════════════════════
  //  History
  // ══════════════════════════════════════════

  const [isSharedReport, setIsSharedReport] = useState(false);

  const openHistory = async (id: string) => {
    try {
      const { data } = await http.get(`/reports/${id}`);
      const r = (data as Record<string, unknown>).data as { id?: string; content?: string; originalContent?: string; status?: string; reportType?: string; projectId?: string; } | undefined;
      if (r) {
        setReportContent(r.content || ''); setOriginalContent(r.originalContent || '');
        setCurrentReportId(r.id ?? null); setCurrentReportStatus(r.status ?? '');
        setReportType((r.reportType || 'daily') as ReportType); setProjectId(r.projectId || '');
        setReviewSuggestions([]); setEditing(false);
        const isMine = reportTab === 'my';
        setIsSharedReport(!isMine);
        setState(!isMine || r.status === 'sent' ? 'read_only' : 'editing');
      }
    } catch { /* noop */ }
  };

  const copyMarkdown = async () => {
    await navigator.clipboard.writeText(reportContent);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  // ══════════════════════════════════════════
  //  Download (Excel / Word / HTML / Markdown)
  // ══════════════════════════════════════════
  const [exportOpen, setExportOpen] = useState(false);

  const reportFileName = () => `${(t.report as Record<string, string>)[reportType === 'sprint_review' ? 'sprintReview' : reportType]} — ${new Date().toLocaleDateString()}`;

  const doExport = async (format: 'xlsx' | 'docx' | 'html' | 'md') => {
    if (!reportContent.trim()) return;
    setExportOpen(false);
    const fname = reportFileName();
    try {
      if (format === 'xlsx') exportExcel(fname, reportContent);
      else if (format === 'docx') await exportWord(fname, reportContent);
      else if (format === 'html') exportHtml(fname, reportContent);
      else exportMarkdown(fname, reportContent);
    } catch { /* download failed */ }
  };

  // ══════════════════════════════════════════
  //  Render
  // ══════════════════════════════════════════

  return (
    <div style={{ height: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column' }}>
      <div className="ch" style={{ flexShrink: 0 }}>
        <h2 className="text-base font-semibold text-ink-primary">{t.report.title}</h2>
        {aiEnabled && <span className="text-xs text-ink-muted">{t.report.subtitle}</span>}
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* ═══ LEFT: AI Generate form (AI edition only) + History ═══ */}
        <div className="overflow-y-auto p-4" style={{ width: '60%', borderRight: '1px solid hsl(var(--edge-default))' }}>
          {aiEnabled && (
          <div className="card ai-glow mb-5">
            <div className="card-bd" style={{ padding: '18px 20px' }}>
              <div className="flex items-center gap-3 mb-3" style={{ flexWrap: 'wrap' }}>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-ink-muted">{t.report.project}</span>
                  <select className="form-input" style={{ width: '170px', padding: '5px 8px', fontSize: '12px' }}
                    value={projectId} onChange={e => setProjectId(e.target.value)}>
                    <option value="">All Projects</option>
                    {projects.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-ink-muted">{t.report.type}</span>
                  <div className="flex gap-0.5">
                    {[{key:'daily',icon:'📅'},{key:'weekly',icon:'📊'},{key:'sprint_review',icon:'🔄'},{key:'monthly',icon:'📈'},{key:'custom',icon:'📝'}].map(rt => {
                      const typeKey = rt.key === 'sprint_review' ? 'sprintReview' : rt.key;
                      return (
                      <button key={rt.key} className="btn-secondary text-xs" style={{
                        padding: '5px 9px', minWidth: '70px', textAlign: 'center',
                        background: reportType === rt.key ? 'hsl(var(--brand-soft))' : 'transparent',
                        borderColor: reportType === rt.key ? 'hsl(var(--brand))' : 'transparent',
                        color: reportType === rt.key ? 'hsl(var(--brand))' : '',
                        fontWeight: reportType === rt.key ? 600 : 400,
                      }} onClick={() => setReportType(rt.key as ReportType)}>{rt.icon} {(t.report as Record<string, string>)[typeKey]}</button>
                    )})}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-ink-muted">{t.report.style}</span>
                  <div className="flex gap-0.5">
                    {[{key:'professional',icon:'💼'},{key:'concise',icon:'⚡'},{key:'detailed',icon:'📋'},{key:'casual',icon:'💬'}].map(styleItem => (
                      <button key={styleItem.key} className="btn-secondary text-xs" style={{
                        padding: '5px 9px', minWidth: '70px', textAlign: 'center',
                        background: style === styleItem.key ? 'hsl(var(--brand-soft))' : 'transparent',
                        borderColor: style === styleItem.key ? 'hsl(var(--brand))' : 'transparent',
                        color: style === styleItem.key ? 'hsl(var(--brand))' : '',
                        fontWeight: style === styleItem.key ? 600 : 400,
                      }} onClick={() => setStyle(styleItem.key)}>{styleItem.icon} {(t.report as Record<string, string>)[styleItem.key]}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mb-3">
                <textarea ref={textareaRef} className="form-input"
                  style={{ minHeight: '180px', maxHeight: '340px', padding: '10px 12px', fontSize: '13px', width: '100%', lineHeight: 1.5, resize: 'vertical', overflowY: 'auto' }}
                  placeholder={t.report.customPromptPlaceholder}
                  value={customPrompt} onChange={e => { setCustomPrompt(e.target.value); autoGrow(); }} onInput={autoGrow} />
              </div>
              <div className="flex items-center gap-2 justify-end">
                <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '6px', flexShrink: 0, border: '1px dashed hsl(var(--edge-default))', color: 'hsl(var(--ink-muted))', fontSize: '18px', fontWeight: 300, lineHeight: 1 }} title={t.report.attachFiles}>
                  {'+'}
                  <input type="file" multiple accept=".txt,.csv,.md,.xlsx,.xls,.docx,.doc,.pptx,.ppt,.png,.jpg,.jpeg,.gif,.webp,.svg,.pdf" style={{ display: 'none' }}
                    onChange={e => { if (e.target.files) setAttachedFiles(prev => [...prev, ...Array.from(e.target.files!)]); }} />
                </label>
                <button className="btn-brand" style={{ padding: '7px 18px', fontSize: '13px' }}
                  onClick={generate} disabled={generating}>
                  {generating ? t.report.generating : t.report.generateReport}
                </button>
              </div>
              {attachedFiles.length > 0 && (
                <div className="flex items-center gap-1 mt-2 flex-wrap">
                  {attachedFiles.map((f, i) => (
                    <span key={i} className="flex items-center gap-1 text-[0.65rem] px-1.5 py-0.5 rounded"
                      style={{ background: 'hsl(var(--surface-card))', border: '1px solid hsl(var(--edge-default))' }}>
                      {f.name}
                      <button style={{ fontSize: '13px', lineHeight: 1, color: 'hsl(var(--ink-muted))' }}
                        onClick={() => setAttachedFiles(prev => prev.filter((_, j) => j !== i))}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          )}

          <ReportHistoryPanel
            history={history}
            filteredHistory={filteredHistory}
            historyFilter={historyFilter}
            setHistoryFilter={setHistoryFilter}
            reportTab={reportTab}
            setReportTab={setReportTab}
            sortDir={sortDir}
            setSortDir={setSortDir}
            colWidths={colWidths}
            onResizeStart={onResizeStart}
            currentReportId={currentReportId}
            openHistory={openHistory}
            loadHistory={loadHistory}
            deleteConfirm={deleteConfirm}
            setDeleteConfirm={setDeleteConfirm}
          />
        </div>

        <div className="overflow-y-auto" style={{ width: '40%' }}>
          {/* Idle */}
          {state === 'idle' && (
            <div className="flex flex-col items-center justify-center" style={{ minHeight: '100%' }}>
              <p className="text-5xl mb-4">📊</p>
              {aiEnabled ? (
                <>
                  <p className="text-sm text-ink-muted">Select a report type and click Generate</p>
                  <p className="text-xs text-ink-muted mt-1">AI will analyze your project data and write a professional report.</p>
                </>
              ) : (
                <p className="text-sm text-ink-muted">{t.report.noReports}</p>
              )}
            </div>
          )}

          {/* Generating */}
          {state === 'generating' && (
            <div className="p-6">
              <div className="card p-4 mb-4 ai-glow">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full border-2 border-brand-main border-t-transparent animate-spin" />
                  <span className="text-sm text-brand-main font-medium">{gen.text || t.report.processing}</span>
                </div>
                <div className="progress mt-3" style={{ height: '4px' }}>
                  <div className="progress-bar brand animate-pulse"
                    style={{ width: gen.step === 1 ? '33%' : gen.step === 2 ? '66%' : '90%' }} />
                </div>
                <div className="flex justify-end mt-3">
                  <button className="btn-secondary text-xs" onClick={cancelGeneration}>✕ {t.report.cancel}</button>
                </div>
              </div>
              {reportContent && (
                <div className="card p-5" style={{ lineHeight: 1.7, fontSize: '14px' }}
                  dangerouslySetInnerHTML={{ __html: sanitize(renderMarkdown(reportContent)) }} />
              )}
            </div>
          )}

          {/* Editing / Read Only */}
          {(state === 'editing' || state === 'read_only') && (
            <div className="p-6">
              {/* Toolbar */}
              <div className="flex items-center gap-2 mb-4">
                {isSharedReport ? (
                  <>
                    <span className="badge bg-status-success-soft text-status-success text-[0.7rem]">📩 {t.report.sharedWithYou}</span>
                    <div className="flex-1" />
                    <button className="btn-secondary text-xs" onClick={() => { setState('idle'); setReportContent(''); }}>{t.report.close}</button>
                  </>
                ) : (
                  <>
                    <button className="btn-secondary text-xs" onClick={() => setEditing(!editing)}>
                      {editing ? '👁 ' + t.report.preview : '✏️ ' + t.report.edit}
                    </button>
                    {aiEnabled && (
                      <button className="btn-secondary text-xs" onClick={aiReview} disabled={reviewing}>
                        {reviewing ? '🤖 ' + t.report.reviewing : '🤖 ' + t.report.aiReview}
                      </button>
                    )}
                    <button className="btn-secondary text-xs" onClick={saveDraft} disabled={saving}>
                      {saving ? t.report.processing : '💾 ' + t.report.saveDraft}
                    </button>
                    <button className="btn-secondary text-xs" onClick={copyMarkdown}>
                      {copied ? '✓ ' + t.report.copied : '📋 ' + t.report.copy}
                    </button>
                    <div style={{ position: 'relative' }}>
                      <button className="btn-secondary text-xs" onClick={() => setExportOpen(!exportOpen)} disabled={!reportContent.trim()}>
                        ⬇ {t.report.download}
                      </button>
                      {exportOpen && (
                        <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 60, background: 'hsl(var(--surface-card))', border: '1px solid hsl(var(--edge-default))', borderRadius: 8, padding: 4, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
                          {([['xlsx', '📊 Excel'], ['docx', '📝 Word'], ['html', '🌐 HTML'], ['md', '📄 Markdown']] as const).map(([fmt, label]) => (
                            <button key={fmt} className="w-full text-left text-xs px-3 py-2 rounded hover:bg-surface-hover transition-colors text-ink-primary"
                              onClick={() => doExport(fmt)}>{label}</button>
                          ))}
                        </div>
                      )}
                    </div>
                    {_currentReportStatus === 'sent' && (
                      <span className="badge bg-status-success-soft text-status-success text-[0.65rem] ml-1">✓ {t.report.sent}</span>
                    )}
                    <div className="flex-1" />
                    <button className="btn-brand text-xs" onClick={openSend}>📧 {t.report.send}</button>
                  </>
                )}
              </div>

              {/* AI Review progress */}
              {aiEnabled && reviewing && (
                <div className="card p-3 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full border-2 border-brand-main border-t-transparent animate-spin" />
                    <span className="text-xs text-brand-main">{reviewProgress}</span>
                  </div>
                </div>
              )}

              {/* Error (read-only demo / server) — visible so a failed action
                  never flashes silently */}
              {error && (
                <div className="mb-3 p-3 rounded-card bg-warning-soft border border-warning/30">
                  <p className="text-xs text-warning font-medium">⚠️ {error}</p>
                </div>
              )}

              {/* Content */}
              <div className="card">
                <div className="card-bd p-5" style={{ minHeight: '300px', lineHeight: 1.7, fontSize: '14px' }}>
                  {editing ? (
                    <MarkdownEditor value={reportContent} onChange={setReportContent} height="500px" />
                  ) : (
                    <div dangerouslySetInnerHTML={{ __html: sanitize(renderMarkdown(reportContent)) }} />
                  )}
                </div>
              </div>

              {/* AI Review suggestions */}
              {aiEnabled && reviewSuggestions.length > 0 && (
                <div className="card ai-glow mt-4">
                  <div className="card-hd"><span className="text-xs font-semibold text-brand-main">🤖 {t.report.aiReviewSuggestions}</span></div>
                  <div className="card-bd p-3">
                    {reviewAssessment && <p className="text-xs text-ink-muted mb-3">{reviewAssessment}</p>}
                    {reviewSuggestions.map((s, idx) => (
                      <div key={idx} className="mb-3 last:mb-0 p-3 rounded-card" style={{ background: 'hsl(var(--surface-app))' }}>
                        <div className="flex items-start gap-2 mb-1">
                          <span className={`text-[0.6rem] font-semibold px-1.5 py-0.5 rounded-full ${
                            s.priority === 'high' ? 'text-danger' : s.priority === 'medium' ? 'text-warning' : 'text-ink-muted'
                          }`} style={{
                            background: s.priority === 'high' ? 'hsl(var(--danger-soft))' : s.priority === 'medium' ? 'hsl(var(--warning-soft))' : 'hsl(var(--surface-hover))',
                          }}>{s.priority.toUpperCase()}</span>
                          <span className="text-xs font-semibold text-ink-primary">{s.section} — {s.issue}</span>
                        </div>
                        <p className="text-xs text-ink-muted mb-2">{s.suggestion}</p>
                        {s.before && (
                          <div className="text-xs mb-2">
                            <span className="text-ink-muted">{t.report.before}: </span><span className="text-danger line-through">{s.before.slice(0, 100)}</span><br />
                            <span className="text-ink-muted">{t.report.after}: </span><span className="text-success">{s.after.slice(0, 100)}</span>
                          </div>
                        )}
                        {state === 'editing' && (
                          appliedSuggestions.has(idx) ? (
                            <span className="text-xs text-success font-medium">✓ {t.report.applied}</span>
                          ) : confirmApply === idx ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-ink-muted">{t.report.apply}?</span>
                              <button className="btn-brand" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={() => applySuggestion(idx)}>Yes</button>
                              <button className="btn-secondary" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={() => setConfirmApply(null)}>No</button>
                            </div>
                          ) : (
                            <button className="btn-secondary" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={() => setConfirmApply(idx)}>{t.report.apply}</button>
                          )
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ReportSendModal
        sendOpen={sendOpen}
        setSendOpen={setSendOpen}
        sendTab={sendTab}
        setSendTab={setSendTab}
        sendTo={sendTo}
        setSendTo={setSendTo}
        sendCC={sendCC}
        setSendCC={setSendCC}
        sendSubject={sendSubject}
        setSendSubject={setSendSubject}
        sendFeedback={sendFeedback}
        setSendFeedback={setSendFeedback}
        sending={sending}
        setSending={setSending}
        workspaceMembers={workspaceMembers}
        memberSearch={memberSearch}
        setMemberSearch={setMemberSearch}
        selectedUserIds={selectedUserIds}
        setSelectedUserIds={setSelectedUserIds}
        onSend={doSend}
        userId={userId}
      />

      {/* ─── Demo tour step 4 — AI Reports highlight ─── */}
      {showTour && (
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
              4. {t.projectOverview.tourStep4Title}
            </p>
            <p className="text-xs text-ink-secondary mb-3 leading-relaxed">
              {t.projectOverview.tourStep4Body}
            </p>
            <div className="flex items-center gap-1.5 mb-3">
              {[1, 2, 3, 4, 5].map(n => (
                <span key={n} className={`h-1.5 rounded-full transition-all ${n === 4 ? 'w-6 bg-brand-main' : n < 4 ? 'w-3 bg-brand-main/40' : 'w-3 bg-edge'}`} />
              ))}
              <span className="ml-auto text-[0.6rem] text-ink-muted font-medium">4/5</span>
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
