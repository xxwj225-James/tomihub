import { translations, type Lang } from './translations';
import { useLanguageStore } from '@/stores/languageStore';

export function useT(): Record<string, any> {
  const lang = useLanguageStore((s) => s.lang) as Lang;
  return (translations[lang] || translations.en) as Record<string, any>;
}
