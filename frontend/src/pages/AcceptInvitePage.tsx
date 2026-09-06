import { useState, useEffect } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useAuthStore } from '@/stores/authStore';
import { authApi } from '@/api/authApi';
import { useT } from '@/i18n/useT';
import { getErrorMessage } from '@/lib/errors';
import { Card, CardContent } from '@/components/ui/Card';

export function AcceptInvitePage() {
  const t = useT();
  const navigate = useNavigate();
  const { user, isAuthenticated, setAuth, setTenants, selectTenant } = useAuthStore();
  const search = useSearch({ strict: false }) as { code?: string };
  const code = search.code || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Invite info from backend
  const [workspaceName, setWorkspaceName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('');
  const [isExistingUser, setIsExistingUser] = useState(false);

  // Form (new user only)
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  const validatePassword = (pw: string) => {
    if (pw.length < 8) return t.auth.passwordMinLength;
    if (!/[a-z]/.test(pw)) return t.auth.passwordLowercase;
    if (!/[A-Z]/.test(pw)) return t.auth.passwordUppercase;
    if (!/\d/.test(pw)) return t.auth.passwordDigit;
    return null;
  };

  useEffect(() => {
    if (!code) { setError(t.acceptInvite.invalidLink); setLoading(false); return; }
    authApi.getInviteInfo(code)
      .then(({ data: resp }) => {
        const d = resp.data;
        setWorkspaceName(d.workspaceName);
        setInviteEmail(d.email);
        setInviteRole(d.role);
        setIsExistingUser(d.isExistingUser || false);
      })
      .catch(() => setError(t.acceptInvite.invalidExpired))
      .finally(() => setLoading(false));
  }, [code]);

  // New user registration (not logged in)
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) { setError(t.acceptInvite.displayNameRequired); return; }
    const pwErr = validatePassword(password);
    if (pwErr) { setError(pwErr); return; }
    setError(''); setSubmitting(true);
    try {
      const { data: resp } = await authApi.register({
        email: inviteEmail,
        password,
        displayName: displayName.trim(),
        inviteCode: code,
      });
      const { user: u, tokens, tenants } = resp.data;
      setAuth(u, tokens); setTenants(tenants);
      if (tenants.length > 0) selectTenant(tenants[0]);
      navigate({ to: '/setup-wizard', search: { invited: '1' } } as never);
    } catch (err: unknown) {
      setError(getErrorMessage(err, { errors: { default: t.acceptInvite.registerFailed } }));
    } finally { setSubmitting(false); }
  };

  // Already logged in — just accept the invite (rejoin workspace)
  const handleAcceptInvite = async () => {
    setSubmitting(true);
    try {
      const { data: resp } = await authApi.register({
        email: inviteEmail,
        password: '',  // already-logged-in: backend validates JWT, not password
        displayName: user?.displayName || '',
        inviteCode: code,
      });
      const { user: u, tokens, tenants } = resp.data;
      setAuth(u, tokens); setTenants(tenants);
      if (tenants.length > 0) selectTenant(tenants[0]);
      navigate({ to: '/home' });
    } catch (err: unknown) {
      setError(getErrorMessage(err, { errors: { default: t.acceptInvite.joinFailed } }));
    } finally { setSubmitting(false); }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-surface-app">
        <p className="text-sm text-ink-muted">{t.acceptInvite.loading}</p>
      </div>
    );
  }

  if (error && !workspaceName) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-surface-app">
        <Card className="w-full max-w-[420px]">
          <CardContent className="p-8 text-center">
            <p className="text-3xl mb-4">🔗</p>
            <h2 className="text-lg font-bold text-ink-primary mb-2">{t.acceptInvite.invalidTitle}</h2>
            <p className="text-sm text-ink-muted">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Already logged in — show "Join" button ───
  if (isAuthenticated && user) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-surface-app">
        <Card className="w-full max-w-[420px]">
          <CardContent className="p-8">
            <div className="text-center mb-6">
              <p className="text-3xl mb-3">📨</p>
              <h1 className="text-lg font-bold text-ink-primary">{t.acceptInvite.joinTitle}</h1>
              <p className="text-xl font-semibold text-brand-main mt-1">{workspaceName}</p>
              {inviteRole && (
                <p className="text-sm text-ink-muted mt-1">{t.acceptInvite.joinedAs(inviteRole)}</p>
              )}
            </div>

            <div className="bg-surface-hover rounded-card p-4 mb-4">
              <p className="text-sm text-ink-primary">{t.acceptInvite.youAre}</p>
              <p className="text-sm font-semibold text-ink-primary mt-0.5">{user.email}</p>
            </div>

            {error && <p className="text-xs text-danger mb-4">{error}</p>}

            <button className="btn-brand w-full" onClick={handleAcceptInvite} disabled={submitting}>
              {submitting ? t.acceptInvite.joining : t.acceptInvite.joinWorkspace}
            </button>

            <p className="text-xs text-ink-muted text-center mt-3">
              {t.acceptInvite.notYou} <span className="text-brand-main cursor-pointer" onClick={() => { useAuthStore.getState().logout(); window.location.reload(); }}>{t.acceptInvite.switchAccount}</span>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Existing user, not logged in — enter password to join directly ───
  if (isExistingUser && !isAuthenticated) {
    const handleExistingUserJoin = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!password) { setError(t.acceptInvite.passwordRequired); return; }
      setError(''); setSubmitting(true);
      try {
        const { data: rejoinResp } = await authApi.register({
          email: inviteEmail, password, displayName: inviteEmail, inviteCode: code,
        });
        setAuth(rejoinResp.data.user, rejoinResp.data.tokens);
        setTenants(rejoinResp.data.tenants);
        if (rejoinResp.data.currentTenant) selectTenant(rejoinResp.data.currentTenant);
        navigate({ to: '/home' });
      } catch (err: unknown) {
        setError(getErrorMessage(err, { errors: { default: t.acceptInvite.invalidPasswordExpired } }));
      } finally { setSubmitting(false); }
    };

    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-surface-app">
        <Card className="w-full max-w-[420px]">
          <CardContent className="p-8">
            <div className="text-center mb-6">
              <p className="text-3xl mb-3">🔗</p>
              <h1 className="text-lg font-bold text-ink-primary">{t.acceptInvite.joinTitle} {workspaceName}</h1>
              <p className="text-sm text-ink-muted mt-1">{inviteRole && t.acceptInvite.joinedAs(inviteRole)}</p>
            </div>

            <form onSubmit={handleExistingUserJoin}>
              <div className="bg-surface-hover rounded-card p-3 mb-4">
                <p className="text-xs text-ink-muted">{t.acceptInvite.account}</p>
                <p className="text-sm font-semibold text-ink-primary">{inviteEmail}</p>
              </div>
              <div className="form-grp">
                <label className="form-label">{t.acceptInvite.passwordLabel}</label>
                <input className="form-input w-full" type="password" placeholder={t.acceptInvite.passwordPlaceholder}
                  value={password} onChange={e => setPassword(e.target.value)} autoFocus autoComplete="current-password" />
              </div>
              {error && <p className="text-xs text-danger mb-4">{error}</p>}
              <button className="btn-brand w-full" type="submit" disabled={submitting}>
                {submitting ? t.acceptInvite.joining : t.acceptInvite.joinWorkspace}
              </button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── New user — show registration form ───
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-surface-app">
      <Card className="w-full max-w-[420px]">
        <CardContent className="p-8">
          <div className="text-center mb-6">
            <p className="text-3xl mb-3">📨</p>
            <h1 className="text-lg font-bold text-ink-primary">
              {t.acceptInvite.invitedTitle}
            </h1>
            <p className="text-xl font-semibold text-brand-main mt-1">{workspaceName}</p>
            {inviteRole && (
              <p className="text-sm text-ink-muted mt-1">{t.acceptInvite.joinedAs(inviteRole)}</p>
            )}
          </div>

          <form onSubmit={handleRegister}>
            <div className="form-grp">
              <label className="form-label">{t.auth.email}</label>
              <input className="form-input w-full" value={inviteEmail} disabled style={{ opacity: 0.6 }} autoComplete="off" />
            </div>
            <div className="form-grp">
              <label className="form-label">{t.auth.displayName}</label>
              <input className="form-input w-full" placeholder={t.auth.displayNamePlaceholder} value={displayName} onChange={e => setDisplayName(e.target.value)} autoFocus autoComplete="off" />
            </div>
            <div className="form-grp">
              <label className="form-label">{t.auth.password}</label>
              <input className="form-input w-full" type="password" placeholder={t.auth.passwordHint} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
            </div>

            {error && <p className="text-xs text-danger mb-4">{error}</p>}

            <button className="btn-brand w-full" type="submit" disabled={submitting}>
              {submitting ? t.acceptInvite.joining : t.acceptInvite.joinWorkspace}
            </button>
          </form>

          <p className="text-xs text-ink-muted text-center mt-3">
            {t.acceptInvite.alreadyHaveAccount} <span className="text-brand-main cursor-pointer" onClick={() => navigate({ to: '/login' })}>{t.acceptInvite.logIn}</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
