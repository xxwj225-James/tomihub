import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useProjectStore } from '@/stores/projectStore';
import { useAuthStore } from '@/stores/authStore';
import { useLanguageStore } from '@/stores/languageStore';
import { issueApi, type IssueData, type IssuePermissions, type AiReviewResult, type MemberInfo } from '@/api/issueApi';
import { safeArray } from '@/lib/cn';
import { getErrorMessage, getLlmErrorMessage } from '@/lib/errors';
import { StatusTracker } from '@/components/StatusTracker';
import { AiReviewPanel } from '@/components/issue/AiReviewPanel';
import { MarkdownEditor } from '@/components/MarkdownEditor';
import http from '@/lib/http';
import { useT } from '@/i18n/useT';
import { CommentSection } from '@/components/issue/CommentSection';
import { EstimationScalePicker } from '@/components/estimation/EstimationScalePicker';

interface CommentData { id: string; issueId: string; authorId: string; authorName: string; body: string; createdAt: string; }

function SideItem({
  label,
  value,
  children,
  className,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="py-2 border-b border-edge last:border-b-0">
      <div className="text-[0.6875rem] font-semibold text-ink-muted uppercase tracking-wider mb-1">
        {label}
      </div>
      {children || (
        <span className={`text-[0.8125rem] text-ink-primary ${className || ''}`}>
          {value}
        </span>
      )}
    </div>
  );
}

export function IssueDetailPage() {
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { id?: string };
  // Pages that deep-link here (e.g. Project Overview risk card) pass
  // ?from=overview so the back button returns there, not the issue list.
  const from = (useSearch({ strict: false }) as { from?: string }).from;
  const { currentProject } = useProjectStore();
  const id = params.id;

  // Status list: from master_data filtered by project methodology
  const projectMethod = (() => { try { return JSON.parse(currentProject?.settings || '{}').methodology || ''; } catch { return ''; } })();
  const isScrum = projectMethod === 'scrum';
  const [statusList, setStatusList] = useState<Array<{key:string;value:string;color:string}>>([]);
  useEffect(() => {
    http.get(`/master-data?category=issue_status&methodology=${projectMethod}`).then(({ data }: { data: Record<string, unknown> }) => {
      setStatusList(data.data as Array<{key:string;value:string;color:string}> || []);
    }).catch(()=>{});
  }, [currentProject?.id, projectMethod]);

  const [priorityMap, setPriorityMap] = useState<Record<string, string>>({});
  const [priorityColorMap, setPriorityColorMap] = useState<Record<string, string>>({});
  const [priorityList, setPriorityList] = useState<Array<{key:string;value:string;icon:string;color:string}>>([]);
  const [phaseList, setPhaseList] = useState<Array<{key:string;value:string}>>([]);

  useEffect(() => {
    http.get('/master-data?category=issue_priority').then(({ data }: { data: Record<string, unknown> }) => {
      const list = (data.data || []) as Array<Record<string, unknown>>;
      setPriorityList(list as Array<{key:string;value:string;icon:string;color:string}>);
    http.get('/master-data?category=project_phase').then(({ data }: { data: Record<string, unknown> }) => {
      setPhaseList((data.data || []) as Array<{key:string;value:string}>);
    }).catch(() => {});
    // Project-custom phases override the global defaults
    if (currentProject?.id) {
      http.get(`/projects/${currentProject.id}/phases`).then(({ data }: { data: Record<string, unknown> }) => {
        const list = (data.data || []) as Array<{key:string;value:string}>;
        if (list.length > 0) setPhaseList(list);
      }).catch(() => {});
    }
      const labelMap: Record<string,string> = {};
      const colorMap: Record<string,string> = {};
      list.forEach((p: Record<string, unknown>) => { labelMap[p.key as string] = p.value as string; colorMap[p.key as string] = p.color as string; });
      setPriorityMap(labelMap);
      setPriorityColorMap(colorMap);
    }).catch(()=>{});
  }, []);

const priorityLabel = (p: string) => priorityMap[p] || p;
  const priorityColor = (p: string) => priorityColorMap[p] || 'hsl(var(--ink-muted))';
  const closedStatuses = useMemo(() => {
    if (statusList.length > 0) {
      return statusList.filter(s => ['done', 'cancelled'].includes(s.key)).map(s => s.key);
    }
    return ['done', 'cancelled'];
  }, [statusList]);

  const [issue, setIssue] = useState<IssueData | null>(null);
  const [perms, setPerms] = useState<IssuePermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [panorama, setPanorama] = useState<Record<string, unknown> | null>(null);
  const [panoramaOpen, setPanoramaOpen] = useState(false);

  // ─── AI Review (page-level, SSE streaming) ───
  const [aiResult, setAiResult] = useState<AiReviewResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProgress, setAiProgress] = useState('');

  // ─── Comments ───
  const [comments, setComments] = useState<CommentData[]>([]);
  const [commentSort, setCommentSort] = useState<'time' | 'user'>('time');
  const [commentSortDir, setCommentSortDir] = useState<'asc' | 'desc'>('desc');
  const [newComment, setNewComment] = useState('');
  const [showAddComment, setShowAddComment] = useState(false);
  const [commentCollapsed, setCommentCollapsed] = useState(false);
  const [commentAiText, setCommentAiText] = useState('');
  const [commentAiLoading, setCommentAiLoading] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);

  // IssueEditPanel internal state (inlined)
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState('');

  // ─── Edit form ───
  const [edTitle, setEdTitle] = useState('');
  const [edDesc, setEdDesc] = useState('');
  const [edStatus, setEdStatus] = useState('');
  const [edDueDate, setEdDueDate] = useState('');
  const [edPriority, setEdPriority] = useState('');
  const [edAssignee, setEdAssignee] = useState('');
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [edSecurity, setEdSecurity] = useState('none');
  const [editSprints, setEditSprints] = useState<Array<{id:string; name:string; status:string}>>([]);
  const [edSprint, setEdSprint] = useState('');
  const [edSP, setEdSP] = useState('');
  const [edLabels, setEdLabels] = useState('');
  const [edPhase, setEdPhase] = useState('');
  const [saving, setSaving] = useState(false);

  // ─── Delete ───
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const issueKey = currentProject ? `${currentProject.key}-${issue?.issueNumber || '?'}` : '...';

  // Back returns to the referring page (Board, backlog, search...) instead of
  // always jumping to the issues list; falls back to the list for direct visits.
  const goBack = () => {
    if (from === 'overview') { navigate({ to: '/project-overview' }); return; }
    const ref = document.referrer;
    if (ref && ref.startsWith(window.location.origin)) window.history.back();
    else navigate({ to: '/issues' });
  };
  const isClosed = (currentProject as unknown as Record<string, unknown> | null)?.status === 'closed';
  const t = useT();

  // Load issue + perms + comments
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      issueApi.get(id).then(r => setIssue(r.data.data)),
      issueApi.getPermissions(id).then(r => setPerms(r.data.data)),
      http.get(`/issues/${id}/comments`).then(r => {
        const commentPr = r.data as { data?: { items?: CommentData[] } };
        setComments(commentPr?.data?.items || []);
      }),
    ]).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    issueApi.listMembers().then(({ data: resp }) => setMembers(safeArray(resp.data))).catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    http.get(`/ai/issues/${id}/panorama`).then(({ data }: { data: Record<string, unknown> }) => {
      const p = data as { panorama?: Record<string, unknown> };
      if (p?.panorama) setPanorama(p.panorama as Record<string, unknown>);
    }).catch(() => {});
  }, [id]);

  const sortedComments = useMemo(() => {
    const sorted = [...comments];
    const dir = commentSortDir === 'asc' ? 1 : -1;
    if (commentSort === 'user') {
      sorted.sort((a, b) => a.authorName.localeCompare(b.authorName) * dir);
    } else {
      sorted.sort((a, b) => (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) * dir);
    }
    return sorted;
  }, [comments, commentSort, commentSortDir]);

  const canEdit = perms?.canEditProtected ?? false;
  const canDelete = perms?.canDelete ?? false;
  const showCollapseBtn = comments.length > 5;

  // ─── Open Edit ───
  const openEdit = () => {
    if (!issue) return;
    setEdTitle(issue.title);
    setEdDesc(issue.description || '');
    setEdStatus(issue.status);
    setEdPriority(issue.priority);
    setEdPhase((issue as unknown as Record<string, unknown>).phase as string || '');
    setEdAssignee(issue.assigneeId || '');
    setEdSecurity(issue.securityLevel || 'none');
    setEdSprint(issue.sprintId || 'Backlog');
    const spVal = isScrum ? issue.storyPoints : (issue as unknown as Record<string, unknown>).workload;
    setEdSP(spVal?.toString() || '');
    setEdLabels(issue.labels || '');
    setEdDueDate((issue as unknown as Record<string, unknown>).dueDate as string || '');
    // Load sprints for dropdown
    if (issue.projectId) http.get(`/sprints?projectId=${issue.projectId}`).then((resp) => {
      const sprintsPr = resp.data as { data?: { items?: Array<{id:string; name:string; status:string}> } };
      setEditSprints(sprintsPr?.data?.items || []);
    }).catch(() => {});
    setEditOpen(!editOpen);
    setError('');
  };

  // ─── Save Edit ───
  const handleSave = async () => {
    if (!issue) return;
    if (!edTitle?.trim()) { setError(t.issueDetail.titleRequired); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (!edDesc?.trim()) { setError(t.issueDetail.descRequired); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (!edPriority) { setError(t.issueDetail.priorityRequired); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (!edAssignee) { setError(t.issueDetail.assigneeRequired); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    setSaving(true); setError('');
    try {
      const p: Record<string, unknown> = {};
      if (edTitle !== issue.title) p.title = edTitle;
      if (edDesc !== (issue.description || '')) p.description = edDesc;
      if (edStatus !== issue.status) p.status = edStatus;
      if (edPriority !== issue.priority) p.priority = edPriority;
      const a = edAssignee || undefined;
      if (a !== (issue.assigneeId || undefined)) p.assigneeId = a;
      if (edSprint !== (issue.sprintId || 'Backlog')) p.sprintId = edSprint;
      const sp = edSP ? parseFloat(edSP) : undefined;
      if (sp !== (issue.storyPoints || undefined)) { if (isScrum) p.storyPoints = sp; else (p as Record<string, unknown>).workload = sp; }
      if (edLabels !== (issue.labels || '')) p.labels = edLabels;
      if (edDueDate !== ((issue as unknown as Record<string, unknown>).dueDate || '')) (p as unknown as Record<string, unknown>).dueDate = edDueDate || null;
      if (edSecurity !== (issue.securityLevel || 'none')) p.securityLevel = edSecurity;
      if (edPhase !== ((issue as unknown as Record<string, unknown>).phase || '')) p.phase = edPhase || null;

      const { data: resp } = await issueApi.update(issue.id, p as never);
      setIssue(resp.data); setEditOpen(false);
    } catch (err: unknown) {
      setError(getErrorMessage(err, { errors: { default: t.issueDetail.failedToSave } }));
    } finally { setSaving(false); }
  };

  // ─── Delete ───
  const handleDelete = async () => {
    if (!issue) return;
    setDeleting(true); setError('');
    try { await issueApi.delete(issue.id); navigate({ to: '/issues' }); }
    catch (err: unknown) { setError(getErrorMessage(err, { errors: { default: t.issueDetail.failedToDelete } })); setDeleting(false); setDeleteConfirm(false); }
  };

  // ─── AI Review (SSE streaming, same as Create Issue page) ───
  const aiReviewRef = useRef(false);
  const runAiReview = useCallback(async () => {
    if (!issue || !currentProject) return;
    if (aiReviewRef.current) return; // prevent concurrent requests
    aiReviewRef.current = true;
    setAiLoading(true); setAiResult(null);
    setAiProgress('Searching for similar issues...');
    try {
      const resp = await fetch('/api/v1/ai/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'detail',
          excludeIssueId: issue.id,
          projectId: currentProject.id,
          title: issue.title,
          description: issue.description || '',
          type: issue.type,
          priority: issue.priority,
          assigneeId: issue.assigneeId || undefined,
          storyPoints: issue.storyPoints || undefined,
          lang: useAuthStore.getState().user?.aiLanguage || useLanguageStore.getState().lang || 'en',
          userId: useAuthStore.getState().user?.id || '',
        }),
      });
      if (!resp.ok || !resp.body) { setAiLoading(false); setAiResult({ score: 0, maxScore: 100, verdict: `Error ${resp.status}`, notes: [], suggestions: [] }); return; }

      const reader = resp.body.getReader();
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
            const d = JSON.parse(line.slice(6));
            if (pendingEvent === 'progress') setAiProgress(d.text || '');
            if (pendingEvent === 'result') { setAiResult(d as unknown as AiReviewResult); setAiLoading(false); setAiProgress(''); }
            if (pendingEvent === 'error') { setAiResult({ score:0, maxScore:100, verdict:'Error', notes:[], suggestions:[], error:d.code ? getLlmErrorMessage(d.code, t.app) : (d.message || '') } as unknown as AiReviewResult); setAiLoading(false); setAiProgress(''); }
            pendingEvent = '';
          }
        }
      }
    } catch { // Log error to monitoring service when available
      setAiResult({ score: 0, maxScore: 100, verdict: t.issueDetail.aiReviewNotAvailable, notes: [], suggestions: [] });
    } finally { setAiLoading(false); setAiProgress(''); aiReviewRef.current = false; }
    // t (useT) is stable — no need to add to deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue, currentProject]);

  // Auto-trigger AI Review for open issues (skip closed)
  useEffect(() => {
    if (!issue || !currentProject) return;
    if (closedStatuses.includes(issue.status)) return;
    runAiReview();
    // closedStatuses is stable — adding would re-trigger on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue, currentProject, runAiReview]);

  // ─── Add Comment ───
  const handleAddComment = async (body: string) => {
    if (!id) return;
    try {
      await http.post(`/issues/${id}/comments`, { body });
      const { data: resp } = await http.get(`/issues/${id}/comments`);
      const commentPr = resp as { data?: { items?: CommentData[] } };
      setComments(commentPr?.data?.items || []);
      setNewComment(''); setCommentAiText(''); setShowAddComment(false);
    } catch { /* noop */ }
  };

  // ─── AI Optimize Comment ───
  const handleCommentAi = async () => {
    if (!newComment.trim()) return;
    setCommentAiLoading(true);
    try {
      const { data: resp } = await http.post('/ai/optimize-comment', { text: newComment, lang: useAuthStore.getState().user?.aiLanguage || useLanguageStore.getState().lang || 'en' });
      const optimized = (resp as { optimized?: string }).optimized;
      // Only claim "replaced" when we actually got a rewrite back
      if (typeof optimized === 'string' && optimized.trim() && optimized !== newComment) {
        const original = newComment;
        setNewComment(optimized);
        setCommentAiText(original); // store original for revert
      }
    } catch { /* noop */ } finally { setCommentAiLoading(false); }
  };

  // ─── Loading ───
  if (loading) return <div><div className="ch"><h2 className="text-base font-semibold text-ink-primary">{t.issueDetail.loading}</h2></div></div>;
  if (!issue) return (
    <div>
      <div className="ch"><div className="flex items-center gap-3"><button className="btn-ghost" onClick={goBack}>&larr; {t.issueDetail.back}</button><h2 className="text-base font-semibold text-ink-primary">{t.issueDetail.notFound}</h2></div></div>
    </div>
  );

  return (
    <div>
      {/* ═══ HEADER ═══ */}
      <div className="ch">
        <div className="flex items-center gap-3">
          <button className="btn-ghost" onClick={goBack}>&larr; {t.issueDetail.back}</button>
          <h2 className="text-base font-semibold text-ink-primary">{issueKey}</h2>
          <span className="text-sm text-ink-muted truncate max-w-xs">{issue.title}</span>
          <span className="badge" style={{ background: priorityColor(issue.priority) + '20', color: priorityColor(issue.priority) }}>{priorityLabel(issue.priority)}</span>
        </div>
        <div className="flex gap-2">
          {!isClosed && <button className="btn-brand" onClick={() => navigate({ to: '/issues/new' })}>{t.issueDetail.newIssue}</button>}
          {!isClosed && <button className="btn-secondary" onClick={() => {
            const params = new URLSearchParams();
            if (issue.title) params.set('title', issue.title);
            if (issue.description) params.set('description', issue.description);
            if (issue.priority) params.set('priority', issue.priority);
            navigate({ to: `/issues/new?${params.toString()}` } as { to: string });
          }}>📋 {t.issueDetail.copy}</button>}
          {!isClosed && <button className="btn-secondary" onClick={openEdit}>{editOpen ? `✕ ${t.issueDetail.closeEdit}` : `✏ ${t.issueDetail.edit}`}</button>}
          {!isClosed && canDelete && (deleteConfirm ? (
            <div className="flex gap-1 items-center">
              <span className="text-xs text-danger font-semibold">{t.issueDetail.deleteConfirm}</span>
              <button className="btn-danger btn-xs" onClick={handleDelete} disabled={deleting}>{t.issueDetail.yes}</button>
              <button className="btn-secondary btn-xs" onClick={() => setDeleteConfirm(false)}>{t.issueDetail.no}</button>
            </div>
          ) : (
            <button className="btn-danger" onClick={() => setDeleteConfirm(true)}>🗑 {t.issueDetail.delete}</button>
          ))}
        </div>
      </div>
      {/* Status Tracker */}
      <div className="px-6 pt-2">
        <StatusTracker currentStatus={editOpen ? (edStatus || issue.status) : issue.status}
          interactive={editOpen}
          onChangeStatus={setEdStatus}
          statusList={statusList} />
      </div>

      {error && <div className="mx-6 mt-4 card bg-danger-soft text-danger p-3 text-sm">{error}</div>}

      {/* AI Panorama */}
      {panorama && (panorama.complexity_score as number) >= 0.20 && (
        <div className="mx-6 mt-4 card">
          <div className="card-hd flex items-center justify-between cursor-pointer"
            onClick={() => setPanoramaOpen(!panoramaOpen)}>
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-main flex items-center gap-1.5">
              {'\u{1F9E0}'} AI Panorama
            </span>
            <div className="flex items-center gap-3">
              <span className="text-[0.65rem] text-ink-muted">
                Complexity: <b className="text-brand-main">{Math.round((panorama.complexity_score as number) * 100)}%</b>
              </span>
              <span className="text-[0.6rem] text-ink-muted">{panoramaOpen ? '▲' : '▼'}</span>
            </div>
          </div>
          {panoramaOpen && (
            <div className="card-bd p-3">
              <div className="grid grid-cols-4 gap-3 mb-3">
                <div className="text-center p-2 bg-surface-hover rounded-card">
                  <div className="text-lg font-bold text-brand-main">{panorama.comment_count as number}</div>
                  <div className="text-[0.6rem] text-ink-muted">Comments</div>
                </div>
                <div className="text-center p-2 bg-surface-hover rounded-card">
                  <div className="text-lg font-bold text-ink-primary">{panorama.age_days as number}d</div>
                  <div className="text-[0.6rem] text-ink-muted">Age</div>
                </div>
                <div className="text-center p-2 bg-surface-hover rounded-card">
                  <div className="text-lg font-bold text-ink-primary">{panorama.priority as string}</div>
                  <div className="text-[0.6rem] text-ink-muted">Priority</div>
                </div>
                <div className="text-center p-2 bg-surface-hover rounded-card">
                  <div className="text-sm font-bold text-ink-primary truncate">{panorama.assignee_name as string || '—'}</div>
                  <div className="text-[0.6rem] text-ink-muted">Assignee</div>
                </div>
              </div>
              {/* Complexity progress */}
              <div className="progress mb-1" style={{ height: '4px' }}>
                <div className="progress-bar brand" style={{
                  width: `${Math.round((panorama.complexity_score as number) * 100)}%`,
                  transition: 'width 0.5s'
                }} />
              </div>
              <span className="text-[0.55rem] text-ink-muted">
                {(panorama.complexity_score as number) < 0.40 ? 'Basic metrics' : 'Full panorama analysis'}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="mx-6 mt-4">
        {issue.status === 'done' || issue.status === 'cancelled' ? (
          <div className="card">
            <div className="card-hd flex items-center gap-2">
              <span className="text-sm font-semibold text-ink-muted">{'\u{1F916}'} {t.issueDetail.aiReview}</span>
            </div>
            <div className="card-bd p-3 text-sm text-ink-muted">
              {t.issueDetail.aiReviewNotAvailable}
            </div>
          </div>
        ) : (
          <AiReviewPanel
            review={aiResult}
            loading={aiLoading}
            progress={aiProgress}
            onViewSimilarIssue={(issueId) => navigate({ to: `/issues/${issueId}` } as { to: string })}
          />
        )}
      </div>

      {/* ═══ CONTENT ═══ */}
      <div className="p-6" style={{ maxWidth: '1100px' }}>
        {/* ── Edit Panel ── */}
        {editOpen && (
          <div className="card mb-4">
            <div className="card-hd flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink-primary">{t.issueDetail.editTitle}</h3>
              <span className="text-xs text-ink-muted">
                {canEdit
                  ? `✅ ${t.issueDetail.fullAccess}`
                  : `\u{1F512} ${t.issueDetail.protectedLocked}`}
              </span>
            </div>
            <div className="card-bd p-4">
              <div className="mb-4">
                <div className="form-grp">
                  <label className="form-label">
                    {t.issueDetail.title} {!canEdit && '\u{1F512}'}
                  </label>
                  <input
                    className="form-input"
                    value={edTitle}
                    onChange={(e) => setEdTitle(e.target.value)}
                    disabled={!canEdit}
                  />
                </div>
              </div>
              <div className="form-grp mb-4">
                <label className="form-label">
                  {t.issueDetail.description} {!canEdit && '\u{1F512}'}
                </label>
                <MarkdownEditor value={edDesc} onChange={setEdDesc} readOnly={!canEdit} height="300px" />
              </div>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="form-grp">
                  <label className="form-label">
                    {t.issueDetail.priority} {!canEdit && '\u{1F512}'}
                  </label>
                  <select
                    className="form-select"
                    value={edPriority}
                    onChange={(e) => setEdPriority(e.target.value)}
                    disabled={!canEdit}
                  >
                    {priorityList.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.value}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-grp">
                  <label className="form-label">{t.issueDetail.phase}</label>
                  <select
                    className="form-select"
                    value={edPhase}
                    onChange={(e) => setEdPhase(e.target.value)}
                    disabled={!canEdit}
                  >
                    <option value="">—</option>
                    {phaseList.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.value}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-grp">
                  <label className="form-label">{t.issueDetail.assignee}</label>
                  <div className="relative">
                    <input
                      className="form-input w-full"
                      style={{ padding: '6px 10px' }}
                      placeholder={t.issueDetail.searchMembers}
                      value={assigneeSearch}
                      onChange={(e) => {
                        setAssigneeSearch(e.target.value);
                        setAssigneeOpen(true);
                      }}
                      onFocus={() => setAssigneeOpen(true)}
                      onBlur={() => setTimeout(() => setAssigneeOpen(false), 150)}
                    />
                    {assigneeOpen &&
                      (() => {
                        const term = assigneeSearch.toLowerCase();
                        const filtered = members.filter(
                          (m) =>
                            !term ||
                            m.displayName.toLowerCase().includes(term) ||
                            m.email.toLowerCase().includes(term),
                        );
                        return (
                          <div
                            className="absolute left-0 top-full mt-0.5 z-20 card w-full max-h-40 overflow-y-auto shadow-dialog p-1"
                          >
                            <button
                              className="w-full text-left px-2 py-1.5 text-xs text-ink-muted hover:bg-surface-hover rounded transition-colors"
                              onMouseDown={() => {
                                setEdAssignee('');
                                setAssigneeSearch('');
                                setAssigneeOpen(false);
                              }}
                            >
                              {t.issueDetail.unassigned}
                            </button>
                            {filtered.map((m) => (
                              <button
                                key={m.id}
                                className="w-full text-left px-2 py-1.5 text-xs text-ink-primary hover:bg-surface-hover rounded transition-colors"
                                onMouseDown={() => {
                                  setEdAssignee(m.id);
                                  setAssigneeSearch(m.displayName);
                                  setAssigneeOpen(false);
                                }}
                              >
                                {m.displayName}{' '}
                                <span className="text-ink-muted ml-1">{m.email}</span>
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                  </div>
                </div>
                <div className="form-grp">
                  <label className="form-label">{t.issueDetail.security}</label>
                  <select
                    className="form-select"
                    value={edSecurity}
                    onChange={(e) => setEdSecurity(e.target.value)}
                  >
                    <option value="none">None (public)</option>
                    <option value="internal">Internal</option>
                    <option value="confidential">Confidential</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4 mb-4">
                {isScrum && (
                  <div className="form-grp">
                    <label className="form-label">{t.issueDetail.sprint}</label>
                    <select
                      className="form-select"
                      value={edSprint}
                      onChange={(e) => setEdSprint(e.target.value)}
                    >
                      <option value="">{t.issueDetail.backlog}</option>
                      {editSprints.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.status})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="form-grp">
                  <label className="form-label">
                    {isScrum ? t.issueDetail.storyPoints : t.issueDetail.workload}
                  </label>
                  {isScrum ? (
                    <EstimationScalePicker
                      value={edSP ? parseFloat(edSP) : null}
                      onChange={(v) => setEdSP(v !== null ? String(v) : '')}
                    />
                  ) : (
                    <input
                      className="form-input"
                      type="number"
                      value={edSP}
                      onChange={(e) => setEdSP(e.target.value)}
                    />
                  )}
                </div>
                <div className="form-grp">
                  <label className="form-label">{t.issueDetail.dueDate}</label>
                  <input
                    type="date"
                    className="form-input"
                    style={{ padding: '6px 10px' }}
                    value={edDueDate}
                    onChange={(e) => setEdDueDate(e.target.value)}
                    disabled={!canEdit}
                  />
                </div>
                <div className="form-grp">
                  <label className="form-label">{t.issueDetail.labels}</label>
                  <input
                    className="form-input"
                    value={edLabels}
                    onChange={(e) => setEdLabels(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-4 border-t border-edge justify-end">
                <button className="btn-brand" onClick={handleSave} disabled={saving}>
                  {saving ? t.issueDetail.saving : t.issueDetail.saveChanges}
                </button>
                <button className="btn-secondary" onClick={() => setEditOpen(false)}>
                  {t.issueDetail.cancel}
                </button>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '24px' }}>
          {/* ── Left ── */}
          <div>
            {/* Description — hide when editing */}
            {!editOpen && (issue.description ? (
              <div className="card mb-4"><div className="card-hd"><h3 className="text-sm font-semibold text-ink-primary">{t.issueDetail.description}</h3></div><div className="card-bd text-sm leading-relaxed whitespace-pre-wrap">{issue.description}</div></div>
            ) : <div className="card mb-4"><div className="card-bd p-6 text-center text-sm text-ink-muted">{t.issueDetail.noDescription}</div></div>)}

            <CommentSection
              issueId={id}
              comments={comments}
              commentSort={commentSort}
              setCommentSort={setCommentSort}
              commentSortDir={commentSortDir}
              setCommentSortDir={setCommentSortDir}
              newComment={newComment}
              setNewComment={setNewComment}
              showAddComment={showAddComment}
              setShowAddComment={setShowAddComment}
              commentCollapsed={commentCollapsed}
              setCommentCollapsed={setCommentCollapsed}
              commentAiText={commentAiText}
              setCommentAiText={setCommentAiText}
              commentAiLoading={commentAiLoading}
              showEmoji={showEmoji}
              setShowEmoji={setShowEmoji}
              showCollapseBtn={showCollapseBtn}
              sortedComments={sortedComments}
              isClosed={isClosed}
              onAddComment={handleAddComment}
              onAiOptimize={handleCommentAi}
            />
          </div>

          {!editOpen && (
            <div className="card mb-4">
              <div className="card-hd">
                <h3 className="text-sm font-semibold text-ink-primary">
                  {t.issueDetail.details}
                </h3>
              </div>
              <div className="card-bd" style={{ padding: '12px 14px' }}>
                <SideItem
                  label={t.issueDetail.assignee}
                  value={issue.assigneeName || issue.assigneeId || t.issueDetail.unassigned}
                />
                <SideItem label={t.issueDetail.priority}>
                  <span
                    className="badge"
                    style={{
                      background: priorityColor(issue.priority) + '20',
                      color: priorityColor(issue.priority),
                    }}
                  >
                    {priorityLabel(issue.priority)}
                  </span>
                </SideItem>
                <SideItem
                  label={isScrum ? t.issueDetail.storyPoints : t.issueDetail.workload}
                  value={issue.storyPoints?.toString() || '—'}
                  className="font-semibold"
                />
                <SideItem
                  label={t.issueDetail.dueDate}
                  value={
                    (issue as unknown as Record<string, unknown>).dueDate
                      ? new Date((issue as unknown as Record<string, unknown>).dueDate as string).toLocaleDateString()
                      : '—'
                  }
                />
                {isScrum && (
                  <SideItem
                    label={t.issueDetail.sprint}
                    value={issue.sprintId || t.issueDetail.backlog}
                  />
                )}
                <SideItem
                  label={t.issueDetail.security}
                  value={issue.securityLevel || t.issueDetail.none}
                />
                <SideItem
                  label={t.issueDetail.created}
                  value={new Date(issue.createdAt).toLocaleDateString()}
                  className="text-xs text-ink-muted"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
