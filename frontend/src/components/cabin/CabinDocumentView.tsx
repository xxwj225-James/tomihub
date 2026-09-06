import { useState } from 'react';
import { sanitize } from '@/lib/sanitize';
import { marked } from 'marked';
import { cabinApi, type CabinDocument, type CabinFeedback } from '@/api/cabinApi';
import { useT } from '@/i18n/useT';

interface CabinDocumentViewProps {
  doc: CabinDocument;
  cabinName: string;
  cabinStatus: string;
  versions: CabinDocument[];
  feedback: CabinFeedback[];
  isOwner: boolean;
  onClose: () => void;
  onVersionChange: (doc: CabinDocument) => void;
  onDataChange?: (data: { doc: CabinDocument; versions: CabinDocument[]; feedback: CabinFeedback[] }) => void;
  getUserName: (id: string) => string;
}

export function CabinDocumentView({
  doc,
  cabinName,
  cabinStatus,
  versions,
  feedback,
  isOwner,
  onClose,
  onVersionChange,
  onDataChange,
  getUserName,
}: CabinDocumentViewProps) {
  const t = useT();
  const [generating, setGenerating] = useState(false);

  const handleVersionClick = (v: CabinDocument) => {
    onVersionChange(v);
  };

  const handleRegenerate = async () => {
    setGenerating(true);
    try {
      await cabinApi.generateDocument(doc.cabinId);
      const d = await cabinApi.getDocument(doc.cabinId).then(r => r.data.data).catch(() => null);
      const vs = await cabinApi.listDocuments(doc.cabinId).then(r => r.data.data || []).catch(() => []);
      const fb = await cabinApi.listFeedback(doc.cabinId).then(r => r.data.data || []).catch(() => []);
      if (d && onDataChange) {
        onDataChange({ doc: d, versions: vs, feedback: fb });
      }
    } catch { /* Document fetch failure — UI state remains unchanged */ }
    finally { setGenerating(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card shadow-dialog" style={{ width: '780px', maxHeight: '85vh', overflowY: 'auto' }}>
        <div className="card-hd flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">{cabinName} — {t.cabin.panoramaDoc?.(doc.version, '') || 'Report'}</h3>
            <p className="text-[0.625rem] text-ink-muted mt-0.5">
              {versions.length > 0 && `${versions.length} ${t.cabin.version || 'version(s)'} · `}
              {t.cabin.latest || 'Latest'}: {new Date(doc.generatedAt).toLocaleString()}
            </p>
          </div>
          <button className="btn-ghost text-lg px-1" onClick={onClose}>✕</button>
        </div>
        <div className="card-bd flex flex-col gap-4" style={{ padding: '20px' }}>

          {/* Version selector */}
          {versions.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-ink-muted">{t.cabin.version || 'Version'}:</span>
              {versions.map((v, i) => (
                <button key={v.id || i}
                  className={`text-[0.625rem] px-2 py-0.5 rounded-full ${v.version === doc.version ? 'bg-brand-main text-white' : 'bg-surface-hover text-ink-muted'}`}
                  onClick={() => handleVersionClick(v)}>
                  v{v.version}
                </button>
              ))}
            </div>
          )}

          {/* Report content */}
          <div className="p-3 rounded-card bg-surface-hover">
            <div className="text-xs text-ink-primary cabin-doc" style={{ lineHeight: '1.8', maxHeight: '450px', overflowY: 'auto' }}
              dangerouslySetInnerHTML={{ __html: sanitize(marked.parse(doc.content || '') as string) }} />
          </div>

          {/* Feedback */}
          <div>
            <p className="text-xs font-semibold mb-1.5">{t.cabin.feedback?.(feedback.length) || `Feedback (${feedback.length})`}</p>
            {feedback.length === 0 ? (
              <p className="text-[0.625rem] text-ink-muted">{t.cabin.noFeedback || 'No feedback yet.'}</p>
            ) : (
              feedback.map(f => (
                <div key={f.id} className="text-[0.625rem] py-1.5 px-2 mb-1 bg-surface-hover rounded">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-ink-primary">{getUserName(f.userId)}</span>
                    <span className="text-ink-muted">{new Date(f.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-ink-primary">{f.feedback}</p>
                </div>
              ))
            )}
          </div>

          {/* Re-generate for creator (only if not cancelled/closed) */}
          {isOwner && cabinStatus === 'open' && (
            <button className="btn-brand" style={{ width: '100%' }}
              onClick={handleRegenerate} disabled={generating}>
              {generating ? (t.cabin.aiGenerating || 'Generating...') : (t.cabin.regenDoc || '🔄 Re-generate with latest feedback')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
