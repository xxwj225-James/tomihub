import { useNavigate } from '@tanstack/react-router';
import { type CabinData, type CabinParticipant } from '@/api/cabinApi';
import { useT } from '@/i18n/useT';
import { SkeletonCard } from '@/components/ui/Skeleton';

interface CabinEntryListProps {
  entries: CabinData[];
  participants: Record<string, CabinParticipant[]>;
  activeEntryId: string | null;
  loading: boolean;
  compact?: boolean;
  canCreate?: boolean;
  userId?: string;
  onSelectEntry: (id: string) => void;
  onNewEntry: () => void;
  onViewDocument: (cabinId: string) => void;
  hasDocument: (cabinId: string) => boolean;
}

export function CabinEntryList({
  entries,
  participants,
  loading,
  compact = false,
  canCreate = true,
  userId,
  onSelectEntry,
  onNewEntry,
  onViewDocument,
  hasDocument,
}: CabinEntryListProps) {
  const t = useT();
  const navigate = useNavigate();

  const displayEntries = compact ? entries.slice(0, 3) : entries;

  const isCreator = (cabin: CabinData) => cabin.createdBy === userId;

  const getCabinStatus = (c: CabinData) => {
    const cp = Array.isArray(participants[c.id]) ? participants[c.id] : [];
    const isCancelled = c.status === 'cancelled';
    const isClosed = c.status === 'closed';
    let statusText = '';
    let statusColor = '';
    if (isCancelled) { statusText = t.cabin.cancelled; statusColor = 'bg-danger'; }
    else if (isClosed) { statusText = t.cabin.ended; statusColor = 'bg-ink-muted'; }
    else if (isCreator(c)) {
      const allAuth = cp.filter(p => p.role === 'participant').every(p => p.status === 'accepted');
      statusText = allAuth ? t.cabin.readyToGenerate : t.cabin.waitingForAuth;
      statusColor = allAuth ? 'bg-success' : 'bg-warning';
    } else {
      const myPart = cp.find(p => p.userId === userId);
      statusText = myPart?.status === 'accepted' ? t.cabin.authorized : t.cabin.pendingAuth;
      statusColor = myPart?.status === 'accepted' ? 'bg-success' : 'bg-warning';
    }
    return { statusText, statusColor };
  };

  const getMyRole = (c: CabinData) => {
    const cp = Array.isArray(participants[c.id]) ? participants[c.id] : [];
    const myParticipant = cp.find(p => p.userId === userId);
    const isCreatorAndParticipant = isCreator(c) && myParticipant?.role === 'participant';
    if (isCreator(c)) return isCreatorAndParticipant ? t.cabin.initiatorParticipant : t.cabin.initiator;
    return myParticipant?.role === 'viewer' ? t.cabin.viewerRole : t.cabin.participantRole;
  };

  return (
    <>
      <div className="card-hd flex items-center justify-between"
        style={{ background: 'linear-gradient(135deg, hsl(var(--brand-main)/0.04), transparent 70%)' }}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-ink-primary">{t.cabin.activeSyncCabins}</span>
          {entries.length > 0 && <span className="text-[0.625rem] bg-success/10 text-success font-medium px-1.5 py-0.5 rounded-full">{entries.length} {t.cabin.activeBadge}</span>}
        </div>
        <div className="flex items-center gap-3">
          {canCreate && (
            <button className="btn-brand btn-xs" onClick={onNewEntry} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '14px' }}>+</span> {t.cabin.newCabin}
            </button>
          )}
          {compact && entries.length > 3 && (
            <button className="text-xs text-brand-main font-medium hover:underline" onClick={() => navigate({ to: '/cabins' })}>
{t.cabin.viewAll || 'View All →'}
            </button>
          )}
        </div>
      </div>
      <div className="card-bd flex flex-col gap-2" style={{ padding: '12px 16px' }}>
        {loading ? (
          <div className="space-y-2 py-2">
            {Array.from({ length: 3 }, (_, i) => <SkeletonCard key={i} lines={2} />)}
          </div>
        ) : displayEntries.length === 0 ? (
          <p className="text-xs text-ink-muted py-3 text-center">{t.cabin.noActiveCabins}</p>
        ) : (
          displayEntries.map(c => {
            const { statusText, statusColor } = getCabinStatus(c);
            const myRole = getMyRole(c);
            const hasDoc = hasDocument(c.id);
            return (
              <div key={c.id} className="p-3 rounded-card bg-surface-hover cursor-pointer hover:bg-edge transition-colors"
                onClick={() => onSelectEntry(c.id)}>
                <div className="flex items-center gap-4">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColor}`} />
                  <span className="text-xs font-semibold text-ink-primary truncate" style={{ flex: '2' }}>{c.name}</span>
                  <span className={`text-[0.625rem] font-medium shrink-0 ${statusColor === 'bg-success' ? 'text-success' : statusColor === 'bg-warning' ? 'text-warning' : 'text-ink-muted'}`}
                    style={{ width: '110px' }}>{statusText}</span>
                  <span className="text-[0.625rem] text-ink-muted shrink-0 px-2 py-0.5 rounded-full"
                    style={{ minWidth: '64px', textAlign: 'center', background: 'hsl(var(--sf-h))' }}>{myRole}</span>
                  {hasDoc ? (
                    <button className="text-[0.625rem] text-brand-main font-medium hover:underline shrink-0" style={{ width: '60px', textAlign: 'right' }}
                      onClick={e => { e.stopPropagation(); onViewDocument(c.id); }}>
{t.cabin.viewDoc}
                    </button>
                  ) : (
                    <span style={{ width: '60px' }} />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
