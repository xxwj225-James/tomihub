import { useLanguageStore } from '@/stores/languageStore';
import { authApi } from '@/api/authApi';

export function LanguageSwitcher() {
  const { lang, setLang } = useLanguageStore();

  const cycleLang = () => {
    const next = lang === 'en' ? 'zh' : lang === 'zh' ? 'ja' : 'en';
    setLang(next);
    // Persist to DB so language follows user across browsers
    authApi.updateProfile({ uiLanguage: next }).catch(()=>{});
  };

  return (
    <button onClick={cycleLang}
      className="sidebar-link w-full text-[0.75rem]">
      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
        <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
      </svg>
      <span className="flex-1 text-left text-xs uppercase tracking-wide font-medium">{lang}</span>
    </button>
  );
}
