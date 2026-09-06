import { useState, useRef, useEffect } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { useT } from '@/i18n/useT';
import { cn } from '@/lib/cn';
import { ChevronDown } from 'lucide-react';

export function SessionProjectBanner() {
  const t = useT();
  const currentProject = useProjectStore(s => s.currentProject);
  const projects = useProjectStore(s => s.projects);
  const setCurrentProject = useProjectStore(s => s.setCurrentProject);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  if (!currentProject) return null;
  const list = projects || [];

  return (
    <div className="relative shrink-0" ref={ref}>
      {/* Banner bar */}
      <button
        className={cn(
          'w-full flex items-center gap-2 px-4 py-2 text-xs transition-colors',
          'bg-brand-soft/40 border-b border-brand-main/15',
          'hover:bg-brand-soft/60 cursor-pointer',
        )}
        onClick={() => setOpen(!open)}
      >
        <span className="text-sm">📁</span>
        <span className="text-slate-500">{t.aiAssistant.currentProject}</span>
        <span className="font-mono font-bold text-brand-main">{currentProject.key}</span>
        <span className="text-slate-600 font-medium truncate">{currentProject.name}</span>
        <span className="ml-auto text-[0.55rem] text-brand-main/60 font-medium flex items-center gap-0.5">
          {t.aiAssistant.switchProject} <ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 right-0 mx-2 mt-1 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-50 max-h-64 overflow-y-auto">
          <div className="px-3 py-1 text-[0.55rem] font-semibold text-slate-400 uppercase tracking-wider">
            {t.aiAssistant.selectProject}
          </div>
          {list.map(p => (
            <button
              key={p.id}
              className={cn(
                'w-full text-left px-3 py-2 text-xs hover:bg-brand-soft/30 flex items-center gap-2 transition-colors',
                currentProject.id === p.id ? 'bg-brand-soft/20 text-brand-main font-semibold' : 'text-slate-700',
              )}
              onClick={() => { setCurrentProject(p); setOpen(false); }}
            >
              <span className={cn(
                'w-2 h-2 rounded-full shrink-0',
                currentProject.id === p.id ? 'bg-brand-main' : 'bg-slate-300',
              )} />
              <span className="font-mono text-[0.6rem] opacity-60">{p.key}</span>
              <span className="truncate">{p.name}</span>
            </button>
          ))}
          <div className="border-t border-slate-100 mt-1 pt-1 px-3">
            <button
              className="w-full text-left text-[0.6rem] text-slate-400 hover:text-slate-600 py-1"
              onClick={() => { setCurrentProject(null as any); setOpen(false); }}
            >
              {t.aiAssistant.clearSelection}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
