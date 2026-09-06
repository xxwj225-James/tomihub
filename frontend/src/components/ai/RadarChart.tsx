// ─── Radar chart for multi-dimension scores (project health, personal health) ───
// All colors come from semantic CSS variables so light/dark themes both work.
import { useId } from 'react';

interface Props {
  dimensions: Record<string, number>;
  labels?: Record<string, string>;
  size?: number;
}

export function RadarChart({ dimensions, labels, size = 240 }: Props) {
  const uid = useId();
  const keys = Object.keys(dimensions);
  const n = keys.length;
  if (n < 3) return null;

  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 46; // leave room for labels OUTSIDE the polygon
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i: number, r: number) =>
    `${(cx + r * Math.cos(angle(i))).toFixed(1)},${(cy + r * Math.sin(angle(i))).toFixed(1)}`;
  const ptXY = (i: number, r: number): [number, number] =>
    [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))];

  // Grid rings at 25/50/75/100
  const rings = [0.25, 0.5, 0.75, 1];
  const ringPoly = (ratio: number) => keys.map((_, i) => pt(i, R * ratio)).join(' ');
  const dataPoly = keys
    .map((k, i) => pt(i, R * Math.max(0, Math.min(100, Number(dimensions[k]) || 0)) / 100))
    .join(' ');

  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, maxWidth: '100%' }} role="img">
      <defs>
        <linearGradient id={`${uid}-radar`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(var(--brand))" stopOpacity="0.30" />
          <stop offset="100%" stopColor="hsl(var(--brand))" stopOpacity="0.10" />
        </linearGradient>
      </defs>
      {/* Grid rings — subtle, behind everything */}
      {rings.map(r => (
        <polygon key={r} points={ringPoly(r)} fill="none" stroke="hsl(var(--edge-default))" strokeWidth="1"
          opacity={r === 1 ? 0.9 : 0.55} />
      ))}
      {/* Axis lines */}
      {keys.map((_, i) => {
        const [x2, y2] = ptXY(i, R);
        return <line key={i} x1={cx} y1={cy} x2={x2} y2={y2} stroke="hsl(var(--edge-default))" strokeWidth="1" opacity="0.7" />;
      })}
      {/* Data polygon */}
      <polygon points={dataPoly} fill={`url(#${uid}-radar)`} stroke="hsl(var(--brand))" strokeWidth="2"
        strokeLinejoin="round" />
      {/* Score dots */}
      {keys.map((k, i) => {
        const score = Math.max(0, Math.min(100, Number(dimensions[k]) || 0));
        const [dx, dy] = ptXY(i, R * score / 100);
        return <circle key={k} cx={dx} cy={dy} r="3" fill="hsl(var(--surface-card))" stroke="hsl(var(--brand))" strokeWidth="1.8" />;
      })}
      {/* Labels OUTSIDE the polygon — never covered by the shape */}
      {keys.map((k, i) => {
        const [lx, ly] = ptXY(i, R + 20);
        const label = labels?.[k] || k.replace(/_/g, ' ');
        const score = Math.round(Number(dimensions[k]) || 0);
        return (
          <g key={k}>
            <text x={lx} y={ly - 1} textAnchor="middle" dominantBaseline="middle"
              fontSize="10" fontWeight="600" fill="hsl(var(--ink-secondary))"
              style={{ paintOrder: 'stroke', stroke: 'hsl(var(--surface-card))', strokeWidth: 3 }}>
              {label}
            </text>
            <text x={lx} y={ly + 11} textAnchor="middle" dominantBaseline="middle"
              fontSize="9" fontWeight="700" fill={score >= 80 ? 'hsl(var(--success))' : score >= 60 ? 'hsl(var(--brand))' : 'hsl(var(--danger))'}
              style={{ paintOrder: 'stroke', stroke: 'hsl(var(--surface-card))', strokeWidth: 3 }}>
              {score}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
