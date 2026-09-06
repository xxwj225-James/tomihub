import { useRef, useEffect } from 'react';
import { cn } from '@/lib/cn';
import { Loader2, CornerDownLeft } from 'lucide-react';

interface ChatInputAreaT {
  placeholder: string;
  send: string;
  enterHint: string;
  escToStop: string;
  [key: string]: unknown;
}

interface ChatInputAreaProps {
  input: string;
  setInput: (s: string) => void;
  attachedFiles: Array<{name: string; type: string; data: string; size: number}>;
  setAttachedFiles: React.Dispatch<React.SetStateAction<Array<{name: string; type: string; data: string; size: number}>>>;
  onSend: () => void;
  isStreaming: boolean;
  onStop: () => void;
  error: string;
  setError: (e: string) => void;
  t: ChatInputAreaT;
}

export function ChatInputArea({
  input,
  setInput,
  attachedFiles,
  setAttachedFiles,
  onSend,
  isStreaming,
  onStop,
  error,
  setError,
  t,
}: ChatInputAreaProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px'; }
  }, [input]);

  const readFileAsBase64 = (file: File): Promise<{name: string; type: string; data: string; size: number}> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({
        name: file.name, type: file.type,
        data: (reader.result as string).split(',')[1] || (reader.result as string),
        size: file.size,
      });
      reader.readAsDataURL(file);
    });
  };

  const handleFiles = async (files: FileList | File[]) => {
    const validTypes = ['text/', 'image/', 'application/json', 'application/pdf',
      'application/vnd.openxmlformats-officedocument', 'application/msword',
      'application/vnd.ms-excel', 'text/csv', 'application/csv'];
    const arr = Array.from(files).filter(f =>
      f.size < 10 * 1024 * 1024 && validTypes.some(t => f.type.startsWith(t) || f.name.endsWith('.log') || f.name.endsWith('.csv'))
    );
    if (arr.length === 0) return;
    const results = await Promise.all(arr.map(readFileAsBase64));
    setAttachedFiles(prev => [...prev, ...results].slice(0, 10));
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of items) {
      if (item.kind === 'file') { const f = item.getAsFile(); if (f) files.push(f); }
    }
    if (files.length > 0) { e.preventDefault(); handleFiles(files); }
  };

  const removeFile = (idx: number) => setAttachedFiles(prev => prev.filter((_, i) => i !== idx));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
  };

  const handleSendClick = () => { if (input.trim()) onSend(); };

  return (
    <div className="px-4 py-3 border-t border-edge shrink-0 bg-surface-card" onPaste={handlePaste}>
      {/* File chips */}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {attachedFiles.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-[0.6rem] bg-surface-hover border border-edge rounded-full px-2 py-0.5">
              {f.type.startsWith('image/') ? '🖼' : '📄'} {f.name.length > 20 ? f.name.slice(0, 20) + '...' : f.name}
              <button className="text-ink-muted hover:text-danger" onClick={() => removeFile(i)}>×</button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <button
          className="w-9 h-9 mb-1 rounded-full flex items-center justify-center text-ink-muted hover:text-brand-main hover:bg-brand-soft transition-all text-xl font-light border border-edge shrink-0"
          onClick={() => fileInputRef.current?.click()}
          title="Upload files"
        >+</button>
        <input type="file" ref={fileInputRef} className="hidden" multiple
          accept=".txt,.log,.csv,.json,.md,.pdf,.docx,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.bmp"
          onChange={e => e.target.files && handleFiles(e.target.files)} />
        <div className="relative flex-1">
          <textarea
            ref={inputRef}
            className="w-full form-input text-sm resize-none rounded-2xl"
            style={{ padding: '12px 52px 12px 18px', minHeight: '48px', maxHeight: '160px' }}
            placeholder={t.placeholder as string}
            value={input}
            onChange={e => { setInput(e.target.value); if (error) setError(''); }}
            onKeyDown={handleKeyDown}
            autoFocus
            rows={1}
          />
          <button
            className={cn(
              'absolute right-2 bottom-2 w-8 h-8 rounded-full flex items-center justify-center transition-all',
              input.trim() ? 'bg-brand-main text-white hover:bg-brand-hover' : 'bg-surface-hover text-ink-muted'
            )}
            onClick={handleSendClick}
            disabled={!input.trim()}
            title={t.send as string}
          >
            {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CornerDownLeft className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Footer: stop button + shortcut hints */}
      <div className="flex items-center justify-end mt-2 px-1">
        <span className="text-[0.6rem] text-ink-muted/50">
          {isStreaming ? (
            <button className="hover:text-danger transition-colors" onClick={onStop}>{t.escToStop as string}</button>
          ) : (
            t.enterHint as string
          )}
        </span>
      </div>
    </div>
  );
}
