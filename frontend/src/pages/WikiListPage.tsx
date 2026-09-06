import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useSearch } from '@tanstack/react-router';
import { wikiApi, type WikiPage } from '@/api/wikiApi';
import { useProjectStore } from '@/stores/projectStore';
import { cn } from '@/lib/cn';
import { aiEnabled } from '@/lib/aiGate';
import { isDemoUser as isDemoUserEmail } from '@/lib/demoUser';
import { useT } from '@/i18n/useT';
import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen, Search, X, Clock, FileWarning, Edit3, Trash2 } from 'lucide-react';
import { MarkdownEditor } from '@/components/MarkdownEditor';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { sanitize } from '@/lib/sanitize';
import { renderMarkdown } from '@/lib/renderMarkdown';

interface Props {
  projectId: string;
}

// ─── Tree Node ───

interface TreeNode {
  name: string; path: string; children: Map<string, TreeNode>; pages: WikiPage[];
}

function buildTree(pages: WikiPage[]): TreeNode {
  const root: TreeNode = { name: '', path: '', children: new Map(), pages: [] };
  for (const p of pages) {
    const cat = (p.category || 'general').replace(/\/$/, '');
    const parts = cat.split('/');
    let current = root;
    for (const part of parts) {
      if (!current.children.has(part)) {
        current.children.set(part, { name: part, path: current.path ? `${current.path}/${part}` : part, children: new Map(), pages: [] });
      }
      current = current.children.get(part)!;
    }
    current.pages.push(p);
  }
  return root;
}

function countPages(node: TreeNode): number {
  return node.pages.length + Array.from(node.children.values()).reduce((s, c) => s + countPages(c), 0);
}

interface FlatEntry {
  type: 'folder' | 'page'; name: string; path: string; depth: number; page?: WikiPage; childCount?: number;
}

function flattenTree(node: TreeNode, depth: number, expanded: Set<string>): FlatEntry[] {
  const result: FlatEntry[] = [];
  for (const [, child] of node.children) {
    result.push({ type: 'folder', name: child.name, path: child.path, depth, childCount: countPages(child) });
    if (expanded.has(child.path)) {
      for (const p of child.pages) result.push({ type: 'page', name: p.title, path: p.id, depth: depth + 1, page: p });
      for (const [, sub] of child.children) result.push(...flattenTree({ name: '', path: '', children: new Map([[sub.name, sub]]), pages: [] }, depth + 1, expanded));
    }
  }
  for (const p of node.pages) result.push({ type: 'page', name: p.title, path: p.id, depth: 0, page: p });
  return result;
}

// ─── Search Results ───

function SearchResults({ pages, query, onSelect }: { pages: WikiPage[]; query: string; onSelect: (p: WikiPage) => void }) {
  const t = useT();
  if (pages.length === 0) return (
    <div className="text-center py-16">
      <p className="text-2xl mb-3">🔍</p>
      <p className="text-sm text-ink-primary font-medium">{t.wikiList.noResults} "{query}"</p>
      <p className="text-xs text-ink-muted mt-1">{t.wikiList.noResultsHint}</p>
    </div>
  );
  return (
    <div>
      <p className="text-xs text-ink-muted mb-4">{t.wikiList.resultsAbout(pages.length)}</p>
      <div className="space-y-5">
        {pages.map(p => (
          <div key={p.id} className="group">
            <div className="flex items-center gap-2 mb-0.5">
              {p.category && <span className="text-[0.6rem] text-brand-main">{p.category}</span>}
              {p.isSample && <span className="badge text-[0.5rem] bg-ink-muted/10 text-ink-muted">{t.wikiList.sample}</span>}
            </div>
            <button className="text-base font-medium text-ink-primary hover:text-brand-main transition-colors text-left" onClick={() => onSelect(p)}>
              {p.isSample && <span className="mr-1.5">📝</span>}{p.title}
            </button>
            <p className="text-xs text-ink-muted mt-1 leading-relaxed">{(p.content || '').replace(/[#>📝*`\n]/g, '').substring(0, 180)}</p>
            <div className="flex items-center gap-3 mt-1.5 text-[0.6rem] text-ink-muted">
              <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{new Date(p.updatedAt).toLocaleDateString()}</span>
              <span>{p.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Filtered List ───

function FilteredList({ pages, filter, onBack, onSelect }: { pages: WikiPage[]; filter: string; onBack: () => void; onSelect: (p: WikiPage) => void }) {
  const t = useT();
  const labels: Record<string, string> = { all: t.wikiList.allPages, published: t.wikiList.publishedLabel, draft: t.wikiList.drafts, sample: t.wikiList.templates };
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<'title' | 'created' | 'author' | 'status'>('created');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    const arr = [...pages];
    arr.sort((a, b) => {
      let va: string | number, vb: string | number;
      if (sortKey === 'title') { va = a.title.toLowerCase(); vb = b.title.toLowerCase(); }
      else if (sortKey === 'created') { va = new Date(a.createdAt || '').getTime(); vb = new Date(b.createdAt || '').getTime(); }
      else if (sortKey === 'author') { va = (a.createdByName || '').toLowerCase(); vb = (b.createdByName || '').toLowerCase(); }
      else { va = a.status; vb = b.status; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [pages, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const sortBy = (key: 'title' | 'created' | 'author' | 'status') => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };
  const sortArrow = (key: string) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  const columns: Array<{ key: 'title' | 'created' | 'author' | 'status'; label: string }> = [
    { key: 'title', label: t.wikiList.colTitle },
    { key: 'created', label: t.wikiList.colCreated },
    { key: 'author', label: t.wikiList.colAuthor },
    { key: 'status', label: t.wikiList.colStatus },
  ];
  const gridCols = { gridTemplateColumns: '1fr 110px 140px 90px' };

  return (
    <div>
      <button className="flex items-center gap-1 text-xs text-brand-main hover:text-brand-main/80 mb-4 transition-colors" onClick={onBack}>{t.wikiList.backToDashboard}</button>
      <h3 className="text-sm font-semibold text-ink-primary mb-1">{labels[filter] || filter}</h3>
      <p className="text-xs text-ink-muted mb-4">{pages.length} page{pages.length !== 1 ? 's' : ''}</p>
      {pages.length === 0 ? <p className="text-sm text-ink-muted text-center py-8">{t.wikiList.noPagesFilter}</p> : (
        <>
          <div className="card overflow-hidden">
            <div className="grid items-center px-3 py-2 border-b border-edge bg-surface-hover text-[0.6rem] font-semibold text-ink-muted uppercase tracking-wider" style={gridCols}>
              {columns.map(c => (
                <button key={c.key} className="text-left hover:text-brand-main transition-colors" onClick={() => sortBy(c.key)}>{c.label}{sortArrow(c.key)}</button>
              ))}
            </div>
            {paged.map(p => (
              <button key={p.id} className="grid w-full text-left items-center px-3 py-2.5 border-b border-edge last:border-b-0 hover:bg-surface-hover transition-colors" style={gridCols} onClick={() => onSelect(p)}>
                <span className="min-w-0 pr-2">
                  <span className="text-sm font-medium text-ink-primary block truncate">{p.isSample && '📝 '}{p.title}</span>
                  {p.category && <span className="badge text-[0.55rem] bg-brand-soft/30 text-brand-main mt-0.5">{p.category}</span>}
                </span>
                <span className="text-[0.6rem] text-ink-muted">{new Date(p.createdAt).toLocaleDateString()}</span>
                <span className="text-[0.6rem] text-ink-muted truncate pr-2">{p.createdByName || '—'}</span>
                <span className={cn('badge text-[0.55rem] justify-self-start', p.status === 'published' ? 'bg-status-success-soft text-status-success' : 'bg-warning-soft text-warning')}>{p.status}</span>
              </button>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button className="btn btn-xs btn-ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t.wikiList.prev}</button>
              <span className="text-xs text-ink-muted">{page} / {totalPages}</span>
              <button className="btn btn-xs btn-ghost" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>{t.wikiList.next}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Dashboard ───

function Dashboard({ pages, onFilter, onSelect }: { pages: WikiPage[]; onFilter: (f: string | null) => void; onSelect: (p: WikiPage) => void }) {
  const t = useT();
  const [recentMode, setRecentMode] = useState<'updated' | 'created' | 'accessed'>('updated');
  const [recentSortKey, setRecentSortKey] = useState<'title' | 'date'>('date');
  const [recentDir, setRecentDir] = useState<'asc' | 'desc'>('desc');
  const tsOf = (p: WikiPage) => recentMode === 'updated' ? p.updatedAt : recentMode === 'created' ? p.createdAt : (p.lastAccessedAt || '');
  const recent = useMemo(() => {
    const arr = [...pages];
    arr.sort((a, b) => {
      let va: string | number, vb: string | number;
      if (recentSortKey === 'title') { va = a.title.toLowerCase(); vb = b.title.toLowerCase(); }
      else { va = new Date(tsOf(a) || '').getTime(); vb = new Date(tsOf(b) || '').getTime(); }
      if (va < vb) return recentDir === 'asc' ? -1 : 1;
      if (va > vb) return recentDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr.slice(0, 6);
  }, [pages, recentMode, recentSortKey, recentDir]);
  const sortRecentBy = (key: 'title' | 'date') => {
    if (recentSortKey === key) setRecentDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setRecentSortKey(key); setRecentDir('desc'); }
  };
  const recentArrow = (key: 'title' | 'date') => recentSortKey === key ? (recentDir === 'asc' ? ' ↑' : ' ↓') : '';
  const dateColLabel = recentMode === 'updated' ? t.wikiList.sortUpdated : recentMode === 'created' ? t.wikiList.sortCreated : t.wikiList.sortAccessed;
  const samples = useMemo(() => pages.filter(p => p.isSample), [pages]);
  const catBreakdown = useMemo(() => {
    const map = new Map<string, { total: number; samples: number }>();
    for (const p of pages) { const top = (p.category || 'general').split('/')[0]; const e = map.get(top) || { total: 0, samples: 0 }; e.total++; if (p.isSample) e.samples++; map.set(top, e); }
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [pages]);
  const published = pages.filter(p => p.status === 'published').length;
  const drafts = pages.filter(p => p.status === 'draft').length;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-3">
        {[{ key: 'all', label: t.wikiList.totalPages, count: pages.length, color: 'text-ink-primary' }, { key: 'published', label: t.wikiList.publishedLabel, count: published, color: 'text-status-success' }, { key: 'draft', label: t.wikiList.drafts, count: drafts, color: 'text-warning' }, { key: 'sample', label: t.wikiList.templates, count: samples.length, color: 'text-brand-main' }].map(s => (
          <button key={s.key} className="card p-4 cursor-pointer hover:shadow-card-hover transition-shadow text-left" onClick={() => onFilter(s.key)}>
            <p className="text-[0.625rem] font-bold uppercase tracking-widest text-ink-muted flex items-center gap-2">{s.label}<span className="text-[0.6875rem] text-ink-muted">▶</span></p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.count}</p>
          </button>
        ))}
      </div>
      <div className="grid gap-6" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div>
          <h3 className="text-sm font-semibold text-ink-primary mb-3 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-ink-muted" />
            {t.wikiList.recentlyUpdated}
            <select className="form-select text-[0.6rem] ml-auto py-0.5" style={{ width: 'auto' }} value={recentMode} onChange={e => setRecentMode(e.target.value as 'updated' | 'created' | 'accessed')}>
              <option value="updated">{t.wikiList.sortUpdated}</option>
              <option value="created">{t.wikiList.sortCreated}</option>
              <option value="accessed">{t.wikiList.sortAccessed}</option>
            </select>
          </h3>
          <div className="card overflow-hidden">
            <div className="grid items-center px-3 py-2 border-b border-edge bg-surface-hover text-[0.6rem] font-semibold text-ink-muted uppercase tracking-wider" style={{ gridTemplateColumns: '1fr 110px' }}>
              <button className="text-left hover:text-brand-main transition-colors" onClick={() => sortRecentBy('title')}>{t.wikiList.colTitle}{recentArrow('title')}</button>
              <button className="text-left hover:text-brand-main transition-colors" onClick={() => sortRecentBy('date')}>{dateColLabel}{recentArrow('date')}</button>
            </div>
            {recent.map(p => (
              <button key={p.id} className="grid w-full text-left items-center px-3 py-2 border-b border-edge last:border-b-0 hover:bg-surface-hover transition-colors" style={{ gridTemplateColumns: '1fr 110px' }} onClick={() => onSelect(p)}>
                <span className="min-w-0 pr-2">
                  <span className="text-sm text-ink-primary truncate block">{p.isSample && '📝 '}{p.title}</span>
                </span>
                <span className="text-[0.6rem] text-ink-muted">{
                  recentMode === 'updated' ? new Date(p.updatedAt).toLocaleDateString()
                  : recentMode === 'created' ? new Date(p.createdAt).toLocaleDateString()
                  : p.lastAccessedAt ? new Date(p.lastAccessedAt).toLocaleDateString() : '—'
                }</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink-primary mb-3">{(t.wikiList as Record<string,unknown>).categories as string}</h3>
          <div className="space-y-2">
            {catBreakdown.map(([cat, info]) => (
              <button key={cat} className="card p-3 w-full text-left cursor-pointer hover:shadow-card-hover transition-shadow" onClick={() => onFilter(`cat:${cat}`)}>
                <div className="flex items-center justify-between mb-1.5"><span className="text-xs font-medium text-ink-primary capitalize">{cat}</span><span className="text-[0.6rem] text-ink-muted">{info.total} pages</span></div>
                <div className="progress" style={{ height: '4px' }}><div className="progress-bar brand" style={{ width: `${(info.total / pages.length) * 100}%` }} /></div>
                {info.samples > 0 && <p className="text-[0.6rem] text-warning mt-1 flex items-center gap-1"><FileWarning className="w-2.5 h-2.5" />{info.samples} template{info.samples > 1 ? 's' : ''} to fill</p>}
              </button>
            ))}
          </div>
        </div>
      </div>
      {samples.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-ink-primary mb-3 flex items-center gap-1.5"><FileWarning className="w-3.5 h-3.5 text-warning" />{t.wikiList.templatesToComplete}</h3>
          <div className="grid grid-cols-2 gap-2">
            {samples.map(p => (
              <button key={p.id} className="card p-3 text-left hover:shadow-card-hover transition-shadow border border-warning/20 bg-warning-soft/5" onClick={() => onSelect(p)}>
                <p className="text-sm text-ink-primary font-medium mb-1">📝 {p.title}</p>
                <div className="flex items-center gap-2"><span className="badge text-[0.5rem] bg-brand-soft/30 text-brand-main">{p.category}</span><span className="text-[0.6rem] text-ink-muted">{new Date(p.updatedAt).toLocaleDateString()}</span></div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── View / Edit Panel (right side) ───

function ViewEditPanel({ page, onClose, onSaved, canWrite }: { page: WikiPage; onClose: () => void; onSaved: () => void; canWrite: boolean }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(page.title);
  const [content, setContent] = useState(page.content || '');
  const [category, setCategory] = useState(page.category || 'general');
  const [status, setStatus] = useState(page.status || 'draft');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isClosed = (useProjectStore.getState().currentProject as unknown as Record<string, unknown>)?.status === 'closed';

  const save = async () => {
    setError(''); setSaving(true);
    try {
      await wikiApi.update(page.projectId, page.id, { title, content, category, status });
      setEditing(false);
      onSaved();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to save'); }
    finally { setSaving(false); }
  };

  const deletePage = async () => {
    if (!confirm('Delete this page?')) return;
    await wikiApi.delete(page.projectId, page.id);
    onSaved();
    onClose();
  };

  const renderHTML = (md: string) => sanitize(renderMarkdown(md));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button className="text-xs text-brand-main hover:text-brand-main/80 transition-colors" onClick={onClose}>{t.wikiList.back}</button>
        <div className="flex items-center gap-2">
          {!isClosed && canWrite && !editing && (
            <>
              <button className="btn-ghost btn-xs flex items-center gap-1" onClick={() => setEditing(true)}><Edit3 className="w-3 h-3" />Edit</button>
              <button className="btn-ghost btn-xs text-status-danger flex items-center gap-1" onClick={deletePage}><Trash2 className="w-3 h-3" />Delete</button>
            </>
          )}
        </div>
      </div>
      {error && <div className="card bg-danger-soft text-danger p-2 mb-3 text-xs">{error}</div>}
      {editing ? (
        <div className="space-y-4">
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" style={{ fontSize: '20px', fontWeight: 700 }} />
          <div className="flex gap-4">
            <div className="flex-1 form-grp">
              <label className="form-label">Category</label>
              <input className="form-input" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. architecture/api" />
            </div>
            <div className="form-grp">
              <label className="form-label">Status</label>
              <select className="form-select" value={status} onChange={e => setStatus(e.target.value)}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
          <MarkdownEditor value={content} onChange={setContent} height="420px" />
          <div className="flex justify-end gap-2">
            <button className="btn-ghost btn-xs" onClick={() => { setEditing(false); setTitle(page.title); setContent(page.content || ''); }}>Cancel</button>
            <Button onClick={save} loading={saving}>Save</Button>
          </div>
        </div>
      ) : (
        <div>
          <h1 className="text-xl font-bold text-ink-primary mb-1">{page.title}</h1>
          <div className="flex items-center gap-3 mb-6 text-xs text-ink-muted">
            {page.category && <span className="badge bg-brand-soft/30 text-brand-main">{page.category}</span>}
            <span>{page.status}</span>
            <span>Updated {new Date(page.updatedAt).toLocaleDateString()}</span>
          </div>
          <div className="prose prose-sm max-w-none text-ink-primary" dangerouslySetInnerHTML={{ __html: renderHTML(page.content || '') }} />
        </div>
      )}
    </div>
  );
}

// ─── New Page Panel ───

function NewPagePanel({ projectId, onCreated, onCancel }: { projectId: string; onCreated: (p: WikiPage) => void; onCancel: () => void }) {
  const t = useT();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('general');
  const [status, setStatus] = useState('draft');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    if (!title.trim()) return;
    setError(''); setSaving(true);
    try {
      const { data: resp } = await wikiApi.create(projectId, { title: title.trim(), content, category, status });
      if (resp.data) { onCreated(resp.data); }
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to create'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <button className="text-xs text-brand-main hover:text-brand-main/80 mb-4 transition-colors" onClick={onCancel}>{t.wikiList.back}</button>
      <h2 className="text-lg font-semibold text-ink-primary mb-4">{t.wiki.newPage || 'New Page'}</h2>
      {error && <div className="card bg-danger-soft text-danger p-2 mb-3 text-xs">{error}</div>}
      <div className="space-y-4">
        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Page title" style={{ fontSize: '20px', fontWeight: 700 }} />
        <div className="flex gap-4">
          <div className="flex-1 form-grp">
            <label className="form-label">Category</label>
            <input className="form-input" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. architecture/api" />
          </div>
          <div className="form-grp">
            <label className="form-label">Status</label>
            <select className="form-select" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </div>
        </div>
        <MarkdownEditor value={content} onChange={setContent} height="420px" />
        <div className="flex justify-end">
          <Button onClick={create} loading={saving} disabled={!title.trim()}>{t.wiki.createPage || 'Create Page'}</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───

export function WikiListPage({ projectId }: Props) {
  const t = useT();
  const search = useSearch({ strict: false }) as { new?: string; tour?: string };
  const reset = useProjectStore((s) => s.reset);
  // Demo tour step 5 — AI Wiki / knowledge base highlight (AI-only)
  const isDemoUser = useAuthStore((s) => isDemoUserEmail(s.user?.email));
  const showTour = search.tour === '5' && isDemoUser && aiEnabled;
  const finishWikiTour = () => {
    try { localStorage.setItem('tomihub-demo-tour', 'done'); } catch { /* noop */ }
    window.location.href = '/home';
  };
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<WikiPage | null>(null);
  const [showNew, setShowNew] = useState(search.new === 'true');
  const [needsRefresh, setNeedsRefresh] = useState(0);

  const activePageId = useRef<string | null>(null);

  const loadPages = useCallback(async () => {
    setLoading(true);
    try {
      const { data: resp } = await wikiApi.list(projectId);
      const all = resp.data || [];
      setPages(all);
      const cats = new Set<string>();
      for (const p of all) { const cat = p.category || 'general'; cat.split('/').forEach((_, i, a) => cats.add(a.slice(0, i + 1).join('/'))); }
      setExpanded(cats);
      // Refresh active page data
      if (activePageId.current) {
        const updated = all.find(p => p.id === activePageId.current);
        if (updated) setActivePage(updated);
      }
    } finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { loadPages(); }, [loadPages, needsRefresh]);
  useEffect(() => { return () => reset(); }, [reset]);

  const _tree = useMemo(() => buildTree(pages), [pages]); void _tree;

  const openPage = (p: WikiPage) => {
    activePageId.current = p.id;
    setSearchQuery('');
    setFilter(null);
    setShowNew(false);
    // Expand the tree to show this page's category
    const cat = p.category || 'general';
    const parts = cat.split('/');
    setExpanded(prev => {
      const next = new Set(prev);
      for (let i = 0; i < parts.length; i++) next.add(parts.slice(0, i + 1).join('/'));
      return next;
    });
    setActivePage(p);
  };

  const openNewPage = () => {
    setSearchQuery('');
    setFilter(null);
    setActivePage(null);
    setShowNew(true);
  };

  const filteredPages = useMemo(() => {
    if (!searchQuery.trim()) return pages;
    const q = searchQuery.toLowerCase();
    return pages.filter(p => p.title.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q) || (p.content || '').toLowerCase().includes(q));
  }, [pages, searchQuery]);

  const isSearching = searchQuery.trim().length > 0;
  const searchTree = useMemo(() => buildTree(filteredPages), [filteredPages]);
  const effectiveExpanded = useMemo(() => {
    if (isSearching) { const cats = new Set<string>(); for (const p of filteredPages) { const cat = p.category || 'general'; cat.split('/').forEach((_, i, a) => cats.add(a.slice(0, i + 1).join('/'))); } return cats; }
    return expanded;
  }, [isSearching, filteredPages, expanded]);
  const flat = useMemo(() => flattenTree(searchTree, 0, effectiveExpanded), [searchTree, effectiveExpanded]);
  const numberedFlat = useMemo(() => {
    const counters: number[] = [0];
    return flat.map(entry => { const d = entry.depth; counters.length = d + 1; if (!counters[d]) counters[d] = 0; counters[d]++; counters.length = d + 1; return { ...entry, number: counters.filter(n => n > 0).join('.') + '.' }; });
  }, [flat]);

  const toggleFolder = (path: string) => {
    if (isSearching) return;
    setExpanded(prev => { const next = new Set(prev); if (next.has(path)) next.delete(path); else next.add(path); return next; });
  };

  const isClosed = (useProjectStore.getState().currentProject as unknown as Record<string, unknown>)?.status === 'closed';
  const canWrite = useAuthStore((s) => s.canWrite)();

  // Determine right panel content
  const rightPanel = (() => {
    if (showNew) return <NewPagePanel projectId={projectId} onCreated={(p) => { setShowNew(false); openPage(p); }} onCancel={() => setShowNew(false)} />;
    if (isSearching) return <SearchResults pages={filteredPages} query={searchQuery} onSelect={openPage} />;
    if (activePage) return <ViewEditPanel page={activePage} onClose={() => { setActivePage(null); activePageId.current = null; }} onSaved={() => setNeedsRefresh(n => n + 1)} canWrite={canWrite} />;
    if (filter) {
      let fp: WikiPage[], fl: string;
      if (filter.startsWith('cat:')) { const cat = filter.slice(4); fp = pages.filter(p => (p.category || 'general').startsWith(cat)); fl = cat; }
      else if (filter === 'sample') { fp = pages.filter(p => p.isSample); fl = 'sample'; }
      else if (filter === 'draft') { fp = pages.filter(p => p.status === 'draft'); fl = 'draft'; }
      else if (filter === 'published') { fp = pages.filter(p => p.status === 'published'); fl = 'published'; }
      else { fp = pages; fl = 'all'; }
      return <FilteredList pages={fp} filter={fl} onBack={() => setFilter(null)} onSelect={openPage} />;
    }
    return <Dashboard pages={pages} onFilter={setFilter} onSelect={openPage} />;
  })();

  return (
    <div className="flex h-full">
      {/* ── Left: Directory Sidebar ── */}
      <div className="w-72 shrink-0 border-r border-edge bg-surface-card flex flex-col" style={{ height: 'calc(100vh - 3.5rem)' }}>
        <div className="px-3 py-3 border-b border-edge space-y-2">
          <div>
            <p className="text-sm font-semibold text-ink-primary">{t.wikiList.title}</p>
            <p className="text-[0.6rem] text-ink-muted">{t.wikiList.pageCount(pages.length)}</p>
          </div>
          <div className="relative">
            <Search className="w-3 h-3 text-ink-muted absolute left-2 top-1/2 -translate-y-1/2" />
            <input className="form-input w-full text-xs pl-6 pr-6 py-1" placeholder={t.wiki.search || 'Search wiki...'} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            {searchQuery && <button className="absolute right-1.5 top-1/2 -translate-y-1/2" onClick={() => setSearchQuery('')}><X className="w-3 h-3 text-ink-muted hover:text-ink-primary" /></button>}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {loading ? <p className="text-xs text-ink-muted text-center py-4">{t.wikiList.loading}</p> : numberedFlat.map((entry) =>
            entry.type === 'folder' ? (
              <button key={entry.path} className="w-full flex items-start gap-1.5 py-1.5 pr-3 text-xs text-ink-primary hover:bg-surface-hover transition-colors text-left" style={{ paddingLeft: `${12 + entry.depth * 16}px` }} onClick={() => toggleFolder(entry.path)}>
                {effectiveExpanded.has(entry.path) ? <ChevronDown className="w-3 h-3 text-ink-muted shrink-0 mt-0.5" /> : <ChevronRight className="w-3 h-3 text-ink-muted shrink-0 mt-0.5" />}
                <span className="text-[0.6rem] text-ink-muted font-mono shrink-0 mt-0.5">{entry.number}</span>
                {effectiveExpanded.has(entry.path) ? <FolderOpen className="w-3.5 h-3.5 text-brand-main/70 shrink-0 mt-0.5" /> : <Folder className="w-3.5 h-3.5 text-ink-muted/50 shrink-0 mt-0.5" />}
                <span className="font-medium whitespace-normal break-words leading-relaxed">{entry.name}</span>
                <span className="text-[0.55rem] text-ink-muted ml-auto mt-0.5 shrink-0">{entry.childCount}</span>
              </button>
            ) : (
              <button key={entry.page!.id}
                className={cn('w-full flex items-start gap-2 py-1.5 pr-3 text-xs transition-colors text-left',
                  activePage?.id === entry.page!.id ? 'text-brand-main bg-brand-soft/20 border-r-2 border-r-brand-main' : 'text-ink-muted hover:text-brand-main hover:bg-brand-soft/20')}
                style={{ paddingLeft: `${20 + entry.depth * 16}px` }}
                onClick={() => openPage(entry.page!)}
              >
                <span className="text-[0.6rem] text-ink-muted font-mono shrink-0 mt-0.5">{entry.number}</span>
                {entry.page!.isSample ? <span className="text-xs shrink-0 mt-0.5">📝</span> : <FileText className="w-3 h-3 shrink-0 opacity-40 mt-0.5" />}
                <span className="whitespace-normal break-words leading-relaxed">{entry.name}</span>
                {entry.page!.isSample && <span className="badge text-[0.5rem] bg-ink-muted/10 text-ink-muted shrink-0 ml-auto mt-0.5">{t.wikiList.sample}</span>}
              </button>
            )
          )}
        </div>
        {!isClosed && (
          <div className="px-3 py-2.5 border-t border-edge">
            <button className="btn-brand w-full text-xs py-1.5" onClick={openNewPage}>{t.wikiList.newPage}</button>
          </div>
        )}
      </div>

      {/* ── Right: Content Panel ── */}
      <div className="flex-1 overflow-y-auto p-6" style={{ height: 'calc(100vh - 3.5rem)' }}>
        {rightPanel}
      </div>

      {/* ─── Demo tour step 5 — AI Wiki / knowledge base highlight ─── */}
      {showTour && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-end justify-center" onClick={finishWikiTour}>
          <div
            className="bg-surface-card border border-edge rounded-card shadow-card p-4 mb-8 w-full max-w-md mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-ink-primary">✨ {t.projectOverview.tourTitle}</p>
              <button className="text-[0.65rem] text-ink-muted hover:text-ink-primary" onClick={finishWikiTour}>✕</button>
            </div>
            <p className="text-sm font-semibold text-ink-primary mb-1">
              5. {t.projectOverview.tourStep5Title}
            </p>
            <p className="text-xs text-ink-secondary mb-3 leading-relaxed">
              {t.projectOverview.tourStep5Body}
            </p>
            <div className="flex items-center gap-1.5 mb-3">
              {[1, 2, 3, 4, 5].map(n => (
                <span key={n} className={`h-1.5 rounded-full transition-all ${n === 5 ? 'w-6 bg-brand-main' : n < 5 ? 'w-3 bg-brand-main/40' : 'w-3 bg-edge'}`} />
              ))}
              <span className="ml-auto text-[0.6rem] text-ink-muted font-medium">5/5</span>
            </div>
            <div className="flex items-center justify-between">
              <button className="text-xs text-ink-muted hover:text-ink-primary px-2 py-1" onClick={finishWikiTour}>
                {t.projectOverview.tourDone}
              </button>
              <button className="btn-brand btn-xs" onClick={finishWikiTour}>
                {t.projectOverview.tourDone}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
