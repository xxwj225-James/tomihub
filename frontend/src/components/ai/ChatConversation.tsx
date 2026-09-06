import { useRef, useEffect } from 'react';
import { ChatMessageBubble } from '@/components/ai/ChatMessageBubble';
import { ChatWelcome, type ChatWelcomeT } from '@/components/ai/ChatWelcome';
import type { ChatMessage } from '@/components/ai/GlobalAiAssistant';

interface ChatConversationProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string;
  toggleToolExpand: (taskId: string, toolId: string) => void;
  onStopTask: (taskId: string) => void;
  hasProject: boolean;
  doAgentChat: (msg: string) => void;
  t: ChatWelcomeT;
}

export function ChatConversation({
  messages, isStreaming: _isStreaming, error, toggleToolExpand, onStopTask, hasProject, doAgentChat, t,
}: ChatConversationProps) {
  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex flex-col min-h-full">
        {messages.length === 0 && (
          <ChatWelcome t={t} hasProject={hasProject} onSuggestionClick={doAgentChat} />
        )}
        <div className="px-4 py-4 space-y-4">
          {messages.map(msg => (
            <ChatMessageBubble
              key={msg.id}
              message={msg}
              onToggleToolExpand={(toolId: string) => toggleToolExpand(msg.id, toolId)}
              onStopTask={() => onStopTask(msg.id)}
            />
          ))}
          {error && (
            <div className="p-3 rounded-card bg-status-danger-soft border border-danger/20">
              <p className="text-xs text-status-danger">{error}</p>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </div>
    </div>
  );
}
