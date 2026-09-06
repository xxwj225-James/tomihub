import http from '@/lib/http';
import type { ApiResponse } from '@/types/auth';

export interface MemberInfo {
  id: string; userId: string; displayName: string; email: string;
  role: string; roleId?: string; joinedAt: string; status?: string;
}

export const memberApi = {
  /** List all workspace members */
  listMembers: () =>
    http.get<ApiResponse<MemberInfo[]>>('/tenant-members'),

  /** List project members */
  listProjectMembers: (projectId: string) =>
    http.get<ApiResponse<MemberInfo[]>>(`/projects/${projectId}/members`),

  /** Add a workspace member to the project */
  addProjectMember: (projectId: string, userId: string, role: string) =>
    http.post<ApiResponse<MemberInfo>>(`/projects/${projectId}/members`, { userId, role }),

  /** Update a project member's role */
  updateProjectMemberRole: (projectId: string, userId: string, role: string) =>
    http.put<ApiResponse<MemberInfo>>(`/projects/${projectId}/members/${userId}`, { role }),

  /** Remove a member from the project (stays in the workspace) */
  removeProjectMember: (projectId: string, userId: string) =>
    http.delete<ApiResponse<null>>(`/projects/${projectId}/members/${userId}`),

  /** Update a member's role */
  updateMemberRole: (userId: string, role: string) =>
    http.put<ApiResponse<null>>(`/tenant-members/${userId}/role`, { role }),

  /** Disable a member */
  disableMember: (userId: string) =>
    http.put<ApiResponse<null>>(`/tenant-members/${userId}/disable`),

  /** Re-enable a member */
  enableMember: (userId: string) =>
    http.put<ApiResponse<null>>(`/tenant-members/${userId}/enable`),

  /** Remove a member */
  removeMember: (userId: string) =>
    http.delete<ApiResponse<null>>(`/tenant-members/${userId}`),

  /** List available roles */
  listRoles: (scope?: string) =>
    http.get<ApiResponse<Array<{ id: string; name: string; scope: string }>>>('/roles', { params: scope ? { scope } : {} }),

  /** Send a single invite */
  createInvite: (email: string, role: string) =>
    http.post<ApiResponse<{ id: string; email: string; role: string; code: string; status: string }>>('/invites', { email, role }),

  /** Batch invite (comma/space/newline separated) */
  createBatchInvite: (emails: string[], role: string) =>
    http.post<ApiResponse<{
      total: number; sent: number; failed: number; skipped: number;
      results: Array<{ email: string; status: string; reason?: string }>;
    }>>('/invites/batch', { emails, role }),
};
