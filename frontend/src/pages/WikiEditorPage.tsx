import { useState, useEffect } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { wikiApi } from '@/api/wikiApi';
import { useProjectStore } from '@/stores/projectStore';
import { getErrorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent } from '@/components/ui/Card';
import { MarkdownEditor } from '@/components/MarkdownEditor';
import { useT } from '@/i18n/useT';

interface Props {
  projectId: string;
}

export function WikiEditorPage({ projectId }: Props) {
  const t = useT();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { id?: string };
  const isEdit = !!params.id;
  const isClosed = (useProjectStore.getState().currentProject as unknown as Record<string, unknown>)?.status === 'closed';
  const reset = useProjectStore((s) => s.reset);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('general');
  const [status, setStatus] = useState('published');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [suggestedContent, setSuggestedContent] = useState<string | null>(null);
  const [suggestedTitle, setSuggestedTitle] = useState<string | null>(null);
  const [suggestedCategory, setSuggestedCategory] = useState<string | null>(null);
  const [catLoading, setCatLoading] = useState(false);

  useEffect(() => {
    if (isEdit) {
      wikiApi.get(projectId, params.id!).then(({ data: resp }) => {
        if (resp.data) {
          setTitle(resp.data.title);
          setContent(resp.data.content || '');
          setCategory(resp.data.category);
          setStatus(resp.data.status);
        }
      });
    }
  }, [projectId, params.id, isEdit]);

  useEffect(() => { return () => reset(); }, [reset]);

  const save = async () => {
    setError(''); setLoading(true);
    try {
      if (isEdit) {
        await wikiApi.update(projectId, params.id!, { title, content, category, status });
      } else {
        await wikiApi.create(projectId, { title, content, category, status });
      }
      navigate({ to: '/wiki' });
    } catch (err) {
      setError(getErrorMessage(err, { errors: { default: t.wikiEditor.failedToSave } }));
    } finally { setLoading(false); }
  };

  const deletePage = async () => {
    if (!confirm(t.wikiEditor.delete + '?')) return;
    await wikiApi.delete(projectId, params.id!);
    navigate({ to: '/wiki' });
  };

  const aiAction = async (action: string) => {
    if (!title.trim() && !content.trim()) return;
    setAiLoading(true); setError('');
    try {
      const token = localStorage.getItem('access_token') || '';
      const resp = await fetch('/api/v1/ai/optimize-wiki', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
        body: JSON.stringify({ title, content: content || title, action, instruction: aiPrompt || undefined, lang: localStorage.getItem('lang') || 'en' }),
      });
      if (!resp.ok) throw new Error(t.wikiEditor.aiFailed);
      const data = await resp.json();
      setSuggestedTitle(data.title !== title ? data.title : null);
      setSuggestedContent(data.content !== (content || title) ? data.content : (data.content || null));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : t.wikiEditor.aiFailed); }
    finally { setAiLoading(false); }
  };

  const applySuggestion = () => {
    if (suggestedContent !== null) setContent(suggestedContent);
    if (suggestedTitle !== null && !isEdit) setTitle(suggestedTitle);
    setSuggestedContent(null);
    setSuggestedTitle(null);
  };

  const aiOptimize = () => aiAction('polish');

  const suggestCategory = async () => {
    if (!title.trim() && !content.trim()) return;
    setCatLoading(true);
    try {
      const token = localStorage.getItem('access_token') || '';
      const resp = await fetch('/api/v1/ai/optimize-wiki', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
        body: JSON.stringify({ title, content: content || title, action: 'categorize', lang: localStorage.getItem('lang') || 'en' }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.category && data.category !== category) setSuggestedCategory(data.category);
      }
    } catch { /* ignore */ }
    finally { setCatLoading(false); }
  };

  return (
    <div className="p-6">
      <div className="max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <button className="btn-ghost btn-xs" onClick={() => navigate({ to: '/wiki' })}>{t.wikiEditor.back}</button>
          <div className="flex gap-2">
            {isClosed ? (
              <span className="text-xs text-ink-muted">{t.wikiEditor.readOnly}</span>
            ) : (
              <>
                {isEdit && <button className="btn-ghost btn-xs text-status-danger" onClick={deletePage}>{t.wikiEditor.delete}</button>}
                <Button onClick={save} loading={loading}>{t.wikiEditor.save}</Button>
              </>
            )}
          </div>
        </div>

        {error && <div className="card bg-danger-soft text-danger p-3 mb-4 text-sm">{error}</div>}

        <Card>
          <CardContent className="p-6 space-y-4">
            <Input label={t.wikiEditor.title} value={title} onChange={e => setTitle(e.target.value)} disabled={isClosed}
              placeholder={t.wikiEditor.pageTitlePlaceholder} style={{ fontSize: '18px', fontWeight: 600, padding: '12px 16px' }} />

            <div className="flex gap-4">
              <div className="flex-1 form-grp">
                <label className="form-label">{t.wikiEditor.category}</label>
                <div className="flex gap-1">
                  <input className="form-input flex-1" value={category}
                    onChange={e => setCategory(e.target.value)}
                    placeholder="e.g. architecture/api" disabled={isClosed} />
                  {!isClosed && (
                    <button type="button" className="btn-ghost btn-xs" onClick={suggestCategory} disabled={catLoading}
                      title={t.wikiEditor.aiSuggestCat}>{catLoading ? '...' : '🤖'}</button>
                  )}
                </div>
                {suggestedCategory && !isClosed && (
                  <p className="text-[0.625rem] text-brand-main mt-1 cursor-pointer"
                    onClick={() => { setCategory(suggestedCategory); setSuggestedCategory(null); }}>
                    💡 {t.wikiEditor.aiSuggestCatTip}: <span className="font-medium">{suggestedCategory}</span>
                  </p>
                )}
              </div>
              <div className="form-grp">
                <label className="form-label">{t.wikiEditor.status}</label>
                <select className="form-select" value={status} onChange={e => setStatus(e.target.value)} disabled={isClosed}>
                  <option value="draft">{t.wikiEditor.draft}</option>
                  <option value="published">{t.wikiEditor.published}</option>
                  <option value="archived">{t.wikiEditor.archived}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="form-label mb-2">{t.wikiEditor.contentLabel}</label>
              <MarkdownEditor value={content} onChange={setContent} readOnly={isClosed} height="450px" />
            </div>

            {/* AI Actions — hidden when project closed */}
            {!isClosed && (
            <div className="space-y-3">
              {/* Quick action buttons */}
              <div className="flex gap-2 flex-wrap">
                {([
                  ['polish', t.wikiEditor.aiPolish],
                  ['translate', t.wikiEditor.aiTranslate],
                  ['summarize', t.wikiEditor.aiSummarize],
                  ['expand', t.wikiEditor.aiExpand],
                ] as const).map(([action, label]) => (
                  <button key={action}
                    className="btn-ghost btn-xs"
                    disabled={aiLoading}
                    onClick={() => aiAction(action)}
                  >{label}</button>
                ))}
              </div>

              {/* Custom instruction input */}
              <div className="p-3 bg-brand-soft/10 rounded-card border border-brand-soft/20">
                <p className="text-xs font-semibold text-brand-main mb-2">{t.wikiEditor.aiAssist}</p>
                <div className="flex gap-2">
                  <input className="form-input flex-1 text-xs" placeholder={t.wikiEditor.aiPlaceholder}
                    value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && aiOptimize()} />
                  <button className="btn-brand btn-xs" onClick={aiOptimize} disabled={aiLoading || (!content.trim() && !title.trim())}>
                    {aiLoading ? t.wikiEditor.thinking : t.wikiEditor.optimize}
                  </button>
                </div>
                <p className="text-[0.6rem] text-ink-muted mt-1">{t.wikiEditor.aiDesc}</p>
              </div>

              {/* AI Suggestion Preview */}
              {suggestedContent !== null && (
                <div className="p-3 rounded-card border border-brand-soft/30 bg-brand-soft/5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-brand-main">{t.wikiEditor.aiSuggestion}</span>
                    <div className="flex gap-2">
                      <button className="btn-brand btn-xs" onClick={applySuggestion}>{t.wikiEditor.apply}</button>
                      <button className="btn-ghost btn-xs" onClick={() => { setSuggestedContent(null); setSuggestedTitle(null); }}>{t.wikiEditor.reject}</button>
                    </div>
                  </div>
                  <div className="text-xs text-ink-muted prose max-w-none max-h-48 overflow-y-auto"
                    dangerouslySetInnerHTML={{ __html: suggestedContent.replace(/\n/g, '<br/>') }} />
                </div>
              )}
            </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
