import { useT } from '@/i18n/useT';
import { cn } from '@/lib/cn';

interface ReportSendModalProps {
  sendOpen: boolean;
  setSendOpen: (o: boolean) => void;
  sendTab: 'email' | 'in_app';
  setSendTab: (t: 'email' | 'in_app') => void;
  sendTo: string;
  setSendTo: (s: string) => void;
  sendCC: string;
  setSendCC: (s: string) => void;
  sendSubject: string;
  setSendSubject: (s: string) => void;
  sendFeedback: string;
  setSendFeedback: (s: string) => void;
  sending: boolean;
  setSending: (s: boolean) => void;
  workspaceMembers: Array<{ userId: string; displayName: string; email: string }>;
  memberSearch: string;
  setMemberSearch: (s: string) => void;
  selectedUserIds: Set<string>;
  setSelectedUserIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  onSend: () => void;
  userId?: string;
}

export function ReportSendModal({
  sendOpen,
  setSendOpen,
  sendTab,
  setSendTab,
  sendTo,
  setSendTo,
  sendCC,
  setSendCC,
  sendSubject,
  setSendSubject,
  sendFeedback,
  sending,
  workspaceMembers,
  memberSearch,
  setMemberSearch,
  selectedUserIds,
  setSelectedUserIds,
  onSend,
  userId,
}: ReportSendModalProps) {
  const t = useT();

  if (!sendOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[999]" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setSendOpen(false)} />
      <div className="fixed z-[1000] card" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '520px' }}>
        <div className="card-hd flex items-center justify-between">
          <h3>{t.report.sendReport}</h3>
          <button className="btn-ghost text-xs" onClick={() => setSendOpen(false)}>✕</button>
        </div>
        <div className="card-bd p-4">
          <div className="flex gap-2 mb-4">
            <button className="btn-secondary btn-xs" style={sendTab === 'email' ? { background: 'hsl(var(--brand-soft))', color: 'hsl(var(--brand))', fontWeight: 600 } : {}}
              onClick={() => setSendTab('email')}>📧 {t.report.email}</button>
            <button className="btn-secondary btn-xs" style={sendTab === 'in_app' ? { background: 'hsl(var(--brand-soft))', color: 'hsl(var(--brand))', fontWeight: 600 } : {}}
              onClick={() => setSendTab('in_app')}>🔗 {t.report.inAppShare}</button>
          </div>
          {sendTab === 'email' ? (
            <>
              <div className="form-grp"><label className="form-label">{t.report.to}</label><input className="form-input text-sm" placeholder={t.report.emailPlaceholder} value={sendTo} onChange={e => setSendTo(e.target.value)} /></div>
              <div className="form-grp"><label className="form-label">{t.report.cc}</label><input className="form-input text-sm" placeholder={t.report.ccPlaceholder} value={sendCC} onChange={e => setSendCC(e.target.value)} /></div>
              <div className="form-grp"><label className="form-label">{t.report.subject}</label><input className="form-input text-sm" value={sendSubject} onChange={e => setSendSubject(e.target.value)} /></div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="form-grp">
                <label className="form-label">{t.report.shareWithMembers}</label>
                <p className="text-xs text-ink-muted mb-2">{t.report.shareDesc}</p>
              </div>
              <input className="form-input text-sm" placeholder={t.report.searchMembers}
                value={memberSearch} onChange={e => setMemberSearch(e.target.value)} />
              <div className="border border-edge rounded-card max-h-40 overflow-y-auto">
                {workspaceMembers.filter(m => {
                  if (m.userId === userId) return false;
                  const q = memberSearch.toLowerCase();
                  return !q || m.displayName?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q);
                }).slice(0, 20).map(m => {
                  const sel = selectedUserIds.has(m.userId);
                  return (
                    <div key={m.userId} className={cn('flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs hover:bg-surface-hover', sel && 'bg-brand-soft/20')}
                      onClick={() => setSelectedUserIds(prev => { const next = new Set(prev); if (sel) { next.delete(m.userId); } else { next.add(m.userId); } return next; })}>
                      <div className="w-4 h-4 rounded border border-edge flex items-center justify-center shrink-0">{sel && '✓'}</div>
                      <span className="font-medium text-ink-primary flex-1 truncate">{m.displayName}</span>
                      <span className="text-ink-muted truncate">{m.email}</span>
                    </div>
                  );
                })}
                {workspaceMembers.length === 0 && <p className="px-3 py-4 text-xs text-ink-muted text-center">{t.report.loadingMembers}</p>}
                {workspaceMembers.length > 0 && memberSearch && workspaceMembers.filter(m => {
                  const q = memberSearch.toLowerCase();
                  return q && (m.displayName?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q));
                }).length === 0 && <p className="px-3 py-4 text-xs text-ink-muted text-center">{t.report.noMatch} "{memberSearch}"</p>}
              </div>
              {selectedUserIds.size > 0 && (
                <div className="flex flex-wrap gap-1">
                  {Array.from(selectedUserIds).map(uid => {
                    const m = workspaceMembers.find(x => x.userId === uid);
                    return <span key={uid} className="badge bg-brand-soft/30 text-brand-main text-[0.65rem] flex items-center gap-1 cursor-pointer"
                      onClick={() => setSelectedUserIds(prev => { const next = new Set(prev); next.delete(uid); return next; })}>
                      {m?.displayName || uid} ✕</span>;
                  })}
                </div>
              )}
            </div>
          )}
          {sendFeedback && (
            <p className={cn('text-xs mt-2', sendFeedback.includes('Failed') || sendFeedback.includes('failed') ? 'text-status-danger' : 'text-ink-muted')}>{sendFeedback}</p>
          )}
          <div className="flex gap-2 justify-end mt-4 pt-4 border-t border-edge">
            <button className="btn-secondary text-sm" onClick={() => setSendOpen(false)} disabled={sending}>{t.report.cancel}</button>
            <button className="btn-brand text-sm" onClick={onSend} disabled={sending}>{sending ? t.report.sending : sendTab === 'email' ? '📧 ' + t.report.sendEmail : '↗ ' + t.report.share}</button>
          </div>
        </div>
      </div>
    </>
  );
}
