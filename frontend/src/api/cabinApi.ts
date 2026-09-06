import http from '@/lib/http';
import type { ApiResponse } from '@/types/auth';

export interface CabinData {
  id: string; tenantId: string; name: string; description?: string;
  createdBy: string; status: string; createdAt: string; closedAt?: string;
}

export interface CabinParticipant {
  id: string; cabinId: string; userId: string; invitedBy: string;
  status: string; role: string; invitedAt: string;
}

export interface CabinFeedback {
  id: string; documentId: string; cabinId: string; projectId?: string;
  userId: string; feedback: string; createdAt: string;
}

export interface CabinEntry {
  id: string; tenantId: string; cabinId: string; projectId: string;
  projectName?: string; projectKey?: string;
  phase?: string; attachedBy: string; attachedAt: string;
}

export interface CabinDocument {
  id: string; cabinId: string; content: string;
  healthData?: string; dependencyData?: string; summaryData?: string;
  version: number; generatedAt: string;
}

export const cabinApi = {
  list: () => http.get<ApiResponse<CabinData[]>>('/cabins'),

  get: (id: string) => http.get<ApiResponse<CabinData>>(`/cabins/${id}`),

  create: (name: string, description?: string, participantIds?: string[]) =>
    http.post<ApiResponse<CabinData>>('/cabins', { name, description, participantIds }),

  update: (id: string, data: Record<string, string>) =>
    http.put<ApiResponse<CabinData>>(`/cabins/${id}`, data),

  listParticipants: (id: string) =>
    http.get<ApiResponse<CabinParticipant[]>>(`/cabins/${id}/participants`),

  addParticipant: (id: string, userId: string, role?: string) =>
    http.post<ApiResponse<CabinParticipant>>(`/cabins/${id}/participants`, { userId, role }),

  acceptInvite: (id: string) =>
    http.post<ApiResponse<void>>(`/cabins/${id}/accept`),

  authorize: (id: string, projectIds: string[]) =>
    http.post<ApiResponse<void>>(`/cabins/${id}/authorize`, { projectIds }),

  listEntries: (id: string) =>
    http.get<ApiResponse<CabinEntry[]>>(`/cabins/${id}/entries`),

  attachProject: (id: string, projectId: string, phase?: string) =>
    http.post<ApiResponse<CabinEntry>>(`/cabins/${id}/entries`, { projectId, phase }),

  getDocument: (id: string) =>
    http.get<ApiResponse<CabinDocument>>(`/cabins/${id}/document`),

  listDocuments: (id: string) =>
    http.get<ApiResponse<CabinDocument[]>>(`/cabins/${id}/documents`),

  generateDocument: (id: string) =>
    http.post<ApiResponse<{ cabin_id: string; content: string }>>(`/ai/cabins/${id}/generate`),

  listFeedback: (id: string) =>
    http.get<ApiResponse<CabinFeedback[]>>(`/cabins/${id}/feedback`),

  addFeedback: (id: string, documentId: string, projectId: string, feedback: string) =>
    http.post<ApiResponse<CabinFeedback>>(`/cabins/${id}/feedback`, { documentId, projectId, feedback }),
};
