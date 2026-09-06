import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link, Outlet } from '@tanstack/react-router';
import { cn } from '@/lib/cn';
import { aiEnabled } from '@/lib/aiGate';
import { isDemoUser as isDemoUserEmail } from '@/lib/demoUser';
import { useAuthStore } from '@/stores/authStore';
import { useProjectStore } from '@/stores/projectStore';
import { ThemeSwitcher } from './ThemeSwitcher';
import { GlobalAiAssistant } from '@/components/ai/GlobalAiAssistant';
import { LanguageSwitcher } from './LanguageSwitcher';
import { NotificationPanel, type NotifItem } from './NotificationPanel';
import { useT } from '@/i18n/useT';
import { Client } from '@stomp/stompjs';
import http from '@/lib/http';
import { notificationApi } from '@/api/notificationApi';

const icons: Record<string, string> = {
  home: 'M10.707 2.293a1 1 0 00-1.414 0l-7 7A1 1 0 003 11h1v6a1 1 0 001 1h4v-4a1 1 0 011-1h2a1 1 0 011 1v4h4a1 1 0 001-1v-6h1a1 1 0 00.707-1.707l-7-7z',
  overview: 'M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm6 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zm-6 6a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm6 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z',
  board:'M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1V6a1 1 0 011-1h4zM4 13a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zm10-1a1 1 0 00-1 1v3a1 1 0 001 1h4a1 1 0 001-1v-3a1 1 0 00-1-1h-4z',
  issues: 'M9 4.5a1 1 0 012 0v1.5h2.5a1 1 0 010 2H11v2.5a1 1 0 01-2 0V8H6.5a1 1 0 010-2H9V4.5zM3.5 4a1 1 0 00-1 1v11a1 1 0 001 1h11a1 1 0 001-1V5a1 1 0 00-1-1h-11z',
  sprint: 'M12 8v4l3 3M3.05 11a8 8 0 1115.9 0M3.05 11a8 8 0 100 2m0-2h2m-2 2v2m0-2H3',
  gantt: 'M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h8a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h10a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1z',
  settings: 'M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z',
  reports: 'M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11 4a1 1 0 10-2 0v4a1 1 0 102 0V7zm-3 1a1 1 0 10-2 0v3a1 1 0 102 0V8zM8 9a1 1 0 00-2 0v2a1 1 0 102 0V9z',
  members: 'M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z',
  roles: 'M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z',
  apikeys: 'M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v-2l.743-.743L6 12.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z',
  chatops: 'M5 2a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V4a2 2 0 00-2-2H5zm0 2h10v12H5V4zm5 9a1 1 0 100-2 1 1 0 000 2zm-3-5a1 1 0 011-1h.01a1 1 0 010 2H8a1 1 0 01-1-1z',
  profile: 'M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z',
  audit: 'M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z',
  bell: 'M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z',
  chevronDown: 'M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z',
};

export function AppLayout() {
  const t = useT();
  const { user, logout } = useAuthStore();
  const { projects, currentProject, fetchProjects, setCurrentProject } = useProjectStore();
  const navigate = useNavigate();
  const [collapsed] = useState(false);
  const [sidebarPos, setSidebarPos] = useState<'left'|'right'>(() => (localStorage.getItem('sidebarPos') as 'left'|'right') || 'left');
  const [projectSwitcherOpen, setProjectSwitcherOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotifItem[]>([]);
  const [pendingAuditCount, setPendingAuditCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  // Global read-only notice — fired by http.ts when a write is rejected with 403
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [permissionDeniedMsg, setPermissionDeniedMsg] = useState('');
  useEffect(() => {
    const h = (e: Event) => {
      const detail = (e as CustomEvent<{ message?: string }>).detail;
      setPermissionDeniedMsg(detail?.message || '');
      setPermissionDenied(true);
      window.setTimeout(() => setPermissionDenied(false), 4000);
    };
    window.addEventListener('tl-permission-denied', h);
    return () => window.removeEventListener('tl-permission-denied', h);
  }, []);
  // Live-demo quota exhausted (429) → persistent banner with a trial CTA
  const [quotaMsg, setQuotaMsg] = useState('');
  useEffect(() => {
    const h = (e: Event) => {
      const detail = (e as CustomEvent<{ message?: string }>).detail;
      setQuotaMsg(detail?.message || '');
    };
    window.addEventListener('tl-quota-exhausted', h);
    return () => window.removeEventListener('tl-quota-exhausted', h);
  }, []);

  // Check trial/license status — skip if no tenant (select-tenant page), run when tenant changes
  const tid = useAuthStore(s => s.currentTenant?.id);
  // TenantVO.role is persisted in the auth store, so the ADMIN section renders
  // synchronously on first paint — no flash of missing sidebar, no dependence
  // on an async /tenant-members round-trip that may fail or race navigation.
  const tenantRole = useAuthStore(s => s.currentTenant?.role);
  const isDemoUser = useAuthStore(s => isDemoUserEmail(s.user?.email));
  // Demo visitors must NOT see the admin section — live demo exposes everything
  // except admin functions (system settings, members, roles).
  const canSeeAdmin = !isDemoUser && (tenantRole === 'owner' || tenantRole === 'admin');
  useEffect(() => { if (canSeeAdmin) setIsAdmin(true); }, [canSeeAdmin]);

  // Live-demo quota rules — fetched from ai-brain (GET /api/v1/ai/demo/quota-rules)
  // so the limits shown to the demo visitor match the server's actual config.
  // Fallbacks below mirror the backend defaults if the fetch fails.
  const [demoQuota, setDemoQuota] = useState<{ aiPerFeaturePerDay?: number; reportsPerIpCumulative?: number; issuesPerIpCumulative?: number } | null>(null);
  const [showDemoQuota, setShowDemoQuota] = useState(false);
  useEffect(() => {
    if (!isDemoUser) return;
    http.get('/ai/demo/quota-rules').then(({ data }: { data: Record<string, unknown> }) => {
      setDemoQuota((data?.data as typeof demoQuota) ?? null);
    }).catch(() => { /* keep defaults */ });
  }, [isDemoUser]);

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);
  const sidebarWidth = collapsed ? 52 : 220;

  useEffect(() => { if (tid) fetchProjects(); }, [fetchProjects, tid]);

  // ─── WebSocket notifications + initial fetch ───
  useEffect(() => {
    if (!tid) return;
    // Cross-check workspace role from the authoritative member list — the
    // store role already rendered ADMIN synchronously; this only corrects
    // downwards if the persisted role was stale, and never hides ADMIN on
    // a transient fetch failure.
    http.get('/tenant-members').then(({ data }: { data: Record<string, unknown> }) => {
      const membersData = Array.isArray(data?.data) ? data.data as Array<Record<string, unknown>> : [];
      const me = membersData.find(m => m.id === user?.id || m.userId === user?.id);
      const memberRole = me?.role as string | undefined;
      if (memberRole === 'owner' || memberRole === 'admin') {
        setIsAdmin(true);
      } else if (memberRole === 'viewer' || memberRole === 'member') {
        // Authoritative non-admin — hide ADMIN even if the persisted role said
        // admin (e.g. role was revoked in another session). Demo visitors are
        // members and must not see the admin section either.
        setIsAdmin(false);
      }
    }).catch(() => { /* keep the persisted-role decision on failure */ });

    // Initial fetch of existing notifications
    http.get('/notifications').then((resp) => {
      const pageResult = resp.data as { data?: { items?: Array<{
        id: string; type: string; title: string; body?: string; actionType: string;
        sourceAgent?: string; issueKey?: string; issueTitle?: string; projectId?: string;
        createdAt: string; status: string; actionPayload?: string; resolvedAt?: string; readAt?: string;
      }> } };
      const tasks = pageResult?.data?.items || [];
      setNotifications(tasks.map(t => {
        const pName = t.projectId ? useProjectStore.getState().projects.find(p => p.id === t.projectId)?.name : undefined;
        return {
          id: t.id, type: (t.type === 'hitl_pending' && t.status === 'pending') ? 'approval' as const : 'task' as const,
          title: t.title,
          detail: t.issueKey ? `Issue: ${t.issueKey}` : t.body || '',
          projectName: pName,
          time: new Date(t.createdAt).toLocaleTimeString(),
          status: t.status,
          hitlTaskId: t.type === 'hitl_pending' ? t.id : undefined,
          agentName: t.sourceAgent,
          read: !!t.readAt,
        };
      }));
      setPendingAuditCount(tasks.filter(t => t.type === 'hitl_pending' && t.status === 'pending').length);
    }).catch(() => {});

    // WebSocket real-time updates via STOMP
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const client = new Client({
      brokerURL: `${proto}//${window.location.host}/ws`,
      reconnectDelay: 5000,
    });
    client.onConnect = () => {
      client.subscribe('/user/queue/notifications', (msg) => {
        try {
          const n = JSON.parse(msg.body);
          setNotifications(prev => {
            const pName = n.projectId ? useProjectStore.getState().projects.find(p => p.id === n.projectId)?.name : undefined;
            return [{
              id: n.id, type: 'task' as const,
              title: n.title, detail: n.body || '',
              projectName: pName,
              time: new Date().toLocaleTimeString(),
            }, ...prev];
          });
          if (n.type === 'hitl_pending') setPendingAuditCount(c => c + 1);
        } catch { /* noop */ }
      });
    };
    try { client.activate(); } catch { /* WebSocket optional */ }

    // Polling fallback — poll all + pending HITL count
    // Uses recursive setTimeout so the interval can change at runtime
    // (users adjust it in Profile → Notification Settings, stored in localStorage).
    const doPoll = async () => {
      try {
        const { data: resp } = await http.get('/notifications');
        const pageResult = resp as { data?: { items?: Array<Record<string, unknown>> } };
        const tasks = pageResult?.data?.items || [];
        setNotifications(tasks.map(t => {
          const tProjectId = t.projectId as string | undefined;
          const pName = tProjectId ? useProjectStore.getState().projects.find(p => p.id === tProjectId)?.name : undefined;
          return {
            id: t.id as string,
            type: (t.type === 'hitl_pending' && t.status === 'pending') ? 'approval' as const : 'task' as const,
            title: t.title as string, detail: (t.body as string) || '',
            projectName: pName,
            time: new Date(t.createdAt as string).toLocaleTimeString(),
            status: t.status as string,
            hitlTaskId: t.type === 'hitl_pending' ? t.id as string : undefined,
            read: !!t.readAt,
          };
        }));
      } catch { /* noop */ }
      // Pending HITL count — dedicated API call for accuracy
      try {
        const { data: resp2 } = await http.get('/notifications', { params: { type: 'hitl_pending', status: 'pending' } });
        const pr2 = resp2 as { data?: { items?: Array<unknown> } };
        setPendingAuditCount(pr2?.data?.items?.length || 0);
      } catch { /* noop */ }
    };
    let pollTimer = 0;
    const scheduleNext = () => {
      const ms = parseInt(localStorage.getItem('notifRefreshInterval') || '30', 10) * 1000;
      pollTimer = window.setTimeout(async () => {
        await doPoll();
        scheduleNext();  // re-read interval from localStorage each cycle
      }, ms);
    };
    doPoll().then(scheduleNext);
    return () => { try { client.deactivate(); } catch { /* noop */ } clearTimeout(pollTimer); };
  }, [user?.id]);
  useEffect(() => {
    if (!currentProject && projects && projects.length > 0) setCurrentProject(projects[0]);
  }, [projects, currentProject, setCurrentProject]);

  const handleRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    notificationApi.markRead(id).catch(() => {});
  };

  const handleMarkAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    // Persist to backend — mark EVERY unread notification as read (not just HITL)
    notifications.filter(n => !n.read).forEach(n => {
      http.post(`/notifications/${n.id}/read`).catch(() => {});
    });
  };

  const handleApprove = (taskId: string) => {
    setNotifications(prev => prev.filter(n => n.hitlTaskId !== taskId));
    // Call unified notifications API (primary) + Python MCP (backward compat)
    http.post(`/notifications/${taskId}/resolve`, { action: 'approve' }).catch(() => {});
    http.post(`/mcp/tasks/${taskId}/confirm`, { action: 'approve' }).catch(() => {});
  };

  const handleDeny = (taskId: string) => {
    setNotifications(prev => prev.filter(n => n.hitlTaskId !== taskId));
    http.post(`/notifications/${taskId}/resolve`, { action: 'deny' }).catch(() => {});
    http.post(`/mcp/tasks/${taskId}/confirm`, { action: 'deny' }).catch(() => {});
  };

  const setSidebarWithPersist = (pos: 'left'|'right') => { setSidebarPos(pos); localStorage.setItem('sidebarPos', pos); };

  return (
    <div className="flex h-full overflow-hidden" style={{ flexDirection: sidebarPos === 'right' ? 'row-reverse' : 'row' }}>
      {/* ═══ SIDEBAR ═══ */}
      <aside
        className="flex flex-col shrink-0 transition-all duration-200 bg-surface-sidebar"
        style={{ width: `${sidebarWidth}px`, borderRight: sidebarPos === 'left' ? '1px solid hsl(var(--edge-sidebar))' : 'none', borderLeft: sidebarPos === 'right' ? '1px solid hsl(var(--edge-sidebar))' : 'none' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-[10px] px-4 h-12 border-b border-edge-sidebar bg-surface-sidebar">
          <img src="/icon.png" alt="" draggable={false} className="w-7 h-7 shrink-0 select-none" />
          {!collapsed && <span className="text-sm font-semibold tracking-tight text-ink-sidebar-active">{t.app.name}</span>}
        </div>

        <nav className="sb-nav bg-surface-sidebar">
          {/* ═══ USER-LEVEL: Notifications ═══ */}
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="sidebar-link w-full relative"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path d={icons.bell} />
            </svg>
            {!collapsed && <span>{t.nav.notifications}</span>}
            {unreadCount > 0 && !collapsed && (
              <span className="badge text-white" style={{ background: 'hsl(var(--danger))', minWidth: '18px', textAlign: 'center' }}>
                {unreadCount}
              </span>
            )}
            {collapsed && unreadCount > 0 && (
              <span className="absolute top-0 right-0 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[0.45rem] font-bold bg-danger text-white"
                style={{ transform: 'translate(25%, -25%)' }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* ═══ Home ═══ */}
          <Link to="/home" className="sidebar-link" activeProps={{ className: 'sidebar-link-active' }}>
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path d={icons.home} fillRule="evenodd" clipRule="evenodd" />
            </svg>
            {!collapsed && <span>{t.nav.home}</span>}
          </Link>

          {/* ═══ PROJECT SECTION (only visible after joining a project) ═══ */}
          {projects && projects.length > 0 && (
            <>
              {!collapsed && <div className="sb-label">{t.sidebar.project}</div>}

              {/* Project Selector */}
              {!collapsed ? (
                <div className="relative px-0.5 pb-1">
                  <button
                    onClick={() => setProjectSwitcherOpen(!projectSwitcherOpen)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-btn text-sm text-ink-sidebar hover:bg-surface-hover/10 hover:text-ink-sidebar-active transition-colors"
                  >
                    <span className="w-5 h-5 rounded flex items-center justify-center text-[0.6rem] font-bold shrink-0 bg-brand-main/20 text-brand-main">
                      {(currentProject?.name || '')
                        .split(/\s+/)
                        .filter(w => /[A-Za-z]/.test(w[0] || ''))
                        .map(w => w[0])
                        .join('')
                        .substring(0, 2)
                        .toUpperCase() || 'AI'}
                    </span>
                    <span className="truncate text-xs flex-1 text-left">
                      {currentProject?.name || t.app.name}
                    </span>
                    <svg className="w-3 h-3 shrink-0 text-ink-muted" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d={icons.chevronDown} clipRule="evenodd" />
                    </svg>
                  </button>
                  {projectSwitcherOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setProjectSwitcherOpen(false)} />
                      <div className="absolute top-full left-1 right-1 z-50 mt-1 card shadow-dialog overflow-hidden">
                        <div className="card-bd-nopad max-h-48 overflow-y-auto">
                          {projects.map((p) => (
                            <button
                              key={p.id}
                              onClick={() => {
                                const changed = currentProject?.id !== p.id;
                                setCurrentProject(p); setProjectSwitcherOpen(false);
                                if (changed) navigate({ to: '/project-overview', replace: true });
                              }}
                              className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-surface-hover transition-colors"
                            >
                              <span className="w-5 h-5 rounded flex items-center justify-center text-[0.55rem] font-bold shrink-0 bg-brand-soft text-brand-main">
                                {(p.name || '').split(/\s+/).filter(w => /[A-Za-z]/.test(w[0] || '')).map(w => w[0]).join('').substring(0, 2).toUpperCase() || p.key.substring(0, 2)}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-ink-primary truncate">{p.name}</p>
                                <p className="text-[0.625rem] text-ink-muted">{p.key}</p>
                              </div>
                              {p.id === currentProject?.id && (
                                <span className="w-1.5 h-1.5 rounded-full bg-brand-main shrink-0" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex justify-center py-1">
                  <button
                    onClick={() => setProjectSwitcherOpen(!projectSwitcherOpen)}
                    className="w-7 h-7 flex items-center justify-center rounded-btn text-[0.5rem] font-bold bg-brand-main/20 text-brand-main"
                    title={currentProject?.name || t.sidebar.selectProject}
                  >
                    {currentProject?.key?.substring(0, 2) || 'AI'}
                  </button>
                </div>
              )}

              {/* Project-scoped nav */}
              {(() => {
                const items = [
                  { icon: 'overview', label: t.nav.overview, to: '/project-overview' },
                  ...(aiEnabled ? [{ icon: 'board', label: t.nav.aiInsights, to: '/project-knowledge' }] : []),
                  { icon: 'board', label: t.nav.board, to: '/board' },
                  { icon: 'issues', label: t.nav.backlog, to: '/backlog' },
                  { icon: 'issues', label: t.nav.issues, to: '/issues' },
                  { icon: 'board', label: t.nav.sprintPlanning, to: '/sprints/planning' },
                  { icon: 'gantt', label: t.nav.gantt, to: '/gantt' },
                  { icon: 'settings', label: t.nav.settings, to: '/settings' },
                ];
                return items.map((item) => (

                <Link
                  key={item.to}
                  to={item.to}
                  className="sidebar-link"
                  activeProps={{ className: 'sidebar-link-active' }}
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path d={icons[item.icon]} fillRule="evenodd" clipRule="evenodd" />
                  </svg>
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              ))
            })()}
            </>
          )}

          {/* ═══ ADMIN SECTION ═══ */}
          {isAdmin && !collapsed && <div className="sb-sep" />}
          {isAdmin && !collapsed && <div className="sb-label">{t.sidebar.admin}</div>}
          {isAdmin && [
            { icon: 'members', label: t.sidebar.members, to: '/members' },
            { icon: 'settings', label: t.nav.settings, to: '/admin-settings' },
            { icon: 'reports', label: t.nav.batchMonitor, to: '/batch-monitor' },
          ].map((item) => (
            <Link
              key={item.icon}
              to={item.to}
              className="sidebar-link"
              activeProps={{ className: 'sidebar-link-active' }}
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path d={icons[item.icon]} fillRule="evenodd" clipRule="evenodd" />
              </svg>
              {!collapsed && <span className="text-xs">{item.label}</span>}
            </Link>
          ))}

          {/* ═══ ACCOUNT SECTION ═══ */}
          {!collapsed && <div className="sb-sep" />}
          {!collapsed && <div className="sb-label">{t.sidebar.account}</div>}
          {[
            { icon: 'profile', label: t.sidebar.profile, to: '/profile' },
            { icon: 'apikeys', label: t.sidebar.apiKeys, to: '/api-keys' },
          ].map((item) => (
            <Link
              key={item.icon}
              to={item.to}
              className="sidebar-link"
              activeProps={{ className: 'sidebar-link-active' }}
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path d={icons[item.icon]} fillRule="evenodd" clipRule="evenodd" />
              </svg>
              {!collapsed && <span className="text-xs">{item.label}</span>}
            </Link>
          ))}
          <Link
            to="/mcp-audit"
            className="sidebar-link"
            activeProps={{ className: 'sidebar-link-active' }}
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path d={icons.audit} fillRule="evenodd" clipRule="evenodd" />
            </svg>
            {!collapsed && <span className="text-xs">{t.sidebar.mcpAudit}</span>}
            {!collapsed && pendingAuditCount > 0 && (
              <span className="badge text-white" style={{ background: 'hsl(var(--warning))', minWidth: '18px', textAlign: 'center', fontSize: '10px' }}>
                {pendingAuditCount > 9 ? '9+' : pendingAuditCount}
              </span>
            )}
          </Link>
        </nav>

        {/* ═══ FOOTER ═══ */}
        <div className="px-2 py-1.5 bg-surface-sidebar border-t border-edge-sidebar space-y-0.5">
          <ThemeSwitcher />
          {!collapsed && (
            <div className="flex gap-1 px-2 py-0.5">
              <button className={cn('w-[18px] h-[18px] rounded-full flex items-center justify-center border-2 transition-all', sidebarPos === 'left' ? 'border-brand-main bg-brand-main text-white' : 'border-transparent bg-surface-hover text-ink-muted hover:border-brand-main')} onClick={() => setSidebarWithPersist('left')} title="Sidebar Left">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" className="w-2.5 h-2.5"><line x1="3" y1="2" x2="3" y2="14" strokeWidth="1.8" strokeLinecap="round"/><polyline points="11,4 6,8 11,12" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <button className={cn('w-[18px] h-[18px] rounded-full flex items-center justify-center border-2 transition-all', sidebarPos === 'right' ? 'border-brand-main bg-brand-main text-white' : 'border-transparent bg-surface-hover text-ink-muted hover:border-brand-main')} onClick={() => setSidebarWithPersist('right')} title="Sidebar Right">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" className="w-2.5 h-2.5"><line x1="13" y1="2" x2="13" y2="14" strokeWidth="1.8" strokeLinecap="round"/><polyline points="5,4 10,8 5,12" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
          )}
          <LanguageSwitcher />
          {!collapsed && (
            <div className="flex items-center gap-2 px-2 py-1.5">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[0.6rem] font-bold shrink-0 bg-brand-main text-brand-text">
                {(user?.displayName || '?').charAt(0)}
              </div>
              <span className="text-xs truncate text-ink-sidebar">{user?.displayName || '...'}</span>
            </div>
          )}
          <button
            onClick={() => { logout(); navigate({ to: '/login' }); }}
            className="sidebar-link w-full text-[0.75rem]"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
            </svg>
            {!collapsed && t.common.logout}
          </button>
        </div>
      </aside>

      {/* ═══ NOTIFICATION PANEL ═══ */}
      {notifOpen && (
        <NotificationPanel
          items={notifications}
          sidebarWidth={sidebarWidth}
          onClose={() => setNotifOpen(false)}
          onRead={handleRead}
          onMarkAllRead={handleMarkAllRead}
          onApprove={handleApprove}
          onDeny={handleDeny}
        />
      )}

      {/* ═══ MAIN CONTENT ═══ */}
      <main className="flex-1 overflow-auto bg-surface-app">
        {/* Demo banner is AI-demo chrome (quotas + "apply for trial" CTA).
            The no-AI open edition has no AI features — never show it. */}
        {aiEnabled && isDemoUserEmail(user?.email) && (
          <div className="bg-brand-main text-white text-sm font-medium">
            <div className="px-4 py-2 flex items-center justify-between gap-3">
              <span>{t.app.demoBanner}</span>
              <span className="flex items-center gap-3 shrink-0">
                <button type="button" onClick={() => setShowDemoQuota(v => !v)} className="underline font-semibold hover:no-underline">
                  {showDemoQuota ? t.app.demoQuota.hideRules : t.app.demoQuota.viewRules}
                </button>
                <a href="https://tomatovector.com/hub-preview" target="_blank" rel="noreferrer" className="underline font-semibold hover:no-underline">{t.app.demoRegister}</a>
              </span>
            </div>
            {showDemoQuota && (
              <ul className="px-4 pb-2.5 text-xs text-white/90 list-disc pl-5 space-y-1">
                <li>{t.app.demoQuota.aiPerFeature.replace('{n}', String(demoQuota?.aiPerFeaturePerDay ?? 1))}</li>
                <li>{t.app.demoQuota.reportsCumulative.replace('{n}', String(demoQuota?.reportsPerIpCumulative ?? 20))}</li>
                <li>{t.app.demoQuota.issuesCumulative.replace('{n}', String(demoQuota?.issuesPerIpCumulative ?? 50))}</li>
                <li>{t.app.demoQuota.resetDaily}</li>
              </ul>
            )}
          </div>
        )}
        {permissionDenied && (
          <div className="bg-warning text-brand-text px-4 py-2 text-sm font-medium text-center">
            ⚠️ {permissionDeniedMsg || t.app.permissionDenied}
          </div>
        )}
        {quotaMsg && (
          <div className="bg-brand-main text-white px-4 py-2 text-sm font-medium flex items-center justify-between">
            <span>⏳ {quotaMsg}</span>
            <span className="flex items-center gap-3">
              <a href="https://tomatovector.com/hub-preview" target="_blank" rel="noreferrer" className="underline font-semibold hover:no-underline">
                {t.app.demoRegister}
              </a>
              <button className="underline font-semibold hover:no-underline" onClick={() => setQuotaMsg('')}>✕</button>
            </span>
          </div>
        )}
        <Outlet />
      </main>

      {aiEnabled && <GlobalAiAssistant />}
    </div>
  );
}
