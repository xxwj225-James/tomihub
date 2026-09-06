import http from '@/lib/http';
import type { ApiResponse, PageResult } from '@/types/auth';

export interface ProjectData {
  id: string;
  tenantId: string;
  name: string;
  key: string;
  description: string;
  leadId: string;
  visibility: string;
  status: string;
  phase?: string;
  settings?: string;
  createdAt: string;
}

export const projectApi = {
  list: () => http.get<ApiResponse<PageResult<ProjectData>>>('/projects', { params: { includeClosed: true } }),

  create: (data: { name: string; key: string; description?: string; generateWiki?: boolean; methodology?: string }) =>
    http.post<ApiResponse<ProjectData>>('/projects', data),

  getWiki: (projectId: string) =>
    http.get<ApiResponse<Array<{ id: string; title: string; content?: string }>>>(`/projects/${projectId}/wiki`),

  update: (projectId: string, data: Record<string, unknown>) =>
    http.put<ApiResponse<Record<string, unknown>>>(`/projects/${projectId}`, data),

  getStats: (projectId: string) =>
    http.get<ApiResponse<Record<string, number>>>(`/projects/${projectId}/stats`),

  getActivity: (projectId: string) =>
    http.get<ApiResponse<Array<Record<string, unknown>>>>(`/projects/${projectId}/activity`),
};
