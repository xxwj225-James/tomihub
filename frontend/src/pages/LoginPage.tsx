import { useState, useMemo, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, Link } from '@tanstack/react-router';
import { useAuthStore } from '@/stores/authStore';
import { useLanguageStore } from '@/stores/languageStore';
import { aiEnabled } from '@/lib/aiGate';
import { demoModeEnabled } from '@/lib/demoUser';
import type { Lang } from '@/i18n/translations';
import { authApi } from '@/api/authApi';
import { useT } from '@/i18n/useT';
import { getErrorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1), rememberMe: z.boolean().default(false) });
type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const t = useT();
  const navigate = useNavigate();
  const { setAuth, setTenants, selectTenant } = useAuthStore();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Check for ?expired=1 and ?redirect=  query params
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const isExpired = searchParams.get('expired') === '1';
  const redirectTo = searchParams.get('redirect');

  // Auto demo entry: /login?demo=1 → enter the read-only demo account directly
  // (Tomatovector website "Try Demo" button deep-links here, no extra click).
  // Only exists in a demo-mode build — normal installs ignore the param.
  const demoAutoRef = useRef(false);
  useEffect(() => {
    if (!demoModeEnabled) return;
    if (searchParams.get('demo') === '1' && !demoAutoRef.current) {
      demoAutoRef.current = true;
      handleGuestLogin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', rememberMe: false },
  });

  const handleGuestLogin = async () => {
    setError(''); setLoading(true);
    try {
      const { data: resp } = await authApi.guestLogin();
      const { user, tokens, tenants, currentTenant } = resp.data;
      setAuth(user, tokens); setTenants(tenants);
      if (currentTenant) selectTenant(currentTenant);
      // First demo visit → guided tour of the AI highlights (Home personal AI
      // analysis → Overview risk & health radar → Reports → Wiki). The no-AI
      // edition has no AI highlights — go straight home.
      if (!aiEnabled) {
        navigate({ to: '/home', replace: true });
        return;
      }
      let isFirstDemoVisit = false;
      try {
        isFirstDemoVisit = localStorage.getItem('tomihub-demo-tour') !== 'done';
      } catch { /* storage unavailable */ }
      if (isFirstDemoVisit) {
        navigate({ to: '/home', search: { tour: '1' }, replace: true });
      } else {
        // Guest always goes directly to home — skip setup wizard
        navigate({ to: '/home', replace: true });
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, { errors: { default: 'Demo unavailable. Please try again later.' } }));
    } finally { setLoading(false); }
  };

  const onSubmit = async (data: LoginForm) => {
    setError(''); setLoading(true);
    try {
      const { data: resp } = await authApi.login({ email: data.email, password: data.password, rememberMe: data.rememberMe });
      const { user, tokens, tenants, requireTenantSelection, currentTenant, isFirstUser } = resp.data;
      setAuth(user, tokens); setTenants(tenants);
      // Sync UI language from profile (cross-browser persistence)
      // Storage access must never block login — guarded inside the store.
      if (user.uiLanguage) {
        useLanguageStore.getState().setLang(user.uiLanguage as Lang);
      }
      // Auto-process pending invite (rejoin workspace after login)
      let pendingCode: string | null = null;
      try { pendingCode = sessionStorage.getItem('pendingInviteCode'); } catch { /* storage unavailable */ }
      if (!currentTenant && pendingCode) {
        try { sessionStorage.removeItem('pendingInviteCode'); } catch { /* noop */ }
        try {
          const { data: rejoinResp } = await authApi.register({
            email: user.email, password: data.password, displayName: user.displayName || '', inviteCode: pendingCode,
          });
          setAuth(rejoinResp.data.user, rejoinResp.data.tokens);
          setTenants(rejoinResp.data.tenants);
          if (rejoinResp.data.currentTenant) selectTenant(rejoinResp.data.currentTenant);
          navigate({ to: redirectTo || '/home', replace: true });
          return;
        } catch { /* fall through to normal flow */ }
      }
      if (requireTenantSelection || !currentTenant) navigate({ to: '/select-tenant' });
      else if (isFirstUser) { selectTenant(currentTenant); navigate({ to: '/setup-wizard' }); }
      else {
        selectTenant(currentTenant);
        const needsSetup = user.onboardingCompleted === false;
        // Restore the page the user was on before token expired.
        // replace: true — the login page must not stay in history, otherwise
        // the Back button returns to /login after a session-expired re-login.
        if (redirectTo) navigate({ to: redirectTo, replace: true });
        else if (needsSetup) navigate({ to: '/setup-wizard', replace: true });
        else navigate({ to: '/home', replace: true });
      }
    } catch (err: unknown) {
      // If "Account has no workspace" but there's a pending invite → rejoin
      let pendingCode: string | null = null;
      try { pendingCode = sessionStorage.getItem('pendingInviteCode'); } catch { /* storage unavailable */ }
      const apiErr = err as { response?: { data?: { message?: string } } };
      const msg = (apiErr?.response?.data?.message || '');
      if (pendingCode && msg.includes('no workspace')) {
        try { sessionStorage.removeItem('pendingInviteCode'); } catch { /* noop */ }
        try {
          const { data: rejoinResp } = await authApi.register({
            email: data.email, password: data.password, displayName: data.email, inviteCode: pendingCode,
          });
          setAuth(rejoinResp.data.user, rejoinResp.data.tokens);
          setTenants(rejoinResp.data.tenants);
          if (rejoinResp.data.currentTenant) selectTenant(rejoinResp.data.currentTenant);
          navigate({ to: '/home', replace: true });
          return;
        } catch { setError('Failed to rejoin workspace. Please try again.'); }
      }
      setError(getErrorMessage(err, t.auth));
    }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-surface-app">
      <div className="w-full max-w-[400px]">

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-brand-main tracking-tight">{t.app.name}</h1>
          <p className="text-xs font-medium text-ink-muted mt-1">{t.app.systemName}</p>
        </div>

        <Card>
          <CardHeader>
            <h1 className="text-xl font-bold text-center text-ink-primary">{t.auth.loginTitle}</h1>
          </CardHeader>
          <CardContent>
            {isExpired && (
              <div className="px-3 py-2.5 rounded-card mb-4 text-sm border border-warning/30 bg-warning-soft text-warning">
                ⏰ Session expired. Please log in again.
              </div>
            )}
            {error && (
              <div className="px-3 py-2.5 rounded-card mb-4 text-sm border border-danger/20 bg-danger-soft text-danger">{error}</div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Input label={t.auth.email} type="email" placeholder={t.auth.emailPlaceholder}
                     autoComplete="email" error={errors.email?.message ? t.auth.invalidEmail : undefined}
                     {...register('email')} />
              <Input label={t.auth.password} type="password" placeholder={t.auth.passwordPlaceholder}
                     autoComplete="current-password"
                     error={errors.password?.message ? t.auth.invalidPassword : undefined}
                     {...register('password')} />

              <div className="flex items-center justify-between text-sm pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-ink-secondary">
                  <input type="checkbox" className="rounded w-4 h-4 accent-brand-main" {...register('rememberMe')} />
                  {t.auth.rememberMe}
                </label>
                <Link to="/forgot-password" className="hover:underline font-medium text-brand-main">
                  {t.auth.forgotPassword}
                </Link>
              </div>

              <Button className="w-full" size="lg" loading={loading}>
                {loading ? t.auth.loggingIn : t.auth.login}
              </Button>

              {demoModeEnabled && (
                <>
                  <div className="relative my-3">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-edge" /></div>
                    <div className="relative flex justify-center text-xs"><span className="bg-surface-card px-2 text-ink-muted">or</span></div>
                  </div>

                  <Button className="w-full" variant="secondary" size="lg" loading={loading} onClick={handleGuestLogin}>
                    {t.auth.tryDemo}
                  </Button>
                </>
              )}
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-ink-secondary">
          {t.auth.noAccount}{' '}
          {demoModeEnabled ? (
            <span className="font-medium text-ink-muted cursor-not-allowed select-none" title={t.auth.registerDisabled}>
              {t.auth.registerNow} (disabled)
            </span>
          ) : (
            <Link to="/register" className="hover:underline font-medium text-brand-main">
              {t.auth.registerNow}
            </Link>
          )}
        </p>
        {demoModeEnabled && (
          <p className="mt-1.5 text-center text-[0.6875rem] text-ink-muted">
            {t.auth.registerDisabled}
          </p>
        )}
      </div>
    </div>
  );
}
