import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, Link, useSearch } from '@tanstack/react-router';
import { useAuthStore } from '@/stores/authStore';
import { authApi } from '@/api/authApi';
import { useEmailCountdown } from '@/hooks/useEmailCountdown';
import { useT } from '@/i18n/useT';
import { getErrorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';

const registerSchema = z.object({
  email: z.string().email(), code: z.string().optional(),
  password: z.string().min(8).regex(/[a-z]/).regex(/[A-Z]/).regex(/\d/),
  displayName: z.string().min(1).max(100),
});
type RegisterForm = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const t = useT();
  const navigate = useNavigate();
  const { setAuth, setTenants, selectTenant } = useAuthStore();
  const { countdown, isCooldown, startCooldown } = useEmailCountdown(60);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const urlSearch = useSearch({ strict: false }) as { inviteCode?: string };
  const inviteCode = urlSearch.inviteCode || '';
  const isInvite = !!inviteCode;

  const { register, handleSubmit, getValues, formState: { errors } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', code: '', password: '', displayName: '' },
  });

  const handleSendCode = async () => {
    const email = getValues('email');
    if (!z.string().email().safeParse(email).success) { setError(t.auth.invalidEmail); return; }
    setError('');
    try {
      const resp = await authApi.sendCode(email, 'register');
      const devCode = (resp.data as unknown as { data?: { dev_code?: string } })?.data?.dev_code;
      if (devCode) { setError('DEV CODE: ' + devCode); setCodeSent(true); }
      else { setCodeSent(true); }
      startCooldown();
    } catch (err) { setError(getErrorMessage(err, t.auth)); }
  };

  const onSubmit = async (data: RegisterForm) => {
    setError(''); setLoading(true);
    try {
      const { data: resp } = await authApi.register({
        email: data.email, code: data.code || '', password: data.password,
        displayName: data.displayName, inviteCode: inviteCode || undefined,
        workspaceName: !isInvite ? workspaceName.trim() || undefined : undefined,
      });
      // Auto-login (need tokens for wizard API calls) then go to setup wizard
      const { user, tokens, tenants } = resp.data;
      setAuth(user, tokens); setTenants(tenants);
      if (tenants.length > 0) selectTenant(tenants[0]);
      navigate({ to: '/setup-wizard' });
    } catch (err: unknown) { setError(getErrorMessage(err, { errors: { default: t.auth.registerFailed } })); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-surface-app">
      <div className="w-full max-w-[420px]">

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-brand-main tracking-tight">{t.app.name}</h1>
          <p className="text-xs font-medium text-ink-muted mt-1">{t.app.systemName}</p>
        </div>

        <Card>
          <CardHeader>
            <h1 className="text-xl font-bold text-center text-ink-primary">{t.auth.registerTitle}</h1>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="px-3 py-2.5 rounded-card mb-4 text-sm border border-danger/20 bg-danger-soft text-danger">{error}</div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {isInvite && (
                <>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Input label={t.auth.email} type="email" placeholder={t.auth.emailPlaceholder}
                             autoComplete="email" error={errors.email?.message} {...register('email')} />
                    </div>
                    <Button type="button" variant="secondary" size="md" disabled={isCooldown} onClick={handleSendCode}>
                      {isCooldown ? `${countdown}s` : t.auth.sendCode}
                    </Button>
                  </div>
                  <Input label={t.auth.codeLabel} placeholder={t.auth.codePlaceholder} maxLength={6}
                         error={errors.code?.message} {...register('code')} />
                  {codeSent && <p className="text-xs text-success">{t.auth.codeSent}</p>}
                </>
              )}
              {!isInvite && (
                <Input label={t.auth.email} type="email" placeholder={t.auth.emailPlaceholder}
                       autoComplete="email" error={errors.email?.message} {...register('email')} />
              )}
              <Input label={t.auth.displayName} placeholder={t.auth.displayNamePlaceholder}
                     autoComplete="name" error={errors.displayName?.message} {...register('displayName')} />
              {!isInvite && (
                <div>
                  <label className="text-sm font-medium text-ink-primary mb-1 block">Workspace Name</label>
                  <input className="form-input w-full" placeholder="My Team Workspace"
                    value={workspaceName} onChange={e => setWorkspaceName(e.target.value)} />
                  <p className="text-xs text-ink-muted mt-1">You will be the admin of this workspace.</p>
                </div>
              )}
              {isInvite && (
                <p className="text-xs text-brand-main bg-brand-soft p-2 rounded-card">
                  You've been invited to join a workspace. Complete registration to accept.
                </p>
              )}
              <Input label={t.auth.password} type="password" placeholder={t.auth.passwordHint}
                     autoComplete="new-password" error={errors.password?.message} {...register('password')} />

              <Button className="w-full" size="lg" loading={loading}>
                {loading ? t.auth.registering : t.auth.register}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-ink-secondary">
          {t.auth.haveAccount}{' '}
          <Link to="/login" className="hover:underline font-medium text-brand-main">{t.auth.backToLogin}</Link>
        </p>
      </div>
    </div>
  );
}
