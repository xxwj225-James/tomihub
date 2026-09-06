interface Props {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

function level(score: number): 'healthy' | 'at_risk' | 'critical' {
  if (score >= 80) return 'healthy';
  if (score >= 50) return 'at_risk';
  return 'critical';
}

const GRADIENTS = {
  healthy: ['#10b981', '#34d399', '#6ee7b7'],
  at_risk: ['#f59e0b', '#fbbf24', '#fcd34d'],
  critical: ['#ef4444', '#f87171', '#fca5a5'],
};

const LABELS: Record<string, string> = {
  healthy: 'Healthy', at_risk: 'At Risk', critical: 'Critical',
};

export function HealthGauge({ score, size = 'md' }: Props) {
  const dims = { sm: 52, md: 72, lg: 104 };
  const strokeW = { sm: 5, md: 6, lg: 8 };
  const font = { sm: 16, md: 22, lg: 32 };
  const d = dims[size];
  const s = strokeW[size];
  const r = (d - s * 2) / 2;
  const c = d / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(100, Math.max(0, score)) / 100);
  const lvl = level(score);
  const [color1, color2] = GRADIENTS[lvl];
  const gradId = `gauge-grad-${size}-${score}`;

  return (
    <div className="flex items-center gap-4">
      <svg width={d} height={d} className="shrink-0" style={{ filter: `drop-shadow(0 0 ${s * 1.5}px ${color1}40)` }}>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={color1} />
            <stop offset="100%" stopColor={color2} />
          </linearGradient>
        </defs>
        {/* Background ring */}
        <circle cx={c} cy={c} r={r} fill="none" stroke="hsl(var(--edge-default)/0.5)" strokeWidth={s} />
        {/* Glow ring (subtle outer glow) */}
        <circle cx={c} cy={c} r={r + 2} fill="none" stroke={color1} strokeWidth={1.5} opacity={0.3}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" transform={`rotate(-90 ${c} ${c})`} />
        {/* Active arc */}
        <circle cx={c} cy={c} r={r} fill="none" stroke={`url(#${gradId})`} strokeWidth={s}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" transform={`rotate(-90 ${c} ${c})`}
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)' }} />
        {/* Score text */}
        <text x={c} y={c + font[size] * 0.35} textAnchor="middle"
          fill="hsl(var(--ink-primary))" fontSize={font[size]} fontWeight={800}
          style={{ fontFamily: 'system-ui, sans-serif' }}>
          {score}
        </text>
      </svg>
      <div>
        <p className="text-sm font-bold text-ink-primary">{score}<span className="text-xs text-ink-muted font-normal">/100</span></p>
        <p className="text-xs font-semibold capitalize" style={{ color: color1 }}>
          {LABELS[lvl]}
        </p>
      </div>
    </div>
  );
}
