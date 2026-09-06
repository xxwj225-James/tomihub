import { create } from 'zustand';
import type { UserVO, TenantVO } from '@/types/auth';

interface AuthState {
  user: UserVO | null;
  currentTenant: TenantVO | null;
  tenants: TenantVO[];
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;

  setAuth: (user: UserVO, tokens: { accessToken: string; refreshToken: string }) => void;
  setTenants: (tenants: TenantVO[]) => void;
  selectTenant: (tenant: TenantVO) => void;
  setTokens: (tokens: { accessToken: string; refreshToken: string }) => void;
  logout: () => void;
  canWrite: () => boolean;
}

const STORAGE_KEY = 'ai-pm-auth';

interface PersistedState {
  currentTenant: TenantVO | null;
  tenants: TenantVO[];
  accessToken: string | null;
  refreshToken: string | null;
  user: UserVO | null;
}

function loadPersisted(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        currentTenant: parsed?.state?.currentTenant || null,
        tenants: parsed?.state?.tenants || [],
        accessToken: parsed?.state?.accessToken || null,
        refreshToken: parsed?.state?.refreshToken || null,
        user: parsed?.state?.user || null,
      };
    }
  } catch { /* Persisted state parse failure — defaults handled by return */ }
  return { currentTenant: null, tenants: [], accessToken: null, refreshToken: null, user: null };
}

function savePersisted(state: Partial<PersistedState>) {
  try {
    const current = loadPersisted();
    const merged = { ...current, ...state };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      state: {
        currentTenant: merged.currentTenant,
        tenants: merged.tenants,
        accessToken: merged.accessToken,
        refreshToken: merged.refreshToken,
        user: merged.user,
      }
    }));
  } catch { /* localStorage write failure — non-critical, state still works in memory */ }
}

const persisted = loadPersisted();

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: persisted.user,
  currentTenant: persisted.currentTenant,
  tenants: persisted.tenants,
  accessToken: persisted.accessToken,
  refreshToken: persisted.refreshToken,
  isAuthenticated: !!(persisted.accessToken && persisted.user),

  setAuth: (user, tokens) => {
    savePersisted({ user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
    set({
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      isAuthenticated: true,
    });
  },

  setTenants: (tenants) => {
    savePersisted({ tenants });
    set({ tenants });
  },

  /** Check if current user can write (not a viewer/demo user). */
  canWrite: () => {
    const role = get().currentTenant?.role;
    return role !== 'viewer' && (role as string) !== 'pending';
  },

  selectTenant: (tenant) => {
    savePersisted({ currentTenant: tenant });
    set({ currentTenant: tenant });
  },

  setTokens: (tokens) => {
    savePersisted({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
    set({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  },

  logout: () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* localStorage removal failure — non-critical during logout */ }
    set({
      user: null,
      currentTenant: null,
      tenants: [],
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
    });
  },
}));
