import http from '@/lib/http';
import type { ApiResponse } from '@/types/auth';

export interface HitlConfig {
  id?: string;
  agentName: string | null;  // null = global
  mode: 'manual' | 'auto';
  isGlobalEnabled?: boolean;
}

export const hitlApi = {
  list: () => http.get<ApiResponse<HitlConfig[]>>('/hitl-config'),

  saveGlobal: (mode: 'manual' | 'auto', isGlobalEnabled: boolean) =>
    http.put<ApiResponse<HitlConfig>>('/hitl-config', { agentName: null, mode, isGlobalEnabled }),

  saveAgent: (agentName: string, mode: 'manual' | 'auto') =>
    http.put<ApiResponse<HitlConfig>>('/hitl-config', { agentName, mode }),

  deleteAgent: (id: string) =>
    http.delete<ApiResponse<null>>(`/hitl-config/${id}`),
};
