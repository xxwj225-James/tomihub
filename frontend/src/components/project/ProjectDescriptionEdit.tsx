import { useState, useRef, useEffect } from 'react';
import { useT } from '@/i18n/useT';

interface ProjectDescriptionEditProps {
  descText: string;
  setDescText: (v: string) => void;
  editingDesc: boolean;
  setEditingDesc: (v: boolean) => void;
  descSaving: boolean;
  descError: string;
  phase: string;
  setPhase: (v: string) => void;
  isOwner: boolean;
  isLead: boolean;
  isClosed: boolean;
  projectId: string | undefined;
  onSave: () => void | Promise<void>;
  onAiOptimize: (prompt: string) => Promise<void>;
}

export function ProjectDescriptionEdit({
  descText,
  setDescText,
  editingDesc,
  setEditingDesc,
  descSaving,
  descError,
  isOwner,
  isLead,
  isClosed,
  onSave,
  onAiOptimize,
}: ProjectDescriptionEditProps) {
  const t = useT();
  const [aiOptimizing, setAiOptimizing] = useState(false);
  const [aiOptimizePrompt, setAiOptimizePrompt] = useState('');
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const originalDescRef = useRef(descText);

  // Snapshot the description when the user enters edit mode so we can revert on cancel.
  useEffect(() => {
    if (editingDesc) originalDescRef.current = descText;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingDesc]);

  const handleCancel = () => {
    setEditingDesc(false);
    setDescText(originalDescRef.current);
  };

  const handleAiOptimize = async () => {
    if (!descText.trim()) return;
    setAiOptimizing(true);
    try {
      await onAiOptimize(
        aiOptimizePrompt.trim() || 'Optimize and improve this project description',
      );
      setShowAiPrompt(false);
      setAiOptimizePrompt('');
    } finally {
      setAiOptimizing(false);
    }
  };

  return (
    <div className="card">
      <div className="card-hd flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-primary">
          {t.projectOverview.projectDescription}
        </h3>
        {!isClosed && (isOwner || isLead) && !editingDesc ? (
          <button
            className="btn-ghost btn-xs text-brand-main"
            onClick={() => setEditingDesc(true)}
          >
            {t.projectOverview.edit}
          </button>
        ) : !editingDesc ? null : (
          <div className="flex gap-1">
            <button
              className="btn-ghost btn-xs"
              onClick={() => setShowAiPrompt(!showAiPrompt)}
              title="AI optimize description"
            >
              {'\u{1F916}'} {t.projectOverview.aiOptimize}
            </button>
            <button className="btn-brand btn-xs" onClick={onSave} disabled={descSaving}>
              {t.projectOverview.save}
            </button>
            <button className="btn-secondary btn-xs" onClick={handleCancel}>
              {t.projectOverview.cancel}
            </button>
          </div>
        )}
        {showAiPrompt && (
          <div className="flex gap-2 mt-2">
            <input
              className="form-input flex-1 text-xs"
              style={{ padding: '6px 10px' }}
              placeholder={t.projectOverview.aiPromptPlaceholder}
              value={aiOptimizePrompt}
              onChange={(e) => setAiOptimizePrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAiOptimize();
              }}
            />
            <button
              className="btn-brand btn-xs"
              onClick={handleAiOptimize}
              disabled={aiOptimizing}
            >
              {aiOptimizing ? t.projectOverview.optimizing : t.projectOverview.go}
            </button>
          </div>
        )}
        {descError && <p className="text-xs text-danger mt-1.5">{descError}</p>}
      </div>
      <div className="card-bd p-4">
        {editingDesc ? (
          <textarea
            className="form-input w-full"
            style={{
              minHeight: '150px',
              padding: '10px 14px',
              fontSize: '13px',
              lineHeight: 1.7,
              resize: 'vertical',
            }}
            value={descText}
            onChange={(e) => setDescText(e.target.value)}
            placeholder="Describe the project — background, goals, scope, success metrics..."
          />
        ) : (
          <p className="text-sm text-ink-primary leading-relaxed whitespace-pre-wrap">
            {descText || (
              <span className="text-ink-muted">{t.projectOverview.noDescription}</span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
