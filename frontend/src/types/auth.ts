// ─── Auth Types ───

export interface UserVO {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  jobTitle?: string;
  skills?: string;
  gender?: string;
  aiLanguage?: string;
  uiLanguage?: string;
  onboardingCompleted?: boolean;
  invited?: boolean;
}

export interface TenantVO {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  role: 'owner' | 'admin' | 'member' | 'viewer';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

export interface AuthResponse {
  user: UserVO;
  tokens: TokenPair;
  tenants: TenantVO[];
  currentTenant: TenantVO | null;
  requireTenantSelection: boolean;
  isFirstUser?: boolean;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

// ─── Issue Types ───

export type IssueType = 'epic' | 'story' | 'task' | 'bug' | 'sub_task';
export type IssuePriority = 'critical' | 'high' | 'medium' | 'low';
export type IssueStatus = 'open' | 'in_progress' | 'in_review' | 'done' | 'cancelled';

export interface IssueSummary {
  id: string;
  key: string;
  title: string;
  type: IssueType;
  status: IssueStatus;
  priority: IssuePriority;
  assignee_name: string;
  story_points: number | null;
  created_at: string;
}

export interface IssueDetail extends IssueSummary {
  description: string;
  project_id: string;
  project_name: string;
  parent_id: string | null;
  sprint_id: string | null;
  labels: string[];
  due_date: string | null;
  started_at: string | null;
  resolved_at: string | null;
  comments: Comment[];
  attachments: Attachment[];
}

export interface Comment {
  id: string;
  author_name: string;
  author_avatar: string | null;
  body: string;
  created_at: string;
}

export interface Attachment {
  id: string;
  file_name: string;
  file_size: number;
  content_type: string;
  url: string;
}
