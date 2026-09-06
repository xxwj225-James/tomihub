import http from '@/lib/http';
import type { ApiResponse } from '@/types/auth';

export interface ChatSession {
  id: string;
  title: string;
  projectId: string;
  totalTokens: number;
  maxTokens: number;
  tokenPercent: number;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: Array<{ name: string; args?: Record<string, unknown>; result?: unknown; status?: string }>;
  tokensUsed: number;
  iteration: number;
  createdAt: string;
}

export const chatSessionApi = {
  list: () => http.get<ApiResponse<ChatSession[]>>('/ai/chat/sessions'),

  create: (projectId?: string, title?: string) =>
    http.post<ApiResponse<{ id: string; title: string; projectId: string }>>('/ai/chat/sessions', { projectId, title }),

  loadMessages: (sessionId: string, before?: string, limit = 50) =>
    http.get<ApiResponse<ChatMessage[]>>(`/ai/chat/sessions/${sessionId}/messages`, { params: { before, limit } }),

  delete: (sessionId: string) =>
    http.delete<ApiResponse<null>>(`/ai/chat/sessions/${sessionId}`),

  rename: (sessionId: string, title: string) =>
    http.put<ApiResponse<ChatSession>>(`/ai/chat/sessions/${sessionId}`, { title }),
};
