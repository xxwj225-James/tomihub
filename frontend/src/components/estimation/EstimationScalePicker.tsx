import { cn } from '@/lib/cn';

interface EstimationScalePickerProps {
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
}

const FIBONACCI = [1, 2, 3, 5, 8, 13, 21];

export function EstimationScalePicker({ value, onChange, disabled }: EstimationScalePickerProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {FIBONACCI.map(n => (
        <button
          key={n}
          type="button"
          className={cn(
            'w-9 h-9 rounded-btn text-xs font-semibold transition-colors',
            value === n
              ? 'bg-brand-main text-white shadow-sm'
              : 'bg-surface-card text-ink-primary border border-edge hover:bg-brand-soft hover:text-brand-main',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          onClick={() => onChange(value === n ? null : n)}
          disabled={disabled}
          title={`${n} story points`}
        >
          {n}
        </button>
      ))}
      <button
        type="button"
        className={cn(
          'w-9 h-9 rounded-btn text-xs font-semibold transition-colors',
          value === null || value === undefined
            ? 'bg-brand-main text-white shadow-sm'
            : 'bg-surface-card text-ink-muted border border-edge hover:bg-surface-hover',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
        onClick={() => onChange(null)}
        disabled={disabled}
        title="Not estimated"
      >
        ?
      </button>
    </div>
  );
}
