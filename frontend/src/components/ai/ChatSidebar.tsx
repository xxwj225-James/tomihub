import { useState } from 'react';
import { cn } from '@/lib/cn';
import { X } from 'lucide-react';
import { useT } from '@/i18n/useT';

interface SessionData {
  id: string;
  title: string;
  tokenPercent: number;
  [key: string]: unknown;
}

interface ChatSidebarProps {
  sessions: SessionData[];
  currentSessionId: string;
  onNewSession: () => void;
  onSwitchSession: (sid: string) => void;
  onDeleteSession: (sid: string) => void;
  onRenameSession: (sid: string, title: string) => void;
}

export function ChatSidebar({
  sessions,
  currentSessionId,
  onNewSession,
  onSwitchSession,
  onDeleteSession,
  onRenameSession,
}: ChatSidebarProps) {
  const t = useT();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const startRename = (s: SessionData) => {
    setEditingId(s.id);
    setEditTitle(s.title);
  };

  const commitRename = () => {
    if (editingId && editTitle.trim()) {
      onRenameSession(editingId, editTitle.trim());
    }
    setEditingId(null);
    setEditTitle('');
  };

  return (
    <div className="fixed right-[600px] top-0 bottom-0 z-50 w-[200px] bg-surface-card border-r border-edge shadow-dialog flex flex-col animate-slide-in overflow-hidden">
      <div className="px-3 py-2.5 border-b border-edge shrink-0">
        <button className="w-full text-xs font-medium text-brand-main hover:bg-brand-soft rounded-btn px-2 py-1.5 transition-colors"
          onClick={onNewSession}>{'+ New Chat'}</button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 && (
          <p className="text-[0.6rem] text-ink-muted text-center py-4 px-2">{t.aiAssistant.noSessions}</p>
        )}
        {sessions.map(s => (
          <div key={s.id}
            className={cn(
              'group px-3 py-2 cursor-pointer hover:bg-surface-hover transition-colors border-b border-edge/30',
              currentSessionId === s.id && 'bg-brand-soft/50'
            )}
            onClick={() => editingId !== s.id && onSwitchSession(s.id)}>
            <div className="flex items-start justify-between gap-1">
              {editingId === s.id ? (
                <input
                  className="flex-1 text-[0.65rem] px-1 py-0.5 rounded border border-brand-main bg-surface-card text-ink-primary outline-none"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null); }}
                  autoFocus
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span
                  className="text-[0.65rem] text-ink-primary truncate flex-1 leading-tight"
                  onDoubleClick={e => { e.stopPropagation(); startRename(s); }}
                  title={t.aiAssistant.renameHint}
                >{s.title}</span>
              )}
              <button className="opacity-0 group-hover:opacity-100 text-ink-muted hover:text-danger shrink-0"
                onClick={e => { e.stopPropagation(); onDeleteSession(s.id); }}
                title={t.aiAssistant.delete}><X className="w-3 h-3" /></button>
            </div>
            <div className="mt-1 flex items-center gap-1">
              <div className="flex-1 progress" style={{ height: '3px' }}>
                <div className={cn('progress-bar',
                  s.tokenPercent >= 80 ? 'danger' : s.tokenPercent >= 50 ? 'brand' : 'success')}
                  style={{ width: `${Math.min(100, s.tokenPercent)}%` }} />
              </div>
              <span className="text-[0.55rem] text-ink-muted/60 shrink-0">{s.tokenPercent}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
