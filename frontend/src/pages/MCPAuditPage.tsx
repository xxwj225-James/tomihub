import { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { notificationApi, type NotificationData } from '@/api/notificationApi';
import { useT } from '@/i18n/useT';
import { cn } from '@/lib/cn';

const sBg: Record<string, string> = {
  approved: 'bg-success-soft', auto: 'bg-brand-soft', denied: 'bg-danger-soft',
  expired: 'bg-surface-hover', pending: 'bg-warning-soft',
};
const sClr: Record<string, string> = {
  approved: 'text-success', auto: 'text-brand-main', denied: 'text-danger',
  expired: 'text-ink-muted', pending: 'text-warning',
};
const ico: Record<string, string> = {
  approved: '✓', auto: '⚡', denied: '✗', expired: '⏰', pending: '⏳',
};
const tag: Record<string, string> = {
  approved: 'tag-lo', auto: 'tag-b', denied: 'tag-hi', expired: 'tag-med', pending: 'tag-med',
};

/** Extract a human-readable diff summary from action_payload */
function payloadSummary(item: NotificationData): string {
  if (item.actionType === 'none' || !item.actionPayload) return '';
  try {
    const p = JSON.parse(item.actionPayload);
    const args = p.arguments || {};
    const parts: string[] = [];
    if (args.status) parts.push(`status: → ${args.status}`);
    if (args.priority) parts.push(`priority: → ${args.priority}`);
    if (args.body) parts.push(`comment: ${String(args.body).substring(0, 80)}`);
    return parts.join(' · ');
  } catch { return ''; }
}

export function McpAuditPage() {
  const t = useT();
  const [allEntries, setAllEntries] = useState<NotificationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [agentFilter, setAgentFilter] = useState('All');
  const [daysFilter, setDaysFilter] = useState('all');

  const fetchData = useCallback(() => {
    setRefreshing(true);
    notificationApi.list({ type: 'hitl_pending' })
      .then(({ data: resp }) => {
        const items = resp.data?.items || [];
        // Sort: pending first, then by created_at desc
        items.sort((a, b) => {
          if (a.status === 'pending' && b.status !== 'pending') return -1;
          if (a.status !== 'pending' && b.status === 'pending') return 1;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        setAllEntries(items);
      })
      .finally(() => { setRefreshing(false); setLoading(false); });
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh every 10s so list stays in sync with sidebar badge
  useEffect(() => {
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleApprove = (id: string) => {
    setAllEntries(prev => prev.map(e => e.id === id ? { ...e, status: 'approved' } : e));
    notificationApi.resolve(id, 'approve').catch(() => {});
    setTimeout(fetchData, 1500);
  };
  const handleDeny = (id: string) => {
    setAllEntries(prev => prev.map(e => e.id === id ? { ...e, status: 'denied' } : e));
    notificationApi.resolve(id, 'deny').catch(() => {});
    setTimeout(fetchData, 1500);
  };

  const agents = Array.from(new Set(allEntries.map(e => e.sourceAgent).filter(Boolean))).sort();

  const filtered = allEntries.filter(e => {
    if (statusFilter !== 'All' && e.status !== statusFilter) return false;
    if (agentFilter !== 'All' && e.sourceAgent !== agentFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(e.title || '').toLowerCase().includes(q)
          && !(e.sourceAgent || '').toLowerCase().includes(q)
          && !(e.issueKey || '').toLowerCase().includes(q)) return false;
    }
    if (daysFilter !== 'all') {
      const cutoff = Date.now() - Number(daysFilter) * 86400000;
      if (new Date(e.createdAt).getTime() < cutoff) return false;
    }
    return true;
  });

  const fmtTime = (ts: string) => {
    if (!ts) return '';
    try { return new Date(ts).toLocaleString(); } catch { return ts; }
  };

  return (
    <div>
      <div className="ch">
        <div>
          <h2 className="text-base font-semibold text-ink-primary">{t.mcpAudit.title}</h2>
          <p className="text-xs text-ink-muted mt-0.5">{t.mcpAudit.description}</p>
        </div>
      </div>
      <div className="p-6" style={{ maxWidth: '800px' }}>
        <div className="flex gap-2 mb-2 items-center">
          <input className="form-input text-sm" style={{ minWidth: 0, flexShrink: 1, maxWidth: '280px' }}
            placeholder={t.mcpAudit.searchPlaceholder}
            value={search} onChange={e => setSearch(e.target.value)} />
          <select className="form-select text-sm" style={{ width: 'auto', flexShrink: 0 }}
            value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="All">{t.mcpAudit.allStatus}</option>
            <option value="pending">pending</option>
            <option value="approved">approved</option>
            <option value="auto">auto</option>
            <option value="denied">denied</option>
            <option value="expired">expired</option>
          </select>
          <select className="form-select text-sm" style={{ width: 'auto', flexShrink: 0 }}
            value={agentFilter} onChange={e => setAgentFilter(e.target.value)}>
            <option value="All">{t.mcpAudit.allAgents}</option>
            {agents.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select className="form-select text-sm" style={{ width: 'auto', flexShrink: 0 }}
            value={daysFilter} onChange={e => setDaysFilter(e.target.value)}>
            <option value="all">{t.mcpAudit.allTime}</option>
            <option value="1">{t.mcpAudit.today}</option>
            <option value="7">{t.mcpAudit.last7Days}</option>
            <option value="30">{t.mcpAudit.last30Days}</option>
          </select>
          <span style={{ flex: 1 }} />
          <button className="btn-ghost px-2" title={t.mcpAudit.refresh} onClick={fetchData} disabled={refreshing}>
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <div className="text-[0.6875rem] text-ink-muted mb-2 flex items-center gap-3">
          <span>{t.mcpAudit.entries(filtered.length, allEntries.length)}</span>
          {refreshing && <span className="text-brand-main">{t.mcpAudit.refreshing}</span>}
        </div>

        <div className="card"><div className="card-bd-nopad">
          {loading ? (
            <p className="text-center text-sm text-ink-muted py-10">{t.mcpAudit.loading}</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-ink-muted py-10">
              {allEntries.length === 0 ? t.mcpAudit.noEntries : t.mcpAudit.noFilterMatch}
            </p>
          ) : (
            filtered.map(item => {
              const isPending = item.status === 'pending';
              const summary = payloadSummary(item);
              return (
                <div key={item.id} className={cn('px-4 py-3 border-b border-edge last:border-b-0 hover:bg-surface-hover transition-colors', isPending && 'bg-warning-soft/30')}>
                  <div className="flex items-start gap-4">
                    <div className={'w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ' + (sBg[item.status] || '') + ' ' + (sClr[item.status] || '')}>{ico[item.status] || '?'}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink-primary">
                        {isPending
                          ? `${item.sourceAgent || t.mcpAudit.unknown} ${t.mcpAudit.wantsTo} ${item.title}`
                          : `${item.sourceAgent || t.mcpAudit.unknown} — ${item.title}`}
                      </p>
                      {summary && <p className="text-xs text-ink-muted mt-0.5 font-mono">{summary}</p>}
                      <p className="text-xs text-ink-muted mt-0.5">
                        {item.issueKey && <span>{item.issueKey}{item.issueTitle ? ` — ${item.issueTitle}` : ''} &middot; </span>}
                        {fmtTime(item.createdAt)}
                      </p>
                    </div>
                    {isPending ? (
                      <div className="flex gap-2 shrink-0">
                        <button className="btn-brand text-xs" style={{ padding: '3px 10px', fontSize: '11px' }}
                          onClick={(ev) => { ev.stopPropagation(); handleApprove(item.id); }}>{t.mcpAudit.approve}</button>
                        <button className="btn-secondary text-xs" style={{ padding: '3px 10px', fontSize: '11px' }}
                          onClick={(ev) => { ev.stopPropagation(); handleDeny(item.id); }}>{t.mcpAudit.deny}</button>
                      </div>
                    ) : (
                      <span className={'badge ' + (tag[item.status] || 'tag-med')}>{item.status}</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div></div>
      </div>
    </div>
  );
}
