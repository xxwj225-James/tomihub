// ─── Unified issue-count link ────────────────────────────────────────────────
// Everywhere an AI analysis shows an issue count, this is the ONLY style:
// an underlined link — the number itself carries the underline — that jumps
// to the filtered Issues list. Keep this consistent across Home, Project
// Overview and any future AI section.
import { useNavigate } from '@tanstack/react-router';
import { cn } from '@/lib/cn';

interface Props {
  count: number;
  label?: string;
  /** Issues-page search params (status/priority/type/assignee/view) */
  search?: Record<string, string>;
  /** Optional extra action before navigating (e.g. switch project) */
  onBeforeJump?: () => void;
  title?: string;
  tone?: 'default' | 'danger' | 'warning';
}

const TONES = {
  default: 'text-brand-main hover:text-brand-hover',
  danger: 'text-danger hover:text-danger/80',
  warning: 'text-warning hover:text-warning/80',
};

export function IssueCountChip({ count, label, search, onBeforeJump, title, tone = 'default' }: Props) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className={cn('text-[0.65rem] font-medium underline underline-offset-2 decoration-1 cursor-pointer transition-colors', TONES[tone])}
      title={title || (label ? `${count} ${label}` : String(count))}
      onClick={() => {
        if (onBeforeJump) onBeforeJump();
        navigate({ to: '/issues', search: search || {} });
      }}>
      <span className="font-bold">{count}</span>
      {label ? ` ${label}` : null}
    </button>
  );
}
