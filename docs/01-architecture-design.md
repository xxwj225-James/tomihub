# AI-Enabled Project Management System — Software Architecture Design

> **Codename**: AI-PM (AI-Powered Project Manager)
> **Version**: v1.0.0
> **Date**: 2026-06-06
> **Design principles**: Separation of concerns, non-intrusive AI integration, progressive enhancement, multi-tenant first

---

## Table of Contents

1. [Overall Architecture](#1-overall-architecture)
2. [Technology Stack](#2-technology-stack)
3. [Layered System Architecture](#3-layered-system-architecture)
4. [Microservice Breakdown](#4-microservice-breakdown)
5. [AI Brain Design](#5-ai-brain-design)
6. [Data Model Design](#6-data-model-design)
7. [Multi-Tenant Architecture](#7-multi-tenant-architecture)
8. [Communication Mechanisms](#8-communication-mechanisms)
9. [Security Architecture](#9-security-architecture)
10. [Deployment Architecture](#10-deployment-architecture)

---

## 1. Overall Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (TypeScript + React)                   │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Dashboard│  │  Kanban  │  │  Issues   │  │  Reports │  │  Admin   │ │
│  │AI Insight│  │  Board   │  │List/Detail│  │ (AI Gen) │  │   Panel  │ │
│  └──────────┘  └──────────┘  └───────────┘  └──────────┘  └──────────┘ │
└────────────────────────────┬────────────────────────────────────────────┘
                             │  HTTPS / WSS / gRPC
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      API GATEWAY (Spring Cloud Gateway)                  │
│Auth/JWT │ Rate limit / breaker │ Routing │ Request log │ WebSocket proxy│
└────────────────────────────┬────────────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ Java Business │   │Python AI Brain│   │ Data Backend  │
│ (Spring Boot)  │   │   (FastAPI)    │   │  (Supabase)   │
│               │   │               │   │               │
│• User / Tenant│   │• Health mon.  │   │• PostgreSQL   │
│• Permissions  │   │• Risk pred.   │   │• Realtime     │
│• Workflow eng.│   │• Bug trends   │   │• File storage │
│• Issue CRUD   │   │• Resource opt.│   │• User auth    │
│• Notifications│   │• AI Reports   │   │• Row Level    │
│• Webhook      │   │• Daily digest │   │  Security     │
│               │   │• NLP analysis │   │               │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│    Redis     │   │ Elasticsearch│   │ RabbitMQ /   │
│Cache/Session │   │Full-text search│   │   Kafka      │
└──────────────┘   └──────────────┘   └──────────────┘
```

### Core Architecture Philosophy

| Role | Technology | Responsibility | Analogy |
|------|------|------|------|
| **Skeleton** | Java / Spring Boot | Traditional business logic: CRUD, permissions, workflows | The bones and muscles of the human body |
| **Brain** | Python / FastAPI | AI computation: analysis, prediction, generation | The nervous system of the human body |
| **Senses** | React / TypeScript | User interaction, data display, boards | The five senses of the human body |
| **Blood** | Supabase / Redis / MQ | Data storage, caching, messaging | The blood circulation of the human body |

---

## 2. Technology Stack

### 2.1 Java Business Skeleton

| Component | Technology | Version | Description |
|------|------|------|------|
| Framework | Spring Boot | 3.3.x | Core business framework |
| Microservice governance | Spring Cloud | 2024.x | Gateway, Config, Registry |
| Service registry | Nacos / Consul | 2.x | Service discovery and configuration center |
| ORM | MyBatis-Plus / JPA | 3.5.x | Database access |
| Permissions | Sa-Token | 1.38+ | Lightweight RBAC permission framework |
| Workflow | Flowable / Camunda | 7.x | Process engine (Kanban status transitions) |
| API docs | SpringDoc (OpenAPI 3) | 2.6+ | Automatic API documentation generation |
| Message queue | RabbitMQ | 3.13 | Async tasks, event-driven |
| Cache | Redis + Caffeine | 7.x | Multi-level cache |
| Search engine | Elasticsearch | 8.x | Full-text search of Issues |
| Object storage | MinIO / Supabase Storage | - | File attachment storage |
| Monitoring | Micrometer + Prometheus | - | Metrics collection |

### 2.2 Python AI Brain

| Component | Technology | Version | Description |
|------|------|------|------|
| Framework | FastAPI | 0.115+ | High-performance async API |
| Async tasks | Celery + Redis | 5.x | Background AI task scheduling |
| LLM gateway | LiteLLM | latest | Unified multi-model access (OpenAI/Claude/local models) |
| Vector database | pgvector / Milvus | - | Semantic search, knowledge base |
| NLP | spaCy / transformers | - | Text analysis |
| Data analysis | pandas / numpy | - | Data processing |
| Report generation | WeasyPrint / ReportLab | - | PDF report generation |
| MCP protocol | mcp-python-sdk | - | Standardization of AI tool invocation |
| Model serving | vLLM / Ollama | - | Local model inference (optional) |

### 2.3 Frontend

| Component | Technology | Version | Description |
|------|------|------|------|
| Framework | React | 19.x | UI framework |
| Types | TypeScript | 5.x | Type safety |
| Styling | Tailwind CSS | 4.x | Atomic CSS |
| State management | Zustand / Jotai | - | Lightweight state management |
| Board | @dnd-kit / pragma-drag | - | Drag-and-drop sorting |
| Charts | ECharts / Recharts | - | Data visualization |
| HTTP | TanStack Query | 5.x | Server state management |
| WebSocket | Centrifuge / Socket.io | - | Real-time communication |
| Rich text | Tiptap / Plate | - | Editor |
| Routing | TanStack Router | - | Type-safe routing |

### 2.4 Data Foundation

| Component | Technology | Description |
|------|------|------|
| Database | Supabase (PostgreSQL 16) | Primary database + realtime subscriptions |
| Authentication | Supabase Auth (GoTrue) | Multi-tenant user authentication |
| Storage | Supabase Storage | File attachments |
| Realtime | Supabase Realtime | WebSocket push |
| Security | Row Level Security (RLS) | Row-level multi-tenant isolation |

---

## 3. Layered System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Presentation Layer                        │
│  React Components → Pages → Layouts → Hooks → State              │
├──────────────────────────────────────────────────────────────────┤
│                          Gateway Layer                           │
│  Spring Cloud Gateway → Auth Filter → Rate Limiter → Router      │
├────────────┬─────────────────────────────────┬───────────────────┤
│ Business  │        AI Service Layer         │ Integration Layer  │
│ (Java)    │         (Python)                │   (BaaS)           │
│           │                                │                    │
│ Auth Svc  │  Health Monitor Service         │  Supabase Auth     │
│ Tenant    │  Risk Analysis Service          │  Supabase DB       │
│ Core Svc★ │  Report Generation Service      │  Supabase Storage  │
│ Notify    │  Daily Digest Service           │  Supabase Realtime │
│ Webhook   │  Search & Recommendation Svc    │                    │
│           │                                 │ ★ = merged / fixed │
│           │                                 │[corrections](./04- │
│           │  WBS Decomposition Svc          │  architecture-     │
│           │  Sprint Planning Svc            │  fixes.md)         │
│           │  MCP Server                     │                    │
├────────────┴─────────────────────────────────┴───────────────────┤
│                          Infrastructure                          │
│  Redis │ RabbitMQ │ Elasticsearch │ MinIO │ Prometheus │ Nginx   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. Microservice Breakdown

### 4.1 Java Microservice Detailed Design (v2.0 Revised)

> **Important correction**: Board/Issue/Sprint/Workflow/Project merged into `ai-pm-core`.
> Reason: Kanban drag-and-drop involves Issue status changes + column ordering + Sprint burndown + Workflow validation;
> spreading these across 4 services would lead to a distributed transaction disaster. See [Architecture Correction Document](./04-architecture-fixes.md).

```
ai-pm-services/                  # 6 services (down from 10)
├── ai-pm-gateway/              # API Gateway
│   ├── Route config (dynamic routing)
│   ├── JWT / API Key / OAuth2 auth
│   ├── Tenant context extraction & passthrough
│   ├── TraceId injection & end-to-end tracing
│   ├── Rate limiting / circuit breaking (Sentinel)
│   └── CORS handling
│
├── ai-pm-auth/                 # Auth & authorization service
│   ├── Email signup (verification code)
│   ├── Email login
│   ├── JWT issuance & refresh (RS256)
│   ├── API Key management & validation
│   ├── OAuth2 Device Flow
│   ├── Session management & device list
│   └── Audit log (login/logout/failure)
│
├── ai-pm-tenant/               # Multi-tenant management service
│   ├── Tenant creation & configuration
│   ├── Tenant member management
│   ├── Subscription / billing
│   └── Tenant-level settings
│
├── ai-pm-core/  ★ Core service (5 domains merged)
│   ├── Issue CRUD & type system (Epic→Story→Task→Bug→Sub-task)
│   ├── Issue tree hierarchy (parent_id, WBS)
│   ├── Issue links (blocks/relates/duplicates)
│   ├── Comments & attachments & change history
│   ├── Board (Kanban/Scrum, Column/WIP/Swimlane)
│   ├── Board card ordering & drag-position persistence
│   ├── Sprint CRUD & planning & burndown chart
│   ├── Workflow state machine engine & transition validation
│   ├── Project CRUD & members & milestones
│   └── ★ All of the above share one DB, one transaction context
│
├── ai-pm-notification/         # Notification service
│   ├── In-app notifications
│   ├── Email notifications
│   ├── WebSocket push
│   └── Notification preferences
│
├── ai-pm-webhook/              # Webhook service
│   ├── Webhook registration management
│   ├── Event triggering & delivery
│   ├── Retry mechanism
│   └── Delivery log
│
└── ai-pm-log/  ★ Log management service (new)
    ├── Log collection (ELK + Loki)
    ├── Log levels (TRACE/DEBUG/INFO/WARN/ERROR/FATAL)
    ├── Audit log persistence
    ├── AI token usage statistics
    └── Alert rule engine (Kibana Alerting)
```

### 4.2 Service-to-Service Call Relationships (v2.0 Revised)

```
Gateway
  ├── → auth (authentication)
  ├── → tenant (tenant management)
  ├── → core (core business) ★
  │      ├── Issue CRUD (aggregate root)
  │      ├── Board + Card (views of Issues)
  │      ├── Sprint (grouping of Issues)
  │      ├── Workflow (state machine)
  │      ├── Project (project management)
  │      └── ★ All in-process calls; no distributed transactions
  ├── → notification (notification management)
  ├── → webhook (Webhook management)
  └── → ai-brain (AI analysis requests) ★ must be async
         ├── Submit task → RabbitMQ → Python Celery Worker
         ├── On completion → WebSocket push result
         └── Frontend polls GET /ai/analysis-tasks/{taskId}
```

---

## 5. AI Brain Design

### 5.1 AI Service Detailed Architecture

```
ai-pm-brain/
├── api/                         # FastAPI routes
│   ├── health_monitor.py        # Project health monitoring API
│   ├── risk_analysis.py         # Risk analysis API
│   ├── report_generator.py      # Report generation API
│   ├── daily_digest.py          # Daily digest API
│   ├── resource_optimizer.py    # Resource optimization API
│   └── search_assistant.py      # Intelligent search API
│
├── agents/                      # AI Agent definitions
│   ├── project_health_agent.py  # Health assessment Agent
│   ├── risk_detector.py         # Risk detection Agent
│   ├── bug_triage_agent.py      # Bug triage Agent
│   ├── report_writer.py         # Report-writing Agent
│   └── daily_briefing.py        # Daily briefing Agent
│
├── models/                      # Data models & Prompts
│   ├── prompts/                 # Prompt templates
│   │   ├── health_check.jinja2
│   │   ├── risk_report.jinja2
│   │   ├── daily_digest.jinja2
│   │   └── sprint_review.jinja2
│   └── schemas/                 # Structured-output Schemas
│       ├── health_score.py
│       ├── risk_item.py
│       └── report_section.py
│
├── services/                    # Business logic
│   ├── llm_gateway.py           # LLM unified gateway
│   ├── data_fetcher.py          # Fetch data from Java services
│   ├── embedding_service.py     # Vector embedding service
│   └── scheduler.py             # Scheduled task scheduler
│
└── tasks/                       # Celery async tasks
    ├── generate_daily_report.py
    ├── analyze_project_health.py
    ├── detect_risks.py
    └── optimize_sprint.py
```

### 5.2 AI Core Capability Matrix

| AI Capability | Input | Processing | Output | Trigger |
|---------|------|----------|------|----------|
| **Project health monitoring** | Issue data, Sprint progress, member activity | Multi-dimensional weighted scoring + LLM analysis | Health score, alert level, improvement suggestions | Scheduled daily / Manual |
| **Risk prediction** | Overdue Issues, Bug backlog, personnel changes | Rules engine + ML model + LLM reasoning | Risk list, impact assessment, mitigation plans | Realtime / Scheduled |
| **Bug trend analysis** | Bug creation/closure curves, severity distribution | Time-series analysis + LLM summarization | Trend charts, root-cause analysis, improvement suggestions | Weekly |
| **Resource optimization** | Member workload, skill matrix, Issue assignments | Constraint solving + LLM suggestions | Optimized allocation plan, overload alerts | At Sprint planning |
| **Intelligent report generation** | Full project data | LLM multi-step reasoning + template filling | Markdown/PDF reports | Manual / Scheduled |
| **Daily work digest** | Member activity of the day (commit/issue/comment) | LLM summarization + structured output | Individual digest / Team digest | Daily at 18:00 |
| **Intelligent search** | Natural language queries | Embedding + RAG | Relevant Issues/documents/code | Realtime |
| **Sentiment analysis** | Comment content | NLP sentiment analysis + LLM | Sentiment trends, conflict alerts | Realtime |

### 5.3 LLM Invocation Strategy

```
User request
    │
    ▼
┌─────────────────────────────────────────┐
│           LLM Gateway (LiteLLM)          │
│                                          │
│  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │   Fast   │  │ Standard │  │  Deep  │ │
│  │          │  │          │  │        │ │
│  │ Haiku    │  │ Sonnet   │  │ Opus   │ │
│  │ GPT-4o-mini│ │ GPT-4o   │  │ GPT-5  │ │
│  │  Small   │  │  Medium  │  │ Large  │ │
│  └──────────┘  └──────────┘  └────────┘ │
│                                          │
│  Strategy:                              │
│  1. Simple classify/summarize → fast    │
│  2. Code analysis / report → standard   │
│  3. Architecture/risk assessment → deep │
│  4. Auto-degrade path: opus→sonnet→haiku│
│  5. Prefer local models (cost control)  │
└─────────────────────────────────────────┘
```

---

## 6. Data Model Design

### 6.1 Core Entity Relationship Diagram

```
┌──────────┐       ┌──────────┐       ┌──────────┐
│  Tenant  │ 1───N │  Project │ 1───N │  Sprint  │
│  (Org)   │       │(Project) │       │ (Sprint) │
└────┬─────┘       └────┬─────┘       └──────────┘
     │                  │
     │ 1                │ 1
     │                  │
     ▼ N                ▼ N
┌──────────┐       ┌──────────┐       ┌──────────┐
│   User   │ N───M │  Issue   │ N───1 │ Workflow │
│  (User)  │       │ (Issue)  │       │(Workflow)│
└────┬─────┘       └────┬─────┘       └──────────┘
     │                  │
     │ 1                │ 1
     │                  │
     ▼ N                ▼ N
┌──────────┐       ┌──────────┐
│  Comment │       │Attachment│
│(Comment) │       │  (File)  │
└──────────┘       └──────────┘
```

### 6.2 Core Table Structures

```sql
-- ===== Tenants & Users =====

-- Tenant (organization / workspace)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    logo_url TEXT,
    plan VARCHAR(50) DEFAULT 'free',          -- free/pro/enterprise
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User (globally unique; may belong to multiple tenants)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    email_verified BOOLEAN DEFAULT FALSE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tenant membership relation
CREATE TABLE tenant_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'member', -- owner/admin/member/viewer
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, user_id)
);

-- Email verification code
CREATE TABLE email_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    code VARCHAR(6) NOT NULL,
    purpose VARCHAR(20) NOT NULL,              -- register/login/reset_password
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Refresh token
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    device_info JSONB DEFAULT '{}',
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== Projects =====

-- Project
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key VARCHAR(10) NOT NULL,                  -- Project key, e.g. "PROJ"
    description TEXT,
    lead_id UUID REFERENCES users(id),
    visibility VARCHAR(20) DEFAULT 'private',   -- private/internal/public
    status VARCHAR(20) DEFAULT 'active',        -- active/archived/completed
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, key)
);

-- Project members
CREATE TABLE project_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'member', -- lead/developer/reviewer/viewer
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);

-- ===== Issues =====

-- Workflow definition
CREATE TABLE workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    states JSONB NOT NULL,                     -- [{key, name, category(todo/in_progress/done)}]
    transitions JSONB NOT NULL,                -- [{from, to, name, conditions, validators}]
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Issue types
CREATE TABLE issue_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,                 -- Bug/Task/Story/Epic/Sub-task
    icon VARCHAR(50),
    color VARCHAR(7),
    hierarchy_level INT DEFAULT 0,             -- 0=Epic, 1=Story, 2=Task/Bug, 3=Sub-task
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Issue (core table)
CREATE TABLE issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    workflow_id UUID NOT NULL REFERENCES workflows(id),

    -- Identifiers
    issue_number INT NOT NULL,                 -- Auto-increment number within the project
    title VARCHAR(500) NOT NULL,
    description TEXT,

    -- Classification
    type_id UUID REFERENCES issue_types(id),
    status VARCHAR(50) NOT NULL,               -- Current status (matches workflow states.key)
    priority VARCHAR(20) DEFAULT 'medium',     -- critical/high/medium/low
    severity VARCHAR(20),                      -- Severity (for Bugs)

    -- People
    assignee_id UUID REFERENCES users(id),
    reporter_id UUID NOT NULL REFERENCES users(id),

    -- Planning
    sprint_id UUID,                            -- Linked Sprint
    parent_id UUID REFERENCES issues(id),      -- Parent Issue (hierarchy)
    story_points DECIMAL(3,1),

    -- Time
    due_date DATE,
    started_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,

    -- Ordering
    sort_order INT DEFAULT 0,

    -- Extensions
    labels TEXT[] DEFAULT '{}',
    custom_fields JSONB DEFAULT '{}',
    ai_tags TEXT[] DEFAULT '{}',               -- AI auto tags
    ai_risk_score DECIMAL(3,2),                -- AI risk score

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, issue_number)
);

-- Issue link relations
CREATE TABLE issue_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    link_type VARCHAR(20) NOT NULL,            -- blocks/is_blocked_by/relates_to/duplicates
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(source_id, target_id, link_type)
);

-- Issue comments
CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    ai_sentiment VARCHAR(20),                  -- AI sentiment analysis: positive/neutral/negative
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Issue change history
CREATE TABLE issue_changelog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    changed_by UUID NOT NULL REFERENCES users(id),
    field VARCHAR(50) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Attachments
CREATE TABLE attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    uploader_id UUID NOT NULL REFERENCES users(id),
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    content_type VARCHAR(100),
    storage_path TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== Sprints =====

CREATE TABLE sprints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    goal TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'planning',     -- planning/active/completed/cancelled
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== Notifications =====

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES users(id),
    type VARCHAR(50) NOT NULL,                 -- issue_assigned/mentioned/status_changed/...
    title VARCHAR(255) NOT NULL,
    body TEXT,
    resource_type VARCHAR(50),                 -- issue/comment/project/sprint
    resource_id UUID,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== AI analysis records =====

CREATE TABLE ai_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    analysis_type VARCHAR(50) NOT NULL,        -- health_check/risk_scan/daily_report/sprint_review
    input_summary TEXT,
    result JSONB NOT NULL,
    model_used VARCHAR(100),
    tokens_used INT,
    cost DECIMAL(10,6),
    triggered_by UUID REFERENCES users(id),    -- NULL means a scheduled trigger
    status VARCHAR(20) DEFAULT 'completed',    -- pending/processing/completed/failed
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 7. Multi-Tenant Architecture

### 7.1 Isolation Strategy: Shared Database + RLS (Row Level Security)

```
┌──────────────────────────────────────────────┐
│              PostgreSQL (Supabase)            │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Tenant A │  │ Tenant B │  │ Tenant C │   │
│  │ (RLS)    │  │ (RLS)    │  │ (RLS)    │   │
│  │          │  │          │  │          │   │
│  │User data │  │User data │  │User data │   │
│  │Proj. data│  │Proj. data│  │Proj. data│   │
│  │ Issue   │  │ Issue   │  │ Issue   │   │
│  └──────────┘  └──────────┘  └──────────┘   │
│                                              │
│  Same table; tenant_id + RLS isolation       │
└──────────────────────────────────────────────┘
```

### 7.2 RLS Policy Examples

```sql
-- Enable RLS
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;

-- Policy: users can only see their own tenant's data
CREATE POLICY "tenant_isolation" ON issues
    FOR ALL
    USING (tenant_id IN (
        SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    ));

-- Policy: project-level isolation
CREATE POLICY "project_access" ON issues
    FOR SELECT
    USING (project_id IN (
        SELECT project_id FROM project_members WHERE user_id = auth.uid()
    ));
```

### 7.3 Tenant Context Propagation

```
Request → Gateway parses JWT (contains tenant_id)
         → Inject X-Tenant-Id into the header
         → Each microservice extracts it from the header
         → DB queries auto-append the tenant_id condition
         → AI services get tenant context from Java services
```

---

## 8. Communication Mechanisms

### 8.1 Synchronous Communication

```
Frontend ←──── REST / GraphQL ────→ Java microservices
Java Svc  ←──── OpenFeign ────→ Java Svc (internal)
Java Svc  ←──── gRPC ────→ Python AI services (high performance)
```

### 8.2 Asynchronous Communication

```
Events: Issue created / status changed / commented / Sprint completed
       │
       ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  RabbitMQ   │────→│Java consumer│────→│Notify/Webhook│
│  Exchange   │     └─────────────┘     └─────────────┘
│             │     ┌─────────────┐
│             │────→│Python consumer│────→ AI analysis
└─────────────┘     └─────────────┘
```

### 8.3 Event Bus Design

| Event | Producer | Consumer | Handling |
|------|--------|--------|------|
| `issue.created` | Issue Service | Notification Svc, Webhook Svc | Send notifications/callbacks |
| `issue.status_changed` | Workflow Service | Notification Svc, AI Brain | Notification + health check |
| `issue.assigned` | Issue Service | Notification Svc | Notify the assignee |
| `issue.commented` | Issue Service | Notification Svc, AI Brain | Notification + sentiment analysis |
| `sprint.completed` | Project Service | AI Brain | Generate Sprint review report |
| `member.joined` | Tenant Service | Notification Svc | Welcome notification |
| `daily.checkin` | Scheduled trigger | AI Brain | Generate daily digest |

---

## 9. Security Architecture

### 9.1 Authentication Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Browser  │────→│ Gateway  │────→│ Auth Svc │────→│ Supabase │
│          │     │          │     │          │     │   Auth   │
│   POST   │     │ Routing  │     │ Validate │     │Verify pwd│
│  /login  │     │          │     │Issue JWT │     │          │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
     │
     │  ← JWT (Access Token + Refresh Token)
     ▼
┌──────────┐
│  Browser  │  Cookie/Storage stores Token
└──────────┘
```

### 9.2 JWT Design

```json
{
  "header": {
    "alg": "RS256",
    "typ": "JWT"
  },
  "payload": {
    "sub": "user-uuid",
    "email": "user@example.com",
    "tenant_id": "current-tenant-uuid",
    "tenant_ids": ["t1", "t2"],
    "roles": ["admin", "member"],
    "permissions": ["issue:create", "issue:delete", "project:manage"],
    "iat": 1717600000,
    "exp": 1717603600
  }
}
```

### 9.3 Security Measures Checklist

- [ ] JWT RS256 asymmetric signing (public/private key)
- [ ] Short-lived Access Token (15 minutes) + long-lived Refresh Token (7 days)
- [ ] Refresh Token rotation (old token invalidated after each refresh)
- [ ] Passwords hashed with BCrypt/Argon2
- [ ] API rate limiting (IP-level + user-level)
- [ ] CORS whitelist
- [ ] SQL injection protection (MyBatis-Plus parameterized queries)
- [ ] XSS filtering
- [ ] CSRF Token
- [ ] Audit log for sensitive operations
- [ ] RLS row-level security (database layer)
- [ ] Full-site HTTPS encryption

---

## 10. Deployment Architecture

### 10.1 Development Environment

```
┌─────────────────────────────────────────────────┐
│          Docker Compose (Development)           │
│                                                  │
│  ┌────────┐  ┌────────┐  ┌─────────┐  ┌───────┐ │
│  │ Java   │  │ Python  │  │ React   │  │ Redis │ │
│  │ :8080  │  │ :8000   │  │ :3000   │  │ :6379 │ │
│  └────────┘  └────────┘  └─────────┘  └───────┘ │
│  ┌────────┐  ┌────────┐  ┌────────────────────┐ │
│  │Postgres│  │ RabbitMQ│  │ Supabase (Cloud)   │ │
│  │ :5432  │  │ :5672  │  │  or Supabase CLI   │ │
│  └────────┘  └────────┘  └────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### 10.2 Production Environment

```
┌──────────────────────────────────────────────────────────────────┐
│                     Kubernetes (Production)                      │
│                                                                   │
│  ┌─────────────────────┐  ┌─────────────────────┐                │
│  │   Java Services      │  │   Python AI Brain    │                │
│  │   (Deployment × 3)  │  │   (Deployment × 2)  │                │
│  │   HPA: CPU 70%      │  │   HPA: GPU 60%      │                │
│  └─────────────────────┘  └─────────────────────┘                │
│                                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │ Supabase │  │  Redis   │  │RabbitMQ  │  │Elastic   │         │
│  │ (Cloud)  │  │ Cluster  │  │ Cluster  │  │ Cluster  │         │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘         │
│                                                                   │
│  ┌──────────────────────────────────────────────────────┐        │
│  │              Nginx Ingress + Cert-Manager             │        │
│  │              (SSL Termination + Routing)              │        │
│  └──────────────────────────────────────────────────────┘        │
└──────────────────────────────────────────────────────────────────┘
```

---

## Appendix: Project Directory Structure

```
ai-pm/
├── docs/                          # Design docs
│   ├── 01-architecture-design.md
│   ├── 02-login-module-design.md
│   ├── 03-communication-and-agent-integration.md  ★
│   ├── 04-api-specification.md
│   └── 05-ai-brain-design.md
│
├── backend/                       # Java business skeleton
│   ├── ai-pm-common/              # Common module
│   ├── ai-pm-gateway/             # API Gateway
│   ├── ai-pm-auth/                # Auth & authorization
│   ├── ai-pm-tenant/              # Multi-tenant
│   ├── ai-pm-project/             # Project management
│   ├── ai-pm-issue/               # Issue management
│   ├── ai-pm-board/               # ★ Kanban service
│   ├── ai-pm-sprint/              # ★ Sprint / iteration
│   ├── ai-pm-workflow/            # Workflow engine
│   ├── ai-pm-notification/        # Notification service
│   └── ai-pm-webhook/             # Webhook
│
├── ai-brain/                      # Python AI brain
│   ├── api/
│   ├── agents/
│   ├── models/
│   ├── services/
│   ├── tasks/
│   └── tests/
│
├── frontend/                      # React frontend
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── stores/
│   │   ├── api/
│   │   └── types/
│   └── public/
│
├── supabase/                      # Supabase configuration
│   ├── migrations/
│   └── seed.sql
│
├── docker/                        # Docker configuration
├── k8s/                           # Kubernetes configuration
├── docker-compose.yml
└── Makefile
```

---

## Next Steps

- [ ] [Login Module Detailed Design](./02-login-module-design.md)
- [ ] API interface specification
- [ ] AI Brain detailed design
- [ ] Database migration scripts
- [ ] Project scaffolding setup
