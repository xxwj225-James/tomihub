import { create } from 'zustand';

export type ThemeKey = 'pipeline' | 'hub' | 'canvas' | 'quantum';

export interface ThemeDef {
  key: ThemeKey;
  name: string;
  desc: string;
  color: string;
}

export const THEMES: ThemeDef[] = [
  { key: 'pipeline', name: 'Clean Pipeline', desc: 'Dark sidebar · white canvas · layered shadows · utmost restraint', color: '#5E6AD2' },
  { key: 'hub',      name: 'Connected Hub',  desc: 'All-white · light gray base · rounded blue · community collaboration', color: '#1877F2' },
  { key: 'canvas',   name: 'Material Canvas',desc: 'Pure white · layered shadows · four vibrant colors · clean & efficient', color: '#1A73E8' },
  { key: 'quantum',  name: 'Quantum Grid',   desc: 'White background · black text · neon green · bright tech · NVIDIA style', color: '#76B900' },
];

interface ThemeState {
  theme: ThemeKey;
  setTheme: (theme: ThemeKey) => void;
}

function getSaved(): ThemeKey {
  try {
    const s = localStorage.getItem('ai-pm-theme') as ThemeKey;
    return THEMES.some((t) => t.key === s) ? s : 'pipeline';
  } catch { return 'pipeline'; }
}

function apply(theme: ThemeKey) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('ai-pm-theme', theme); } catch { /* storage unavailable — theme applies in memory only */ }
}

apply(getSaved());

export const useThemeStore = create<ThemeState>((set) => ({
  theme: getSaved(),
  setTheme: (theme) => { apply(theme); set({ theme }); },
}));
