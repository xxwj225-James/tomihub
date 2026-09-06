import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { PieChart } from 'echarts/charts';
import { LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([PieChart, LegendComponent, TooltipComponent, CanvasRenderer]);

// Hex colors — Canvas renderer cannot resolve CSS variables like hsl(var(--xxx))
const COLORS = [
  '#4338CA',  // brand indigo
  '#f59e0b',  // warning amber
  '#10b981',  // success green
  '#ef4444',  // danger red
  '#6b7280',  // muted gray
  '#8b5cf6',  // purple
  '#ec4899',  // pink
  '#0d9488',  // teal
];

/** Resolve a CSS variable to its computed value. */
function cssVar(name: string, fallback: string): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    // HSL values are stored as "0 0% 100%" (without hsl() wrapper)
    return v ? `hsl(${v})` : fallback;
  } catch {
    return fallback;
  }
}

/** Accept "var(--x)" or a raw color; resolve variables for the canvas renderer. */
function resolveColor(color: string): string {
  const m = color.match(/var\((--[a-z0-9-]+)\)/i);
  return m ? cssVar(m[1], color) : color;
}

interface Props {
  data: Array<{ name: string; value: number }>;
  width?: number;
  height?: number;
  innerRadius?: string;
  showLegend?: boolean;
  /** Explicit per-name colors (e.g. semantic priority colors); falls back to the palette */
  colors?: Record<string, string>;
}

export function DonutChart({ data, width = 200, height = 200, innerRadius = '55%', showLegend = true, colors }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const instance = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current || data.length === 0) return;
    if (!instance.current) {
      instance.current = echarts.init(ref.current, undefined, { width, height, renderer: 'canvas' });
    }
    const chart = instance.current;

    // Resolve CSS variables to real colors — canvas can't parse var()
    const surfaceBg = cssVar('--surface-card', '#ffffff');
    const edgeColor = cssVar('--edge-default', '#e5e7eb');
    const inkPrimary = cssVar('--ink-primary', '#111827');
    const inkMuted = cssVar('--ink-muted', '#6b7280');

    chart.setOption({
      tooltip: {
        trigger: 'item',
        backgroundColor: surfaceBg,
        borderColor: edgeColor,
        textStyle: { color: inkPrimary, fontSize: 11 },
        formatter: '{b}: {c} ({d}%)',
      },
      legend: showLegend ? {
        bottom: 0,
        textStyle: { color: inkMuted, fontSize: 10 },
        itemWidth: 8, itemHeight: 8,
        itemGap: 12,
        padding: [8, 0, 0, 0],
      } : undefined,
      series: [{
        type: 'pie',
        radius: [innerRadius, '75%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 3,
          borderColor: surfaceBg,
          borderWidth: 2,
        },
        label: { show: false },
        emphasis: {
          label: { show: true, fontSize: 13, fontWeight: 'bold' },
          scaleSize: 8,
        },
        data: data.map((d, i) => ({
          ...d,
          itemStyle: { color: colors?.[d.name] ? resolveColor(colors[d.name]) : COLORS[i % COLORS.length] },
        })),
        animationType: 'scale',
        animationEasing: 'elasticOut',
        animationDuration: 1000,
      }],
    }, true);

    return () => { chart.dispose(); instance.current = null; };
  }, [data, width, height, innerRadius, showLegend, colors]);

  return <div ref={ref} style={{ width, height }} />;
}
