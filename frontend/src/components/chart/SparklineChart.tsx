import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

/** Resolve a semantic CSS variable (e.g. "--brand") to a canvas-usable hsl() string. */
function cssColor(varName: string): string {
  if (typeof document === 'undefined') return 'transparent';
  let v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  // Resolve nested var() references (e.g. --brand-main: var(--brand))
  let guard = 0;
  while (/^var\(--/.test(v) && guard++ < 5) {
    const inner = v.match(/^var\((--[a-z0-9-]+)\)/i);
    if (!inner) break;
    v = getComputedStyle(document.documentElement).getPropertyValue(inner[1]).trim();
  }
  return v ? `hsl(${v})` : 'transparent';
}

/** Accept "var(--x)" / "hsl(var(--x))" or a raw color; resolve variables for canvas. */
function resolveColor(color: string): string {
  const m = color.match(/var\((--[a-z0-9-]+)\)/i);
  return m ? cssColor(m[1]) : color;
}

/**
 * Build an hsla() string with the given alpha. CSS variables are stored as
 * space-separated modern syntax (e.g. "0 65% 48%"), and naively appending
 * ", 0.25" to "hsl(0 65% 48%)" yields "hsla(0 65% 48%,0.25)" — a mixed
 * syntax Canvas can NOT parse. Normalize to comma-separated hsla() instead.
 */
function withAlpha(hslColor: string, alpha: number): string {
  // Normalize: hsl(0 65% 48%) or hsl(0, 65%, 48%) → hsla(0, 65%, 48%, α)
  const m = hslColor.match(/^hsl\(\s*([\d.]+)[\s,]+([\d.]+%)[\s,]+([\d.]+%)\s*\)$/i);
  if (m) return `hsla(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})`;
  // Already hsla() → replace alpha component
  const m2 = hslColor.match(/^hsla\(\s*([\d.]+)[\s,]+([\d.]+%)[\s,]+([\d.]+%)[\s,]+([\d.]+%?)\s*\)$/i);
  if (m2) return `hsla(${m2[1]}, ${m2[2]}, ${m2[3]}, ${alpha})`;
  // Fallback: if it has commas, insert alpha after the 3rd component; else
  // append. Never emit space-separated hsla — Canvas can't parse it.
  const comma = hslColor.match(/^hsl\(\s*([\d.]+),\s*([\d.]+%),\s*([\d.]+%)\s*\)$/i);
  if (comma) return `hsla(${comma[1]}, ${comma[2]}, ${comma[3]}, ${alpha})`;
  return 'hsla(0, 0%, 0%, 0)';  // safe no-op fallback — never a broken color
}

interface Props {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  showDot?: boolean;
  formatter?: (value: number) => string;
  /** Show y-axis scale and value labels (trend analysis mode) */
  showAxes?: boolean;
  labels?: string[];
}

export function SparklineChart({ data, width = 120, height = 32, color = 'hsl(245,57%,50%)', showDot = true, formatter, showAxes = false, labels }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const instance = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (!instance.current) {
      instance.current = echarts.init(ref.current, undefined, {
        width, height,
        renderer: 'canvas',
      });
    }
    const chart = instance.current;
    const lineColor = resolveColor(color);

    chart.setOption({
      grid: showAxes
        ? { left: 34, right: 8, top: 8, bottom: 20 }
        : { left: 0, right: 0, top: 2, bottom: 0 },
      xAxis: showAxes
        ? {
            type: 'category',
            data: labels || data.map((_, i) => String(i + 1)),
            boundaryGap: false,
            axisLine: { lineStyle: { color: cssColor('--edge-hover') } },
            axisTick: { show: false },
            axisLabel: { color: cssColor('--ink-muted'), fontSize: 9, interval: 'auto' },
          }
        : { show: false, data: data.map((_, i) => i) },
      yAxis: showAxes
        ? {
            type: 'value',
            min: (v: { min: number }) => Math.max(0, Math.floor(v.min / 10) * 10),
            max: (v: { max: number }) => Math.min(100, Math.ceil(v.max / 10) * 10),
            splitNumber: 3,
            axisLine: { show: false },
            axisLabel: { color: cssColor('--ink-muted'), fontSize: 9 },
            splitLine: { lineStyle: { color: cssColor('--edge-default'), type: 'dashed' } },
          }
        : { show: false, min: 'dataMin', max: 'dataMax' },
      tooltip: {
        trigger: 'axis',
        backgroundColor: cssColor('--surface-card'),
        borderColor: cssColor('--edge-hover'),
        textStyle: { color: cssColor('--ink-primary'), fontSize: 11 },
        formatter: formatter ? (p: Array<{ value?: number }>) => formatter(p[0]?.value ?? 0) : undefined,
      },
      series: [{
        type: 'line',
        data,
        smooth: true,
        showSymbol: showAxes || (showDot && data.length <= 14),
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: { color: lineColor, width: 2 },
        itemStyle: { color: lineColor },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: withAlpha(lineColor, 0.25) },
            { offset: 1, color: withAlpha(lineColor, 0.02) },
          ]),
        },
        ...(showAxes && {
          label: {
            show: true,
            position: 'top',
            color: cssColor('--ink-muted'),
            fontSize: 9,
            formatter: (p: { value: number }) => String(p.value),
          },
        }),
        animationDuration: 800,
        animationEasing: 'cubicOut',
      }],
    }, true);

    return () => {
      chart.dispose();
      instance.current = null;
    };
  }, [data, color, showDot, formatter, width, height, showAxes, labels]);

  return <div ref={ref} style={{ width, height, overflow: 'hidden' }} />;
}
