import { useT } from '@/i18n/useT';
import { useProjectStore } from '@/stores/projectStore';
import { cn } from '@/lib/cn';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import type { IssueData } from '@/api/issueApi';
import { SkeletonRow } from '@/components/ui/Skeleton';

export type SortField = string;
export type SortDir = 'asc' | 'desc';

export interface ColumnDef {
  field: string;
  label: string;
  width: string;
  defaultVisible: boolean;
  sortable: boolean;
  render: (issue: IssueData, projectKey: string) => React.ReactNode;
}

function typeBadge(t: string) {
  if (t === 'bug') return 'tag-hi';
  if (t === 'story') return 'tag-b';
  if (t === 'epic') return 'tag-lo';
  return 'tag-b';
}

function priorityBadge(p: string) {
  if (p === 'critical' || p === 'high') return 'tag-hi';
  if (p === 'medium') return 'tag-med';
  return 'tag-lo';
}

export function buildColumns(t: Record<string, string>): ColumnDef[] {
  const spLabel = (() => {
    try { const s = JSON.parse(useProjectStore.getState().currentProject?.settings || '{}'); return s.methodology === 'scrum' ? 'Story Points' : 'Workload'; }
    catch { return 'Workload'; }
  })();
  return [
    { field: 'issueNumber', label: '#', width: '60px', defaultVisible: true, sortable: true,
      render: (i: IssueData, key: string) => <span className="font-mono text-xs text-ink-muted">{key}-{i.issueNumber}</span> },
    { field: 'title', label: t.title || 'Title', width: '', defaultVisible: true, sortable: true,
      render: (i: IssueData) => <span className="text-[0.8125rem] font-medium text-ink-primary truncate">{i.title}</span> },
    { field: 'type', label: t.type || 'Type', width: '60px', defaultVisible: true, sortable: true,
      render: (i: IssueData) => <span className={`badge ${typeBadge(i.type)}`}>{i.type}</span> },
    { field: 'priority', label: t.priority || 'Priority', width: '70px', defaultVisible: true, sortable: true,
      render: (i: IssueData) => <span className={`badge ${priorityBadge(i.priority)}`}>{i.priority}</span> },
    { field: 'status', label: t.status || 'Status', width: '70px', defaultVisible: true, sortable: true,
      render: (i: IssueData) => <span className="text-xs text-ink-muted">{i.status}</span> },
    { field: 'sprint', label: (t.sprint as any)?.sprint || 'Sprint', width: '100px', defaultVisible: true, sortable: false,
      render: (i: IssueData) => <span className="text-xs text-ink-muted">{i.sprintId ? ((i as any).sprintName ?? ((t.sprint as any)?.sprint || 'Sprint')) : ((t.backlog as any)?.title || 'Backlog')}</span> },
    { field: 'storyPoints', label: spLabel, width: '80px', defaultVisible: true, sortable: true,
      render: (i: IssueData) => {
        const isScrumCol = (() => { try { const s = JSON.parse(useProjectStore.getState().currentProject?.settings || '{}'); return s.methodology === 'scrum'; } catch { return false; } })();
        const val = isScrumCol ? i.storyPoints : (i as unknown as { workload?: number }).workload;
        return <span className="text-xs text-ink-muted tabular-nums">{val ?? '—'}</span>;
      } },
    { field: 'assignee', label: t.assignee || 'Assignee', width: '80px', defaultVisible: true, sortable: true,
      render: (i: IssueData) => <span className="text-xs text-ink-secondary">{i.assigneeName || (i.assigneeId ? i.assigneeId.substring(0, 8) : '—')}</span> },
    { field: 'reporter', label: t.creator || 'Creator', width: '80px', defaultVisible: false, sortable: true,
      render: (i: IssueData) => <span className="text-xs text-ink-muted font-mono">{i.reporterId?.substring(0, 8) || '—'}</span> },
    { field: 'createdAt', label: t.created || 'Created', width: '100px', defaultVisible: false, sortable: true,
      render: (i: IssueData) => <span className="text-xs text-ink-muted">{i.createdAt ? new Date(i.createdAt).toLocaleDateString() : '—'}</span> },
  ];
}

function SortIcon({ field, sortField, sortDir }: { field: string; sortField: string; sortDir: SortDir }) {
  if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-ink-muted opacity-40" />;
  return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-brand-main" /> : <ArrowDown className="w-3 h-3 text-brand-main" />;
}

interface IssueTableProps {
  issues: IssueData[];
  unfilteredCount: number;
  onRowClick: (issue: IssueData) => void;
  columns: ColumnDef[];
  sortField: string;
  sortDir: SortDir;
  onSort: (field: string) => void;
  loading: boolean;
  projectId?: string;
  refreshing: boolean;
  projectKey: string;
}

export function IssueTable({
  issues,
  unfilteredCount,
  onRowClick,
  columns,
  sortField,
  sortDir,
  onSort,
  loading,
  projectId,
  refreshing,
  projectKey,
}: IssueTableProps) {
  const t = useT();

  return (
    <>
      {/* Count bar */}
      <div className="px-3.5 py-2 text-[0.6875rem] text-ink-muted border-b border-edge shrink-0 flex items-center gap-3">
        <span>{issues.length} {t?.issues?.issuesCount ?? 'issue(s)'}</span>
        {refreshing && <span className="text-brand-main">{t?.issues?.refreshing ?? 'Refreshing...'}</span>}
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-3 px-3.5 py-1.5 border-b border-edge bg-surface-hover shrink-0 text-[0.6875rem] font-semibold text-ink-muted uppercase tracking-wider">
        {columns.map(c => (
          <button
            key={c.field}
            className={cn(
              'flex items-center gap-1 hover:text-ink-primary transition-colors shrink-0',
              c.field === 'title' && 'flex-1',
            )}
            style={c.field !== 'title' ? { width: c.width } : undefined}
            onClick={() => c.sortable && onSort(c.field)}
            disabled={!c.sortable}
          >
            {c.label}{c.sortable && <SortIcon field={c.field} sortField={sortField} sortDir={sortDir} />}
          </button>
        ))}
      </div>

      {/* Issue rows */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="py-2">{Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} cols={6} />)}</div>
        ) : !projectId ? (
          <div className="text-center py-10">
            <p className="text-sm text-ink-muted">{t?.issues?.selectProject ?? 'Select a project to view issues'}</p>
          </div>
        ) : issues.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm text-ink-muted mb-2">
              {unfilteredCount === 0 ? (t?.issues?.noIssues ?? 'No issues yet.') : (t?.issues?.noMatch ?? 'No issues match your filters.')}
            </p>
          </div>
        ) : (
          issues.map(issue => (
            <div key={issue.id} className="hover-row flex items-center gap-3 cursor-pointer"
              onClick={() => onRowClick(issue)}>
              {columns.map(c => (
                <div
                  key={c.field}
                  className={cn('shrink-0', c.field === 'title' && 'flex-1 min-w-0')}
                  style={c.field !== 'title' ? { width: c.width } : undefined}
                >
                  {c.render(issue, projectKey)}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </>
  );
}
