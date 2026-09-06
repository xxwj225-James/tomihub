import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useProjectStore } from '@/stores/projectStore';
import { useLanguageStore } from '@/stores/languageStore';
import { useNavigate } from '@tanstack/react-router';
import { chatSessionApi, type ChatSession as SessionData, type ChatMessage as StoredMessage } from '@/api/chatSessionApi';
import { ChatInputArea } from '@/components/ai/ChatInputArea';
import { ChatSidebar } from '@/components/ai/ChatSidebar';
import { ChatHeader } from '@/components/ai/ChatHeader';
import { ChatConversation } from '@/components/ai/ChatConversation';
import { ChatFab } from '@/components/ai/ChatFab';
import { SessionProjectBanner } from '@/components/ai/SessionProjectBanner';
import type { ChatWelcomeT } from '@/components/ai/ChatWelcome';
import { useT } from '@/i18n/useT';
import { isDemoUser as isDemoUserEmail } from '@/lib/demoUser';
import { getLlmErrorMessage } from '@/lib/errors';

// ─── uuid — crypto.randomUUID is only available in secure contexts (HTTPS /
// localhost). The demo runs over plain HTTP on the public IP, where
// crypto.randomUUID is undefined → every message send threw
// "crypto.randomUUID is not a function". Fall back to a random-string id.
export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // RFC4122-ish v4 fallback (no crypto API required)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ToolCallRecord {
  id: string; name: string; args: Record<string, unknown>;
  result?: Record<string, unknown>; expanded?: boolean;
}

export interface ChatMessage {
  id: string;           // taskId
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;   // thinking process
  toolCalls?: ToolCallRecord[];
  status: 'running' | 'done' | 'error' | 'stopped';
  controller?: AbortController;
  timestamp: number;
}

interface SessionState {
  id: string;
  title: string;
  messages: ChatMessage[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pruneMessages(msgs: ChatMessage[]): Array<{ role: string; content: string; reasoning_content?: string }> {
  // Skip running messages — their content is incomplete, counting it underestimates tokens
  // Only count completed messages (skip running — content is incomplete)
  const done = msgs.filter(m => m.status !== 'running');
  if (done.length <= 6) return done.map(m => ({
    role: m.role, content: m.content,
    reasoning_content: (m.reasoning && m.toolCalls) ? m.reasoning : undefined,
  }));
  const keep = done.slice(-6);
  const older = done.slice(0, -6);
  const summaries: string[] = [];
  for (const m of older) {
    if (m.toolCalls) {
      const ok = m.toolCalls.filter(t => t.result?.status !== 'error' && t.result?.message);
      if (ok.length > 0) summaries.push(`[Earlier: ${ok.map(t => `${t.name} → ${t.result?.message}`).join('; ')}]`);
    }
  }
  const result: Array<{ role: string; content: string; reasoning_content?: string }> = [];
  if (summaries.length > 0) result.push({ role: 'system', content: `Earlier conversation summary:\n${summaries.join('\n')}` });
  for (const m of keep) {
    const entry: { role: string; content: string; reasoning_content?: string } = { role: m.role, content: m.content };
    if (m.reasoning && m.toolCalls && m.toolCalls.length > 0) entry.reasoning_content = m.reasoning;
    result.push(entry);
  }
  return result;
}

function getPageContext(): Record<string, string> {
  try {
    const path = window.location.pathname;
    const page = path.split('/')[1] || 'home';
    const ctx: Record<string, string> = { page };
    if (page === 'issues' && path.split('/').length > 2) ctx.issueId = path.split('/')[2];
    return ctx;
  } catch { return { page: 'unknown' }; }
}

// ═══════════════ MAIN COMPONENT ═══════════════

export function GlobalAiAssistant() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [attachFiles, setAttachFiles] = useState<Array<{name:string;type:string;data:string;size:number}>>([]);
  const [compacting, setCompacting] = useState(false);
  const [showCompactDialog, setShowCompactDialog] = useState(false);
  const [_tokenState, setTokenState] = useState<{total:number;max:number;percent:number}>({total:0,max:100000,percent:0});

  // Session-scoped messages — keyed by sessionId
  const [sessionsData, setSessionsData] = useState<Record<string, SessionState>>({});
  const sessionsDataRef = useRef<Record<string, SessionState>>({});

  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  // Demo accounts share one login — keep chat local per browser (no shared
  // history, no persisted session, no token quota)
  const isDemoUser = useAuthStore((s) => isDemoUserEmail(s.user?.email));
  const currentSidRef = useRef<string>('');

  const navigate = useNavigate();
  const { currentProject } = useProjectStore();
  const t = useT();

  // Derived
  const currentSession = currentSessionId ? sessionsData[currentSessionId] : null;
  const messages = currentSession?.messages || [];
  const isStreaming = messages.some(m => m.status === 'running');

  // ─── Helpers ─────────────────────────────────────────────────────────────

  const updateMessage = (taskId: string, patch: Partial<ChatMessage>) => {
    setSessionsData(prev => {
      const next = { ...prev };
      for (const sid of Object.keys(next)) {
        const idx = next[sid].messages.findIndex(m => m.id === taskId);
        if (idx >= 0) {
          const updated = [...next[sid].messages];
          updated[idx] = { ...updated[idx], ...patch };
          next[sid] = { ...next[sid], messages: updated };
          break;
        }
      }
      sessionsDataRef.current = next;
      return next;
    });
  };

  const ensureSession = (sid: string, title?: string) => {
    setSessionsData(prev => {
      if (prev[sid]) return prev;
      const next = { ...prev, [sid]: { id: sid, title: title || 'New Chat', messages: [] } };
      sessionsDataRef.current = next;
      return next;
    });
  };

  // ─── Session management ─────────────────────────────────────────────────

  const loadSessions = useCallback(async () => {
    // Demo users never load shared history — each browser gets a fresh, private chat
    if (isDemoUser) return;
    try {
      const { data } = await chatSessionApi.list();
      if (data?.data) setSessions(data.data);
    } catch { /* offline */ }
  }, [isDemoUser]);

  const switchSession = useCallback(async (sid: string) => {
    currentSidRef.current = sid;
    setCurrentSessionId(sid);
    // If session already exists locally (cleared or previously loaded), skip API reload
    if (sessionsDataRef.current[sid]) return;
    ensureSession(sid);
    try {
      const { data } = await chatSessionApi.loadMessages(sid);
      const msgs = data?.data || [];
      const mapped: ChatMessage[] = msgs.map((m: StoredMessage) => ({
        id: m.id, role: m.role as 'assistant' | 'user',
        content: m.content, toolCalls: m.toolCalls as ChatMessage['toolCalls'],
        status: 'done' as const, timestamp: new Date(m.createdAt).getTime(),
      }));
      setSessionsData(prev => {
        const next = { ...prev, [sid]: { id: sid, title: prev[sid]?.title || 'Chat', messages: mapped } };
        sessionsDataRef.current = next;
        return next;
      });
    } catch { /* ignore */ }
  }, []);

  const deleteSession = useCallback(async (sid: string) => {
    try { await chatSessionApi.delete(sid); } catch { /* ignore */ }
    setSessions(prev => prev.filter(s => s.id !== sid));
    setSessionsData(prev => { const n = { ...prev }; delete n[sid]; sessionsDataRef.current = n; return n; });
    if (currentSessionId === sid) {
      setCurrentSessionId('');
      currentSidRef.current = '';
    }
  }, [currentSessionId]);

  const renameSession = useCallback(async (sid: string, title: string) => {
    try { await chatSessionApi.rename(sid, title); } catch { /* ignore */ }
    setSessions(prev => prev.map(s => s.id === sid ? { ...s, title } : s));
    setSessionsData(prev => { const n = { ...prev }; if (n[sid]) n[sid] = { ...n[sid], title }; sessionsDataRef.current = n; return n; });
  }, []);

  const newSession = useCallback(async () => {
    const tempId = uuid();
    currentSidRef.current = tempId;
    setCurrentSessionId(tempId);
    ensureSession(tempId, 'New Chat');
    setTokenState({ total: 0, max: 100000, percent: 0 });
    try {
      const { data } = await chatSessionApi.create(currentProject?.id, 'New Chat');
      if (data?.data?.id) {
        setSessionsData(prev => {
          const n = { ...prev };
          if (n[tempId]) { n[data.data.id] = n[tempId]; n[data.data.id].id = data.data.id; delete n[tempId]; }
          sessionsDataRef.current = n;
          return n;
        });
        currentSidRef.current = data.data.id;
        setCurrentSessionId(data.data.id);
        loadSessions();
      }
    } catch { /* offline */ }
  }, [currentProject?.id, loadSessions]);

  // ─── Task stop ──────────────────────────────────────────────────────────

  const stopAll = () => {
    for (const sid of Object.keys(sessionsDataRef.current)) {
      for (const m of sessionsDataRef.current[sid].messages) {
        m.controller?.abort();
      }
    }
    setSessionsData(prev => {
      const next: Record<string, SessionState> = {};
      for (const sid of Object.keys(prev)) {
        next[sid] = {
          ...prev[sid],
          messages: prev[sid].messages.map(m => m.status === 'running' ? { ...m, status: 'stopped' as const } : m),
        };
      }
      sessionsDataRef.current = next;
      return next;
    });
  };

  const stopTask = (taskId: string) => {
    for (const sid of Object.keys(sessionsDataRef.current)) {
      const m = sessionsDataRef.current[sid].messages.find(msg => msg.id === taskId);
      if (m) { m.controller?.abort(); break; }
    }
    updateMessage(taskId, { status: 'stopped' });
  };

  // ─── Keyboard ───────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setOpen(o => !o); }
      if (e.key === 'Escape') { stopAll(); setOpen(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const sessionsLoaded = useRef(false);
  if (open && !sessionsLoaded.current) { sessionsLoaded.current = true; loadSessions(); }

  // ─── Project switch notification ────────────────────────────────────────

  const prevProjectRef = useRef(currentProject?.id);
  useEffect(() => {
    const prev = prevProjectRef.current;
    const curr = currentProject?.id;
    prevProjectRef.current = curr;
    if (curr && (!prev || prev !== curr)) {
      // User selected a project (either first time or switched)
      // Find the last user message and re-send it so the agent continues
      const sid = currentSidRef.current;
      const session = sid ? sessionsDataRef.current[sid] : null;
      const lastUserMsg = session?.messages
        .filter(m => m.role === 'user')
        .pop();
      const originalQuery = lastUserMsg?.content || '';
      // Re-trigger the last request with the new project context.
      // Auto-retry does NOT consume the demo trial (same message, not a new chat).
      if (originalQuery && !originalQuery.startsWith('[')) {
        doAgentChat(originalQuery, { autoRetry: true });
      }
    }
  }, [currentProject?.id]);

  // ─── Local intent matchers ──────────────────────────────────────────────

  const LOCAL_INTENTS: Array<{pattern:RegExp;handler:(m:RegExpMatchArray)=>void}> = [
    { pattern: /^(open|show|view)\s+(the\s+)?(board|kanban)$/i, handler: () => navigate({ to: '/board' }) },
    { pattern: /^(open|show|view)\s+(my\s+)?tasks$/i, handler: () => navigate({ to: '/issues' }) },
    { pattern: /^go\s+to\s+(home|dashboard)$/i, handler: () => navigate({ to: '/home' }) },
    { pattern: /^(open|show|view)\s+(the\s+)?(backlog)$/i, handler: () => navigate({ to: '/backlog' }) },
    { pattern: /^(open|show|view)\s+(the\s+)?(gantt|timeline)$/i, handler: () => navigate({ to: '/gantt' }) },
    { pattern: /^(open|show|view)\s+(the\s+)?(wiki|knowledge\s*base)$/i, handler: () => navigate({ to: '/wiki' }) },
    { pattern: /^(open|show|view)\s+(the\s+)?(reports?)$/i, handler: () => navigate({ to: '/reports' }) },
    { pattern: /^(open|show|view)\s+(the\s+)?(releases?|versions?)$/i, handler: () => navigate({ to: '/releases' }) },
    { pattern: /^create\s+(a\s+)?(new\s+)?issue$/i, handler: () => navigate({ to: '/issues/new' }) },
    { pattern: /^create\s+(a\s+)?(new\s+)?project$/i, handler: () => navigate({ to: '/projects/new' }) },
  ];

  // ─── fetchAgentSSE ──────────────────────────────────────────────────────

  const fetchAgentSSE = useCallback(async (
    messagesSnapshot: ChatMessage[], taskId: string, signal: AbortSignal,
    tokenOverride?: string, files?: Array<{name:string;type:string;data:string;size:number}>,
  ) => {
    const projectId = currentProject?.id || '';
    const token = tokenOverride || useAuthStore.getState().accessToken;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const lang = useAuthStore.getState().user?.aiLanguage || useLanguageStore.getState().lang || 'en';
    headers['X-Ai-Language'] = lang;
    const pruned = pruneMessages(messagesSnapshot);
    const pageContext = getPageContext();

    const resp = await fetch('/api/v1/ai/agent/chat', {
      method: 'POST', headers,
      body: JSON.stringify({ messages: pruned, projectId, lang, sessionId: isDemoUser ? undefined : (currentSessionId || undefined), taskId, files: files?.length ? files : undefined, context: pageContext }),
      signal,
    });
    if (resp.status === 401 && token) {
      try {
        const refreshToken = useAuthStore.getState().refreshToken;
        const refreshResp = await fetch('/api/v1/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) });
        if (refreshResp.ok) {
          const refreshData = await refreshResp.json();
          const newToken = refreshData?.data?.accessToken || refreshData?.accessToken;
          if (newToken) { useAuthStore.getState().setTokens(refreshData.data); return fetchAgentSSE(messagesSnapshot, taskId, signal, newToken, files); }
        }
      } catch { /* fall through */ }
      useAuthStore.getState().logout();
      window.location.href = '/login';
      return null;
    }
    return resp;
  }, [currentProject?.id, currentSessionId]);

  // ─── doAgentChat — fire-and-forget multi-task ──────────────────────────

  const doAgentChat = useCallback(async (userMessage: string, opts?: { autoRetry?: boolean }) => {
    if (!userMessage.trim()) return;
    const trimmed = userMessage.trim();
    const isAutoRetry = !!opts?.autoRetry;

    // Local intents
    const matchedIntent = LOCAL_INTENTS.find(i => i.pattern.test(trimmed));
    if (matchedIntent) {
      const sid = currentSessionId;
      if (sid) {
        const msg: ChatMessage = { id: uuid(), role: 'user', content: trimmed, status: 'done', timestamp: Date.now() };
        setSessionsData(prev => {
          const n = { ...prev };
          if (n[sid]) n[sid] = { ...n[sid], messages: [...n[sid].messages, msg] };
          sessionsDataRef.current = n;
          return n;
        });
      }
      setQuery('');
      matchedIntent.handler(trimmed.match(matchedIntent.pattern)!);
      return;
    }

    // Demo trial limit: 2 AI chats per browser. Local intents above are free
    // (navigation only); anything that hits the agent counts against the trial.
    // Auto-retries (project switch re-send of the SAME message) do NOT count —
    // only genuine new user sends consume the trial.
    if (isDemoUser && !isAutoRetry) {
      const KEY = 'tomihub-demo-ai-trial';
      const used = parseInt(localStorage.getItem(KEY) || '0', 10) || 0;
      if (used >= 3) {
        setError(t.aiAssistant.demoTrialLimit);
        return;
      }
      localStorage.setItem(KEY, String(used + 1));
    }

    // Cap concurrent
    const running = Object.values(sessionsData).flatMap(s => s.messages).filter(m => m.status === 'running').length;
    if (running >= 3) { setError('Please wait for running tasks to complete.'); return; }

    const taskId = uuid();
    const controller = new AbortController();
    let sid = currentSessionId;

    // Demo users get a local-only session id — chat stays in this browser,
    // nothing is persisted or sent to the server
    if (!sid && isDemoUser) {
      sid = `demo-local-${uuid()}`;
      setCurrentSessionId(sid);
    }

    if (!sid) { setError('No session. Please create a new chat first.'); return; }

    // Create user message + assistant placeholder in session
    const userMsg: ChatMessage = { id: uuid(), role: 'user', content: trimmed, status: 'done', timestamp: Date.now() };
    const assistantMsg: ChatMessage = { id: taskId, role: 'assistant', content: '', reasoning: '', status: 'running', controller, toolCalls: [], timestamp: Date.now() };

    const newMessages = [...(sessionsData[sid]?.messages || []), userMsg, assistantMsg];
    ensureSession(sid);
    setSessionsData(prev => {
      const n = { ...prev, [sid]: { ...prev[sid], messages: newMessages } };
      sessionsDataRef.current = n;
      return n;
    });
    setQuery('');

    const runTask = async () => {
      try {
        const filesToSend = attachFiles.length > 0 ? [...attachFiles] : undefined;
        setAttachFiles([]);

        // Fast classify
        try {
          const projectId = currentProject?.id || '';
          const lang = useAuthStore.getState().user?.aiLanguage || useLanguageStore.getState().lang || 'en';
          const token = useAuthStore.getState().accessToken;
          const cHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
          if (token) cHeaders['Authorization'] = `Bearer ${token}`;
          cHeaders['X-Ai-Language'] = lang;
          const classifyResp = await fetch('/api/v1/ai/agent/classify', { method: 'POST', headers: cHeaders, body: JSON.stringify({ message: userMessage, projectId, lang }), signal: controller.signal });
          if (classifyResp.ok) {
            const classifyData = await classifyResp.json();
            if (classifyData?.classification?.intent === 'ui_action') {
              const target = classifyData?.classification?.target;
              const routeMap: Record<string, string> = { board: '/board', tasks: '/issues', home: '/home', issues: '/issues', wiki: '/wiki', gantt: '/gantt', backlog: '/backlog', reports: '/reports', releases: '/releases' };
              if (target && routeMap[target]) { updateMessage(taskId, { status: 'done' }); navigate({ to: routeMap[target] }); return; }
            }
          }
        } catch { /* fall through */ }

        const resp = await fetchAgentSSE(newMessages, taskId, controller.signal, undefined, filesToSend);
        if (!resp) { updateMessage(taskId, { status: 'error', content: 'Authentication failed' }); return; }
        if (!resp.ok || !resp.body) {
          // Map read-only (demo/viewer) 403 to a friendly message; other
          // errors keep status + text. NOTE: readonly ≠ trial exhausted —
          // showing the trial text here made users think clearing localStorage
          // would fix a permission rejection.
          let friendly = `${resp.status} ${resp.statusText}`;
          try {
            const parsed = await resp.json() as { code?: string; error?: string };
            if (parsed?.code === 'readonly') friendly = t.aiAssistant.demoReadonlyError;
            else if (parsed?.error) friendly = parsed.error;
          } catch { /* non-JSON body */ }
          updateMessage(taskId, { status: 'error', content: friendly });
          return;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '', fullContent = '', fullReasoning = '';
        const toolCalls: ToolCallRecord[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          while (buffer.includes('\n\n')) {
            const frameEnd = buffer.indexOf('\n\n');
            const frame = buffer.slice(0, frameEnd);
            buffer = buffer.slice(frameEnd + 2);

            let eventType = 'message', dataStr = '';
            for (const line of frame.split('\n')) {
              if (line.startsWith('event: ')) eventType = line.slice(7).trim();
              else if (line.startsWith('data: ')) dataStr = line.slice(6);
            }
            if (!dataStr) continue;

            try {
              const data = JSON.parse(dataStr);
              switch (eventType) {
                case 'task_start':
                  if (data.sessionId && !currentSessionId && !isDemoUser) setCurrentSessionId(data.sessionId);
                  break;
                case 'thinking':
                  fullReasoning += data.text || '';
                  updateMessage(taskId, { reasoning: fullReasoning, toolCalls: [...toolCalls] });
                  break;
                case 'tool_call': {
                  const tc: ToolCallRecord = { id: data.id, name: data.name, args: data.args || {}, expanded: false };
                  toolCalls.push(tc);
                  fullContent = '';
                  updateMessage(taskId, { toolCalls: [...toolCalls], content: '' });
                  break;
                }
                case 'tool_result': {
                  const tci = toolCalls.findIndex(tc2 => tc2.id === data.id);
                  if (tci >= 0) toolCalls[tci] = { ...toolCalls[tci], result: data.result };
                  updateMessage(taskId, { toolCalls: [...toolCalls] });
                  break;
                }
                case 'token':
                  fullContent += data.text || '';
                  setTokenState(prev => ({ ...prev, total: prev.total + (data.text?.length || 0) / 2 }));
                  updateMessage(taskId, { content: fullContent });
                  break;
                case 'done':
                  if (data.sessionId && !currentSessionId && !isDemoUser) setCurrentSessionId(data.sessionId);
                  updateMessage(taskId, { status: 'done', content: fullContent, reasoning: fullReasoning, toolCalls: [...toolCalls] });
                  loadSessions();
                  return;
                case 'error':
                  updateMessage(taskId, { status: 'error', content: data.code ? getLlmErrorMessage(data.code, t.app) : (data.message || t.aiAssistant.unknownError) });
                  return;
              }
            } catch { /* skip malformed */ }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') { updateMessage(taskId, { status: 'stopped' }); return; }
        updateMessage(taskId, { status: 'error', content: (err instanceof Error ? err.message : t.aiAssistant.errorNetwork) });
      }
    };

    runTask();
  }, [currentProject?.id, currentSessionId, sessionsData, t, fetchAgentSSE, attachFiles]);

  // ─── UI handlers ────────────────────────────────────────────────────────

  const handleSend = () => { if (query.trim()) doAgentChat(query.trim()); };
  const clearHistory = async () => {
    const sid = currentSessionId;
    if (!sid) return;
    // Clear UI immediately
    setSessionsData(prev => {
      const n = { ...prev, [sid]: { ...prev[sid], messages: [] } };
      sessionsDataRef.current = n;
      return n;
    });
    // Also delete from DB — prevents messages coming back on reload
    try { await chatSessionApi.delete(sid); } catch { /* ignore */ }
    // Recreate session so sidebar entry stays
    try {
      const { data } = await chatSessionApi.create(currentProject?.id, 'Cleared Chat');
      if (data?.data?.id) {
        setSessionsData(prev => {
          const n = { ...prev };
          delete n[sid];
          n[data.data.id] = { id: data.data.id, title: 'Cleared Chat', messages: [] };
          sessionsDataRef.current = n;
          return n;
        });
        setCurrentSessionId(data.data.id);
        loadSessions();
      }
    } catch { /* offline */ }
  };

  const doCompact = async () => {
    const doneMsgs = messages.filter(m => m.status !== 'running');
    if (doneMsgs.length < 4 || compacting) return;
    setCompacting(true);
    try {
      const token = useAuthStore.getState().accessToken || '';
      const resp = await fetch('/api/v1/ai/agent/compact', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: JSON.stringify({ messages: doneMsgs, projectId: currentProject?.id || '' }) });
      if (resp.ok) {
        const data = await resp.json();
        if (data.compacted && data.messages) {
          setSessionsData(prev => {
            const sid = currentSidRef.current;
            if (!sid || !prev[sid]) return prev;
            const mapped: ChatMessage[] = data.messages.map((m: any) => ({ id: m.id || uuid(), role: m.role as 'user'|'assistant', content: m.content || '', status: 'done' as const, timestamp: Date.now() }));
            const n = { ...prev, [sid]: { ...prev[sid], messages: mapped } };
            sessionsDataRef.current = n;
            return n;
          });
        }
      }
    } catch { /* ignore */ }
    finally { setCompacting(false); }
  };

  const toggleToolExpand = useCallback((taskId: string, toolId: string) => {
    updateMessage(taskId, { toolCalls: messages.find(m => m.id === taskId)?.toolCalls?.map(t => t.id === toolId ? { ...t, expanded: !t.expanded } : t) });
  }, [messages]);

  // ─── Sidebar token percent ──────────────────────────────────────────────

  const sessionsForSidebar = sessions.map(s => ({
    id: s.id, title: s.title,
    tokenPercent: s.tokenPercent || (s.id === currentSessionId ? _tokenState.percent : 0),
  }));

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`@keyframes blink { 0%,92%,96%,100%{transform:scaleY(1)} 94%{transform:scaleY(.1)} } .blink-eye{animation:blink 3s infinite;transform-origin:center}`}</style>
      <ChatFab open={open} onClick={() => setOpen(true)} />
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => { stopAll(); setOpen(false); }} />
          <ChatSidebar sessions={sessionsForSidebar} currentSessionId={currentSessionId} onNewSession={newSession} onSwitchSession={switchSession} onDeleteSession={deleteSession} onRenameSession={renameSession} />
          <div className="fixed right-0 top-0 bottom-0 z-50 w-[600px] bg-surface-card border-l border-edge shadow-dialog flex flex-col animate-slide-in">
            <ChatHeader title={t.aiAssistant.header} clearHistoryLabel={t.aiAssistant.clearHistory} hasMessages={messages.length > 0} onClearHistory={clearHistory} onClose={() => { stopAll(); setOpen(false); }} />
            <SessionProjectBanner />
            <ChatConversation messages={messages} isStreaming={isStreaming} error={error} toggleToolExpand={toggleToolExpand} onStopTask={stopTask} hasProject={!!currentProject?.id} doAgentChat={doAgentChat} t={t.aiAssistant as unknown as ChatWelcomeT} />
            {messages.length > 0 && (
              <div className="px-4 py-1.5 border-t border-edge bg-surface-card shrink-0">
                <div className="flex items-center gap-2">
                  <div className="flex-1" style={{ height:'3px',borderRadius:2,background:'hsl(var(--surface-hover))',overflow:'hidden' }}>
                    <div style={{ height:'100%',width:`${Math.max(2,Math.min(100,_tokenState.percent))}%`,borderRadius:2,transition:'width .3s',background:_tokenState.percent>=80?'hsl(var(--danger))':_tokenState.percent>=50?'hsl(var(--brand))':'hsl(var(--success))' }} />
                  </div>
                  <button className="btn-ghost p-1 text-ink-muted hover:text-brand-main rounded-btn shrink-0" onClick={() => messages.length>=4&&setShowCompactDialog(true)} disabled={messages.length<4||compacting} title="Compress" style={{fontSize:10,display:'flex',alignItems:'center',gap:3}}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                    {compacting?'Compacting...':'Compress'}
                  </button>
                </div>
              </div>
            )}
            {showCompactDialog && (
              <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 backdrop-blur-sm">
                <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-[380px]">
                  <h3 className="text-sm font-bold text-slate-800 mb-2">Compress conversation?</h3>
                  <p className="text-xs text-slate-500 mb-4">The AI will summarize {messages.length} messages, preserving key decisions and data.</p>
                  <div className="flex gap-2 justify-end">
                    <button className="px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 rounded-xl hover:bg-slate-50 transition-colors" onClick={()=>setShowCompactDialog(false)}>Cancel</button>
                    <button className="px-4 py-2 text-xs font-semibold text-white bg-brand-main hover:bg-brand-main/90 rounded-xl transition-colors" onClick={async()=>{setShowCompactDialog(false);await doCompact()}}>Compress</button>
                  </div>
                </div>
              </div>
            )}
            <ChatInputArea input={query} setInput={setQuery} attachedFiles={attachFiles} setAttachedFiles={setAttachFiles} onSend={handleSend} isStreaming={isStreaming} onStop={stopAll} error={error} setError={setError} t={t as any} />
          </div>
        </>
      )}
    </>
  );
}
