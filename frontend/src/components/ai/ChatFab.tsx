import { cn } from '@/lib/cn';
import { RobotFace } from '@/components/ai/ChatMessageBubble';

interface ChatFabProps {
  open: boolean;
  onClick: () => void;
}

export function ChatFab({ open, onClick }: ChatFabProps) {
  return (
    <button
      className={cn(
        'fixed bottom-6 right-6 z-50 w-16 h-16 rounded-2xl shadow-dialog flex items-center justify-center transition-all duration-300',
        'bg-gradient-to-br from-brand-main to-brand-hover text-white',
        'hover:shadow-lg hover:scale-110 hover:-translate-y-1',
        'ring-2 ring-brand-main/20',
        open && 'scale-0 opacity-0 pointer-events-none'
      )}
      onClick={onClick}
      title={'AI Assistant (⌘K)'}
    >
      <RobotFace size={36} />
    </button>
  );
}
