import { useT } from '@/i18n/useT';
import http from '@/lib/http';
import { marked } from 'marked';

type ReportType = 'daily' | 'weekly' | 'monthly' | 'sprint_review' | 'custom';

interface HistoryItem {
  id: string; title: string; reportType: ReportType; status: string;
  projectId?: string; generatedAt: string; content?: string;
}

const TYPE_AVATAR: Record<string, string> = {
  daily: 'D', weekly: 'W', monthly: 'M', sprint_review: 'S', custom: 'C',
};

interface ReportHistoryPanelProps {
  history: HistoryItem[];
  filteredHistory: HistoryItem[];
  historyFilter: string;
  setHistoryFilter: (f: string) => void;
  reportTab: 'my' | 'shared';
  setReportTab: (t: 'my' | 'shared') => void;
  sortDir: 'asc' | 'desc';
  setSortDir: (d: 'asc' | 'desc') => void;
  colWidths: { title: number; summary: number; date: number };
  onResizeStart: (col: string, e: React.MouseEvent) => void;
  currentReportId: string | null;
  openHistory: (id: string) => void;
  loadHistory: () => void;
  deleteConfirm: string | null;
  setDeleteConfirm: (id: string | null) => void;
}

export function ReportHistoryPanel({
  filteredHistory,
  historyFilter,
  setHistoryFilter,
  reportTab,
  setReportTab,
  sortDir,
  setSortDir,
  colWidths,
  onResizeStart,
  currentReportId,
  openHistory,
  loadHistory,
  deleteConfirm,
  setDeleteConfirm,
}: ReportHistoryPanelProps) {
  const t = useT();

  return (
    <div className="card">
      <div className="card-hd">
        <div className="flex items-center gap-4">
          <h3 style={{ fontSize: '13px', fontWeight: 600 }}>{t.report.archive}</h3>
          <div className="flex gap-3" style={{ marginLeft: 'auto' }}>
            <button className="text-xs"
              style={{
                padding: '0 0 3px', background: 'transparent', border: 'none',
                borderBottom: reportTab === 'my' ? '2px solid hsl(var(--brand))' : '2px solid transparent',
                color: reportTab === 'my' ? 'hsl(var(--brand))' : 'hsl(var(--ink-muted))',
                fontWeight: reportTab === 'my' ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit',
              }}
              onClick={() => { setReportTab('my'); loadHistory(); }}>{t.report.myReports}</button>
            <button className="text-xs"
              style={{
                padding: '0 0 3px', background: 'transparent', border: 'none',
                borderBottom: reportTab === 'shared' ? '2px solid hsl(var(--brand))' : '2px solid transparent',
                color: reportTab === 'shared' ? 'hsl(var(--brand))' : 'hsl(var(--ink-muted))',
                fontWeight: reportTab === 'shared' ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit',
              }}
              onClick={() => { setReportTab('shared'); loadHistory(); }}>{t.report.sharedWithMe}</button>
          </div>
        </div>
      </div>
      <div className="px-3 flex gap-4 border-b border-edge">
        {['all', 'daily', 'weekly', 'monthly', 'sprint_review'].map(f => (
          <button key={f} className="text-xs"
            style={{
              padding: '8px 0 7px',
              background: 'transparent',
              border: 'none',
              borderBottom: historyFilter === f ? '2px solid hsl(var(--brand))' : '2px solid transparent',
              color: historyFilter === f ? 'hsl(var(--brand))' : 'hsl(var(--ink-muted))',
              fontWeight: historyFilter === f ? 600 : 400,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
            onClick={() => setHistoryFilter(f)}>
            {f === 'all' ? t.report.all : (t.report as Record<string, string>)[f === 'sprint_review' ? 'sprintReview' : f] || f}
          </button>
        ))}
      </div>
      <div className="card-bd-nopad rpt-list-container">
        <div className="flex items-center px-[14px] py-2 border-b border-edge text-[0.65rem] font-semibold text-ink-muted uppercase tracking-wider">
          <span className="shrink-0" style={{ width: historyFilter === 'all' ? '32px' : '0px' }} />
          <span style={{ width: `${colWidths.title}%`, userSelect: 'none' }}>{t.report.titleCol}</span>
          <span
            style={{ width: '4px', height: '20px', cursor: 'col-resize', background: 'transparent', margin: '0 -2px', zIndex: 1 }}
            onMouseDown={e => onResizeStart('title', e)}
          />
          <span style={{ width: `${colWidths.summary}%`, userSelect: 'none' }}>{t.report.summaryCol}</span>
          <span
            style={{ width: '4px', height: '20px', cursor: 'col-resize', background: 'transparent', margin: '0 -2px', zIndex: 1 }}
            onMouseDown={e => onResizeStart('summary', e)}
          />
          <span className="shrink-0 cursor-pointer select-none" style={{ width: `${colWidths.date}%`, textAlign: 'right' }}
            onClick={() => setSortDir(sortDir === 'desc' ? 'asc' : 'desc')}>
            {t.report.dateCol} {sortDir === 'desc' ? '↓' : '↑'}
          </span>
          <span style={{ width: '100px' }} />
        </div>
        {filteredHistory.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-xs text-ink-muted">{t.report.noReports}</p>
          </div>
        ) : (
          filteredHistory.map(r => {
            const isMine = reportTab === 'my';
            const summary = (r.content || '').replace(/[#*`]/g, '').slice(0, 120);
            return (
            <div key={r.id} className="hover-row flex items-center gap-4 cursor-pointer"
              style={{ padding: '10px 14px', background: currentReportId === r.id ? 'hsl(var(--brand-soft))' : '' }}
              onClick={() => openHistory(r.id)}>
              {historyFilter === 'all' && (
                <div className="av shrink-0" style={{
                  width: '32px', height: '32px', fontSize: '12px', borderRadius: '8px',
                  background: r.reportType === 'daily' ? 'hsl(var(--brand-soft))' :
                    r.reportType === 'weekly' ? 'hsl(var(--warning-soft))' :
                    r.reportType === 'sprint_review' ? 'hsl(var(--success-soft))' :
                    r.reportType === 'monthly' ? 'hsl(200 60% 95%)' : 'hsl(var(--surface-hover))',
                  color: r.reportType === 'daily' ? 'hsl(var(--brand))' :
                    r.reportType === 'weekly' ? 'hsl(var(--warning))' :
                    r.reportType === 'sprint_review' ? 'hsl(var(--success))' :
                    r.reportType === 'monthly' ? 'hsl(200 55% 40%)' : 'hsl(var(--ink-muted))',
                }}>
                  {TYPE_AVATAR[r.reportType] || 'R'}
                </div>
              )}
              <div className="min-w-0" style={{ width: `${colWidths.title}%` }}>
                <div className="text-[0.8125rem] font-semibold text-ink-primary truncate">{r.title}</div>
              </div>
              <div className="min-w-0 text-[0.68rem] text-ink-muted truncate" style={{ width: `${colWidths.summary}%` }}>
                {summary || '—'}
              </div>
              <div className="text-[0.68rem] text-ink-muted shrink-0" style={{ width: `${colWidths.date}%`, textAlign: 'right' }}>
                {r.status === 'sent' && <span className="badge bg-status-success-soft text-status-success text-[0.55rem] mr-1">{t.report.sent}</span>}
                {new Date(r.generatedAt).toLocaleDateString()}
              </div>
              {isMine ? (
                <>
                  <button className="rpt-icon-btn" title={t.report.view}
                    onClick={(e) => { e.stopPropagation(); openHistory(r.id); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/></svg>
                  </button>
                  <button className="rpt-icon-btn" title={t.report.downloadHtml}
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        const { data } = await http.get(`/reports/${r.id}`);
                        const report = (data as Record<string, unknown>).data as { content?: string } | undefined;
                        if (report?.content) {
                          const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${r.title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.7;color:#1a1a2e;background:#fff}
h1{font-size:1.5em;border-bottom:2px solid #4338CA;padding-bottom:8px}h2{font-size:1.2em;margin-top:24px}h3{font-size:1em}
table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #ddd;padding:8px 12px;text-align:left}th{background:#f5f5f7;font-weight:600}
code{background:#f0f0f3;padding:2px 6px;border-radius:4px}strong{color:#111}hr{border:none;border-top:1px solid #e0e0e5;margin:20px 0}
</style></head><body>${marked(report.content)}</body></html>`;
                          const blob = new Blob([html], { type: 'text/html' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a'); a.href = url; a.download = `${r.title || 'report'}.html`; a.click();
                          URL.revokeObjectURL(url);
                        }
                      } catch { /* noop */ }
                    }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  </button>
                  {deleteConfirm === r.id ? (
                    <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      <span className="text-[0.65rem] text-ink-muted">{t.report.deleteConfirm}</span>
                      <button className="text-[0.65rem] px-1.5 py-0.5 rounded font-semibold text-white"
                        style={{ background: 'hsl(var(--danger))', border: 'none', cursor: 'pointer' }}
                        onClick={() => { http.delete(`/reports/${r.id}`).then(() => { loadHistory(); setDeleteConfirm(null); }).catch(() => {}); }}>{t.report.ok}</button>
                      <button className="text-[0.65rem] px-1.5 py-0.5 rounded"
                        style={{ background: 'hsl(var(--surface-hover))', color: 'hsl(var(--ink-muted))', border: '1px solid hsl(var(--edge-default))', cursor: 'pointer' }}
                        onClick={() => setDeleteConfirm(null)}>{t.report.cancel}</button>
                    </div>
                  ) : (
                    <button className="rpt-icon-btn rpt-delete" title={t.report.delete}
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirm(r.id); }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button className="rpt-icon-btn" title={t.report.view}
                    onClick={(e) => { e.stopPropagation(); openHistory(r.id); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/></svg>
                  </button>
                  <button className="rpt-icon-btn" title="Remove from my list"
                    style={{ color: 'hsl(var(--ink-muted))' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      http.post(`/reports/${r.id}/dismiss`).then(() => loadHistory()).catch(() => {});
                    }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </>
              )}
            </div>
          ); })
        )}
      </div>
    </div>
  );
}
