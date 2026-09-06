import { useState } from 'react';
import { cn } from '@/lib/cn';
import { sanitize } from '@/lib/sanitize';
import { renderMarkdown } from '@/lib/renderMarkdown';
import { ChatCard } from '@/components/ai/ChatCard';
import { ChevronDown, ChevronRight, Loader2, User } from 'lucide-react';
import type { ChatMessage, ToolCallRecord } from '@/components/ai/GlobalAiAssistant';
import { useT } from '@/i18n/useT';

const TOOL_ICONS: Record<string, string> = {
  search_knowledge: '🔍', get_issue: '📋', list_issues: '📋', list_my_tasks: '✅',
  get_project_stats: '📊', list_members: '👥', list_sprints: '🏃',
  create_issue: '➕', update_issue: '✏️', comment_issue: '💬',
  create_wiki: '📝', update_wiki: '📝',
};

export { renderMarkdown } from '@/lib/renderMarkdown';

// ─── Robot Face ────────────────────────────────────────────────────────────
export function RobotFace({ size = 28 }: { size?: number }) {
  const eyeW = size * 0.16, eyeH = size * 0.24, eyeGap = size * 0.35;
  return (
    <span className="relative flex flex-col items-center justify-center" style={{ width: size * 0.85, height: size * 0.85, gap: `${size * 0.08}px` }}>
      <span className="flex items-center">
        <span className="blink-eye" style={{ width: eyeW, height: eyeH, borderRadius: '50%', background: '#fff', display: 'inline-block', marginRight: `${eyeGap * 0.5}px` }} />
        <span className="blink-eye" style={{ width: eyeW, height: eyeH, borderRadius: '50%', background: '#fff', display: 'inline-block', marginLeft: `${eyeGap * 0.5}px` }} />
      </span>
      <svg width={size * 0.45} height={size * 0.16} viewBox="0 0 20 8" style={{ display: 'block', margin: '0 auto' }}>
        <path d="M2 2 Q10 12 18 2" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="4.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}

// ─── Thinking section ──────────────────────────────────────────────────────
function ThinkingSection({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <div className="mb-2">
      <button className="flex items-center gap-1.5 text-[0.6rem] text-slate-400 hover:text-brand-main transition-colors" onClick={() => setOpen(!open)}>
        <span>{open ? '▾' : '▸'}</span>
        <span>🧠 Thinking ({text.length} chars)</span>
      </button>
      {open && <div className="mt-1.5 p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-[0.65rem] text-slate-500 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">{text}</div>}
    </div>
  );
}

// ─── ToolCallCard ─────────────────────────────────────────────────────────
function ToolCard({ tc, onToggle }: { tc: ToolCallRecord; onToggle: () => void }) {
  const t = useT();
  return (
    <div className="bg-white rounded-lg border border-slate-200/80 overflow-hidden">
      <button className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[0.6rem] hover:bg-slate-50/50 transition-colors" onClick={onToggle}>
        {tc.expanded !== false ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
        <span>{TOOL_ICONS[tc.name] || '🔧'}</span>
        <span className="font-medium text-slate-700">{(t.aiAssistant.toolLabels as Record<string,string>)[tc.name] || tc.name}</span>
        {tc.result ? (
          <span className={cn('text-[0.55rem] px-1.5 py-0.5 rounded-full ml-auto', tc.result.status === 'error' ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600')}>
            {tc.result.status === 'error' ? 'Failed' : 'Done'}
          </span>
        ) : <Loader2 className="w-3 h-3 animate-spin ml-auto text-slate-400" />}
      </button>
      {tc.expanded !== false && (
        <div className="px-2 pb-2 border-t border-slate-100">
          {tc.args && Object.keys(tc.args).length > 0 && (
            <div className="mt-1.5">
              <div className="text-[0.55rem] text-slate-400 uppercase tracking-wider mb-0.5">Args</div>
              <pre className="text-[0.55rem] text-slate-600 bg-slate-50 rounded p-1.5 overflow-x-auto max-h-24">{JSON.stringify(tc.args, null, 1)}</pre>
            </div>
          )}
          {tc.result && (
            <div className="mt-1.5">
              <div className="text-[0.55rem] text-slate-400 uppercase tracking-wider mb-0.5">Result</div>
              <pre className="text-[0.55rem] text-slate-600 bg-slate-50 rounded p-1.5 overflow-x-auto max-h-32 whitespace-pre-wrap">{typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result, null, 1)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Chat Message Bubble ────────────────────────────────────────────────────
interface Props {
  message: ChatMessage;
  onToggleToolExpand: (toolId: string) => void;
  onStopTask: () => void;
}

export function ChatMessageBubble({ message: msg, onToggleToolExpand, onStopTask }: Props) {
  const isRunning = msg.status === 'running';
  const isError = msg.status === 'error';
  const isStopped = msg.status === 'stopped';

  return (
    <div className={cn('flex gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
      {msg.role === 'assistant' && (
        <div className="w-7 h-7 rounded-full bg-brand-main flex items-center justify-center shrink-0 mt-0.5">
          <RobotFace size={14} />
        </div>
      )}

      <div className={cn('max-w-[82%]', msg.role === 'user' ? 'order-1' : '')}>
        {/* User message */}
        {msg.role === 'user' && msg.content && (
          <div className="rounded-2xl rounded-br-md px-4 py-2.5 bg-brand-main text-white text-sm leading-relaxed">
            <span>{msg.content}</span>
          </div>
        )}

        {/* Assistant — running state */}
        {msg.role === 'assistant' && isRunning && (
          <div className={cn('rounded-2xl rounded-bl-md border transition-all', isError ? 'border-red-200 bg-red-50/20' : 'border-blue-200/60 bg-blue-50/20')}>
            {/* Status bar */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-inherit">
              <div className="flex items-center gap-2">
                <span className={cn('w-2 h-2 rounded-full', isError ? 'bg-red-500' : 'bg-blue-500 animate-pulse')} />
                <span className="text-[0.6rem] font-medium text-slate-500">{isError ? 'Error' : 'Running...' }</span>
              </div>
              <button className="text-[0.6rem] text-slate-400 hover:text-red-500 font-medium" onClick={onStopTask}>✕ Stop</button>
            </div>
            {/* Body */}
            <div className="px-3 py-2">
              {msg.reasoning && <ThinkingSection text={msg.reasoning} />}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="mb-2 space-y-1">
                  {msg.toolCalls.map(tc => {
                    const hasRich = tc.result && Object.keys(tc.result).length > 1;
                    return (
                      <div key={tc.id}>
                        <ToolCard tc={tc} onToggle={() => onToggleToolExpand(tc.id)} />
                        {hasRich && <ChatCard toolName={tc.name} result={tc.result!} />}
                      </div>
                    );
                  })}
                </div>
              )}
              {msg.content ? (
                <div className="text-sm leading-relaxed prose prose-sm max-w-none text-slate-700" dangerouslySetInnerHTML={{ __html: sanitize(renderMarkdown(msg.content)) }} />
              ) : !msg.reasoning && (!msg.toolCalls || msg.toolCalls.length === 0) ? (
                <div className="flex items-center gap-2 text-sm text-slate-400 py-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Analyzing...
                </div>
              ) : null}
              {isError && msg.content && <div className="p-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600 mt-2">{msg.content}</div>}
              {isStopped && <p className="text-xs text-slate-400 italic py-1">Task stopped.</p>}
            </div>
          </div>
        )}

        {/* Assistant — error state (terminal, not running) */}
        {msg.role === 'assistant' && msg.status === 'error' && (
          <div>
            <div className="rounded-2xl rounded-bl-md px-4 py-2.5 border border-red-200/60 bg-red-50/40">
              <p className="text-xs font-medium text-red-600 mb-0.5">⚠️ Error</p>
              {msg.content ? (
                <div className="text-sm leading-relaxed text-red-700">{msg.content}</div>
              ) : (
                <div className="text-sm leading-relaxed text-red-500">Something went wrong.</div>
              )}
            </div>
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div className="mt-1 space-y-1">
                {msg.toolCalls.map(tc => <ToolCard key={tc.id} tc={tc} onToggle={() => onToggleToolExpand(tc.id)} />)}
              </div>
            )}
          </div>
        )}

        {/* Assistant — completed state */}
        {msg.role === 'assistant' && msg.status === 'done' && (
          <div>
            {msg.reasoning && <ThinkingSection text={msg.reasoning} />}
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div className="mb-2 space-y-1">
                {msg.toolCalls.map(tc => {
                  const hasRich = tc.result && Object.keys(tc.result).length > 1;
                  return (
                    <div key={tc.id}>
                      <ToolCard tc={tc} onToggle={() => onToggleToolExpand(tc.id)} />
                      {hasRich && <ChatCard toolName={tc.name} result={tc.result!} />}
                    </div>
                  );
                })}
              </div>
            )}
            {msg.content && (
              <div className="rounded-2xl rounded-bl-md px-4 py-2.5 bg-surface-hover border border-edge/20">
                <div className="text-sm leading-relaxed prose prose-sm max-w-none text-ink-primary" dangerouslySetInnerHTML={{ __html: sanitize(renderMarkdown(msg.content)) }} />
              </div>
            )}
          </div>
        )}
      </div>

      {msg.role === 'user' && (
        <div className="w-7 h-7 rounded-full bg-ink-primary/8 flex items-center justify-center shrink-0 mt-0.5">
          <User className="w-4 h-4 text-ink-muted" />
        </div>
      )}
    </div>
  );
}
