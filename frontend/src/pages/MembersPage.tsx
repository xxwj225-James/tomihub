import { useState, useEffect } from 'react';
import { memberApi, type MemberInfo } from '@/api/memberApi';
import { useAuthStore } from '@/stores/authStore';
import { useProjectStore } from '@/stores/projectStore';
import { cn, safeArray } from '@/lib/cn';
import { useT } from '@/i18n/useT';

// Project roles (free-form role strings used in project_members.role).
// 'Project Lead' is included to match the backend roles table & Settings page.
const PROJECT_ROLES = [
  'Project Owner', 'Project Lead', 'Project Manager', 'Scrum Master', 'Release Manager',
  'Developer', 'QA', 'Designer', 'Business Analyst', 'DevOps Engineer',
  'Technical Writer', 'Security Engineer', 'viewer',
];

function roleBadge(role: string) {
  if (role === 'Project Owner' || role === 'owner') return 'tag-hi';
  if (role === 'viewer') return 'tag-lo';
  if (role === 'Project Manager' || role === 'Project Lead' || role === 'Scrum Master' || role === 'Release Manager' || role === 'admin') return 'tag-b';
  return 'tag-med';
}

export function MembersPage() {
  const t = useT();
  const { currentProject, projects, setCurrentProject } = useProjectStore();
  const roleName = (r: string) => (t.members.projectRoleNames as Record<string, string>)?.[r] || r;
  const [projectId, setProjectId] = useState<string>(currentProject?.id || '');
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [workspaceMembers, setWorkspaceMembers] = useState<MemberInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteOk, setInviteOk] = useState('');

  // Add-from-workspace state
  const [addOpen, setAddOpen] = useState(false);
  const [addUserId, setAddUserId] = useState('');
  const [addRole, setAddRole] = useState('Developer');
  const [adding, setAdding] = useState(false);

  // Follow store project selection (user may land here without a project context)
  useEffect(() => {
    if (currentProject?.id && currentProject.id !== projectId) setProjectId(currentProject.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id]);

  const loadProjectMembers = (pid: string) => {
    memberApi.listProjectMembers(pid).then(({ data: resp }) => {
      const raw = (resp as unknown as { data?: unknown }).data;
      const items = Array.isArray(raw) ? raw : ((raw as { items?: MemberInfo[] })?.items || []);
      setMembers(items as MemberInfo[]);
    }).catch(() => setError(t.members.failedToLoad))
      .finally(() => setLoading(false));
  };

  // Project members (primary list) + workspace roster (candidate pool)
  useEffect(() => {
    setLoading(true);
    if (projectId) loadProjectMembers(projectId);
    else setLoading(false);
    memberApi.listMembers().then(({ data: resp }) => {
      setWorkspaceMembers(safeArray(resp.data));
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const candidates = workspaceMembers.filter(w => !members.some(m => m.userId === w.userId));

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!projectId) return;
    try {
      await memberApi.updateProjectMemberRole(projectId, userId, newRole);
      setMembers(prev => prev.map(m => m.userId === userId ? { ...m, role: newRole } : m));
      setEditingRole(null);
    } catch { setError(t.members.failedToUpdateRole); }
  };

  const handleRemove = async (userId: string) => {
    if (!projectId) return;
    try {
      await memberApi.removeProjectMember(projectId, userId);
      setMembers(prev => prev.filter(m => m.userId !== userId));
      setConfirmRemove(null);
    } catch { setError(t.members.failedToRemove); }
  };

  const handleAdd = async () => {
    if (!projectId || !addUserId) return;
    setAdding(true);
    try {
      const { data: resp } = await memberApi.addProjectMember(projectId, addUserId, addRole);
      const created = (resp as unknown as { data?: MemberInfo }).data;
      if (created) setMembers(prev => [...prev, created]);
      setAddUserId('');
      loadProjectMembers(projectId);
    } catch { setError(t.members.failedToAdd); }
    finally { setAdding(false); }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    const selfEmail = useAuthStore.getState().user?.email;
    const emails = inviteEmail.split(/[,;\n\s]+/).map(e => e.trim()).filter(e => e.includes('@') && e !== selfEmail);
    if (emails.length === 0) return;
    setInviteSending(true);
    try {
      const resp = await memberApi.createBatchInvite(emails, inviteRole);
      setInviteOk((resp.data as unknown as Record<string, unknown>).message as string || t.members.batchComplete);
      setInviteEmail('');
      setTimeout(() => setInviteOk(''), 5000);
    } catch { setError(t.members.failedToInvite); }
    finally { setInviteSending(false); }
  };

  const filtered = members.filter(m =>
    !search || m.displayName?.toLowerCase().includes(search.toLowerCase())
    || m.email?.toLowerCase().includes(search.toLowerCase()));

  const myRole = members.find(x => x.userId === useAuthStore.getState().user?.id)?.role || '';

  return (
    <div>
      {/* Header */}
      <div className="ch">
        <div>
          <h2 className="text-base font-semibold text-ink-primary">{t.members.title}</h2>
          <p className="text-xs text-ink-muted mt-0.5">{t.members.description}</p>
        </div>
        <div className="flex gap-2">
          <select className="form-select text-sm" style={{ padding: '6px 10px', width: '220px' }}
            value={projectId}
            onChange={e => { setProjectId(e.target.value); const p = projects.find(x => x.id === e.target.value); if (p) setCurrentProject(p); }}>
            <option value="">{t.members.chooseProject}</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input className="form-input text-sm" style={{ padding: '6px 12px', width: '220px' }}
            placeholder={t.members.searchPlaceholder}
            value={search} onChange={e => setSearch(e.target.value)} />
          <button className="btn-secondary text-sm" onClick={() => setAddOpen(!addOpen)}>＋ {t.members.addFromWorkspace}</button>
          <button className="btn-brand text-sm" onClick={() => setInviteOpen(!inviteOpen)}>{t.members.invite}</button>
        </div>
      </div>

      {inviteOk && <div className="mx-6 mt-4 card bg-success-soft text-success p-3 text-sm">{inviteOk}</div>}
      {error && <div className="mx-6 mt-4 card bg-danger-soft text-danger p-3 text-sm">{error}</div>}

      {/* Add member from workspace dialog */}
      {addOpen && (
        <div className="mx-6 mt-4 card">
          <div className="card-hd"><h3 className="text-sm font-semibold text-ink-primary">{t.members.addFromWorkspace}</h3></div>
          <div className="card-bd p-4">
            <div className="flex gap-3 items-end">
              <div className="form-grp" style={{ width: '280px' }}>
                <label className="form-label">{t.members.chooseMember}</label>
                <select className="form-select" value={addUserId} onChange={e => setAddUserId(e.target.value)}>
                  <option value="">{t.members.chooseMemberPlaceholder}</option>
                  {candidates.map(w => (
                    <option key={w.userId} value={w.userId}>{w.displayName || w.userId} ({w.email})</option>
                  ))}
                </select>
              </div>
              <div className="form-grp" style={{ width: '180px' }}>
                <label className="form-label">{t.members.role}</label>
                <select className="form-select" value={addRole} onChange={e => setAddRole(e.target.value)}>
                  {PROJECT_ROLES.map(r => <option key={r} value={r}>{roleName(r)}</option>)}
                </select>
              </div>
              <div style={{ paddingBottom: '16px', display: 'flex', gap: '8px' }}>
                <button className="btn-brand" onClick={handleAdd} disabled={adding || !addUserId}>
                  {adding ? t.members.sending : t.members.add}
                </button>
                <button className="btn-secondary" onClick={() => setAddOpen(false)}>{t.members.cancel}</button>
              </div>
            </div>
            {candidates.length === 0 && (
              <p className="text-xs text-ink-muted mt-2">{t.members.noWorkspaceCandidates}</p>
            )}
          </div>
        </div>
      )}

      {/* Invite Dialog */}
      {inviteOpen && (
        <div className="mx-6 mt-4 card">
          <div className="card-hd"><h3 className="text-sm font-semibold text-ink-primary">{t.members.inviteTitle}</h3></div>
          <div className="card-bd p-4">
            <div className="flex gap-3 items-end">
              <div className="flex-1 form-grp">
                <label className="form-label">{t.members.email}</label>
                  <textarea className="form-input"  placeholder={t.members.emailPlaceholder}
                    value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}  rows={3} />
              </div>
              <div className="form-grp" style={{ width: '180px' }}>
                <label className="form-label">{t.members.role}</label>
                <select className="form-select" value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
                  <option value="owner">{t.members.roleOwner}</option>
                  <option value="admin">{t.members.roleAdmin}</option>
                  <option value="member">{t.members.roleMember}</option>
                  <option value="viewer">{t.members.roleViewer}</option>
                </select>
              </div>
              <div style={{ paddingBottom: '16px', display: 'flex', gap: '8px' }}>
                <button className="btn-brand" onClick={handleInvite} disabled={inviteSending}>
                  {inviteSending ? t.members.sending : t.members.sendInvite}
                </button>
                <button className="btn-secondary" onClick={() => setInviteOpen(false)}>{t.members.cancel}</button>
              </div>
            </div>
            <p className="text-xs text-ink-muted mt-2">{t.members.inviteExpiry}</p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="p-6" style={{ maxWidth: '1100px' }}>
        <div className="card">
          <div className="card-hd">
            <h3 className="text-sm font-semibold text-ink-primary">{t.members.allMembers(filtered.length)}</h3>
          </div>
          <div className="card-bd-nopad">
            {loading ? (
              <p className="text-center text-xs text-ink-muted py-12">{t.members.loading}</p>
            ) : filtered.length === 0 ? (
              <p className="text-center text-xs text-ink-muted py-12">
                {search ? t.members.noSearchMatch : t.members.noMembers}
              </p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr className="text-left text-[0.6875rem] font-semibold text-ink-muted uppercase tracking-wider border-b border-edge">
                    <th style={{ padding: '10px 18px' }}>{t.members.name}</th>
                    <th style={{ padding: '10px 18px' }}>{t.members.emailCol}</th>
                    <th style={{ padding: '10px 18px' }}>{t.members.roleCol}</th>
                    <th style={{ padding: '10px 18px', width: '100px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(m => (
                    <tr key={m.id} className="border-b border-edge last:border-b-0 hover:bg-surface-hover transition-colors">
                      <td style={{ padding: '10px 18px' }}>
                        <div className="flex items-center gap-2">
                          <div className="av">{m.displayName?.charAt(0) || '?'}</div>
                          <span className="text-sm font-medium text-ink-primary">{m.displayName || m.id}</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 18px' }}>
                        <span className="text-sm text-ink-secondary">{m.email}</span>
                      </td>
                      <td style={{ padding: '10px 18px' }}>
                        {editingRole === m.id ? (
                          <select
                            className="form-select text-xs" style={{ padding: '4px 8px', width: '150px' }}
                            value={m.role || 'viewer'}
                            onChange={e => handleRoleChange(m.userId, e.target.value)}
                            onBlur={() => setEditingRole(null)}
                            autoFocus>
                            {PROJECT_ROLES.map(r => <option key={r} value={r}>{roleName(r)}</option>)}
                          </select>
                        ) : (
                          <span
                            className={cn('badge cursor-pointer', roleBadge(m.role || 'viewer'))}
                            onClick={() => setEditingRole(m.id)}>
                            {roleName(m.role || 'viewer')}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 18px' }}>
                        <div className="flex items-center gap-1">
                          {/* Remove from project */}
                          {confirmRemove === m.id ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-danger">{t.members.removeConfirm}</span>
                              <button className="btn-danger btn-xs" onClick={() => handleRemove(m.userId)}>{t.members.yes}</button>
                              <button className="btn-secondary btn-xs" onClick={() => setConfirmRemove(null)}>{t.members.no}</button>
                            </div>
                          ) : (
                            <button className="btn-ghost btn-xs text-danger"
                              onClick={() => setConfirmRemove(m.id)}
                              disabled={m.userId === useAuthStore.getState().user?.id
                                || (m.role === 'Project Owner' && myRole !== 'Project Owner')}>{t.members.remove}</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
