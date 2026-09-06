import { Link } from '@tanstack/react-router';
import { useT } from '@/i18n/useT';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';

export function ForgotPasswordPage() {
  const t = useT();
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-surface-app">
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-brand-main tracking-tight">{t.app.name}</h1>
          <p className="text-xs font-medium text-ink-muted mt-1">{t.app.systemName}</p>
        </div>

        <Card>
          <CardHeader>
            <h1 className="text-xl font-bold text-center text-ink-primary">{t.common.forgotPasswordTitle}</h1>
            <p className="text-sm text-center mt-1 text-ink-muted">{t.common.forgotPasswordComing}</p>
          </CardHeader>
          <CardContent>
            <p className="text-center text-sm">
              <Link to="/login" className="hover:underline font-medium text-brand-main">{t.auth.backToLogin}</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
