import { useState } from 'react';
import { useT } from '@/i18n/useT';
import { Columns } from 'lucide-react';
import { type MemberInfo } from '@/api/issueApi';

export interface IssueFilters {
  typeFilter: string;
  priorityFilter: string;
  assigneeFilter: string;
  creatorFilter: string;
  selectedSprint: string;
}

interface SprintData {
  id: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
}

interface IssueFilterToolbarProps {
  search: string;
  setSearch: (value: string) => void;
  filters: IssueFilters;
  setFilters: (filters: Partial<IssueFilters>) => void;
  sortBy: { field: string; dir: 'asc' | 'desc' };
  setSortBy: (sort: { field: string; dir: 'asc' | 'desc' }) => void;
  viewMode: Set<string>;
  setViewMode: (field: string) => void;
  allColumns: Array<{ field: string; label: string }>;
  members: MemberInfo[];
  isScrum: boolean;
  sprints: SprintData[];
}

export function IssueFilterToolbar({
  search,
  setSearch,
  filters,
  setFilters,
  viewMode,
  setViewMode,
  allColumns,
  members,
  isScrum,
  sprints,
}: IssueFilterToolbarProps) {
  const t = useT();
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [colPickerOpen, setColPickerOpen] = useState(false);

  const creatorTerm = filters.creatorFilter.toLowerCase();
  const filteredMembers = members.filter(m =>
    !creatorTerm || m.displayName.toLowerCase().includes(creatorTerm) || m.email.toLowerCase().includes(creatorTerm)
  );

  return (
    <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-edge bg-surface-card shrink-0">
      <input
        className="form-input flex-1"
        style={{ padding: '6px 10px' }}
        placeholder={t.issues.searchPlaceholder}
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      <div className="relative" style={{ width: '140px' }}>
        <input
          className="form-input w-full"
          style={{ padding: '6px 10px' }}
          placeholder={t.issues.creatorPlaceholder}
          value={filters.creatorFilter}
          onChange={e => { setFilters({ creatorFilter: e.target.value }); setCreatorOpen(true); }}
          onFocus={() => setCreatorOpen(true)}
          onBlur={() => setTimeout(() => setCreatorOpen(false), 150)}
        />
        {creatorOpen && filteredMembers.length > 0 && (
          <div className="absolute left-0 top-full mt-0.5 z-20 card w-full max-h-40 overflow-y-auto shadow-dialog p-1">
            {filteredMembers.map(m => (
              <button
                key={m.id}
                className="w-full text-left px-2 py-1.5 text-xs text-ink-primary hover:bg-surface-hover rounded transition-colors"
                onMouseDown={() => { setFilters({ creatorFilter: m.displayName }); setCreatorOpen(false); }}
              >
                {m.displayName} <span className="text-ink-muted ml-1">{m.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <select className="form-select" style={{ padding: '6px 10px', width: 'auto' }}
        value={filters.typeFilter} onChange={e => setFilters({ typeFilter: e.target.value })}>
        <option>{t.issues.allTypes}</option><option>Bug</option><option>Task</option><option>Story</option><option>Epic</option>
      </select>
      <select className="form-select" style={{ padding: '6px 10px', width: 'auto' }}
        value={filters.priorityFilter} onChange={e => setFilters({ priorityFilter: e.target.value })}>
        <option>{t.issues.allPriority}</option><option>Critical</option><option>High</option><option>Medium</option><option>Low</option>
      </select>
      <select className="form-select" style={{ padding: '6px 10px', width: 'auto' }}
        value={filters.assigneeFilter} onChange={e => setFilters({ assigneeFilter: e.target.value })}>
        <option value="">{t.issues.allAssignees}</option>
        <option value="unassigned">{t.issues.unassigned}</option>
        {members.map(m => <option key={m.id} value={m.id}>{m.displayName}</option>)}
      </select>
      {isScrum && (
        <select className="form-select" style={{ padding: '6px 10px', width: 'auto' }}
          value={filters.selectedSprint} onChange={e => setFilters({ selectedSprint: e.target.value })}>
          <option value="">{t.issues.allSprints}</option>
          <option value="__backlog">{t.issues.noSprint}</option>
          {sprints.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
      <div className="relative">
        <button className="btn-ghost px-2" title={t.issues.columns} onClick={() => setColPickerOpen(o => !o)}>
          <Columns className="w-4 h-4" />
        </button>
        {colPickerOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setColPickerOpen(false)} />
            <div className="absolute right-0 top-full mt-1 z-20 card p-2 min-w-[160px] shadow-dialog">
              <p className="text-[0.625rem] font-semibold text-ink-muted uppercase px-2 py-1">{t.issues.columns}</p>
              {allColumns.map(c => (
                <label key={c.field} className="flex items-center gap-2 px-2 py-1.5 text-xs text-ink-primary hover:bg-surface-hover rounded cursor-pointer">
                  <input type="checkbox" checked={viewMode.has(c.field)} onChange={() => setViewMode(c.field)} className="w-3.5 h-3.5" />
                  {c.label}
                </label>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
