import http from '@/lib/http';
import { useAuthStore } from '@/stores/authStore';
import type { ApiResponse } from '@/types/auth';

// AI-BOUNDARY: all AI capability calls flow through /api/v1/ai/* (ai-brain,
// closed-source). For an OSS build, gate this prefix at the gateway/nginx —
// the rest of the frontend keeps working, AI surfaces show "upgrade" states.

export interface HealthRisk {
  description: string;
  severity?: 'low' | 'medium' | 'high';
  issue_ids?: string[];
}

export interface HealthResult {
  health_score: number;
  health_level: 'healthy' | 'at_risk' | 'critical';
  dimensions: Record<string, number>;
  summary: string;
  recommendations: string[];
  // LLM now returns structured risk objects with issue_ids; legacy caches hold plain strings
  risks: Array<string | HealthRisk>;
  trend: 'improving' | 'stable' | 'declining';
  cached_at: string;
  stale?: boolean;
  /** Present when the LLM call failed (bad/expired API key, quota, ...) —
   *  the card still shows rule-based estimates, but the reason is surfaced. */
  llm_error?: string;
  /** L3a rule-based weight suggestion (docs/health-dim-weights-design.md).
   *  Suggested 6-dim weights (integers summing to 100) + verifiable reasons. */
  suggested_weights?: Record<string, number>;
  weight_reasons?: string[];
  suggestion_source?: 'rules' | 'llm';
}

export interface IssueRiskResult {
  risk_score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  root_cause: string;
  estimated_effort: string;
  suggested_assignee_skill: string;
  related_patterns: string[];
}

export interface AnalysisTask {
  task_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress_percent: number;
  result: HealthResult | null;
}

export interface AiSummaryResult {
  tier1_my: { title: string; open_count: number; high_priority: string[]; blocked: string[]; recommendation: string };
  tier2_my: { title: string; completed_count: number; story_points: number; strengths: string[]; improvements: string[]; recommendation: string };
  tier1_team?: { title: string; open_total: number; high_count: number; unassigned: number; overdue: number; recommendation: string };
  tier2_team?: { title: string; completed_count: number; story_points: number; strengths: string[]; improvements: string[]; bottlenecks: string[] };
  tier3?: { title: string; project_count: number; summaries: Array<{ name: string; key: string; health: number | null; status: string }>; recommendation: string };
  is_pm: boolean;
  generated_at: string;
  model_used: string;
  stale?: boolean;
  error?: string;
}

export interface ReportRequest {
  project_id: string;
  report_type: 'daily' | 'weekly' | 'monthly' | 'sprint_review';
  prompt?: string;
}

export const aiApi = {
  // Health check
  getMyHealthScore: async (userId: string, projectId?: string, refresh = false): Promise<ApiResponse<HealthResult>> => {
    const token = useAuthStore.getState().accessToken;
    const tenantId = useAuthStore.getState().currentTenant?.id;
    const lang = useAuthStore.getState().user?.aiLanguage || 'en';
    const qs = [projectId && `project_id=${projectId}`, refresh && 'refresh=true', `lang=${lang}`].filter(Boolean).join('&');
    const url = `/api/v1/ai/my-health-score${qs ? '?' + qs : ''}`;
    const resp = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(tenantId && { 'X-Tenant-Id': tenantId }),
      },
    });
    if (!resp.ok) throw new Error(`Health score API error: ${resp.status}`);
    const json = await resp.json();
    return { code: resp.status, message: 'ok', data: json };
  },

  getMyHealthTrend: async (userId: string, days = 30, projectId?: string): Promise<ApiResponse<{
    snapshots: Array<{ score: number; level: string; time: string }>;
    current?: { score: number };
    trend: 'improving' | 'declining' | 'stable';
  }>> => {
    const token = useAuthStore.getState().accessToken;
    const tenantId = useAuthStore.getState().currentTenant?.id;
    const qs = [`days=${days}`, projectId && `project_id=${projectId}`].filter(Boolean).join('&');
    const resp = await fetch(`/api/v1/ai/my-health-trend?${qs}`, {
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(tenantId && { 'X-Tenant-Id': tenantId }),
      },
    });
    if (!resp.ok) throw new Error(`Health trend API error: ${resp.status}`);
    const json = await resp.json();
    return { code: resp.status, message: 'ok', data: json };
  },

  getMyProjectsHealth: async (userId: string): Promise<ApiResponse<{
    projects: Array<{
      id: string; name: string; key: string; phase: string | null;
      myRole: string | null;
      healthScore: number | null; dimensions: Record<string, number>;
      openIssues: number; doneIssues: number; totalIssues: number;
      completionPct: number; criticalOpen: number; highOpen: number; myOpen: number;
      analyzedAt: string | null;
    }>;
  }>> => {
    const token = useAuthStore.getState().accessToken;
    const tenantId = useAuthStore.getState().currentTenant?.id;
    const resp = await fetch('/api/v1/ai/my-projects-health', {
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(tenantId && { 'X-Tenant-Id': tenantId }),
      },
    });
    if (!resp.ok) throw new Error(`Projects health API error: ${resp.status}`);
    const json = await resp.json();
    return { code: resp.status, message: 'ok', data: json };
  },

  getMySummary: async (userId: string, refresh = false): Promise<ApiResponse<AiSummaryResult>> => {
    const token = useAuthStore.getState().accessToken;
    const tenantId = useAuthStore.getState().currentTenant?.id;
    const lang = useAuthStore.getState().user?.aiLanguage || 'en';
    const qs = [refresh && 'refresh=true', `lang=${lang}`].filter(Boolean).join('&');
    const url = `/api/v1/ai/my-summary${qs ? '?' + qs : ''}`;
    const resp = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(tenantId && { 'X-Tenant-Id': tenantId }),
      },
    });
    if (!resp.ok) throw new Error(`Summary API error: ${resp.status}`);
    const json = await resp.json();
    return { code: resp.status, message: 'ok', data: json };
  },

  getProjectHealth: async (projectId: string, refresh = false): Promise<ApiResponse<HealthResult>> => {
    const token = useAuthStore.getState().accessToken;
    const tenantId = useAuthStore.getState().currentTenant?.id;
    const lang = useAuthStore.getState().user?.aiLanguage || 'en';
    const qs = [`project_id=${projectId}`, refresh && 'refresh=true', `lang=${lang}`].filter(Boolean).join('&');
    const resp = await fetch(`/api/v1/ai/project-health?${qs}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(tenantId && { 'X-Tenant-Id': tenantId }),
      },
    });
    if (!resp.ok) throw new Error(`Project health API error: ${resp.status}`);
    const json = await resp.json();
    return { code: resp.status, message: 'ok', data: json };
  },

  getProjectRisk: async (projectId: string, refresh = false): Promise<ApiResponse<{ risk_score: number; risk_level: string; risks: Array<{ level: string; description: string; impact: string; mitigation: string }>; stale?: boolean; cached_at?: string }>> => {
    const token = useAuthStore.getState().accessToken;
    const tenantId = useAuthStore.getState().currentTenant?.id;
    const lang = useAuthStore.getState().user?.aiLanguage || 'en';
    const qs = [`project_id=${projectId}`, refresh && 'refresh=true', `lang=${lang}`].filter(Boolean).join('&');
    const resp = await fetch(`/api/v1/ai/project-risk?${qs}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(tenantId && { 'X-Tenant-Id': tenantId }),
      },
    });
    if (!resp.ok) throw new Error(`Project risk API error: ${resp.status}`);
    const json = await resp.json();
    return { code: resp.status, message: 'ok', data: json };
  },

  analyzeHealth: (projectId: string) =>
    http.post<ApiResponse<{ task_id: string }>>('/ai/analyze-project-health', { project_id: projectId }),

  getAnalysisTask: (taskId: string) =>
    http.get<ApiResponse<AnalysisTask>>(`/ai/analysis-tasks/${taskId}`),

  getHealthCache: (projectId: string) =>
    http.get<ApiResponse<HealthResult>>(`/ai/cache/health/${projectId}`),

  // Risk analysis
  detectRisks: (projectId: string) =>
    http.post<ApiResponse<{ task_id: string }>>('/ai/detect-risks', { project_id: projectId }),

  getIssueRisk: (issueId: string) =>
    http.get<ApiResponse<IssueRiskResult>>(`/ai/issues/${issueId}/risk`),

  // Reports — ai-brain for generation, Java for CRUD
  generateReport: (req: ReportRequest) =>
    http.post<ApiResponse<{ task_id: string }>>('/ai/reports/generate', req),

  listReports: (projectId: string, params?: { status?: string; tab?: string; page?: number }) =>
    http.get<ApiResponse<Report[]>>('/reports', { params: { projectId, ...params } }),

  saveReport: (data: { title: string; reportType: string; projectId: string; content: string }) =>
    http.post<ApiResponse<{ id: string }>>('/reports', data),

  // MCP
  getMcpAuditLog: (params?: { status?: string; agent?: string; days?: number }) =>
    http.get<ApiResponse<McpAuditEntry[]>>('/mcp/audit', { params }),
};

// SMTP Config
export interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  starttls: boolean;
  fromName: string;
}

export interface SmtpPreset {
  host: string;
  port: number;
  starttls: boolean;
  description: string;
}

export const smtpApi = {
  getConfig: () =>
    http.get<ApiResponse<{ config: SmtpConfig; presets: Record<string, SmtpPreset>; is_configured: boolean }>>('/admin/smtp'),
  updateConfig: (config: SmtpConfig) =>
    http.put<ApiResponse<SmtpConfig>>('/admin/smtp', config),
  testConnection: (config: SmtpConfig) =>
    http.post<ApiResponse<string>>('/admin/smtp/test', config),
};

export interface Report {
  id: string;
  title: string;
  type: string;
  content: string;
  project_id: string;
  created_by: string;
  created_at: string;
}

export interface McpAuditEntry {
  id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  status: 'approved' | 'denied' | 'expired';
  result: Record<string, unknown> | null;
  confirmed_by: string;
  created_at: string;
}
