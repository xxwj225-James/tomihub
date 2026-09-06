import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useT } from '@/i18n/useT';
import { cn } from '@/lib/cn';
import { isDemoUser as isDemoUserEmail } from '@/lib/demoUser';

interface Props {
  analysisType: 'project_health' | 'personal_health' | 'project_risk';
  llmScore: number;
  llmLevel: string;
  projectId?: string;
  analysisId?: string;
  className?: string;
}

export function FeedbackRow({ analysisType, llmScore, llmLevel, projectId, analysisId, className }: Props) {
  const t = useT();
  const [scoreFeedback, setScoreFeedback] = useState<'too_low' | 'just_right' | 'too_high'>('just_right');
  const [levelFeedback, setLevelFeedback] = useState<'accurate' | 'not_accurate'>('accurate');
  const [userLevel, setUserLevel] = useState(llmLevel);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [denied, setDenied] = useState(false);
  const isDemoUser = useAuthStore((s) => isDemoUserEmail(s.user?.email));

  const showComment = scoreFeedback !== 'just_right' || levelFeedback !== 'accurate';

  const handleSubmit = async () => {
    // Demo account is read-only — feedback writes are disabled
    if (isDemoUser) { setDenied(true); return; }
    setSubmitting(true);
    try {
      const token = useAuthStore.getState().accessToken;
      const resp = await fetch('/api/v1/ai/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          analysisType,
          llmScore,
          llmLevel,
          scoreFeedback,
          levelFeedback,
          userLevel: levelFeedback === 'not_accurate' ? userLevel : undefined,
          userReason: reason || undefined,
          projectId,
          analysisId,
        }),
      });
      if (resp.ok) {
        setSubmitted(true);
      }
    } catch { /* ignore */ }
    finally { setSubmitting(false); }
  };

  if (submitted) {
    return (
      <div className={cn('p-3 rounded-btn bg-status-success-soft border border-success/20', className)}>
        <p className="text-xs text-status-success font-medium">{t.ai.feedbackThanks || 'Thanks for your feedback!'}</p>
      </div>
    );
  }

  const ScoreBtn = ({ value, label }: { value: typeof scoreFeedback; label: string }) => (
    <button
      className={cn(
        'text-[0.65rem] px-2.5 py-1 rounded-full border transition-all',
        scoreFeedback === value
          ? 'bg-brand-main text-white border-brand-main font-semibold'
          : 'bg-white/70 text-ink-muted border-edge hover:border-edge-hover'
      )}
      onClick={() => setScoreFeedback(value)}
    >{label}</button>
  );

  const LevelBtn = ({ value, label }: { value: typeof levelFeedback; label: string }) => (
    <button
      className={cn(
        'text-[0.65rem] px-2.5 py-1 rounded-full border transition-all',
        levelFeedback === value
          ? 'bg-brand-main text-white border-brand-main font-semibold'
          : 'bg-white/70 text-ink-muted border-edge hover:border-edge-hover'
      )}
      onClick={() => setLevelFeedback(value)}
    >{label}</button>
  );

  return (
    <div className={cn('p-3 rounded-lg bg-brand-soft border border-brand/15', className)} style={{ background: 'hsl(var(--brand-s))' }}>
      <p className="text-xs font-semibold text-brand-main mb-2">{t.ai.feedbackTitle || 'Was this assessment accurate?'}</p>

      <div className="flex items-center gap-2 mb-2">
        <span className="text-[0.6rem] text-ink-muted w-10 shrink-0">{t.ai.score || 'Score'}:</span>
        <ScoreBtn value="too_low" label={t.ai.tooLow || 'Too Low'} />
        <ScoreBtn value="just_right" label={t.ai.justRight || 'Just Right'} />
        <ScoreBtn value="too_high" label={t.ai.tooHigh || 'Too High'} />
      </div>

      <div className="flex items-center gap-2 mb-1">
        <span className="text-[0.6rem] text-ink-muted w-10 shrink-0">{t.ai.level || 'Level'}:</span>
        <LevelBtn value="accurate" label={t.ai.accurate || 'Accurate'} />
        <LevelBtn value="not_accurate" label={t.ai.notAccurate || 'Not Accurate'} />
      </div>

      {showComment && (
        <div className="mt-2 space-y-2">
          {levelFeedback === 'not_accurate' && (
            <select
              className="form-select text-[0.65rem] w-full"
              value={userLevel}
              onChange={e => setUserLevel(e.target.value)}
            >
              <option value="healthy">{t.home.healthy}</option>
              <option value="at_risk">{t.home.atRisk}</option>
              <option value="critical">{t.home.critical}</option>
            </select>
          )}
          <textarea
            className="form-input text-[0.65rem] w-full resize-none"
            style={{ minHeight: '40px', padding: '6px 8px', background: 'hsl(var(--surface-card))' }}
            placeholder={t.ai.feedbackPlaceholder || 'Why? (optional)'}
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={2}
          />
          <div className="text-right">
            <button
              className="btn-brand text-[0.65rem] px-3 py-1.5 rounded-btn"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (t.ai.sending || 'Sending...') : (t.ai.submitFeedback || 'Submit Feedback')}
            </button>
            {denied && (
              <p className="text-[0.65rem] text-warning mt-1.5">{t.app.demoNoPermission}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
