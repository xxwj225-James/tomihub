import { useNavigate } from '@tanstack/react-router';
import { CabinPanel } from '@/components/cabin/CabinPanel';
import { useT } from '@/i18n/useT';

export function CabinListPage() {
  const t = useT();
  const navigate = useNavigate();

  return (
    <div>
      <div className="ch">
        <div className="flex items-center gap-3">
          <button className="btn-ghost btn-xs" onClick={() => navigate({ to: '/home' })}>
            {t.cabinList.back}
          </button>
          <h2 className="text-base font-semibold text-ink-primary">{t.cabinList.title}</h2>
        </div>
      </div>
      <div className="p-6" style={{ maxWidth: '800px' }}>
        <CabinPanel />
      </div>
    </div>
  );
}
