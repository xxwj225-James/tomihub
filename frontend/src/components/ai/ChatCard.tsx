/**
 * Rich ChatCard — renders tool results as actionable cards
 * instead of raw JSON. Handles: issue/wiki/report/exports/dedup/search.
 */
import { cn } from '@/lib/cn';
import { sanitize } from '@/lib/sanitize';
import { renderMarkdown } from '@/lib/renderMarkdown';
import { useNavigate } from '@tanstack/react-router';
import { useProjectStore } from '@/stores/projectStore';

interface ToolResult {
  status?: string; message?: string; key?: string; id?: string;
  title?: string; url?: string; content?: string; description?: string;
  report_type?: string; content_length?: number; filename?: string;
  download?: string; blocked?: boolean; priority?: string;
  duplicates?: Array<{ key: string; title: string; status?: string; category?: string }>;
  results?: Array<{ title: string; snippet: string }>;
  projects?: Array<{ id: string; name: string; key: string; phase?: string }>;
  access?: boolean; role?: string; project?: string; reason?: string;
  total?: number; [key: string]: unknown;
}

interface ChatCardProps {
  toolName: string;
  result: ToolResult;
  className?: string;
}

/** Pick card type based on tool name and result shape */
function cardType(name: string, result: ToolResult): string {
  if (result.blocked) return 'dedup';
  if (name === 'search_knowledge') return 'search';
  if (name === 'web_search') return 'search';
  if (name === 'list_my_projects') return 'project_list';
  if (name === 'check_project_access') return 'access';
  if (name === 'get_project_stats') return 'stats';
  if (name === 'list_members') return 'members';
  if (name === 'list_issues' || name === 'list_my_tasks') return 'issue_list';
  if (name === 'get_issue') return 'issue_detail';
  if (name === 'create_issue') return 'issue_created';
  if (name === 'update_issue') return 'issue_updated';
  if (name === 'create_wiki') return 'wiki_created';
  if (name === 'generate_report') return 'report';
  if (name.startsWith('export')) return 'export';
  return 'generic';
}

function ResultBadge({ status, message }: { status?: string; message?: string }) {
  if (status === 'error' || message) {
    return <span className="text-[0.55rem] font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">Failed</span>;
  }
  return <span className="text-[0.55rem] font-semibold text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded-full">Done</span>;
}

export function ChatCard({ toolName, result, className }: ChatCardProps) {
  const navigate = useNavigate();
  const setCurrentProject = useProjectStore(s => s.setCurrentProject);
  const type = cardType(toolName, result);

  return (
    <div className={cn('rounded-xl border mt-2 overflow-hidden text-xs', className,
      result.status === 'error' ? 'border-red-200 bg-red-50/40' :
      result.blocked ? 'border-amber-200 bg-amber-50/40' :
      'border-slate-200/80 bg-white',
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-inherit bg-white/50">
        <div className="flex items-center gap-2">
          <span className="text-sm">{ICONS[type] || '📌'}</span>
          <span className="font-semibold text-slate-700 text-[0.65rem]">{LABELS[type] || toolName}</span>
        </div>
        <ResultBadge status={result.status} message={result.message} />
      </div>

      {/* Body — varies by card type */}
      <div className="px-3 py-2.5">
        {/* Duplicate warning */}
        {type === 'dedup' && result.duplicates && (
          <div>
            <p className="text-amber-700 font-medium text-[0.65rem] mb-2">
              ⚠️ Possible duplicate — similar items already exist:
            </p>
            <div className="space-y-1">
              {result.duplicates.map((d, i) => (
                <div key={i} className="flex items-center gap-2 p-1.5 rounded-lg bg-white/60 border border-amber-100">
                  <span className="text-[0.6rem] font-mono font-bold text-slate-500">{d.key}</span>
                  <span className="text-[0.65rem] text-slate-700 truncate">{d.title}</span>
                  {d.status && <span className="text-[0.55rem] text-slate-400 ml-auto">{d.status}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search results */}
        {type === 'search' && result.results && (
          <div className="space-y-1">
            {result.results.map((r, i) => (
              <div key={i} className="p-1.5 rounded-lg bg-slate-50/60">
                <p className="text-[0.65rem] font-semibold text-slate-700">{r.title}</p>
                {r.snippet && <p className="text-[0.6rem] text-slate-500 mt-0.5 line-clamp-2">{r.snippet}</p>}
              </div>
            ))}
            {(!result.results || result.results.length === 0) && (
              <p className="text-[0.65rem] text-slate-400">No results found.</p>
            )}
          </div>
        )}

        {/* Issue created / updated */}
        {(type === 'issue_created' || type === 'issue_updated') && (
          <div className="flex items-center gap-3">
            {result.key && (
              <span
                className="text-[0.65rem] font-mono font-bold text-white bg-brand-main px-2 py-1 rounded-md cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => {
                  if (result.id) navigate({ to: '/issues/$id', params: { id: result.id } });
                }}
              >
                {result.key}
              </span>
            )}
            {result.title && <span className="text-[0.65rem] text-slate-700 font-medium truncate">{result.title}</span>}
            {result.message && <span className="text-[0.6rem] text-slate-400 ml-auto">{result.message}</span>}
          </div>
        )}

        {/* Issue detail */}
        {type === 'issue_detail' && (
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[0.65rem] font-mono font-bold text-brand-main">{result.key}</span>
              {result.status && <span className="text-[0.55rem] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">{result.status}</span>}
              {result.priority && <span className="text-[0.55rem] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">{result.priority}</span>}
            </div>
            <p className="text-[0.65rem] font-semibold text-slate-700 mb-1">{result.title}</p>
            {result.description && (
              <div className="text-[0.6rem] text-slate-500 prose prose-sm max-w-none line-clamp-3"
                dangerouslySetInnerHTML={{ __html: sanitize(renderMarkdown((result.description || '').slice(0, 300))) }} />
            )}
          </div>
        )}

        {/* Wiki created */}
        {type === 'wiki_created' && (
          <div>
            {result.id && (
              <span
                className="text-[0.65rem] font-semibold text-brand-main hover:underline cursor-pointer"
                onClick={() => navigate({ to: '/wiki/$id', params: { id: result.id || '' } })}
              >
                📝 {result.title || 'Wiki Page'}
              </span>
            )}
            {result.url && <span className="text-[0.6rem] text-slate-500 ml-2">{result.url}</span>}
          </div>
        )}

        {/* Report generated */}
        {type === 'report' && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[0.65rem] font-semibold text-slate-700">
                {result.report_type || 'Report'} generated
              </span>
              {result.content_length && (
                <span className="text-[0.55rem] text-slate-400">{result.content_length} chars</span>
              )}
            </div>
            {result.content && (
              <div className="text-[0.6rem] text-slate-600 prose prose-sm max-w-none line-clamp-5 max-h-32 overflow-y-auto p-2 rounded-lg bg-slate-50 border border-slate-100"
                dangerouslySetInnerHTML={{ __html: sanitize(renderMarkdown((result.content || '').slice(0, 2000))) }} />
            )}
          </div>
        )}

        {/* Export */}
        {type === 'export' && (
          <div>
            <p className="text-[0.65rem] text-slate-600 mb-1">{result.filename || 'Export ready'}</p>
            {result.download && (
              <a href={result.download.match(/\(([^)]+)\)/)?.[1] || '#'}
                className="text-[0.6rem] font-semibold text-brand-main hover:underline"
                target="_blank" rel="noopener"
                dangerouslySetInnerHTML={{ __html: result.download }} />
            )}
          </div>
        )}

        {/* Project list */}
        {type === 'project_list' && result.projects && (
          <div className="space-y-1">
            {result.projects.map((p, i) => (
              <button
                key={i}
                className="w-full flex items-center gap-2 p-2 rounded-lg bg-slate-50/60 hover:bg-brand-soft/30 cursor-pointer transition-colors text-left border border-transparent hover:border-brand-main/20"
                onClick={() => setCurrentProject(p as any)}
              >
                <span className="text-[0.65rem] font-semibold text-slate-700">{p.name}</span>
                <span className="text-[0.6rem] font-mono text-slate-400">{p.key}</span>
                {p.phase && <span className="text-[0.55rem] text-slate-400 ml-auto">{p.phase}</span>}
                <span className="text-[0.5rem] text-brand-main ml-auto opacity-0 group-hover:opacity-100">Select →</span>
              </button>
            ))}
            <p className="text-[0.55rem] text-slate-400 mt-1.5">Click a project to select it, or use the dropdown in the chat header.</p>
          </div>
        )}

        {/* Access check */}
        {type === 'access' && (
          <div className={cn(
            'flex items-center gap-2 p-2 rounded-lg text-[0.65rem]',
            result.access ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700',
          )}>
            <span>{result.access ? '✅' : '❌'}</span>
            <span>{result.access ? `Access granted — ${result.role || 'member'} of ${result.project || 'project'}` : (result.reason || 'Access denied')}</span>
          </div>
        )}

        {/* Stats */}
        {type === 'stats' && (
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(result).filter(([k]) => k !== 'status' && k !== 'message' && typeof k === 'string' && !k.startsWith('_')).map(([k, v]) => (
              <div key={k} className="text-center p-2 rounded-lg bg-slate-50">
                <p className="text-[0.7rem] font-bold text-slate-700">{String(v)}</p>
                <p className="text-[0.5rem] text-slate-400 uppercase tracking-wider">{k.replace(/_/g, ' ')}</p>
              </div>
            ))}
          </div>
        )}

        {/* Members */}
        {type === 'members' && Array.isArray(result) && (
          <div className="flex flex-wrap gap-1">
            {result.slice(0, 10).map((m: any, i: number) => (
              <span key={i} className="text-[0.6rem] bg-slate-100 text-slate-600 px-2 py-1 rounded-full">
                {String(m.name || m.userId || '?')} {m.role ? `· ${m.role}` : ''}
              </span>
            ))}
            {(result as Array<unknown>).length > 10 && (
              <span className="text-[0.55rem] text-slate-400">+{(result as Array<unknown>).length - 10} more</span>
            )}
          </div>
        )}

        {/* Generic / fallback — show message or truncated JSON */}
        {type === 'generic' && (
          <div>
            {result.message ? (
              <p className="text-[0.65rem] text-slate-600">{result.message}</p>
            ) : (
              <pre className="text-[0.55rem] text-slate-500 bg-slate-50 p-2 rounded-lg max-h-24 overflow-y-auto whitespace-pre-wrap">
                {JSON.stringify(result, null, 1).slice(0, 500)}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const ICONS: Record<string, string> = {
  dedup: '⚠️', search: '🔍', issue_created: '✅', issue_updated: '✏️',
  issue_detail: '📋', wiki_created: '📝', report: '📊', export: '📥',
  project_list: '📁', access: '🔑', stats: '📈', members: '👥',
  issue_list: '📋', generic: '📌',
};

const LABELS: Record<string, string> = {
  dedup: 'Duplicate detected', search: 'Search results',
  issue_created: 'Issue created', issue_updated: 'Issue updated',
  issue_detail: 'Issue details', wiki_created: 'Wiki page created',
  report: 'Report', export: 'Export',
  project_list: 'Projects', access: 'Access',
  stats: 'Stats', members: 'Members',
  issue_list: 'Issues', generic: 'Result',
};
