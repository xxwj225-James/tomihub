import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAuthStore } from '@/stores/authStore';
import { authApi } from '@/api/authApi';
import { useT } from '@/i18n/useT';
import { getErrorMessage } from '@/lib/errors';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import type { TenantVO } from '@/types/auth';

export function TenantSelectPage() {
  const t = useT();
  const navigate = useNavigate();
  const { tenants, selectTenant, setTokens } = useAuthStore();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  if (tenants.length === 0) { navigate({ to: '/login' }); return null; }

  const handleSelect = async (tenant: TenantVO) => {
    setError(''); setLoading(tenant.id);
    try {
      const { data: resp } = await authApi.selectTenant(tenant.id);
      setTokens(resp.data.tokens); selectTenant(resp.data.currentTenant!); navigate({ to: '/home' });
    } catch (err: unknown) { setError(getErrorMessage(err, { errors: { default: 'Failed' } })); }
    finally { setLoading(null); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-surface-app">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="text-xl font-bold text-center text-ink-primary">{t.tenant.title}</h1>
          <p className="text-sm text-center mt-1 text-ink-muted">{t.tenant.subtitle(tenants.length)}</p>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="px-3 py-2.5 rounded-card mb-4 text-sm border border-danger/20 bg-danger-soft text-danger">{error}</div>
          )}
          <div className="space-y-2">
            {tenants.map((tenant) => (
              <button key={tenant.id} onClick={() => handleSelect(tenant)} disabled={loading !== null}
                className="w-full flex items-center gap-4 px-4 py-3 rounded-card border border-edge
                           hover:border-brand-main hover:bg-brand-soft transition-colors text-left disabled:opacity-50">
                <div className="w-10 h-10 rounded-card flex items-center justify-center font-bold text-lg shrink-0 bg-brand-soft text-brand-main">
                  {(tenant.name || '?').charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate text-ink-primary">{tenant.name}</p>
                  <p className="text-xs text-ink-muted">{tenant.slug} &middot; {tenant.role}</p>
                </div>
                {loading === tenant.id && (
                  <svg className="animate-spin h-5 w-5 shrink-0 text-brand-main" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
              </button>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-ink-muted">
            <button onClick={() => { useAuthStore.getState().logout(); navigate({ to: '/login' }); }}
                    className="hover:underline font-medium text-brand-main">{t.tenant.logout}</button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
