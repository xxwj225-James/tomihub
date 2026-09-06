import http from '@/lib/http';
import type { ApiResponse, PageResult } from '@/types/auth';

export interface IssueData {
  id: string;
  tenantId: string;
  projectId: string;
  issueNumber: number;
  title: string;
  description?: string;
  type: string;
  status: string;
  priority: string;
  assigneeId?: string;
  assigneeName?: string;
  reporterId?: string;
  sprintId?: string;
  parentId?: string;
  storyPoints?: number;
  remainingPoints?: number;
  sortOrder?: number;
  labels?: string;
  securityLevel?: string;
  phase?: string;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateIssuePayload {
  projectId: string;
  title: string;
  description?: string;
  type?: string;
  status?: string;
  priority?: string;
  assigneeId?: string;
  storyPoints?: number;
  remainingPoints?: number;
  sprintId?: string;
  parentId?: string;
  labels?: string;
  securityLevel?: string;
  phase?: string;
  dueDate?: string;
}

export interface AiReviewResult {
  score: number; maxScore: number; verdict: string;
  summary?: string;
  logAnalysis?: string;
  duplicateRisk?: string;
  isDuplicate?: boolean; duplicateOf?: string;
  suggestedTitle?: string;
  suggestedDescription?: string;
  notes: Array<{ level: string; msg: string }>;
  suggestions: string[];
  similarIssues?: Array<{ id: string; key: string; title: string; status: string; matchScore: number }>;
  recommendedSP?: number;
  error?: string;
}

export interface IssuePermissions {
  canEditProtected: boolean;
  canDelete: boolean;
  isCreator: boolean;
  userId: string;
}

export interface MemberInfo {
  id: string;
  userId?: string;
  roleId?: string;
  displayName: string;
  email: string;
  role?: string;
}

export const issueApi = {
  listMyTasks: () =>
    http.get<ApiResponse<PageResult<IssueData>>>('/issues/my-tasks'),

  listCreatedByMe: () =>
    http.get<ApiResponse<PageResult<IssueData>>>('/issues/created-by-me'),

  listMembers: () =>
    http.get<ApiResponse<MemberInfo[]>>('/tenant-members'),

  listProjectMembers: (projectId: string) =>
    http.get<ApiResponse<MemberInfo[]>>(`/projects/${projectId}/members`),

  updateMemberRole: (userId: string, role: string) =>
    http.put<ApiResponse<null>>(`/tenant-members/${userId}/role`, { role }),

  removeMember: (userId: string) =>
    http.delete<ApiResponse<null>>(`/tenant-members/${userId}`),

  listRoles: (scope?: string) =>
    http.get<ApiResponse<Array<{ id: string; name: string; scope: string }>>>('/roles', { params: scope ? { scope } : {} }),

  createInvite: (email: string, role: string) =>
    http.post<ApiResponse<{ id: string; email: string; role: string; code: string; status: string }>>('/invites', { email, role }),

  createBatchInvite: (emails: string[], role: string) =>
    http.post('/invites/batch', { emails, role }),


  create: (data: CreateIssuePayload) =>
    http.post<ApiResponse<IssueData>>('/issues', data),

  list: (projectId: string) =>
    http.get<ApiResponse<PageResult<IssueData>>>('/issues', { params: { projectId } }),

  get: (issueId: string) =>
    http.get<ApiResponse<IssueData>>(`/issues/${issueId}`),

  update: (issueId: string, data: Partial<CreateIssuePayload>) =>
    http.put<ApiResponse<IssueData>>(`/issues/${issueId}`, data),

  delete: (issueId: string) =>
    http.delete<ApiResponse<null>>(`/issues/${issueId}`),

  getPermissions: (issueId: string) =>
    http.get<ApiResponse<IssuePermissions>>(`/issues/${issueId}/permissions`),

  getSimilar: (issueId: string) =>
    http.get<ApiResponse<Array<{ id: string; title: string; status: string; matchScore: number }>>>(`/issues/${issueId}/similar`),

  getRisk: (issueId: string) =>
    http.get<ApiResponse<{ riskScore: number; riskLevel: string; risks: Array<{ level: string; msg: string }> }>>(`/issues/${issueId}/risk`),

  getSuggestions: (issueId: string) =>
    http.get<ApiResponse<{ suggestions: Array<{ level: string; msg: string }> }>>(`/issues/${issueId}/suggestions`),

  aiReviewEdit: (issueId: string, data: Partial<CreateIssuePayload>) =>
    http.post<ApiResponse<AiReviewResult>>(`/issues/${issueId}/ai-review-edit`, data),

  aiReview: (data: CreateIssuePayload) =>
    http.post<ApiResponse<AiReviewResult>>('/issues/ai-review', data),

  generateDescription: (prompt: string, context: string) =>
    http.post<ApiResponse<{ description: string }>>('/issues/ai-generate-description', { prompt, context }),

  updateRank: (issueId: string, beforeId?: string, afterId?: string) =>
    http.put<ApiResponse<null>>(`/issues/${issueId}/rank`, { beforeId, afterId }),

  getChildren: (issueId: string) =>
    http.get<ApiResponse<IssueData[]>>(`/issues/${issueId}/children`),
};
