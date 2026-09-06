import http from '@/lib/http';
import type { AuthResponse, ApiResponse, TokenPair, UserVO } from '@/types/auth';

export const authApi = {
  sendCode(email: string, purpose: string) {
    return http.post<ApiResponse<null>>('/auth/send-code', { email, purpose });
  },

  register(data: { email: string; code?: string; password: string; displayName: string; inviteCode?: string; workspaceName?: string }) {
    return http.post<ApiResponse<AuthResponse>>('/auth/register', data);
  },

  login(data: { email: string; password: string; rememberMe: boolean }) {
    return http.post<ApiResponse<AuthResponse>>('/auth/login', data);
  },
  guestLogin() {
    return http.post<ApiResponse<AuthResponse>>('/auth/guest-login');
  },

  selectTenant(tenantId: string) {
    return http.post<ApiResponse<AuthResponse>>('/auth/select-tenant', { tenantId });
  },

  refreshToken(refreshToken: string) {
    return http.post<ApiResponse<TokenPair>>('/auth/refresh', { refreshToken: refreshToken });
  },

  logout(refreshToken?: string) {
    return http.post<ApiResponse<null>>('/auth/logout', refreshToken ? { refreshToken: refreshToken } : {});
  },

  updateProfile(data: { displayName?: string; jobTitle?: string; skills?: string; gender?: string; aiLanguage?: string; uiLanguage?: string; onboardingCompleted?: boolean }) {
    return http.put<ApiResponse<UserVO>>('/auth/profile', data);
  },

  getInviteInfo(code: string) {
    return http.get<ApiResponse<{ email: string; role: string; workspaceName: string; isExistingUser?: boolean }>>(`/invites/lookup`, { params: { code } });
  },
};
