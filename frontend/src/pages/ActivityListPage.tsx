import { useState, useEffect } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { useT } from '@/i18n/useT';
import http from '@/lib/http';
import type { ApiResponse } from '@/types/auth';

interface Activity {
  id: string;
  summary: string;
  event_type: string;
  actor: string;
  created_at: string;
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function ActivityListPage() {
  const t = useT();
  const { currentProject } = useProjectStore();
  const reset = useProjectStore((s) => s.reset);
  const projectId = currentProject?.id;
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  // Server-side pagination — 30 per page, newest first
  const PAGE_SIZE = 30;
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    // Request PAGE_SIZE+1 to detect "more" without a total-count contract —
    // a page that returns exactly PAGE_SIZE rows is ambiguous (the last page may fill one full page).
    http.get<ApiResponse<Activity[]>>(`/projects/${projectId}/activity?offset=${offset}&limit=${PAGE_SIZE + 1}`)
      .then(({ data }) => {
        const items = data.data || [];
        setActivities(items.slice(0, PAGE_SIZE));
        setHasMore(items.length > PAGE_SIZE);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId, offset]);

  useEffect(() => { return () => reset(); }, [reset]);

  return (
    <div>
      <div className="ch">
        <div className="flex items-center gap-3">
          <button className="btn btn-g" onClick={() => window.history.back()}>{t.activity.back}</button>
          <h2 className="text-base font-semibold text-ink-primary">{t.activity.title}</h2>
          {currentProject && <span className="text-xs text-ink-muted">{currentProject.key} · {currentProject.name}</span>}
        </div>
      </div>
      <div className="p-4" style={{ maxWidth: '900px' }}>
        {loading ? (
          <p className="text-sm text-ink-muted text-center py-12">{t.activity.loading}</p>
        ) : activities.length === 0 ? (
          <p className="text-sm text-ink-muted text-center py-12">{t.activity.noActivities}</p>
        ) : (
          <div className="card">
            <div className="card-bd-nopad">
              {activities.map((a, i) => {
                const typeMap: Record<string, { icon: string; label: string }> = {
                  issue_created: { icon: '📝', label: t.activity.typeCreated },
                  status_change: { icon: '🔄', label: t.activity.typeChanged },
                  comment: { icon: '💬', label: t.activity.typeCommented },
                  phase_change: { icon: '📊', label: t.activity.typePhaseChanged },
                  desc_change: { icon: '📋', label: t.activity.typeDescUpdated },
                  wiki_change: { icon: '📖', label: t.activity.typeEdited },
                };
                const tm = typeMap[a.event_type] || { icon: '📌', label: t.activity.typeUpdated };
                const timeAgo = getTimeAgo(a.created_at);
                return (
                  <div key={`${a.id}-${i}`} className="hover-row flex items-start gap-3 px-3 py-2">
                    <span className="text-xs shrink-0 mt-0.5">{tm.icon}</span>
                    <div className="flex-1" style={{ minWidth: 0, overflow: 'visible', wordBreak: 'break-word' }}>
                      <span className="text-xs text-ink-primary font-medium">{a.actor}</span>
                      <span className="text-xs text-ink-muted"> {tm.label} </span>
                      <span className="text-xs text-ink-primary">{a.summary}</span>
                    </div>
                    <span className="text-[0.6rem] text-ink-muted shrink-0 mt-0.5" title={new Date(a.created_at).toLocaleString()}>{timeAgo}</span>
                  </div>
                );
              })}
              {/* Pagination — newest first, 30 per page */}
              {(offset > 0 || hasMore) && (
                <div className="flex items-center justify-center gap-4 py-2.5 border-t border-edge">
                  <button className="btn btn-g btn-xs" onClick={() => setOffset(o => Math.max(0, o - PAGE_SIZE))}
                    disabled={offset === 0} title={t.activity.prevPage}>
                    ◀
                  </button>
                  <span className="text-xs text-ink-muted font-medium">
                    {t.activity.pageOf(offset / PAGE_SIZE + 1)}
                  </span>
                  <button className="btn btn-g btn-xs" onClick={() => setOffset(o => o + PAGE_SIZE)}
                    disabled={!hasMore} title={t.activity.nextPage}>
                    ▶
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
