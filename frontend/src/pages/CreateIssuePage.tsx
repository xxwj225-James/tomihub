import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useProjectStore } from '@/stores/projectStore';
import { useAuthStore } from '@/stores/authStore';
import { issueApi, type AiReviewResult, type MemberInfo } from '@/api/issueApi';
import { safeArray } from '@/lib/cn';
import { useLanguageStore } from '@/stores/languageStore';
import { getErrorMessage, getLlmErrorMessage } from '@/lib/errors';
import { useT } from '@/i18n/useT';
import http from '@/lib/http';
import { CreateIssueForm } from '@/components/issue/CreateIssueForm';

export function CreateIssuePage() {
  const navigate = useNavigate();
  const { currentProject } = useProjectStore();
  const reset = useProjectStore((s) => s.reset);
  const t = useT();
  // Uncontrolled title/desc — refs for reading, NO state updates during typing
  const titleRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const getTitle = () => titleRef.current?.value || title || '';
  const getDesc = () => description || '';

  // AI assignee suggestion — triggered manually when user focuses the Assignee dropdown
  const triggerAiSuggest = async () => {
    const t = getTitle().trim();
    if (!t || !projectId) return;
    setSuggestLoading(true);
    try {
      const token = useAuthStore.getState().accessToken;
      const resp = await fetch('/api/v1/ai/suggest-assignee', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
        body: JSON.stringify({ title: t, description: getDesc(), type: type.toLowerCase(), projectId }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setSuggestedAssignees(data.suggestions || []);
      }
    } catch { /* Suggest assignees fetch failure — graceful fallback */ } finally { setSuggestLoading(false); }
  };
  const [type, setType] = useState<string>('Task');
  const [priority, setPriority] = useState<string>('');
  const [assignee, setAssignee] = useState<string>('');
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [storyPoints, setStoryPoints] = useState('');
  const [sprint, setSprint] = useState<string>('');
  const [parentIssue, setParentIssue] = useState('');
  const [securityLevel, setSecurityLevel] = useState<string>('None (public)');
  const [labels, setLabels] = useState('');
  const [logs, setLogs] = useState('');
  const [attachments, setAttachments] = useState<Array<{url: string; originalName: string; size: string}>>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [suggestedAssignees, setSuggestedAssignees] = useState<Array<{userId: string; name: string; confidence: number; reason: string}>>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [aiReviewResult, setAiReviewResult] = useState<AiReviewResult | null>(null);
  const [aiReviewLoading, setAiReviewLoading] = useState(false);
  const [aiReviewProgress, setAiReviewProgress] = useState('');
  const [genPrompt, setGenPrompt] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiPanel, setAiPanel] = useState<'generate' | 'review' | null>(null);
  const [status, setStatus] = useState('');
  const [statusList, setStatusList] = useState<Array<{key:string;value:string;color:string}>>([]);
  const [dueDate, setDueDate] = useState('');

  // Read project methodology from settings (set at project creation time)
  const projectMethodology = (() => {
    try { return JSON.parse(currentProject?.settings || '{}').methodology || ''; }
    catch { return ''; }
  })();
  const isWaterfall = projectMethodology === 'waterfall';
  const isScrum = projectMethodology === 'scrum';

  const [sprints, setSprints] = useState<Array<{id:string; name:string; status:string}>>([]);
  const [wfDropdown, setWfDropdown] = useState('');
  const [wfStates, setWfStates] = useState<string[]>([]);

  const projectId = currentProject?.id || '';

  useEffect(() => {
    http.get(`/master-data?category=issue_status&methodology=${projectMethodology}`).then(({ data }: { data: Record<string, unknown> }) => {
      setStatusList(data.data as Array<{key:string;value:string;color:string}> || []);
    }).catch(()=>{});
    // Waterfall: load workflow states for the dropdown
    if (projectMethodology === 'waterfall') {
      http.get('/workflows').then(({ data }: { data: Record<string, unknown> }) => {
        const list = (data.data || []) as Array<Record<string, unknown>>;
        const wf = list.find((w: Record<string, unknown>) => (w.name as string).toLowerCase().includes('waterfall'));
        if (wf?.states) {
          try { const states = JSON.parse(wf.states as string); setWfStates(states); setWfDropdown(states[0] || ''); }
          catch { setWfStates([]); }
        }
      }).catch(()=>{});
    }
    if (projectId) {
      http.get(`/sprints?projectId=${projectId}`).then((resp) => {
        const sprintsPr = resp.data as { data?: { items?: Array<{id:string; name:string; status:string}> } };
        setSprints(sprintsPr?.data?.items || []);
      }).catch(()=>{});
    }
  }, [projectId, projectMethodology]);

  // Pre-fill from copy URL params (intentional: only run on mount)
  const search = useSearch({ strict: false }) as Record<string, string>;
  useEffect(() => {
    if (search.title) { setTitle(search.title); if (titleRef.current) titleRef.current.value = search.title; }
    if (search.description) { setDescription(search.description); if (descRef.current) descRef.current.value = search.description; }
    if (search.priority) {
      // URL params use lowercase (from DB), dropdown uses capitalized — normalize
      const p = search.priority;
      setPriority(p.charAt(0).toUpperCase() + p.slice(1));
    }
    if (search.dueDate) setDueDate(search.dueDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch project members for assignee dropdown
  useEffect(() => {
    if (!projectId) return;
    issueApi.listMembers().then(({ data: resp }) => setMembers(safeArray(resp.data))).catch(() => {});
  }, [projectId]);

  useEffect(() => { return () => reset(); }, [reset]);


  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const token = useAuthStore.getState().accessToken;
      const resp = await fetch('/api/v1/files/upload', {
        method: 'POST', headers: { ...(token && { Authorization: `Bearer ${token}` }) },
        body: formData,
      });
      const data = await resp.json();
      if (data.code === 0 && data.data) {
        setAttachments(prev => [...prev, data.data]);
      }
    } catch { /* Upload failure — non-critical, input reset still proceeds */ } finally { setUploading(false); }
    e.target.value = ''; // reset input
  };

  const removeAttachment = (idx: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  const handleCreate = async () => {
    const curTitle = getTitle();
    const curDesc = getDesc();
    if (!projectId) { setError(t.createIssue.noProject); return; }
    if (!curTitle.trim()) { setError(t.createIssue.titleRequired); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (!curDesc.trim()) { setError(t.createIssue.descRequired); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (!priority) { setError(t.createIssue.priorityRequired); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (!assignee) { setError(t.createIssue.assigneeRequired); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const currentStatus = status || statusList[0]?.key || '';
    const isNonBacklog = currentStatus && !currentStatus.toLowerCase().includes('backlog');
    if (isNonBacklog && !dueDate) { setError(t.createIssue.dueDateRequired); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    setError(''); setLoading(true);
    try {
      await issueApi.create({
        projectId,
        title: curTitle,
        description: attachments.length > 0
          ? (curDesc || '') + '\n\n## Attachments\n' + attachments.map(a => `- [${a.originalName}](${a.url})`).join('\n')
          : curDesc || undefined,
        type: type.toLowerCase(),
        priority: priority.toLowerCase(),
        assigneeId: assignee || undefined,
        ...(isScrum ? { storyPoints: storyPoints ? parseFloat(storyPoints) : undefined } : { workload: storyPoints ? parseFloat(storyPoints) : undefined }),
        sprintId: sprint || undefined,
        parentId: parentIssue || undefined,
        labels: labels || undefined,
        securityLevel: securityLevel !== 'None (public)' ? securityLevel.toLowerCase() : undefined,
        dueDate: dueDate || undefined,
      });
      navigate({ to: '/issues' });
    } catch (err: unknown) {
      setError(getErrorMessage(err, { errors: { default: t.createIssue.errorCreateFailed } }));
    } finally { setLoading(false); }
  };

  const handleAiGenerate = async () => {
    if (!genPrompt.trim()) return;
    setGenLoading(true); setAiError('');
    try {
      const { data: resp } = await issueApi.generateDescription(genPrompt.trim(), getDesc());
      if (resp.data?.description) {
        setDescription(resp.data.description);
        if (descRef.current) descRef.current.value = resp.data.description;
      }
      setAiPanel(null);
      setGenPrompt('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAiError(msg || 'AI Generate failed. Check LLM config in Settings → AI Models.');
    } finally { setGenLoading(false); }
  };

  const handleAiReview = async () => {
    if (!projectId) return;
    setAiReviewLoading(true); setAiReviewResult(null); setAiError(''); setAiReviewProgress('Searching for similar issues...');
    try {
      const resp = await fetch('/api/v1/ai/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId, title: getTitle() || 'Untitled', description: getDesc() || '',
          type, priority, logs, assigneeId: assignee || undefined,
          lang: useAuthStore.getState().user?.aiLanguage || useLanguageStore.getState().lang || 'en',
          userId: useAuthStore.getState().user?.id || '',
          ...(isScrum ? { storyPoints: storyPoints ? parseFloat(storyPoints) : undefined } : { workload: storyPoints ? parseFloat(storyPoints) : undefined }),
        }),
      });
      if (!resp.ok || !resp.body) { setAiReviewLoading(false); return; }

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
            if (pendingEvent === 'progress') setAiReviewProgress(d.text || '');
            if (pendingEvent === 'result') { setAiReviewResult(d as unknown as AiReviewResult); setAiReviewLoading(false); setAiReviewProgress(''); }
            if (pendingEvent === 'error') { setAiReviewResult({ score:0, maxScore:100, verdict:'Error', notes:[], suggestions:[], error:d.code ? getLlmErrorMessage(d.code, t.app) : (d.message || '') } as unknown as AiReviewResult); setAiReviewLoading(false); setAiReviewProgress(''); }
            pendingEvent = '';
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAiError(msg || t.createIssue.errorAiUnavailable);
      setAiReviewResult({ score: 0, maxScore: 100, verdict: 'Review unavailable', notes: [], suggestions: [] });
    } finally { setAiReviewLoading(false); setAiReviewProgress(''); }
  };

  return (
    <div>
      {/* ═══ HEADER ═══ */}
      <div className="ch">
        <div className="flex items-center gap-3">
          <button className="btn-ghost text-xs" onClick={() => navigate({ to: '/issues' })}>
            &larr; {t.createIssue.backToIssues}
          </button>
          <h2 className="text-base font-semibold text-ink-primary">{t.createIssue.title}</h2>
          {currentProject && (
            <span className="text-xs text-ink-muted">{currentProject.name} ({currentProject.key})</span>
          )}
        </div>
      </div>

      {/* ═══ FORM ═══ */}
      <div className="p-6" style={{ maxWidth: '900px' }}>
        <CreateIssueForm
          type={type} setType={setType}
          title={title} setTitle={setTitle} titleRef={titleRef}
          description={description} setDescription={setDescription} descRef={descRef}
          priority={priority} setPriority={setPriority}
          storyPoints={storyPoints} setStoryPoints={setStoryPoints}
          assignee={assignee} setAssignee={setAssignee}
          members={members}
          suggestedAssignees={suggestedAssignees}
          suggestLoading={suggestLoading}
          onTriggerAiSuggest={triggerAiSuggest}
          sprint={sprint} setSprint={setSprint}
          parentIssue={parentIssue} setParentIssue={setParentIssue}
          securityLevel={securityLevel} setSecurityLevel={setSecurityLevel}
          labels={labels} setLabels={setLabels}
          isScrum={isScrum}
          isWaterfall={isWaterfall}
          sprints={sprints}
          wfStates={wfStates} wfDropdown={wfDropdown} setWfDropdown={setWfDropdown}
          status={status} setStatus={setStatus}
          statusList={statusList}
          dueDate={dueDate} setDueDate={setDueDate}
          attachments={attachments}
          uploading={uploading}
          onUpload={handleUpload}
          onRemoveAttachment={removeAttachment}
          logs={logs} setLogs={setLogs}
          loading={loading} error={error}
          onSubmit={handleCreate}
          onCancel={() => navigate({ to: '/issues' })}
          aiPanel={aiPanel} setAiPanel={setAiPanel}
          aiError={aiError} setAiError={setAiError}
          genPrompt={genPrompt} setGenPrompt={setGenPrompt}
          genLoading={genLoading}
          onAiGenerate={handleAiGenerate}
          onAiReview={handleAiReview}
          aiReviewResult={aiReviewResult} aiReviewLoading={aiReviewLoading} aiReviewProgress={aiReviewProgress}
        />
      </div>
    </div>
  );
}
