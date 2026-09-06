import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useProjectStore } from '@/stores/projectStore';
import { useAuthStore } from '@/stores/authStore';
import { issueApi } from '@/api/issueApi';
import http from '@/lib/http';
import { useT } from '@/i18n/useT';
import { translations } from '@/i18n/translations';
import { getLlmErrorMessage } from '@/lib/errors';

interface GanttTask {
  id: string; name: string; start: string; end: string;
  duration_days?: number; is_critical?: boolean;
  dependencies?: string[]; milestone?: boolean; assignee?: string | null;
  issueId?: string;
  /** Project-phase KEY (master_data.project_phase) — set from timeline position */
  phase?: string;
  /** True when the linked issue has already started — AI modify must not
      delete/rename/reschedule it; dates are pinned on the backend too. */
  locked?: boolean;
}
interface GanttData { tasks: GanttTask[] }

interface TaskDiff {
  added: GanttTask[];
  removed: GanttTask[];
  updated: Array<{
    before: GanttTask; after: GanttTask;
    changes: Array<{ key: 'name' | 'timeline' | 'deps' | 'milestone'; from: string; to: string }>;
  }>;
}

const COLORS = ['hsl(var(--brand))', 'hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--danger))', 'hsl(var(--brand))', 'hsl(var(--brand))', 'hsl(var(--warning))', 'hsl(var(--success))'];

export function GanttPage() {
  const navigate = useNavigate();
  const { currentProject } = useProjectStore();
  const reset = useProjectStore((s) => s.reset);
  const [description, setDescription] = useState('');
  const [ganttData, setGanttData] = useState<GanttData | null>(null);
  const [loading, setLoading] = useState(false);
  const [genProgress, setGenProgress] = useState('');
  const [error, setError] = useState('');
  const [askMode, setAskMode] = useState<'ask' | 'all' | 'pick' | null>(null);
  const [creating, setCreating] = useState(false);
  const [createdCount, setCreatedCount] = useState(0);
  const [createdIssues, setCreatedIssues] = useState<Record<string, {issueId: string; issueNumber: number}>>({});
  const [hoveredTask, setHoveredTask] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [chartId, setChartId] = useState<number | null>(null);
  const [diff, setDiff] = useState<TaskDiff | null>(null);
  const [editingTask, setEditingTask] = useState<GanttTask | 'new' | null>(null);
  // issueId → issue status: lets us lock tasks whose issue has already started
  // (a started task must not be deleted/renamed/rescheduled by AI modify).
  const [issueStatuses, setIssueStatuses] = useState<Record<string, string>>({});
  // issueId → burn-down ratio (consumed SP / total SP) for the progress overlay
  const [issueProgress, setIssueProgress] = useState<Record<string, number>>({});
  const isClosed = (currentProject as unknown as Record<string, unknown> | null)?.status === 'closed';
  // Read-only accounts (demo viewer) must not add/edit/delete tasks or create
  // issues — same permission model as the rest of the app.
  const canWrite = useAuthStore((s) => s.canWrite)() && !isClosed;
  const t = useT();
  // Load saved Gantt charts from API
  useEffect(() => {
    if (!currentProject?.id) return;
    // Issue statuses drive task locking (started tasks can't be modified by AI)
    issueApi.list(currentProject.id).then(({ data: resp }) => {
      const items = (resp?.data?.items || resp?.data || []) as Array<{ id: string; status: string; storyPoints?: number; remainingPoints?: number }>;
      const map: Record<string, string> = {};
      const prog: Record<string, number> = {};
      for (const i of items) {
        if (!i?.id) continue;
        map[i.id] = i.status || '';
        const sp = i.storyPoints ?? 0;
        const rp = i.remainingPoints ?? 0;
        if (sp > 0) prog[i.id] = Math.max(0, Math.min(1, (sp - rp) / sp));
      }
      setIssueStatuses(map);
      setIssueProgress(prog);
    }).catch(() => {});
    http.get(`/gantt-charts?projectId=${currentProject.id}`).then(({ data: resp }: { data: Record<string, unknown> }) => {
      const charts = (resp.data || []) as Array<Record<string, unknown>>;
      if (charts.length > 0) {
        try {
          const chartDataStr = String(charts[0].chartDataJsonb || '{}');
          const data = JSON.parse(chartDataStr);
          if (data.tasks?.length) {
            setGanttData({ tasks: data.tasks });
            setDescription(String(charts[0].aiRationale || ''));
            setAskMode('pick');
            const id = Number(charts[0].id);
            if (Number.isFinite(id)) setChartId(id);
          }
        } catch { /* invalid data */ }
      }
    }).catch(() => {});
  }, [currentProject?.id]);

  useEffect(() => { return () => reset(); }, [reset]);

  const saveGantt = async (data: GanttData, desc: string) => {
    const projectId = currentProject?.id;
    if (!projectId) return;
    try {
      if (chartId) {
        // Update the existing row instead of inserting a new one on every save
        await http.put(`/gantt-charts/${chartId}`, {
          chartData: JSON.stringify(data),
          rationale: desc,
        });
      } else {
        const { data: resp } = await http.post('/gantt-charts', {
          projectId,
          title: description.trim().slice(0, 80) || 'Gantt Chart',
          chartData: JSON.stringify(data),
          rationale: desc,
        });
        const created = resp.data;
        if (created && typeof created.id === 'number') setChartId(created.id);
      }
      setSaved(true);
    } catch { /* silently fail */ }
  };

  const isModify = ganttData && ganttData.tasks.length > 0;

  const buildIssueDescription = (task: GanttTask) => {
    const deps = (task.dependencies || []).map(depId => {
      const dep = ganttData?.tasks.find(t => t.id === depId);
      return dep ? `- Depends on: ${dep.name} (${dep.start} → ${dep.end})` : '';
    }).filter(Boolean).join('\n');
    return `**Timeline:** ${task.start} → ${task.end}\n${deps ? `\n**Dependencies:**\n${deps}\n` : ''}\n_Generated from AI Gantt chart._`;
  };

  const handleGenerate = async () => {
    if (!canWrite) return;  // read-only (demo) accounts cannot generate/modify
    if (!description.trim()) return;
    // Progress texts follow the AI output language (aiLanguage), like all other AI-generated content
    const lang = useAuthStore.getState().user?.aiLanguage || 'en';
    const g = (((translations as any)[lang] || translations.en) as typeof translations.en).gantt;
    setLoading(true); setError(''); setAskMode(null); setGenProgress(g.starting); setSaved(false);
    // Snapshot for modify diff
    const beforeTasks = isModify && ganttData ? [...ganttData.tasks] : null;
    if (!isModify) { setGanttData(null); setCreatedIssues({}); }
    try {
      const token = localStorage.getItem('access_token') || '';
      const body: Record<string, unknown> = { description: description.trim(), lang };
      if (isModify && ganttData) {
        // Fresh issue statuses → accurate locked flags (a started issue must
        // be force-restored by the backend, not rewritten by the AI)
        let statusMap = issueStatuses;
        try {
          const { data: resp } = await issueApi.list(currentProject?.id || '');
          const items = (resp?.data?.items || resp?.data || []) as Array<{ id: string; status: string; storyPoints?: number; remainingPoints?: number }>;
          const map: Record<string, string> = {};
          const prog: Record<string, number> = {};
          for (const i of items) {
            if (!i?.id) continue;
            map[i.id] = i.status || '';
            const sp = i.storyPoints ?? 0;
            const rp = i.remainingPoints ?? 0;
            if (sp > 0) prog[i.id] = Math.max(0, Math.min(1, (sp - rp) / sp));
          }
          setIssueStatuses(map);
          setIssueProgress(prog);
          statusMap = map;
        } catch { /* keep last known statuses */ }
        const isLocked = (t: GanttTask): boolean => {
          if (!t.issueId) return false;
          const st = (statusMap[t.issueId] || '').toLowerCase();
          if (!st) return false;
          return !['product_backlog', 'backlog', 'todo', 'cancelled'].includes(st);
        };
        // Carry the locked flag so the backend can force-restore started tasks
        body.existingTasks = ganttData.tasks.map(t => ({ ...t, locked: isLocked(t) }));
        body.description = description.trim();
      } else {
        body.description = description.trim();
      }
      const resp = await fetch('/api/v1/ai/generate-gantt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
        body: JSON.stringify(body),
      });
      if (!resp.ok || !resp.body) { setError(t.gantt.generationFailed); return; }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '', pendingEvent = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('event: ')) { pendingEvent = line.slice(7).trim(); continue; }
          if (!line.startsWith('data: ')) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (pendingEvent === 'progress') {
              const stepTexts: Record<string, string> = {
                planning: g.genPlanning,
                parsing: g.genParsing,
                scheduling: g.genScheduling,
              };
              setGenProgress(stepTexts[d.step] || g.starting);
            }
            if (pendingEvent === 'result') {
              if (d.tasks) {
                // Modify mode: the AI often renumbers task ids. Align ids back
                // to the previous plan by name so created-issue links survive
                // and existing issues get UPDATED instead of re-created.
                let tasks: GanttTask[] = d.tasks;
                if (beforeTasks) tasks = alignTaskIds(beforeTasks, d.tasks);
                // Persist the auto-mapped phase KEY onto the tasks themselves
                // so issue create/update and the UI badge all use the key.
                tasks = tasks.map(t => (t.milestone || t.phase)
                  ? t
                  : { ...t, phase: phaseForTask(t, tasks) || undefined });
                // Recompute lock state from issue statuses (backend also
                // force-restores locked tasks, so this is display-side).
                tasks = tasks.map(t => ({ ...t, locked: taskLocked(t) }));
                const next = { ...d, tasks };
                setGanttData(next);
                setAskMode('ask');
                // Modify mode: diff old plan vs new plan
                setDiff(beforeTasks ? computeDiff(beforeTasks, tasks) : null);
                // Remind the user that phases were auto-mapped by timeline
                setPhaseHint(true);
                saveGantt(next, description.trim());
              }
            }
            if (pendingEvent === 'error') setError(d.code ? getLlmErrorMessage(d.code, t.app) : (d.message || t.gantt.generationFailed));
            pendingEvent = '';
          } catch { /* skip partial chunk */ }
        }
      }
    } catch { setError(t.gantt.networkError); }
    finally { setLoading(false); setGenProgress(''); }
  };

  // ─── Phase auto-mapping ───
  // issue.phase stores the project-phase KEY. Tasks created from the Gantt
  // plan get an initial phase by timeline position: earliest start → first
  // phase, latest start → last phase, evenly distributed in between.
  const [projectPhases, setProjectPhases] = useState<Array<{ key: string; value: string }>>([]);
  useEffect(() => {
    http.get('/master-data?category=project_phase').then(({ data }: { data: Record<string, unknown> }) => {
      setProjectPhases((data.data || []) as Array<{ key: string; value: string }>);
    }).catch(() => {});
    if (currentProject?.id) {
      http.get(`/projects/${currentProject.id}/phases`).then(({ data }: { data: Record<string, unknown> }) => {
        const list = (data.data || []) as Array<{ key: string; value: string }>;
        if (list.length > 0) setProjectPhases(list);
      }).catch(() => {});
    }
  }, [currentProject?.id]);

  const phaseForTask = (task: GanttTask, taskList?: GanttTask[]): string => {
    if (projectPhases.length === 0 || task.milestone) return '';
    const tasks = taskList && taskList.length > 0 ? taskList : (ganttData?.tasks || []);
    const times = tasks.map(t => new Date(t.start).getTime());
    const min = Math.min(...times);
    const max = Math.max(...times);
    if (max <= min) return projectPhases[0].key;
    const ratio = (new Date(task.start).getTime() - min) / (max - min);
    const idx = Math.min(projectPhases.length - 1, Math.floor(ratio * projectPhases.length));
    return projectPhases[idx].key;
  };
  const phaseValue = (key: string) => projectPhases.find(p => p.key === key)?.value || key;
  // Reminder banner after generation — phases were auto-set, user should review
  const [phaseHint, setPhaseHint] = useState(false);

  // ─── Task locking ───
  // A task whose linked issue has already left the backlog is LOCKED: AI
  // modify must not delete, rename or reschedule it, and manual edits to its
  // core fields are blocked. Any status other than backlog/todo/cancelled
  // counts as started (defensive: unknown future statuses lock too).
  const taskLocked = (task: GanttTask): boolean => {
    if (!task.issueId) return false;
    const st = (issueStatuses[task.issueId] || '').toLowerCase();
    if (!st) return false;
    return !['product_backlog', 'backlog', 'todo', 'cancelled'].includes(st);
  };

  const createSingleTask = async (task: GanttTask) => {
    if (!canWrite) return null;  // read-only guard
    const projectId = currentProject?.id;
    if (!projectId || task.milestone) return null;
    // Manual selection wins; otherwise derive from timeline position
    const phase = task.phase || phaseForTask(task) || undefined;
    const { data: resp } = await issueApi.create({
      projectId,
      title: task.name,
      description: buildIssueDescription(task),
      type: 'task',
      priority: 'medium',
      phase,
    });
    const issue = resp.data;
    // Persist the resolved phase key + issueId onto the task so later
    // edits/syncs keep them, and reloads can restore issue links + locking
    if (issue && ganttData) {
      const tasks = ganttData.tasks.map(x => x.id === task.id
        ? { ...x, phase: phase || x.phase, issueId: issue.id } : x);
      const next = { ...ganttData, tasks };
      setGanttData(next);
      saveGantt(next, description);
    }
    return issue ? { issueId: issue.id, issueNumber: issue.issueNumber } : null;
  };

  const handleCreateAll = async () => {
    if (!canWrite) return;  // read-only guard
    const projectId = currentProject?.id;
    if (!projectId || !ganttData?.tasks?.length) return;
    setCreating(true); setCreatedCount(0); setError('');
    const nonMilestones = ganttData.tasks.filter(t => !t.milestone);
    const newIssues = { ...createdIssues };
    for (let i = 0; i < nonMilestones.length; i++) {
      const task = nonMilestones[i];
      try {
        // Already linked (e.g. after a modify rewrite kept the id)? Update it.
        if (newIssues[task.id]) {
          await syncLinkedIssue(task);
          setCreatedCount(i + 1);
          continue;
        }
        const info = await createSingleTask(task);
        if (info) { newIssues[task.id] = info; }
        setCreatedCount(i + 1);
        setCreatedIssues({ ...newIssues });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Failed at task "${task.name}": ${msg}`);
        break;
      }
    }
    setCreating(false);
  };

  const handleCreateOne = async (task: GanttTask) => {
    if (!canWrite) return;  // read-only guard
    try {
      // Already linked? Update instead of creating a duplicate issue.
      if (createdIssues[task.id]) {
        await syncLinkedIssue(task);
        return;
      }
      const info = await createSingleTask(task);
      if (info) {
        const next = { ...createdIssues, [task.id]: info };
        setCreatedIssues(next);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`${t.gantt.taskCreateFailed}: "${task.name}": ${msg}`);
    }
  };

  // ─── Manual editing ───
  const syncLinkedIssue = async (task: GanttTask) => {
    if (!canWrite) return;  // read-only guard
    const info = createdIssues[task.id];
    if (!info) return;
    // A started task is locked — never push AI rewrites onto its linked issue
    if (taskLocked(task)) return;
    try {
      await issueApi.update(info.issueId, {
        title: task.name,
        description: buildIssueDescription(task),
        // Always carry the phase KEY (task.phase persists it after create;
        // fall back to timeline mapping for tasks that predate it)
        phase: task.phase || phaseForTask(task) || undefined,
      });
    } catch { /* issue sync failure is non-fatal */ }
  };

  const saveTaskEdit = async (task: GanttTask, isNew: boolean) => {
    if (!canWrite) return;  // read-only guard
    if (!ganttData) return;
    const edited = isNew
      ? [...ganttData.tasks, task]
      : ganttData.tasks.map(x => x.id === task.id ? task : x);
    // Keep the timeline connected: downstream tasks shift when a dependency's
    // dates change (manual edits included)
    const next = { tasks: recalcTimeline(edited) };
    setGanttData(next);
    setEditingTask(null);
    saveGantt(next, description);
    // If this task is already an issue, sync the change
    if (!isNew && createdIssues[task.id]) await syncLinkedIssue(task);
  };

  const deleteTask = async (task: GanttTask) => {
    if (!canWrite) return;  // read-only guard
    if (!ganttData) return;
    // Locked tasks (issue already started) cannot be deleted
    if (taskLocked(task)) {
      setError(t.gantt.cannotDeleteLocked);
      return;
    }
    const info = createdIssues[task.id];
    const msg = info
      ? t.gantt.confirmDeleteTaskWithIssue.replace('{num}', `${currentProject?.key || '?'}-${info.issueNumber}`)
      : t.gantt.confirmDeleteTask;
    if (!confirm(msg)) return;
    if (info) {
      try { await issueApi.delete(info.issueId); } catch { /* non-fatal */ }
      const nextIssues = { ...createdIssues };
      delete nextIssues[task.id];
      setCreatedIssues(nextIssues);
    }
    const nextTasks = ganttData.tasks
      .filter(x => x.id !== task.id)
      .map(x => x.dependencies ? { ...x, dependencies: x.dependencies.filter(d => d !== task.id) } : x);
    const next = { tasks: nextTasks };
    setGanttData(next);
    saveGantt(next, description);
  };

  const deleteLinkedIssue = async (taskId: string) => {
    if (!canWrite) return;  // read-only guard
    const info = createdIssues[taskId];
    if (!info) return;
    const msg = t.gantt.confirmDeleteTaskWithIssue.replace('{num}', `${currentProject?.key || '?'}-${info.issueNumber}`);
    if (!confirm(msg)) return;
    try {
      await issueApi.delete(info.issueId);
      const next = { ...createdIssues };
      delete next[taskId];
      setCreatedIssues(next);
    } catch { /* non-fatal */ }
  };

  const tasks = ganttData?.tasks || [];
  const nonMilestoneCount = tasks.filter(t => !t.milestone).length;

  // ─── Day-based timeline: week majors + day minors ───
  // All date math in UTC (YYYY-MM-DD parses as UTC midnight) so day boundaries
  // never shift with the local timezone.
  const parseDate = (s: string) => new Date(s.length === 10 ? s + 'T00:00:00Z' : s);
  const dayDiff = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 86400000);
  const dates = tasks.length > 0 ? [...new Set(tasks.flatMap(t => [t.start, t.end]))].sort() : [];
  const rawStart = dates[0] ? parseDate(dates[0]) : new Date();
  const rawEnd = dates[dates.length - 1] ? parseDate(dates[dates.length - 1]) : new Date();
  // Align to Monday for clean week majors
  const startDate = new Date(rawStart.getTime() - ((rawStart.getUTCDay() + 6) % 7) * 86400000);
  const endDate = new Date(rawEnd.getTime() + 86400000); // include the last day
  const weekWidth = 98; // divisible by 7 → dayWidth is an exact integer
  const dayWidth = weekWidth / 7; // 14px per day — bar edges land exactly on grid lines
  const totalWeeks = Math.max(Math.ceil(dayDiff(endDate, startDate) / 7) + 1, 1);
  const ROW_H = 48; // row height: date labels (top) + task bar (below)
  const fmtShort = (dateStr: string) => { const d = parseDate(dateStr); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };

  // Per-row heights — task names in the left column wrap fully, rows grow to fit
  const rowHeights = tasks.map(t => {
    const w = Array.from(t.name).reduce((n, c) => n + (c.charCodeAt(0) > 255 ? 2 : 1), 0);
    const lines = Math.max(1, Math.ceil(w / 22)); // ~22 half-width chars per 156px column
    return Math.max(ROW_H, lines * 15 + 24);
  });
  const rowTop = (idx: number) => rowHeights.slice(0, idx).reduce((a, b) => a + b, 0);
  const totalRowsH = rowHeights.reduce((a, b) => a + b, 0);

  const getLeft = (dateStr: string) => {
    // Round to integer px — bar edges land exactly on day grid lines
    return Math.max(0, Math.round(dayDiff(parseDate(dateStr), startDate) * dayWidth));
  };
  const getWidth = (start: string, end: string) => {
    // Bar spans [start 00:00, end 00:00) — right edge lands exactly on the end
    // date's day grid line; single-day tasks fill one full day cell (14px).
    const days = Math.max(1, dayDiff(parseDate(end), parseDate(start)));
    return Math.round(days * dayWidth);
  };

  // Real row offsets measured from the rendered DOM — left-column content (name
  // wrap + date + action buttons) makes rows taller than the name-only estimate,
  // so guide/dep lines must follow the actual bars or they end up floating above
  // them ("broken" connections). Measured in a layout effect (pre-paint), then
  // recomputed on every render so manual edits/adds update instantly.
  const ganttBodyRef = useRef<HTMLDivElement | null>(null);
  const [rowGeom, setRowGeom] = useState<Array<{ top: number; height: number }>>([]);
  useLayoutEffect(() => {
    const container = ganttBodyRef.current;
    if (!container) return;
    const rows = Array.from(container.querySelectorAll('[data-gantt-row]')) as HTMLElement[];
    if (rows.length === 0) return;
    const bodyTop = container.getBoundingClientRect().top;
    setRowGeom(rows.map(r => {
      const rect = r.getBoundingClientRect();
      return { top: rect.top - bodyTop, height: rect.height };
    }));
    // askMode / isClosed change the left-column buttons → row heights change
  }, [ganttData?.tasks, isClosed, askMode]);

  // Row top in SVG coordinates: the SVG layer sits at container y=33 (below the
  // 32px header + 1px axis border), so subtract 33 from the measured offset.
  const rowTopSvg = (idx: number) => rowGeom[idx] ? rowGeom[idx].top - 33 : rowTop(idx);
  const rowsH = rowGeom.length > 0
    ? rowGeom[rowGeom.length - 1].top - 33 + rowGeom[rowGeom.length - 1].height
    : totalRowsH;

  // Vertical center of the bar/dot, in SVG coordinates. Normal bars sit at
  // top:17 with height 25 → center 29.5; milestones are centered on the cell.
  const barCenterY = (idx: number, t: GanttTask) =>
    rowTopSvg(idx) + (t.milestone ? rowHeights[idx] / 2 : 17 + 12.5);
  const barLeftX = (t: GanttTask) => t.milestone ? Math.max(0, getLeft(t.start) - 6) : getLeft(t.start);
  const barRightX = (t: GanttTask) => t.milestone ? getLeft(t.start) + 6 : getLeft(t.end);

  // Resolved dependency targets (deps pointing at missing tasks don't count).
  const taskIds = new Set(tasks.map(t => t.id));
  const depTargets = new Set(tasks.flatMap(t => (t.dependencies || []).filter(d => taskIds.has(d))));

  // Start guide lines — one per task WITHOUT a predecessor, continuous from the
  // timeline axis down to the bar start (the task "connects to the time axis").
  // Tasks with dependencies are connected to their predecessor by the dep line
  // below instead, so no task gets two competing connectors.
  const startLines: Array<{ x: number; y: number }> = [];
  tasks.forEach((task, idx) => {
    if (depTargets.has(task.id)) return;
    startLines.push({
      x: barLeftX(task),
      y: barCenterY(idx, task),
    });
  });

  const depLines: Array<{x1: number; y1: number; x2: number; y2: number}> = [];
  tasks.forEach((task, idx) => {
    if (task.dependencies) {
      task.dependencies.forEach(depId => {
        const depIdx = tasks.findIndex(t => t.id === depId);
        if (depIdx >= 0 && depIdx !== idx) {
          const depTask = tasks[depIdx];
          depLines.push({
            // Connector runs predecessor bar right edge → this bar left edge,
            // both at bar vertical center, so the arrow lands exactly on the bar.
            x1: barRightX(depTask),
            y1: barCenterY(depIdx, depTask),
            x2: barLeftX(task),
            y2: barCenterY(idx, task),
          });
        }
      });
    }
  });

  const diffFieldNames: Record<string, string> = {
    name: t.gantt.fieldName,
    timeline: t.gantt.timelineLabel,
    deps: t.gantt.fieldDependencies,
    milestone: t.gantt.fieldMilestone,
  };

  return (
    <div>
      <div className="ch">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-ink-primary">{t.gantt.title}</h2>
          {currentProject && <span className="text-xs text-ink-muted">{currentProject.name}</span>}
          {ganttData && saved && <span className="text-xs text-success ml-2">{t.gantt.saved}</span>}
        </div>
      </div>

      <div className="p-6" style={{ maxWidth: '1100px' }}>
        {/* AI Input */}
        <div className="card mb-6">
          <div className="card-hd"><h3 className="text-sm font-semibold text-ink-primary">{t.gantt.aiGenerateTitle}</h3></div>
          <div className="card-bd p-4">
            <p className="text-xs text-ink-muted mb-3">
              {isModify
                ? t.gantt.modifyDesc
                : t.gantt.generateDesc}
            </p>
            {!canWrite ? (
              <p className="text-xs text-ink-muted py-4 text-center">{t.gantt.readOnlyClosed}</p>
            ) : (
              <>
                <textarea className="form-input w-full" style={{ minHeight: '120px', padding: '12px 16px', fontSize: '13px', lineHeight: 1.7, resize: 'vertical' }}
                  placeholder={t.gantt.examplePlaceholder}
                  value={description} onChange={e => setDescription(e.target.value)} />
                <div className="flex items-center gap-3 mt-3">
                  <button className="btn-brand" onClick={handleGenerate} disabled={loading || !description.trim() || !currentProject}>
                    {loading ? t.gantt.processing : isModify ? t.gantt.modifyGantt : t.gantt.generateGantt}
                  </button>
                  {error && <span className="text-xs text-danger">{error}</span>}
                </div>
                {/* Progress bar during generation */}
                {loading && genProgress && (
                  <div className="mt-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="inline-block w-3.5 h-3.5 border-2 border-brand-main border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs text-brand-main font-medium">{genProgress}</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-surface-hover overflow-hidden">
                      <div className="h-full bg-brand-main rounded-full transition-all duration-500 animate-pulse" style={{ width: '100%' }} />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Modify diff panel — lists what changed vs the previous plan */}
        {diff && (diff.added.length > 0 || diff.removed.length > 0 || diff.updated.length > 0) && (
          <div className="card mb-4 p-4">
            <p className="text-xs font-semibold text-ink-primary uppercase tracking-wider mb-2">{t.gantt.diffTitle}</p>
            <div className="space-y-1">
              {diff.updated.map(u => {
                const linked = createdIssues[u.after.id];
                const locked = taskLocked(u.after);
                return (
                  <div key={u.after.id} className="flex items-center gap-2 text-xs py-0.5 flex-wrap">
                    <span className="shrink-0">✏️</span>
                    <span className="text-warning font-medium shrink-0">{t.gantt.diffUpdated}</span>
                    <span className="text-ink-primary font-medium">{u.after.name}</span>
                    {locked && <span className="shrink-0 text-[0.55rem] bg-warning-soft text-warning px-1.5 py-0.5 rounded-full">🔒 {t.gantt.lockedTag}</span>}
                    <span className="text-ink-muted">
                      {u.changes.map(c => `${diffFieldNames[c.key]}: ${c.from} → ${c.to}`).join(' · ')}
                    </span>
                    {linked ? (
                      locked || !canWrite ? (
                        <span className="ml-auto shrink-0 text-ink-muted opacity-70">{t.gantt.diffLocked}</span>
                      ) : (
                        <button className="ml-auto shrink-0 text-brand-main hover:underline font-medium"
                          onClick={() => syncLinkedIssue(u.after)}>
                          {t.gantt.diffUpdateIssue} ({currentProject?.key || '?'}-{linked.issueNumber})
                        </button>
                      )
                    ) : (
                      <span className="ml-auto shrink-0 text-ink-muted opacity-70">{t.gantt.diffNoLinkedIssue}</span>
                    )}
                  </div>
                );
              })}
              {diff.removed.map(r => {
                const linked = createdIssues[r.id];
                const locked = taskLocked(r);
                return (
                  <div key={r.id} className="flex items-center gap-2 text-xs py-0.5 flex-wrap">
                    <span className="shrink-0">🗑️</span>
                    <span className="text-danger font-medium shrink-0">{t.gantt.diffRemoved}</span>
                    <span className="text-ink-muted line-through">{r.name}</span>
                    {locked && <span className="shrink-0 text-[0.55rem] bg-warning-soft text-warning px-1.5 py-0.5 rounded-full">🔒 {t.gantt.lockedTag}</span>}
                    {linked ? (
                      locked || !canWrite ? (
                        <span className="ml-auto shrink-0 text-ink-muted opacity-70">{t.gantt.diffLocked}</span>
                      ) : (
                        <button className="ml-auto shrink-0 text-danger hover:underline font-medium"
                          onClick={() => deleteLinkedIssue(r.id)}>
                          {t.gantt.diffDeleteIssue} ({currentProject?.key || '?'}-{linked.issueNumber})
                        </button>
                      )
                    ) : null}
                  </div>
                );
              })}
              {diff.added.map(a => (
                <div key={a.id} className="flex items-center gap-2 text-xs py-0.5">
                  <span className="shrink-0">➕</span>
                  <span className="text-success font-medium shrink-0">{t.gantt.diffAdded}</span>
                  <span className="text-ink-primary font-medium">{a.name}</span>
                  <span className="ml-auto shrink-0 text-ink-muted opacity-70">{t.gantt.diffNoLinkedIssue}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {diff && diff.added.length === 0 && diff.removed.length === 0 && diff.updated.length === 0 && (
          <div className="card mb-4 p-3 text-xs text-ink-muted">✅ {t.gantt.diffNoChanges}</div>
        )}

        {/* Phase auto-set reminder — after generation, task phases were mapped
            from the project Phases config by timeline position */}
        {phaseHint && projectPhases.length > 0 && ganttData && (
          <div className="card mb-4 p-3 flex items-center gap-2 border-warning/30 bg-warning-soft/40">
            <span className="text-xs text-ink-primary flex-1">📌 {t.gantt.phaseAutoSetHint}</span>
            <button className="btn-ghost text-xs px-1" onClick={() => setPhaseHint(false)}>✕</button>
          </div>
        )}

        {/* Confirmation Banner */}
        {canWrite && askMode === 'ask' && ganttData && (
          <div className="card mb-4 p-4 border-2 border-brand-main bg-brand-soft">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-brand-main">{t.gantt.generateConfirmTitle.replace('{count}', String(nonMilestoneCount))}</p>
                <p className="text-xs text-ink-muted mt-0.5">{t.gantt.generateConfirmDesc.replace('{count}', String(nonMilestoneCount)).replace('{project}', currentProject?.name || 'the project')}</p>
              </div>
              <div className="flex gap-2">
                <button className="btn-brand" onClick={() => { setAskMode('all'); handleCreateAll(); }}>
                  ✅ {t.gantt.yesCreateAll}
                </button>
                <button className="btn-secondary" onClick={() => setAskMode('pick')}>
                  🔍 {t.gantt.noLetMePick}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Creating progress (batch mode) */}
        {creating && (
          <div className="card mb-4 p-3 bg-surface-hover">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full border-2 border-brand-main border-t-transparent animate-spin" />
              <span className="text-xs text-brand-main">{t.gantt.creatingIssues} {createdCount}/{nonMilestoneCount}</span>
            </div>
          </div>
        )}

        {/* Gantt Chart */}
        {ganttData && tasks.length > 0 && (
          <div className="card mb-4" style={{ overflowX: 'auto' }}>
            <div className="card-hd flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink-primary">{t.gantt.ganttTimeline} ({tasks.length} {t.gantt.tasks})</h3>
              <div className="flex items-center gap-3">
                <span className="text-xs text-ink-muted">{dates[0]} → {dates[dates.length - 1]}</span>
                {askMode === 'pick' && Object.keys(createdIssues).length > 0 && (
                  <span className="text-xs text-success">{Object.keys(createdIssues).length}/{nonMilestoneCount} created</span>
                )}
                {canWrite && (
                  <button className="btn-brand btn-xs" onClick={() => setEditingTask('new')}>＋ {t.gantt.addTask}</button>
                )}
              </div>
            </div>
            <div className="card-bd p-0">
              <div ref={ganttBodyRef} style={{ position: 'relative', minWidth: totalWeeks * weekWidth + 200, paddingBottom: 20 }}>
                {/* Header — timeline axis with week tick marks */}
                <div className="flex" style={{ borderBottom: '1px dashed hsl(var(--edge-default))', position: 'sticky', top: 0, background: 'var(--surface-card)', zIndex: 2 }}>
                  <div style={{ width: 180, minWidth: 180, height: 32, padding: '0 12px', position: 'sticky', left: 0, background: 'var(--surface-card)', zIndex: 3 }} className="flex items-center text-xs font-semibold text-ink-muted uppercase border-r border-edge">{t.gantt.taskColumn}</div>
                  <div style={{ flex: 1, position: 'relative', height: 32 }}>
                    {Array.from({ length: totalWeeks + 1 }).map((_, i) => {
                      const wkStart = new Date(startDate.getTime() + i * 7 * 86400000);
                      const fmt = (d: Date) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
                      return (
                        <div key={i} style={{
                          position: 'absolute', left: i * weekWidth, width: weekWidth,
                          borderLeft: '1px dashed hsl(var(--edge-default))',
                          height: 32, display: 'flex', alignItems: 'flex-end',
                        }}>
                          {/* Day ticks within the week — minor marks under the date */}
                          {Array.from({ length: 6 }).map((_, j) => (
                            <div key={j} style={{
                              position: 'absolute', left: (j + 1) * dayWidth, top: 20, bottom: 0, width: 0,
                              borderLeft: '1px dashed hsl(var(--edge-default))', opacity: 0.4,
                            }} />
                          ))}
                          {i < totalWeeks && (
                            <span className="text-[0.55rem] text-ink-muted font-medium" style={{ whiteSpace: 'nowrap', paddingLeft: 3, paddingBottom: 3 }}>
                              {fmt(wkStart)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Week zebra stripes — makes the week grid visually trackable */}
                <div style={{ position: 'absolute', left: 180, top: 33, bottom: 20, width: totalWeeks * weekWidth, pointerEvents: 'none' }}>
                  {Array.from({ length: totalWeeks }).map((_, i) => i % 2 === 1 && (
                    <div key={i} style={{ position: 'absolute', left: i * weekWidth, width: weekWidth, top: 0, bottom: 0, background: 'var(--surface-hover)', opacity: 0.45 }} />
                  ))}
                </div>

                {/* Continuous grid lines — week majors (strong) + day minors (faint),
                    running from the timeline axis down through all rows so bars snap
                    visually to the exact day they start/end on. */}
                <div style={{ position: 'absolute', left: 180, top: 33, bottom: 20, width: totalWeeks * weekWidth, pointerEvents: 'none', zIndex: 0 }}>
                  {Array.from({ length: totalWeeks * 7 + 1 }).map((_, i) => {
                    const isMajor = i % 7 === 0;
                    return (
                      <div key={i} style={{
                        position: 'absolute', left: i * dayWidth, top: 0, bottom: 0, width: 0,
                        borderLeft: isMajor
                          ? '1px solid hsl(var(--edge-default))'
                          : '1px dashed hsl(var(--edge-default))',
                        opacity: isMajor ? 1 : 0.4,
                      }} />
                    );
                  })}
                </div>

                {/* Start guide lines — a single continuous dashed stroke per task, from
                    the timeline axis down to the bar start (no per-row fragments). */}
                <svg style={{ position: 'absolute', top: 33, left: 180, width: totalWeeks * weekWidth, height: rowsH, pointerEvents: 'none', zIndex: 0 }}>
                  {startLines.map((l, i) => (
                    <line key={i} x1={l.x} y1={0} x2={l.x} y2={l.y}
                      stroke="hsl(var(--edge-default))" strokeWidth="1" strokeDasharray="4 3" />
                  ))}
                </svg>

                {/* Dependency SVG */}
                {depLines.length > 0 && (
                  <svg style={{ position: 'absolute', top: 33, left: 180, width: totalWeeks * weekWidth, height: rowsH, pointerEvents: 'none', zIndex: 3 }}>
                    <defs>
                      <marker id="gantt-arrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
                        <path d="M1,1 L7,4 L1,7 Z" fill="hsl(var(--brand))" />
                      </marker>
                    </defs>
                    {depLines.map((l, i) => (
                      <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                        stroke="hsl(var(--brand))" strokeWidth="1.5" strokeDasharray="4 3" markerEnd="url(#gantt-arrow)" />
                    ))}
                  </svg>
                )}

                {/* Task rows */}
                {tasks.map((task, idx) => {
                  const isCreated = !!createdIssues[task.id];
                  const isHovered = hoveredTask === task.id;
                  return (
                    <div key={task.id} data-gantt-row className="flex" style={{ borderBottom: '1px solid hsl(var(--edge-default))', minHeight: rowHeights[idx], background: isHovered ? 'var(--surface-hover)' : 'transparent' }}
                      onMouseEnter={() => setHoveredTask(task.id)}
                      onMouseLeave={() => setHoveredTask(null)}>
                      <div style={{ width: 180, minWidth: 180, padding: '8px 12px', position: 'sticky', left: 0, background: isHovered ? 'var(--surface-hover)' : 'var(--surface-card)', zIndex: 1 }} className="flex items-center border-r border-edge gap-2">
                        {canWrite && askMode === 'pick' && !task.milestone && (
                          createdIssues[task.id]
                            ? <button className="text-[0.6rem] font-mono font-semibold text-brand-main bg-brand-soft px-1.5 py-0.5 rounded hover:bg-brand-main hover:text-white transition-colors shrink-0"
                                onClick={() => navigate({ to: `/issues/${createdIssues[task.id].issueId}` } as { to: string })}
                                title={`Open ${currentProject?.key || '?'}-${createdIssues[task.id].issueNumber}`}>
                                {currentProject?.key || '?'}-{createdIssues[task.id].issueNumber}
                              </button>
                            : <button className="btn-brand btn-xs shrink-0" style={{ fontSize: '0.6rem', padding: '2px 6px' }}
                                onClick={() => handleCreateOne(task)} title="Create this task">
                                📋
                              </button>
                        )}
                        {askMode !== 'pick' && createdIssues[task.id] && (
                          <button className="text-[0.6rem] font-mono font-semibold text-success bg-success-soft px-1.5 py-0.5 rounded hover:underline shrink-0"
                            onClick={() => navigate({ to: `/issues/${createdIssues[task.id].issueId}` } as { to: string })}>
                            {currentProject?.key || '?'}-{createdIssues[task.id].issueNumber}
                          </button>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-ink-primary" style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.35 }}>{task.name}</p>
                          <p className="text-[0.6rem] text-ink-muted mt-0.5">
                            {task.start} → {task.end}
                            {task.phase && (
                              <span className="ml-1.5 text-[0.55rem] bg-brand-soft/40 text-brand-main px-1.5 py-0.5 rounded-full">{phaseValue(task.phase)}</span>
                            )}
                          </p>
                          {canWrite && (
                            <div className="flex items-center gap-1.5 mt-1">
                              {taskLocked(task) && (
                                <span className="text-[0.55rem] bg-warning-soft text-warning px-1.5 py-0.5 rounded-full">🔒 {t.gantt.lockedTag}</span>
                              )}
                              <button className="text-[0.6rem] text-ink-muted hover:text-brand-main transition-colors"
                                onClick={() => setEditingTask(task)}>
                                ✏️ {t.gantt.editTask}
                              </button>
                              <button className="text-[0.6rem] text-ink-muted hover:text-danger transition-colors"
                                onClick={() => deleteTask(task)}>
                                🗑️ {t.gantt.deleteTask}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ flex: 1, position: 'relative', height: rowHeights[idx], zIndex: 0 }}>
                        {/* zIndex: 0 creates a stacking context — keeps bars/labels/dots below the
                            sticky task column (z=1) and header (z=2) so scrolled content never
                            overlaps them, while inner z-values order the row contents locally. */}
                        {/* Start/end date labels — anchored to the exact date position on the week grid */}
                        {!task.milestone && (
                          <>
                            <span style={{
                              position: 'absolute', left: getLeft(task.start), top: 3,
                              fontSize: '0.55rem', lineHeight: '10px', color: 'var(--ink-muted)',
                              whiteSpace: 'nowrap', zIndex: 2, pointerEvents: 'none',
                            }}>{fmtShort(task.start)}</span>
                            <span style={{
                              position: 'absolute', left: getLeft(task.end), top: 3,
                              transform: 'translateX(-100%)',
                              fontSize: '0.55rem', lineHeight: '10px', color: 'var(--ink-muted)',
                              whiteSpace: 'nowrap', zIndex: 2, pointerEvents: 'none',
                            }}>{fmtShort(task.end)}</span>
                          </>
                        )}
                        <div style={{
                          position: 'absolute',
                          left: task.milestone ? getLeft(task.start) - 6 : getLeft(task.start),
                          width: task.milestone ? 12 : getWidth(task.start, task.end),
                          top: task.milestone ? rowHeights[idx] / 2 - 6 : 17,
                          height: task.milestone ? 12 : 25,
                          borderRadius: task.milestone ? '50%' : 4,
                          background: task.milestone ? 'hsl(var(--brand))' : isCreated ? 'hsl(var(--success))' : COLORS[idx % COLORS.length],
                          opacity: isCreated ? 0.6 : 0.85,
                          zIndex: 1,
                          cursor: askMode === 'pick' && !task.milestone && !isCreated ? 'pointer' : 'default',
                        }}
                          onClick={() => { if (askMode === 'pick' && !task.milestone && !isCreated) handleCreateOne(task); }}
                          title={[
                            `${task.name}: ${task.start} → ${task.end}`,
                            isCreated ? t.gantt.created : '',
                            task.dependencies?.length ? t.gantt.dependsOn + task.dependencies.join(', ') : '',
                          ].filter(Boolean).join('\n')}
                        >
                          {/* Burn-down overlay — consumed SP ratio of the linked issue */}
                          {!task.milestone && isCreated && task.issueId && issueProgress[task.issueId] !== undefined && issueProgress[task.issueId] > 0 && (
                            <div style={{
                              position: 'absolute', left: 0, top: 0, bottom: 0,
                              width: `${Math.round(issueProgress[task.issueId] * 100)}%`,
                              background: 'rgba(255,255,255,0.35)',
                              borderRadius: 4, pointerEvents: 'none',
                            }} />
                          )}
                          {!task.milestone && (
                            <span className="text-[0.55rem] text-white font-medium px-1.5 truncate block" style={{ lineHeight: '25px', position: 'relative', zIndex: 1 }}>
                              {task.name}
                              {isCreated && task.issueId && issueProgress[task.issueId] !== undefined && (
                                <span className="ml-1 opacity-90">{Math.round(issueProgress[task.issueId] * 100)}%</span>
                              )}
                            </span>
                          )}
                        </div>
                        {task.dependencies?.map(depId => {
                          const depTask = tasks.find(t => t.id === depId);
                          return depTask ? (
                            <div key={depId} style={{
                              position: 'absolute', left: getLeft(task.start) - 4, top: rowHeights[idx] / 2 - 4,
                              width: 8, height: 8, borderRadius: '50%', background: 'hsl(var(--ink-muted))', zIndex: 2,
                            }} title={`${t.gantt.dependsOn}${depTask.name}`} />
                          ) : null;
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {!currentProject && (
          <div className="card p-8 text-center text-sm text-ink-muted mb-4 border border-warning/30 bg-warning-soft">
            <p className="text-3xl mb-2">⚠️</p>
            <p className="text-warning font-medium">{t.gantt.noProjectTitle}</p>
            <p className="text-ink-muted mt-1">{t.gantt.noProjectDesc}</p>
          </div>
        )}

        {currentProject && !ganttData && !loading && (
          <div className="card p-8 text-center text-sm text-ink-muted">
            <p className="text-3xl mb-2">📊</p>
            <p>{t.gantt.noGanttHint}</p>
          </div>
        )}
      </div>

      {/* Task editor modal */}
      {editingTask && (
        <TaskEditorModal
          key={editingTask === 'new' ? 'new' : editingTask.id}
          task={editingTask}
          tasks={tasks}
          phases={projectPhases}
          onSave={saveTaskEdit}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}

// ─── Lightweight CPM: after manual add/edit, shift downstream tasks so the
//     timeline stays connected (start >= all dependency ends + 1 day) ───
function recalcTimeline(tasks: GanttTask[]): GanttTask[] {
  const fmtDate = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  const addDays = (dateStr: string, n: number) => {
    // UTC math — local setDate() would shift the date in non-UTC+8 timezones
    const d = new Date(dateStr.length === 10 ? dateStr + 'T00:00:00Z' : dateStr);
    d.setUTCDate(d.getUTCDate() + n);
    return fmtDate(d);
  };
  const durationOf = (t: GanttTask) => {
    if (t.milestone) return 0;
    return Math.max(0, Math.round((new Date(t.end).getTime() - new Date(t.start).getTime()) / 86400000));
  };
  const result = tasks.map(t => ({ ...t }));
  let changed = true;
  let iter = 0;
  // Locked tasks (issue already started) keep their dates — never shift them,
  // even when an upstream task's dates change.
  const isLocked = (t: GanttTask) => !!t.locked;
  // Bound iterations — guards against dependency cycles (A→B→A)
  while (changed && iter++ <= result.length + 1) {
    changed = false;
    for (const t of result) {
      if (isLocked(t)) continue;
      if (!t.dependencies?.length) continue;
      for (const depId of t.dependencies) {
        const dep = result.find(x => x.id === depId);
        if (!dep) continue;
        const minStart = addDays(dep.end, 1);
        if (t.start < minStart) {
          const dur = durationOf(t);
          t.start = minStart;
          t.end = t.milestone ? minStart : addDays(minStart, dur);
          changed = true;
        }
      }
    }
  }
  return result;
}

// ─── Modify alignment: LLMs often renumber task ids. Reuse the previous id
// for a task with the same name so created-issue links survive the rewrite
// and existing issues are updated instead of re-created.
// Match priority: same id → same issueId (AI kept it or frontend wrote it
// back) → same name. Locked tasks must keep their original id/name/dates.
function alignTaskIds(before: GanttTask[], after: GanttTask[]): GanttTask[] {
  const beforeIds = new Set(before.map(t => t.id));
  const beforeByIssue = new Map<string, GanttTask>();
  for (const b of before) if (b.issueId) beforeByIssue.set(b.issueId, b);
  const beforeByName = new Map<string, GanttTask>();
  for (const b of before) if (!beforeByName.has(b.name)) beforeByName.set(b.name, b);
  // Map each after-id to the id it should use: keep same-id tasks, then match
  // by issueId, then by name; only claim a before-id not used by another task.
  const idMap = new Map<string, string>();
  const claimed = new Set<string>();
  for (const a of after) {
    if (beforeIds.has(a.id)) { idMap.set(a.id, a.id); claimed.add(a.id); }
  }
  for (const a of after) {
    if (idMap.has(a.id)) continue;
    const b = a.issueId ? beforeByIssue.get(a.issueId) : undefined;
    if (b && !claimed.has(b.id)) { idMap.set(a.id, b.id); claimed.add(b.id); }
  }
  for (const a of after) {
    if (idMap.has(a.id)) continue;
    const b = beforeByName.get(a.name);
    if (b && !claimed.has(b.id)) { idMap.set(a.id, b.id); claimed.add(b.id); }
    else idMap.set(a.id, a.id);
  }
  return after.map(t => {
    const mappedId = idMap.get(t.id) || t.id;
    const orig = before.find(b => b.id === mappedId);
    // Inherit issueId/phase/locked from the task we're aligning to, so
    // issue links and lock state survive id renumbering.
    return {
      ...t,
      id: mappedId,
      issueId: t.issueId || orig?.issueId,
      phase: t.phase || orig?.phase,
      locked: orig?.locked,
      dependencies: (t.dependencies || []).map(d => idMap.get(d) || d),
    };
  });
}

// ─── Modify diff: compare old plan vs new plan ───
function computeDiff(before: GanttTask[], after: GanttTask[]): TaskDiff {
  const beforeMap = new Map(before.map(t => [t.id, t]));
  const afterIds = new Set(after.map(t => t.id));
  const added = after.filter(t => !beforeMap.has(t.id));
  const removed = before.filter(t => !afterIds.has(t.id));
  const updated: TaskDiff['updated'] = [];
  for (const a of after) {
    const b = beforeMap.get(a.id);
    if (!b) continue;
    const changes: TaskDiff['updated'][number]['changes'] = [];
    if (b.name !== a.name) changes.push({ key: 'name', from: b.name, to: a.name });
    if (b.start !== a.start || b.end !== a.end) changes.push({ key: 'timeline', from: `${b.start} ~ ${b.end}`, to: `${a.start} ~ ${a.end}` });
    const bd = (b.dependencies || []).join(','); const ad = (a.dependencies || []).join(',');
    if (bd !== ad) changes.push({ key: 'deps', from: bd || '-', to: ad || '-' });
    if (!!b.milestone !== !!a.milestone) changes.push({ key: 'milestone', from: b.milestone ? '✓' : '-', to: a.milestone ? '✓' : '-' });
    if (changes.length) updated.push({ before: b, after: a, changes });
  }
  return { added, removed, updated };
}

// ─── Manual add/edit task modal ───
function TaskEditorModal({ task, tasks, phases, onSave, onClose }: {
  task: GanttTask | 'new';
  tasks: GanttTask[];
  phases: Array<{ key: string; value: string }>;
  onSave: (t: GanttTask, isNew: boolean) => void;
  onClose: () => void;
}) {
  const t = useT();
  const locked = task !== 'new' && !!task.locked;
  const [name, setName] = useState(task === 'new' ? '' : task.name);
  const [start, setStart] = useState(task === 'new' ? '' : task.start);
  const [end, setEnd] = useState(task === 'new' ? '' : task.end);
  const [milestone, setMilestone] = useState(task === 'new' ? false : !!task.milestone);
  const [phase, setPhase] = useState(task === 'new' ? '' : (task.phase || ''));
  const [deps, setDeps] = useState<string[]>(task === 'new' ? [] : [...(task.dependencies || [])]);
  const [err, setErr] = useState('');
  const others = tasks.filter(x => task === 'new' || x.id !== task.id);

  const toggleDep = (id: string) => {
    if (locked) return;
    setDeps(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSave = () => {
    if (!name.trim() || !start || !end) { setErr(t.gantt.fieldRequired); return; }
    if (end < start) { setErr(t.gantt.fieldInvalidRange); return; }
    onSave({
      id: task === 'new' ? `m${Date.now()}` : task.id,
      name: name.trim(),
      start, end,
      milestone,
      dependencies: deps.length > 0 ? deps : undefined,
      phase: phase || undefined,
    }, task === 'new');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="card w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-ink-primary mb-4">
          {task === 'new' ? t.gantt.taskEditorAddTitle : t.gantt.taskEditorTitle}
        </h3>
        {locked && (
          <p className="mb-3 text-[0.65rem] bg-warning-soft text-warning px-2 py-1.5 rounded-card">
            🔒 {t.gantt.lockedEditHint}
          </p>
        )}
        <div className="space-y-3">
          <div>
            <label className="text-xs text-ink-muted block mb-1">{t.gantt.fieldName}</label>
            <input className="form-input w-full" value={name} disabled={locked} onChange={e => setName(e.target.value)} />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-ink-muted block mb-1">{t.gantt.fieldStart}</label>
              <input type="date" className="form-input w-full" value={start} disabled={locked} onChange={e => setStart(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className="text-xs text-ink-muted block mb-1">{t.gantt.fieldEnd}</label>
              <input type="date" className="form-input w-full" value={end} disabled={locked} onChange={e => setEnd(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-ink-primary cursor-pointer">
            <input type="checkbox" checked={milestone} disabled={locked} onChange={e => setMilestone(e.target.checked)} />
            {t.gantt.fieldMilestone}
          </label>
          {phases.length > 0 && (
            <div>
              <label className="text-xs text-ink-muted block mb-1">{t.gantt.fieldPhase}</label>
              <select className="form-input w-full" value={phase} disabled={locked} onChange={e => setPhase(e.target.value)}>
                <option value="">—</option>
                {phases.map(p => <option key={p.key} value={p.key}>{p.value}</option>)}
              </select>
            </div>
          )}
          {others.length > 0 && (
            <div>
              <label className="text-xs text-ink-muted block mb-1">{t.gantt.fieldDependencies}</label>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {others.map(o => (
                  <label key={o.id} className="flex items-center gap-2 text-xs text-ink-primary cursor-pointer">
                    <input type="checkbox" checked={deps.includes(o.id)} disabled={locked} onChange={() => toggleDep(o.id)} />
                    <span className="truncate">{o.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {err && <p className="text-xs text-danger">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-secondary" onClick={onClose}>{t.gantt.cancel}</button>
          {!locked && <button className="btn-brand" onClick={handleSave}>{t.gantt.save}</button>}
        </div>
      </div>
    </div>
  );
}
