import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/authStore';

// ─── HTTP Client ───
const http = axios.create({
  baseURL: (import.meta.env.VITE_API_BASE_URL || '') + '/api/v1',
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Request Interceptor ───
http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const tenantId = useAuthStore.getState().currentTenant?.id;
  if (tenantId) {
    config.headers['X-Tenant-Id'] = tenantId;
  }
  // AI output language — lets the backend localize user-facing LLM error
  // messages (invalid/expired API key, insufficient balance, rate limits...)
  const aiLang = useAuthStore.getState().user?.aiLanguage;
  if (aiLang) {
    config.headers['X-Ai-Language'] = aiLang;
  }
  return config;
});

// Track if we've already redirected to prevent loops
let redirected = false;
// Single-flight refresh: the backend rotates (single-use) refresh tokens, so
// concurrent 401s must share ONE refresh — otherwise the second request uses
// an already-revoked token and the server logs the user out everywhere.
let refreshInFlight: Promise<boolean> | null = null;

// ─── Response Interceptor ───
http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // 401: try refresh once, redirect to login on failure
    if (error.response?.status === 401) {
      // Skip auth endpoints
      if (originalRequest.url?.includes('/auth/')) {
        return Promise.reject(error);
      }

      // Already retried — give up and redirect
      if (originalRequest._retry) {
        if (!redirected) {
          redirected = true;
          useAuthStore.getState().logout();
          const from = encodeURIComponent(window.location.pathname + window.location.search);
          // assign (push) keeps the current page in history — after re-login the
          // user lands back here via replace, so Back never revisits /login
          window.location.assign(`/login?expired=1&redirect=${from}`);
        }
        return Promise.reject(error);
      }

      // Try refresh once — but share a single in-flight refresh across all
      // concurrent 401s (the backend rotates refresh tokens).
      originalRequest._retry = true;
      try {
        if (!refreshInFlight) {
          refreshInFlight = (async () => {
            try {
              const rt = useAuthStore.getState().refreshToken;
              if (!rt) return false;
              const { data } = await axios.post(
                (import.meta.env.VITE_API_BASE_URL || '') + '/api/v1/auth/refresh',
                { refreshToken: rt },
              );
              useAuthStore.getState().setTokens(data.data);
              return !!data.data?.accessToken;
            } catch {
              return false;
            } finally {
              refreshInFlight = null;
            }
          })();
        }
        const refreshed = await refreshInFlight;
        if (!refreshed) {
          if (!redirected) {
            redirected = true;
            useAuthStore.getState().logout();
            const from = encodeURIComponent(window.location.pathname + window.location.search);
            window.location.assign(`/login?expired=1&redirect=${from}`);
          }
          return Promise.reject(error);
        }
        // Retry with the NEW token from the store
        const newToken = useAuthStore.getState().accessToken;
        if (newToken) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }
        return http(originalRequest);
      } catch {
        // Refresh failed — redirect to login
        if (!redirected) {
          redirected = true;
          useAuthStore.getState().logout();
          const from = encodeURIComponent(window.location.pathname + window.location.search);
          window.location.assign(`/login?expired=1&redirect=${from}`);
        }
        return Promise.reject(error);
      }
    }

    // 429: live-demo per-IP quota exhausted → global notice pointing to the trial
    if (error.response?.status === 429) {
      const data = error.response.data as { code?: string; message?: string; quota?: string } | undefined;
      if (data?.code === 'quota_exhausted') {
        window.dispatchEvent(new CustomEvent('tl-quota-exhausted', {
          detail: { message: data.message || 'Demo quota exhausted — request a trial to deploy your own instance', quota: data.quota },
        }));
      }
    }

    // 403: Forbidden
    if (error.response?.status === 403) {
      const data = error.response.data as { code?: number; message?: string } | undefined;
      if (data?.code === 40301) {
        window.location.href = '/select-tenant';
      }
      // Write operations rejected by the server (read-only user / demo account)
      // → surface a global notice so the failure is always visible
      const method = (originalRequest.method || '').toUpperCase();
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        window.dispatchEvent(new CustomEvent('tl-permission-denied', {
          detail: { message: data?.message || '' },
        }));
      }
    }

    return Promise.reject(error);
  },
);

export default http;
