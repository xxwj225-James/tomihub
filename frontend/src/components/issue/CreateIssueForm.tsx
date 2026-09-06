import { memo } from 'react';
import { useT } from '@/i18n/useT';
import type { AiReviewResult, MemberInfo } from '@/api/issueApi';
import { cn } from '@/lib/cn';
import { StatusTracker } from '@/components/StatusTracker';
import { EstimationScalePicker } from '@/components/estimation/EstimationScalePicker';
import { AiReviewPanel } from '@/components/issue/AiReviewPanel';
import { MarkdownEditor } from '@/components/MarkdownEditor';

const ISSUE_TYPES = ['Bug', 'Task', 'Story', 'Epic'] as const;
const PRIORITIES = ['Medium', 'Critical', 'High', 'Low'] as const;
const SECURITY_LEVELS = ['None (public)', 'Internal', 'Confidential'];

interface CreateIssueFormProps {
  type: string; setType: (v: string) => void;
  title: string; setTitle: (v: string) => void;
  titleRef: React.RefObject<HTMLInputElement | null>;
  description: string; setDescription: (v: string) => void;
  descRef: React.RefObject<HTMLTextAreaElement | null>;
  priority: string; setPriority: (v: string) => void;
  storyPoints: string; setStoryPoints: (v: string) => void;
  assignee: string; setAssignee: (v: string) => void;
  members: MemberInfo[];
  suggestedAssignees: Array<{userId: string; name: string; confidence: number; reason: string}>;
  suggestLoading: boolean;
  onTriggerAiSuggest: () => void;
  sprint: string; setSprint: (v: string) => void;
  parentIssue: string; setParentIssue: (v: string) => void;
  securityLevel: string; setSecurityLevel: (v: string) => void;
  labels: string; setLabels: (v: string) => void;
  isScrum: boolean;
  isWaterfall: boolean;
  sprints: Array<{id: string; name: string; status: string}>;
  wfStates: string[];
  wfDropdown: string; setWfDropdown: (v: string) => void;
  status: string; setStatus: (v: string) => void;
  statusList: Array<{key: string; value: string; color: string}>;
  dueDate: string; setDueDate: (v: string) => void;
  attachments: Array<{url: string; originalName: string; size: string}>;
  uploading: boolean;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveAttachment: (idx: number) => void;
  logs: string; setLogs: (v: string) => void;
  loading: boolean;
  error: string;
  onSubmit: () => void;
  onCancel: () => void;
  aiPanel: 'generate' | 'review' | null;
  setAiPanel: (v: 'generate' | 'review' | null) => void;
  aiError: string;
  setAiError: (v: string) => void;
  genPrompt: string; setGenPrompt: (v: string) => void;
  genLoading: boolean;
  onAiGenerate: () => void;
  onAiReview: () => void;
  aiReviewResult: AiReviewResult | null;
  aiReviewLoading: boolean;
  aiReviewProgress: string;
}

// Individual memoized field — AI suggestions only affect this, not the whole row
const AssigneeField = memo(function AssigneeField_(props: {
  assignee: string; setAssignee: (v: string) => void;
  members: MemberInfo[];
  suggestedAssignees: Array<{userId:string; name:string; confidence:number; reason:string}>;
  suggestLoading: boolean;
  onFocus?: () => void;
}) {
  const { assignee, setAssignee, members, suggestedAssignees, suggestLoading } = props;
  const t = useT();
  return (
    <div className="flex-1 form-grp">
      <label className="form-label">{t.createIssue.assignee}</label>
      {suggestLoading && <span className="text-[0.6rem] text-ink-muted ml-2">🤖 {t.createIssue.aiThinking}</span>}
      {suggestedAssignees.length > 0 && !assignee && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {suggestedAssignees.map(s => (
            <button key={s.userId} className="text-[0.65rem] px-2 py-0.5 rounded-full bg-brand-soft/40 text-brand-main cursor-pointer hover:bg-brand-soft border border-brand-soft/30"
              onClick={() => setAssignee(s.userId)}
              title={s.reason}>
              🤖 {s.name} ({Math.round(s.confidence * 100)}%)
            </button>
          ))}
        </div>
      )}
      <select className="form-select text-sm" style={{ padding: '10px 14px' }}
        value={assignee} onChange={e => setAssignee(e.target.value)}
        onFocus={props.onFocus}>
        <option value="">{t.createIssue.unassigned}</option>
        {members.map(m => <option key={m.id} value={m.id}>{m.displayName}</option>)}
      </select>
    </div>
  );
});

// Memoized: fields that never change during typing — no suggestedAssignees dependency
const Row2Fields = memo(function Row2Fields_(props: {
  priority: string; setPriority: (v: string) => void;
  storyPoints: string; setStoryPoints: (v: string) => void;
  isScrum: boolean;
  dueDate: string; setDueDate: (v: string) => void;
  showDueDateRequired: boolean;
}) {
  const { priority, setPriority, storyPoints, setStoryPoints, isScrum, dueDate, setDueDate, showDueDateRequired } = props;
  const t = useT();
  return (
    <>
      <div className="flex-1 form-grp">
        <label className="form-label">{t.createIssue.priority}</label>
        <select className="form-select text-sm" style={{ padding: '10px 14px' }}
          value={priority} onChange={e => setPriority(e.target.value)}>
          <option value="">{t.createIssue.selectPriority}</option>
          {PRIORITIES.map(p => <option key={p}>{p}</option>)}
        </select>
      </div>
      <div className="flex-1 form-grp">
        <label className="form-label">{isScrum ? t.createIssue.storyPoints : t.createIssue.workload}</label>
        {isScrum ? (
          <EstimationScalePicker
            value={storyPoints ? parseFloat(storyPoints) : null}
            onChange={v => setStoryPoints(v !== null ? String(v) : '')}
          />
        ) : (
          <input className="form-input text-sm" type="number" min="1" max="100"
            style={{ padding: '10px 14px' }}
            placeholder={t.createIssue.estimate}
            value={storyPoints} onChange={e => setStoryPoints(e.target.value)} />
        )}
      </div>
      <div className="flex-1 form-grp">
        <label className="form-label">{t.createIssue.dueDate} {showDueDateRequired && <span className="text-danger">*</span>}</label>
        <input type="date" className="form-input text-sm" style={{ padding: '10px 14px' }}
          value={dueDate} onChange={e => setDueDate(e.target.value)} />
      </div>
    </>
  );
});

// Memoized Row 3 — Sprint + Parent + Security
const Row3Fields = memo(function Row3Fields_(props: {
  sprint: string; setSprint: (v: string) => void;
  parentIssue: string; setParentIssue: (v: string) => void;
  securityLevel: string; setSecurityLevel: (v: string) => void;
  labels: string; setLabels: (v: string) => void;
  isScrum: boolean;
  sprints: Array<{id:string; name:string; status:string}>;
}) {
  const { sprint, setSprint, parentIssue, setParentIssue, securityLevel, setSecurityLevel, labels, setLabels, isScrum, sprints } = props;
  const t = useT();
  return (
    <>
      <div className="flex gap-3 mb-4">
        {isScrum && (
          <div className="flex-1 form-grp">
            <label className="form-label">{t.createIssue.sprint}</label>
            <select className="form-select text-sm" style={{ padding: '10px 14px' }}
              value={sprint} onChange={e => setSprint(e.target.value)}>
              <option value="">{t.createIssue.backlog}</option>
              {sprints.map(s => <option key={s.id} value={s.id}>{s.name} ({s.status})</option>)}
            </select>
          </div>
        )}
        <div className="flex-1 form-grp">
          <label className="form-label">{t.createIssue.parentIssue}</label>
          <input className="form-input text-sm" style={{ padding: '10px 14px' }}
            placeholder={t.createIssue.parentPlaceholder}
            value={parentIssue} onChange={e => setParentIssue(e.target.value)} />
        </div>
        <div className="flex-1 form-grp">
          <label className="form-label">{t.createIssue.securityLevel}</label>
          <select className="form-select text-sm" style={{ padding: '10px 14px' }}
            value={securityLevel} onChange={e => setSecurityLevel(e.target.value)}>
            {SECURITY_LEVELS.map(sl => <option key={sl}>{sl}</option>)}
          </select>
        </div>
      </div>
      <div className="form-grp">
        <label className="form-label">{t.createIssue.labels}</label>
        <input className="form-input text-sm" style={{ padding: '10px 14px' }}
          placeholder={t.createIssue.labelsPlaceholder}
          value={labels} onChange={e => setLabels(e.target.value)} />
      </div>
    </>
  );
});

export function CreateIssueForm(props: CreateIssueFormProps) {
  const t = useT();
  const {
    type, setType,
    title, setTitle, titleRef,
    description, setDescription,
    priority, setPriority,
    storyPoints, setStoryPoints,
    assignee, setAssignee,
    members, suggestedAssignees, suggestLoading, onTriggerAiSuggest,
    sprint, setSprint,
    parentIssue, setParentIssue,
    securityLevel, setSecurityLevel,
    labels, setLabels,
    isScrum, isWaterfall,
    sprints,
    wfStates, wfDropdown, setWfDropdown,
    status, setStatus, statusList,
    dueDate, setDueDate,
    attachments, uploading, onUpload, onRemoveAttachment,
    logs, setLogs,
    loading, error,
    onSubmit, onCancel,
    aiPanel, setAiPanel, aiError, setAiError,
    genPrompt, setGenPrompt, genLoading,
    onAiGenerate, onAiReview,
    aiReviewResult, aiReviewLoading, aiReviewProgress,
  } = props;

  const handleAcceptTitle = (title: string) => {
    setTitle(title);
    if (titleRef.current) titleRef.current.value = title;
  };
  const handleAcceptDescription = (desc: string) => {
    setDescription(desc);
  };
  const handleAcceptSP = (sp: number) => {
    setStoryPoints(String(sp));
  };

  return (
    <>
      {error && (
        <div className="card bg-danger-soft text-danger p-3 mb-4 text-sm">{error}</div>
      )}

      <div className="card mb-4">
        <div className="card-bd" style={{ padding: '28px 32px' }}>

          {/* Row 1: Issue Type */}
          <div className="flex gap-3 mb-4">
            <div className="flex-1 form-grp">
              <label className="form-label">{t.createIssue.issueType}</label>
              <select className="form-select text-sm" style={{ padding: '10px 14px' }}
                value={type} onChange={e => setType(e.target.value)}>
                {ISSUE_TYPES.map(issueType => <option key={issueType}>{issueType}</option>)}
              </select>
            </div>
          </div>

          {/* Title */}
          <div className="form-grp mb-4">
            <label className="form-label">{t.createIssue.title}</label>
            <input ref={titleRef} className="form-input font-medium" style={{ padding: '14px 16px', fontSize: '16px' }}
              placeholder={t.createIssue.titlePlaceholder}
              defaultValue={title} />
          </div>

          {/* Description */}
          <div className="form-grp mb-4">
            <label className="form-label">{t.createIssue.description}</label>
            <MarkdownEditor value={description} onChange={setDescription} height="320px" />
            <div className="flex items-center gap-2 mt-2">
              {!aiPanel ? (
                <div className="flex gap-1.5">
                  <button className="btn-secondary btn-xs" onClick={() => { setAiPanel('generate'); }}>
                    🤖 {t.createIssue.aiAssist}
                  </button>
                </div>
              ) : (
                <button className="btn-ghost btn-xs text-ink-muted" onClick={() => { setAiPanel(null); }}>
                  ✕ {t.createIssue.closeAiAssist}
                </button>
              )}
            </div>

            {/* ═══ AI Assist Panel ═══ */}
            {aiPanel && (
              <div className="mt-3 p-4 rounded-card bg-surface-hover border border-edge">
                {aiError && (
                  <div className="mb-3 p-2 bg-danger-soft text-danger text-xs rounded">{aiError}</div>
                )}
                <div className="flex items-center gap-1 mb-3">
                  {(['generate', 'review'] as const).map(tab => (
                    <button key={tab}
                      className={cn('btn btn-xs', aiPanel === tab ? 'bg-brand-main text-white' : 'btn-ghost')}
                      onClick={() => { setAiPanel(tab); setAiError(''); }}>
                      {tab === 'generate' ? `🖊 ${t.createIssue.generateTab}` : `🔍 ${t.createIssue.reviewTab}`}
                    </button>
                  ))}
                </div>

                {aiPanel === 'generate' && (
                  <div>
                    <p className="text-xs text-ink-muted mb-2">{t.createIssue.generateDesc}</p>
                    <div className="flex gap-2">
                      <input className="form-input flex-1 text-xs" style={{ padding: '8px 12px' }}
                        placeholder={t.createIssue.generatePlaceholder}
                        value={genPrompt}
                        onChange={e => setGenPrompt(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') onAiGenerate(); }} />
                      <button className="btn-brand btn-xs" onClick={onAiGenerate} disabled={genLoading}>
                        {genLoading ? '...' : t.createIssue.generate}
                      </button>
                    </div>
                  </div>
                )}

                {aiPanel === 'review' && (
                  <AiReviewPanel
                    review={aiReviewResult}
                    loading={aiReviewLoading}
                    progress={aiReviewProgress}
                    onStartReview={onAiReview}
                    onAcceptTitle={handleAcceptTitle}
                    onAcceptDescription={handleAcceptDescription}
                    onAcceptStoryPoints={handleAcceptSP}
                  />
                )}
              </div>
            )}
          </div>

          {/* Status Tracker — methodology-specific */}
          <div className="mb-4">
            <StatusTracker currentStatus={status || statusList[0]?.key || 'todo'}
              interactive={true}
              onChangeStatus={setStatus}
              statusList={statusList} />
          </div>

          {/* Workflow dropdown — Waterfall only */}
          {isWaterfall && wfStates.length > 0 && (
            <div className="mb-4">
              <label className="form-label">{t.createIssue.workflowPhase}</label>
              <select className="form-select text-sm" style={{ padding: '10px 14px', maxWidth: '280px' }}
                value={wfDropdown} onChange={e => setWfDropdown(e.target.value)}>
                {wfStates.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <p className="text-xs text-ink-muted mt-1">{t.createIssue.workflowPhaseDesc}</p>
            </div>
          )}

          <div style={{ transform: 'translateZ(0)', contain: 'layout style' }}>
            <div className="flex gap-3 mb-4">
              <Row2Fields
                priority={priority} setPriority={setPriority}
                storyPoints={storyPoints} setStoryPoints={setStoryPoints}
                isScrum={isScrum}
                dueDate={dueDate} setDueDate={setDueDate}
                showDueDateRequired={!!status && !status.toLowerCase().includes('backlog')}
              />
              <AssigneeField assignee={assignee} setAssignee={setAssignee}
                members={members} suggestedAssignees={suggestedAssignees} suggestLoading={suggestLoading}
                onFocus={onTriggerAiSuggest} />
            </div>
            <Row3Fields
              sprint={sprint} setSprint={setSprint}
              parentIssue={parentIssue} setParentIssue={setParentIssue}
              securityLevel={securityLevel} setSecurityLevel={setSecurityLevel}
              labels={labels} setLabels={setLabels}
              isScrum={isScrum}
              sprints={sprints}
            />
          </div>

          {/* Attachments */}
          <div className="form-grp mb-4">
            <label className="form-label">{t.createIssue.attachments}</label>
            <div className="flex items-center gap-2 mb-2">
              <label className="btn-secondary btn-xs cursor-pointer">
                {uploading ? t.createIssue.uploading : `📎 ${t.createIssue.chooseFile}`}
                <input type="file" className="hidden" onChange={onUpload} disabled={uploading}
                  accept=".log,.txt,.png,.jpg,.jpeg,.gif,.bmp,.xlsx,.xls,.docx,.doc,.pdf,.csv,.json,.xml,.zip" />
              </label>
              <span className="text-xs text-ink-muted">{t.createIssue.attachmentMaxSize}</span>
            </div>
            {attachments.length > 0 && (
              <div className="space-y-1">
                {attachments.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-ink-primary bg-surface-hover rounded px-2 py-1">
                    <span>📎</span>
                    <span className="flex-1 truncate">{a.originalName}</span>
                    <span className="text-ink-muted">{(parseInt(a.size) / 1024).toFixed(1)} KB</span>
                    <button className="text-danger hover:underline" onClick={() => onRemoveAttachment(i)}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Logs — optional */}
          <div className="form-grp mb-4">
            <label className="form-label flex items-center gap-2">
              {t.createIssue.logsLabel} <span className="text-xs text-ink-muted font-normal">{t.createIssue.logsOptional}</span>
            </label>
            <textarea className="form-input text-sm" style={{ minHeight: '80px', padding: '10px 14px', resize: 'vertical' }}
              placeholder={t.createIssue.logsPlaceholder}
              value={logs} onChange={e => setLogs(e.target.value)} />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end pt-4 mt-4 border-t border-edge">
            <div className="flex gap-2">
              <button className="btn-brand" onClick={onSubmit} disabled={loading}>
                {loading ? t.createIssue.submitting : t.createIssue.submit}
              </button>
              <button className="btn-secondary" onClick={onCancel}>
                {t.createIssue.cancel}
              </button>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
