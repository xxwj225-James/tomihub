import { RobotFace } from '@/components/ai/ChatMessageBubble';

export interface ChatWelcomeT {
  welcomeTitle: string;
  welcomeDesc: string;
  noProject: string;
  suggestions: string[];
  [key: string]: unknown;
}

interface ChatWelcomeProps {
  t: ChatWelcomeT;
  hasProject: boolean;
  onSuggestionClick: (suggestion: string) => void;
}

export function ChatWelcome({ t, hasProject, onSuggestionClick }: ChatWelcomeProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-brand-main flex items-center justify-center mb-4">
        <RobotFace size={30} />
      </div>
      <p className="text-base text-ink-primary font-semibold mb-1">{t.welcomeTitle as string}</p>
      <p className="text-sm text-ink-muted max-w-xs mb-6">{t.welcomeDesc as string}</p>
      {!hasProject && (
        <p className="text-xs text-warning mb-4">{t.noProject as string}</p>
      )}
      <div className="grid grid-cols-2 gap-2 max-w-sm">
        {(t.suggestions as string[]).map(s => (
          <button key={s}
            className="text-xs text-ink-muted text-left px-3 py-2 rounded-btn bg-surface-hover hover:bg-surface-hover/70 border border-edge/50 transition-colors"
            onClick={() => onSuggestionClick(s)}
          >{s}</button>
        ))}
      </div>
    </div>
  );
}
