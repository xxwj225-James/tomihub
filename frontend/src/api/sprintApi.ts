import http from '@/lib/http';
import type { ApiResponse, PageResult } from '@/types/auth';

export interface SprintData {
  id: string; projectId: string; name: string; goal?: string;
  startDate: string; endDate: string; status: string;
  createdAt: string;
}

export const sprintApi = {
  list: (projectId: string) =>
    http.get<ApiResponse<PageResult<SprintData>>>(`/sprints?projectId=${projectId}`),

  create: (data: { projectId: string; name: string; goal?: string; startDate: string; endDate: string }) =>
    http.post<ApiResponse<SprintData>>('/sprints', data),

  start: (id: string) =>
    http.post<ApiResponse<SprintData>>(`/sprints/${id}/start`),

  complete: (id: string) =>
    http.post<ApiResponse<SprintData>>(`/sprints/${id}/complete`),
};
