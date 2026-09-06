import http from '@/lib/http';

export const configApi = {
  getLlmConfig: () =>
    http.get('/llm-config'),

  updateLlmConfig: (data: Record<string, unknown>) =>
    http.put('/llm-config', data),

  getModels: () =>
    http.get('/ai/models'),

  testConnection: (data: Record<string, unknown>, extraConfig?: { timeout?: number }) =>
    http.post('/llm-config/test-connection', data, extraConfig),

  toggleService: (enabled: boolean) =>
    http.post('/llm-config/toggle-service', { enabled }),
};
