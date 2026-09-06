import { useThemeStore, THEMES } from '@/stores/themeStore';

export function ThemeSwitcher() {
  const { theme, setTheme } = useThemeStore();

  return (
    <div className="flex gap-1 px-2.5 py-1">
      {THEMES.map((t) => (
        <button
          key={t.key}
          onClick={() => setTheme(t.key)}
          title={t.name}
          className="w-4 h-4 rounded-full border-2 transition-all duration-150 hover:scale-110 shrink-0"
          style={{
            background: t.color,
            borderColor: theme === t.key
              ? 'hsl(var(--ink-sidebar-active))'
              : 'transparent',
            boxShadow: theme === t.key
              ? '0 0 0 2px hsl(var(--ink-sidebar-active) / 0.2)'
              : 'none',
          }}
        />
      ))}
    </div>
  );
}
