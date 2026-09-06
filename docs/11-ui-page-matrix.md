# UI Pages and View Matrix

> **Version**: v1.1
> **Date**: 2026-06-07
> **Status**: ✅ Confirmed

---

## 1. Global Navigation Structure

```
Sidebar
─────────────────
⚡ AI-PM
─────────────────
🏠 Home (Dashboard)

📁 Projects
    ├── 📋 Board          ← Kanban / Scrum toggle
    ├── 📝 Issues         ← Backlog + list merged
    ├── 🔄 Sprints        ← Active/history/burndown
    ├── 📅 Gantt
    │
    ├── 🤖 AI Analysis (AI)           ← ★ Project-level AI, nested under the project
    │   ├── 💚 Health Monitoring (Health)
    │   └── ⚠ Risk Assessment (Risks)
    │
    └── ⚙ Settings        ← Members/Workflow/Security levels/Webhooks
─────────────────
📋 AI Daily Digest        ← ★ Cross-project, standalone entry
📊 Reports
─────────────────
👥 Members                ← Admin
🔑 API Keys               ← Admin
─────────────────
🔔 Notifications / 👤 Profile / 🎨 Theme / 🌐 Language
```

### Where AI Appears

```
AI capability             Route                              Display location
────────────────────── ────────────────────────────────  ──────────────────────────
Project health monitor     /projects/:key/ai/health          Standalone AI page + D1 dashboard card
Project risk assessment    /projects/:key/ai/risks           Standalone AI page + D1 dashboard card
Issue-level risk + root cause analysis   (no standalone route)   ★ I2 inline in Issue detail
AI Daily Digest            /ai/daily-digest                  Standalone page (cross-project)
Sprint retrospective report  /reports/:id                      Report center
```

## 2. Complete Page Matrix

### 2.1 Auth — P0 — All implemented

| # | Page | Route | Description | Status |
|---|------|------|------|------|
| A1 | Login | `/login` | Email + password, remember me, multi-tenant picker | ✅ |
| A2 | Register | `/register` | Email → verification code → name → password | ✅ |
| A3 | Forgot Password | `/forgot-password` | Reset password via email verification code | ⚠️ Placeholder |
| A4 | Select Workspace | `/select-tenant` | Multi-tenant card list after login | ✅ |

### 2.2 Home Dashboard — P0

| # | Page | Route | Description | Content blocks |
|---|------|------|------|----------|
| D1 | **Workspace** | `/dashboard` | Personal work overview | ① My to-do Issue list (assigned to me, ordered by priority) ② Issues I created ③ Project card grid ④ AI summary card (today's work summary, risk alerts) |

### 2.3 Board — P0

| # | Page | Route | Description | Key components |
|---|------|------|------|----------|
| B1 | **Kanban Board** | `/projects/:key/board?view=kanban` | Drag-and-drop cards, grouped by status into columns, WIP limits, swimlanes | Board, Column, Card, Swimlane, QuickFilter |
| B2 | **Scrum Board** | `/projects/:key/board?view=scrum` | Sprint dimension + burndown overview | SprintBoard, SprintHeader, BurndownMini |
|  | | | ★ B1/B2 share the same page, toggled by the top SegmentedControl | BoardViewToggle |

### 2.4 Issues — P0 — ★ Backlog + Issue List merged

| # | Page | Route | Description | Layout |
|---|------|------|------|------|
| I1 | **Issue Management** | `/projects/:key/issues` | ★ Merged page: left Backlog panel + right list/board | **Left panel**: Backlog (Issues not assigned to a Sprint, drag-to-reorder) **Right panel**: Issue filter list + bulk actions bar |
| I2 | **Issue Detail** | `/projects/:key/issues/:id` | Title/description/comments/attachments/change history | IssueDetail → ★ AI inline: Issue risk assessment + root cause analysis |
| I3 | **Create Issue** | `/projects/:key/issues/new` | ★ Standalone page (not a modal/drawer) | IssueCreateForm (full-width editor) |
| I4 | **Edit Issue** | `/projects/:key/issues/:id/edit` | Same as create page, pre-filled data | IssueEditForm |

### 2.5 Sprint Management — P1

| # | Page | Route | Description | Key components |
|---|------|------|------|----------|
| S1 | **Active Sprint** | `/projects/:key/sprints/active` | Sprint progress, burndown chart, Issue list | SprintProgress, BurndownChart, SprintIssueList |
| S2 | **Sprint List** | `/projects/:key/sprints` | All sprints list, velocity statistics | SprintList, VelocityChart |

### 2.6 Gantt — P1

| # | Page | Route | Description | Key components |
|---|------|------|------|----------|
| G1 | **Gantt View** | `/projects/:key/gantt` | Timeline, Issue bars, dependency links, milestones | GanttChart, DependencyLine, MilestoneMarker |

### 2.7 Project Settings — P1

| # | Page | Route | Description | Key components |
|---|------|------|------|----------|
| PS1 | **Project Settings** | `/projects/:key/settings` | Basic info/Members/Workflow/Security levels/Webhooks | SettingsTabs, MemberTable, WorkflowEditor, SecurityLevelList |

### 2.8 AI Analysis — P1

| # | Page | Route | Description | Display location |
|---|------|------|------|----------|
| AI1 | **Project Health Monitor** | `/projects/:key/ai/health` | Health score dashboard, radar chart per dimension | ★ Nested under the project, standalone page |
| AI2 | **Project Risk Assessment** | `/projects/:key/ai/risks` | Risk list, probability/impact matrix | ★ Nested under the project, standalone page. Summary inlined into the D1 dashboard card |
| AI3 | **Issue AI Analysis** | (no standalone route) | Issue risk score, root cause analysis | ★ Inline in the I2 Issue detail page, shown automatically on page load |
| AI4 | **Daily Digest Generation** | `/ai/daily-digest` | Cross-project digest draft, editable and submittable | ★ Standalone page, top-level sidebar entry |

### 2.9 Reports — P2

| # | Page | Route | Description |
|---|------|------|------|
| R1 | **Report List** | `/reports` | All generated reports |
| R2 | **Report Detail** | `/reports/:id` | View/export AI-generated report |

### 2.10 Administration — P1

| # | Page | Route | Description |
|---|------|------|------|
| AD1 | **Member Management** | `/admin/members` | Invite/remove/assign roles |
| AD2 | **Roles & Permissions** | `/admin/roles` | Custom roles + permission codes |
| AD3 | **API Key Management** | `/admin/api-keys` | Create/revoke/usage |

### 2.11 Personal Settings — P2

| # | Page | Route | Description |
|---|------|------|------|
| PR1 | **Profile** | `/profile` | Name/avatar/password |
| PR2 | **Notification Preferences** | `/profile/notifications` | Notification channels/types |
| PR3 | **Login Devices** | `/profile/sessions` | Session list/force sign-out |

---

## 3. Data Flow — Which Page Fetches Data Where

```
                         API Endpoint
Page                    ─────────────────────────
D1 Dashboard            GET /issues?assignee=@me
                        GET /issues?reporter=@me
                        GET /projects
                        GET /ai/dashboard-summary

B1 Kanban Board         GET /projects/:key/board?view=kanban
B2 Scrum Board          GET /projects/:key/board?view=scrum&sprint=active

I1 Backlog+Issues       GET /projects/:key/issues (including sprint_id IS NULL, i.e. Backlog)
I2 Issue Detail         GET /issues/:id + GET /ai/issues/:id/analysis

I3 Create Issue         POST /issues
I4 Edit Issue           PATCH /issues/:id

S1 Active Sprint        GET /projects/:key/sprints/active + issues + burndown
G1 Gantt                GET /projects/:key/gantt

AI1 Health Monitor      POST /ai/analyze-project-health → GET /ai/tasks/:id
AI3 Issue AI Analysis   ★ Called inline within page I2: GET /ai/issues/:id/analysis
AI4 Daily Digest        POST /ai/daily-digest
```

---

## 4. AI Analysis Display Location Summary

```
AI content                       Display location              Interaction
───────────────────────────   ──────────────────────  ──────────────
Project health score + risk alerts  ① D1 Dashboard (card)      Auto-displayed
                               ② P2 Project detail (banner)    Auto-displayed
                               ③ AI1 standalone page (full)    Manually triggered

Issue-level risk score + root cause analysis   ★ I2 Issue detail inline   Auto on page load
                               (below description/AI block)

Sprint retrospective report    R2 Report detail (standalone)    Manually generated

Digest draft                   AI4 standalone page               Manually generate + edit
```

---

## 5. Phase Plan

| Phase | Page count | Contents |
|-------|--------|------|
| **P0** (MVP) | 7 | A1 A2 A4 D1 P1 B1/B2 I1 I2 I3 I4 |
| **P1** | 6 | S1 S2 G1 AI1 AI2 AI4 AD1 AD2 |
| **P2** | 5 | R1 R2 PR1 PR2 PR3 AD3 A3 PS1 |

---

## 6. Confirmation Status

| # | Decision item | Conclusion |
|---|--------|------|
| 1 | Board supports Kanban + Scrum | ✅ Same page toggled via view parameter |
| 2 | Backlog + Issue List merged | ✅ Backlog left / list right |
| 3 | Dashboard contents | ✅ My to-dos + Created by me + Project cards + AI summary |
| 4 | Create Issue interaction | ✅ Standalone full page |
| 5 | AI analysis display | ✅ Project-level = standalone page + D1 inline card / Issue-level = inline in detail |
| 6 | Phase 1 scope | ✅ Confirmed |
| 7 | Sidebar structure | ✅ Project > Board / Issues / Sprints / Gantt / Settings |
