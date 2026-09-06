import http from '@/lib/http';
import type { ApiResponse, PageResult } from '@/types/auth';

export interface NotificationData {
  id: string;
  type: string;
  subtype?: string;
  title: string;
  body?: string;
  sourceAgent?: string;
  sourceUserId?: string;
  sourceType: string;
  issueKey?: string;
  issueTitle?: string;
  actionType: string;
  actionPayload?: string;
  status: string;
  createdAt: string;
  expiresAt?: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export const notificationApi = {
  list: (params?: { type?: string; status?: string }) =>
    http.get<ApiResponse<PageResult<NotificationData>>>('/notifications', { params }),

  get: (id: string) =>
    http.get<ApiResponse<NotificationData>>(`/notifications/${id}`),

  resolve: (id: string, action: 'approve' | 'deny' | 'dismiss') =>
    http.post<ApiResponse<NotificationData>>(`/notifications/${id}/resolve`, { action }),

  markRead: (id: string) =>
    http.post<ApiResponse<void>>(`/notifications/${id}/read`),
};
