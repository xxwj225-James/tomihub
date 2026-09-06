interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmClass?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, message, confirmLabel, confirmClass = 'btn-brand', onConfirm, onCancel }: Props) {
  if (!open) return null;
  const displayConfirm = confirmLabel || 'Confirm';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="card shadow-dialog" style={{ width: '380px' }}>
        <div className="card-hd">
          <h3 className="text-sm font-semibold text-ink-primary">{title}</h3>
        </div>
        <div className="card-bd" style={{ padding: '20px' }}>
          <p className="text-sm text-ink-primary">{message}</p>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-edge">
          <button className="btn-ghost" onClick={onCancel}>{"Cancel"}</button>
          <button className={confirmClass} onClick={onConfirm}>{displayConfirm}</button>
        </div>
      </div>
    </div>
  );
}
