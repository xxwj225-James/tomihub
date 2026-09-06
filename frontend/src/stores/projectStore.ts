import { create } from 'zustand';
import { projectApi, type ProjectData } from '@/api/projectApi';

interface ProjectState {
  projects: ProjectData[];
  currentProject: ProjectData | null;
  loading: boolean;
  fetchProjects: () => Promise<void>;
  addProject: (project: ProjectData) => void;
  setCurrentProject: (project: ProjectData) => void;
  clearCurrentProject: () => void;
  reset: () => void;
}

const STORAGE_KEY = 'ai-pm-project-current';

function loadCachedProject(): ProjectData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveCachedProject(project: ProjectData | null) {
  try {
    if (project) localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* noop */ }
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  projects: [],
  currentProject: loadCachedProject(),
  loading: false,

  fetchProjects: async () => {
    set({ loading: true });
    try {
      const { data: resp } = await projectApi.list();
      const pageResult = resp as unknown as { data?: { items?: ProjectData[] } };
      const projects = pageResult?.data?.items || (Array.isArray(resp.data) ? resp.data : []);
      const current = get().currentProject;
      const restored = current ? projects.find(p => p.id === current.id) : null;
      set({
        projects,
        currentProject: restored || (projects.length > 0 && !current ? projects[0] : null),
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  addProject: (project) =>
    set((s) => ({
      projects: [project, ...s.projects],
      currentProject: s.currentProject || project,
    })),

  setCurrentProject: (project) => {
    saveCachedProject(project);
    set({ currentProject: project });
  },

  clearCurrentProject: () => {
    saveCachedProject(null);
    set({ currentProject: null });
  },

  // Preserve projects list and cached project — prevents empty sidebar on navigation
  reset: () => set({ loading: false, projects: get().projects, currentProject: loadCachedProject() }),
}));
