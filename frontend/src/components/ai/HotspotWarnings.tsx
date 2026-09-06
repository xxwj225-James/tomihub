import { useState, useEffect } from 'react';

interface Hotspot {
  cognition_type: string;
  cognition_summary: string;
  confidence_score: number;
  hit_count: number;
}

export function HotspotWarnings({ projectId }: { projectId: string }) {
  const [hots, setHots] = useState<Hotspot[]>([]);
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/v1/ai/evolution/hotspots?projectId=${projectId}`)
      .then(r => r.json()).then(d => setHots(d.hotspots || [])).catch(() => {});
  }, [projectId]);
  if (hots.length === 0) return null;
  return (
    <div className="card">
      <div className="card-hd"><h3 className="text-sm font-semibold text-warning">⚠️ AI Hotspot Warnings</h3></div>
      <div className="card-bd p-2 space-y-2">
        {hots.map((h, i) => (
          <div key={i} className="text-xs p-2 rounded-card bg-warning-soft/30">
            <div className="flex items-center gap-2 mb-1">
              <span className="badge tag-hi text-[0.55rem]">{h.cognition_type}</span>
              <span className="text-ink-muted">{Math.round(h.confidence_score * 100)}% conf · {h.hit_count} hits</span>
            </div>
            <p className="text-ink-primary leading-relaxed">{h.cognition_summary}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
