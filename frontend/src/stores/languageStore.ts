import { create } from 'zustand';
import type { Lang } from '@/i18n/translations';

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

function getSaved(): Lang {
  try {
    const s = localStorage.getItem('ai-pm-lang');
    if (s === 'zh' || s === 'ja' || s === 'en') return s;
  } catch { /* storage unavailable — fall through to browser detection */ }
  // First visit — detect from browser language
  const nav = (typeof navigator !== 'undefined' && navigator.language) || '';
  if (nav.startsWith('zh')) return 'zh';
  if (nav.startsWith('ja')) return 'ja';
  return 'en';
}

export const useLanguageStore = create<LangState>((set) => ({
  lang: getSaved(),
  setLang: (lang) => {
    try { localStorage.setItem('ai-pm-lang', lang); } catch { /* storage unavailable — keep in memory only */ }
    set({ lang });
  },
}));
