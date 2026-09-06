import { useState } from 'react';
import { useT } from '@/i18n/useT';
import type { AiReviewResult } from '@/api/issueApi';

export interface AiReviewPanelProps {
  review: AiReviewResult | null;
  loading: boolean;
  progress: string;
  onStartReview?: () => void;
  /** Apply suggested title to parent form */
  onAcceptTitle?: (title: string) => void;
  /** Apply suggested description to parent form */
  onAcceptDescription?: (desc: string) => void;
  /** Apply recommended story points to parent form */
  onAcceptStoryPoints?: (sp: number) => void;
  /** Navigate to a similar/detected issue */
  onViewSimilarIssue?: (issueId: string) => void;
}

export function AiReviewPanel({
  review, loading, progress,
  onStartReview, onAcceptTitle, onAcceptDescription, onAcceptStoryPoints,
  onViewSimilarIssue,
}: AiReviewPanelProps) {
  const t = useT();
  const [appliedTitle, setAppliedTitle] = useState(false);
  const [appliedDesc, setAppliedDesc] = useState(false);

  if (!loading && !review) {
    return onStartReview ? (
      <button className="btn-brand btn-xs" onClick={onStartReview}>{t.issueDetail.aiReview}</button>
    ) : null;
  }

  return (
    <div>
      {/* Progress bar */}
      {loading && progress && (
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full border-2 border-brand-main border-t-transparent animate-spin" />
            <span className="text-sm text-brand-main font-medium">{progress}</span>
          </div>
          <div className="progress mt-3" style={{ height: '4px' }}>
            <div className="progress-bar brand animate-pulse"
              style={{ width: progress.includes('Searching') ? '33%' : progress.includes('Checking') ? '66%' : '90%' }} />
          </div>
        </div>
      )}

      {/* Error */}
      {review?.error && (
        <div className="card bg-danger-soft p-3 text-sm text-danger">
          <p className="text-sm text-danger">{review.error}</p>
        </div>
      )}

      {/* Result */}
      {review && !review.error && (
        <div className="card ai-glow"
          style={review.isDuplicate ? { borderColor: 'hsl(var(--warning))', borderWidth: '2px' } : undefined}>

          {/* Header */}
          <div className="card-hd flex items-center justify-between"
            style={review.isDuplicate ? { background: 'hsl(var(--warning-soft))' } : undefined}>
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-main flex items-center gap-1.5">
              <span className="pulse" />AI Review — {review.verdict}
            </span>
            <span className="text-xs font-semibold text-brand-main">
              {review.score}/{review.maxScore || 100}
              {review.isDuplicate && <span className="ml-2 text-xs text-warning">{'⚠'} {t.issueDetail.duplicate}</span>}
            </span>
          </div>

          <div className="card-bd p-3">
            {/* Summary */}
            {review.summary && (
              <p className="text-sm text-ink-primary mb-3 leading-relaxed">{review.summary}</p>
            )}

            {/* Acceptable suggestions (title / description / SP) */}
            {review.suggestedTitle && onAcceptTitle && (
              <div className="p-2 bg-surface-hover rounded-card text-xs mb-2">
                <span className="font-semibold text-ink-muted">{t.createIssue.suggestedTitle} </span>
                <span className="text-ink-primary">{review.suggestedTitle}</span>
                <button className="ml-2 text-brand-main font-medium"
                  onClick={() => { onAcceptTitle(review.suggestedTitle!); setAppliedTitle(true); }}>
                  {appliedTitle ? `✓ ${t.createIssue.applied}` : t.createIssue.apply}
                </button>
              </div>
            )}

            {review.suggestedDescription && onAcceptDescription && (
              <div className="p-2 bg-surface-hover rounded-card text-xs mb-2">
                <span className="font-semibold text-ink-muted">{t.createIssue.suggestedDescription} </span>
                <span className="text-ink-primary line-clamp-3">{review.suggestedDescription}</span>
                <button className="ml-2 text-brand-main font-medium"
                  onClick={() => { onAcceptDescription(review.suggestedDescription!); setAppliedDesc(true); }}>
                  {appliedDesc ? `✓ ${t.createIssue.applied}` : t.createIssue.apply}
                </button>
              </div>
            )}

            {/* Similar Issues (>= 60% match) */}
            {(() => {
              const filtered = ((review.similarIssues || []) as Array<{ key?: string; id?: string; title?: string; matchScore?: number }>)
                .filter(s => (s.matchScore || 0) >= 60);
              if (filtered.length === 0) return null;
              return (
                <div className="mb-3 pb-3 border-b border-edge">
                  <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">{'\u{1F50D}'} {t.issueDetail.similarIssues}</p>
                  {filtered.map((s) => (
                    <button key={s.key || s.id}
                      className="flex items-center gap-2 mb-1 text-xs hover:bg-surface-hover rounded px-1 py-0.5 transition-colors w-full text-left"
                      style={{ color: 'inherit', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                      onClick={() => onViewSimilarIssue?.(s.id || s.key || '')}>
                      <span className="font-mono text-brand-main">{s.key}</span>
                      <span className="flex-1 truncate text-ink-primary">{s.title}</span>
                      <span className={'badge ' + ((s.matchScore || 0) >= 80 ? 'tag-hi' : 'tag-med')}>
                        {(s.matchScore || 0) >= 80 ? '⚠ Duplicate' : `${s.matchScore || 0}%`}
                      </span>
                      <svg className="w-3 h-3 text-ink-muted shrink-0" viewBox="0 0 16 16" fill="currentColor"><path d="M11 3H5a2 2 0 00-2 2v8a2 2 0 002 2h6a2 2 0 002-2V5a2 2 0 00-2-2z"/></svg>
                    </button>
                  ))}
                </div>
              );
            })()}

            {/* Log analysis */}
            {review.logAnalysis && (
              <div className="mb-3 p-3 bg-surface-hover rounded-card">
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1">{'\u{1F4CB}'} {t.issueDetail.logAnalysis}</p>
                <p className="text-sm text-ink-primary leading-relaxed whitespace-pre-wrap">{review.logAnalysis}</p>
              </div>
            )}

            {/* Suggestions */}
            {review.suggestions && review.suggestions.length > 0 && (
              <>
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">{'\u{1F4A1}'} {t.issueDetail.suggestions}</p>
                {review.suggestions.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 mb-2 last:mb-0 text-sm">
                    <span className="shrink-0 text-brand-main">{'→'}</span>
                    <span className="text-ink-secondary">{typeof s === 'string' ? s : (s as { msg: string }).msg}</span>
                  </div>
                ))}
              </>
            )}

            {/* Recommended SP */}
            {review.recommendedSP && (
              <div className="mt-3 pt-3 border-t border-edge text-xs text-ink-muted">
                {'⭐'} {t.issueDetail.recommendedSP}: <span className="font-semibold text-brand-main"
                  onClick={onAcceptStoryPoints ? () => onAcceptStoryPoints(review.recommendedSP!) : undefined}
                  style={onAcceptStoryPoints ? { cursor: 'pointer' } : undefined}>
                  {review.recommendedSP} SP
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
