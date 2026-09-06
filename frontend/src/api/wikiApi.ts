import http from '@/lib/http';
import type { ApiResponse } from '@/types/auth';

export interface WikiPage {
  id: string;
  projectId: string;
  title: string;
  content: string;
  category: string;
  status: string;
  isSample: boolean;
  createdBy: string;
  createdByName?: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt?: string;
}

export const wikiApi = {
  list: (projectId: string, category?: string) =>
    http.get<ApiResponse<WikiPage[]>>(`/projects/${projectId}/wiki`, { params: { category } }),

  get: (projectId: string, id: string) =>
    http.get<ApiResponse<WikiPage>>(`/projects/${projectId}/wiki/${id}`),

  create: (projectId: string, data: { title: string; content?: string; category?: string; status?: string }) =>
    http.post<ApiResponse<WikiPage>>(`/projects/${projectId}/wiki`, data),

  update: (projectId: string, id: string, data: { title?: string; content?: string; category?: string; status?: string }) =>
    http.put<ApiResponse<WikiPage>>(`/projects/${projectId}/wiki/${id}`, data),

  delete: (projectId: string, id: string) =>
    http.delete<ApiResponse<null>>(`/projects/${projectId}/wiki/${id}`),
};
