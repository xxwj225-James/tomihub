import { useState, useEffect } from 'react';
import { RobotFace } from '@/components/ai/ChatMessageBubble';
import { Trash2, X } from 'lucide-react';
import http from '@/lib/http';

interface ChatHeaderProps {
  title: string;
  clearHistoryLabel: string;
  hasMessages: boolean;
  onClearHistory: () => void;
  onClose: () => void;
}

async function fetchChatPref(): Promise<boolean> {
  try {
    const token = localStorage.getItem('access_token');
    if (!token) return false;
    const resp = await http.get('/ai/chat/user/chat-preference');
    return !!(resp.data as any)?.enabled;
  } catch { return false; }
}

async function saveChatPref(enabled: boolean): Promise<void> {
  try {
    await http.put('/ai/chat/user/chat-preference', { enabled });
  } catch { /* ignore */ }
}

export function ChatHeader({
  title, clearHistoryLabel, hasMessages, onClearHistory, onClose,
}: ChatHeaderProps) {
  const [saveHistory, setSaveHistory] = useState(false);

  useEffect(() => { fetchChatPref().then(setSaveHistory); }, []);

  const toggleSave = async () => {
    const next = !saveHistory;
    setSaveHistory(next);
    await saveChatPref(next);
  };

  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-edge shrink-0 bg-surface-card">
      <div className="flex items-center gap-2">
        <span className="w-5 h-5 rounded-md bg-brand-main flex items-center justify-center"><RobotFace size={16} /></span>
        <span className="text-sm font-semibold text-ink-primary">{title}</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          className={`text-[0.55rem] font-medium px-2 py-1 rounded-full transition-colors ${saveHistory ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}
          onClick={toggleSave}
          title={saveHistory ? 'Chat history: saved' : 'Chat history: not saved'}
        >
          {saveHistory ? '● Saved' : '○ Not saved'}
        </button>
        {hasMessages && (
          <button className="btn-ghost p-1.5 text-ink-muted hover:text-danger rounded-btn" onClick={onClearHistory} title={clearHistoryLabel}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
        <button className="btn-ghost p-1.5 text-ink-muted hover:text-ink-primary rounded-btn" onClick={onClose}>
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
