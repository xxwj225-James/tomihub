import http from '@/lib/http';
import type { ApiResponse } from '@/types/auth';

export interface ApiKeyData {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  keyPrefix: string;
  scopes: string;
  hitlMode?: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface GeneratedKey {
  id: string;
  name: string;
  key: string;       // only shown once
  scopes: string;
  createdAt: string;
}

export const apiKeyApi = {
  list: () => http.get<ApiResponse<ApiKeyData[]>>('/api-keys'),

  generate: (name: string, scopes: string, hitlMode: string = 'manual') =>
    http.post<ApiResponse<GeneratedKey>>('/api-keys', { name, scopes, hitlMode }),

  revoke: (id: string) =>
    http.delete<ApiResponse<null>>(`/api-keys/${id}`),
};
