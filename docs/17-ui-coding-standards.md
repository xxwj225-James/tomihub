# UI Coding Standards v1.1

> **Mandatory** | Applies to all code under `frontend/src/`
> **Last updated**: 2026-06-08

---

## Rule 1 — Hardcoded Color Values Are Absolutely Forbidden

**❌ Forbidden**

```tsx
// Forbidden: hardcoded colors in any form
<div style={{ color: '#333' }}>
<div className="bg-[#f5f5f5]">
<div className="text-gray-900">
<div style={{ background: 'hsl(240, 3%, 98%)' }}>
```

**✅ Allowed**

```tsx
// Only allowed: semantic Tailwind class names
<div className="text-ink-primary">
<div className="bg-surface-app">
<div className="border-edge">

// For dynamic references, use CSS variables (never write literal values)
const accent = 'hsl(var(--brand))'; // Only for required scenarios such as SVG fill / accentColor
```

---

## Rule 1.5 — Dynamic className Merging (the `cn` utility)

**`cn()` MUST be used to merge all dynamic class names.** Direct string concatenation is forbidden, and calling `clsx` or `tailwind-merge` alone is forbidden.

```tsx
// src/lib/cn.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
```

### ❌ Forbidden

```tsx
// String concatenation → Tailwind class override priority conflicts
<div className={`card ${isActive ? 'bg-brand-main' : 'bg-surface-card'}`}>

// clsx alone → Tailwind class conflicts are not resolved
<div className={clsx('card', isActive && 'bg-brand-main')}>
```

### ✅ Allowed

```tsx
import { cn } from '@/lib/cn';

// Only allowed: cn() automatically resolves Tailwind class conflicts
<div className={cn('card', isActive ? 'bg-brand-main' : 'bg-surface-card')}>

// Merging multiple conditions
<div className={cn(
  'card p-4',
  isDragging && 'shadow-card-hover border-brand-main',
  isDangerous && 'border-status-danger bg-status-danger-soft'
)}>
```

**Why `twMerge` is required**: Tailwind class names are flat, and a later class does not necessarily override an earlier one. In `bg-red-500 bg-brand-main`, `bg-brand-main` does not automatically override `bg-red-500`. `twMerge` understands Tailwind's class-name semantics and correctly resolves the conflict.

---

## Rule 2 — Semantic Color Palette (All Available Class Names)

```
Text levels         Background levels   Borders            Brand colors
──────────────  ────────────────  ────────────────  ──────────────
text-ink-primary  bg-surface-app    border-edge       text-brand-main
text-ink-secondary bg-surface-card  border-edge-hover bg-brand-main
text-ink-muted    bg-surface-hover  border-edge-sidebar bg-brand-hover
text-ink-sidebar  bg-surface-sidebar                  bg-brand-soft
text-ink-sidebar-active                               bg-brand-text

Status Colors
──────────────────────────────────────────
Text                    Background                      Border
──────────────────────  ─────────────────────────  ─────────────────────────
text-status-success     bg-status-success-soft      border-status-success
text-status-warning     bg-status-warning-soft      border-status-warning
text-status-danger      bg-status-danger-soft       border-status-danger

Usage:
  success  → Issue resolved, Sprint completed, operation succeeded
  warning  → Sprint at risk, WIP approaching the limit, needs attention
  danger   → High-risk deletion, MCP HITL interception, P0 unassigned timeout

Note: These class names are distinct from the legacy text-danger / bg-danger-soft (used for buttons and other components).
      Status colors are reserved exclusively for business status display, such as Issue status, risk levels, and audit interception.

Radius              Shadows
────────────────  ──────────────────
rounded-card     shadow-card
rounded-btn      shadow-card-hover
rounded-input    shadow-dialog

Fonts
─────────
font-ui        (Inter / system-ui)
font-mono      (JetBrains Mono)
```

---

## Rule 3 — Component File Structure

```
src/
├── components/
│   ├── ui/           # Generic UI components (Button, Input, Card, Badge...)
│   ├── layout/       # Layout components (AppLayout, Sidebar, Header...)
│   ├── board/        # Board related (BoardColumn, BoardCard...)
│   ├── issue/        # Issue related (IssueRow, IssueDetail...)
│   └── common/       # Shared business components (UserAvatar, PriorityBadge...)
│
├── pages/            # Page components, one page per file
├── hooks/            # Custom hooks
├── stores/           # Zustand stores
├── api/              # API call functions
├── i18n/             # Internationalization
├── types/            # TypeScript type definitions
└── lib/              # Utility functions (http client, token manager...)
```

### File Naming

```
Component files: PascalCase.tsx    (LoginPage, BoardCard, UserAvatar)
Hook files:      camelCase.ts      (useEmailCountdown, useT)
Store files:     camelCase.ts      (authStore, themeStore)
Utility files:   camelCase.ts      (http, tokenManager)
Type files:      camelCase.ts      (auth, issue)
```

### Component Guidelines

```tsx
// ✅ Standard component template
import { useT } from '@/i18n/useT';

interface Props {
  title: string;
  onAction?: () => void;
}

export function BoardCard({ title, onAction }: Props) {
  const t = useT();

  return (
    <div className="card p-4">
      <h3 className="text-ink-primary font-medium">{title}</h3>
      <button className="btn-brand" onClick={onAction}>
        {t.common.save}
      </button>
    </div>
  );
}
```

- **Only one main component is exported per file**
- **Props are defined with `interface`, never inlined**
- **All user-visible text goes through `useT()`**
- **No fetch/axios logic inside components** — call the functions under `api/`

---

## Rule 4 — Internationalization (i18n) Mandatory

```tsx
// ❌ Forbidden: hardcoded UI strings (Chinese or English)
<button>Create Issue</button>
<h1>Welcome to AI-PM</h1>

// ✅ Only allowed: reference through useT()
import { useT } from '@/i18n/useT';
const t = useT();
<button>{t.issue.create}</button>
<h1>{t.auth.loginTitle}</h1>
```

When adding new strings:
1. Add to both `en` and `zh` in `src/i18n/translations.ts` first
2. Group new keys by module (`auth.*`, `issue.*`, `dashboard.*`, `common.*`...)
3. **Do not** create new translation files — manage everything in a single file

---

## Rule 5 — Page Layout

### Auth Pages (Login / Register / ForgotPassword)

```tsx
<div className="min-h-screen flex items-center justify-center px-4 bg-surface-app">
  <div className="w-full max-w-[400px]">
    {/* Logo + Form */}
  </div>
</div>
```

### Main App Pages (Require AppLayout)

```tsx
// Route config: wrap every authenticated page with AppLayout
// AppLayout automatically provides: sidebar + notification bell + theme/language switcher

// Page components only write the content area:
export function DashboardPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-ink-primary">Title</h2>
      </div>
      {/* content */}
    </div>
  );
}
```

---

## Rule 6 — Forbidden Patterns (Anti-Patterns)

### Anti-pattern 1: Lorem ipsum or demo data in components

```tsx
// ❌ Forbidden
const DEMO_ISSUES = [...];

// ✅ Correct: empty state + placeholder UI
{issues.length === 0 ? <EmptyState /> : <IssueList items={issues} />}
```

### Anti-pattern 2: Inline complex style objects

```tsx
// ❌ Forbidden
<div style={{ padding: '12px 16px', fontSize: '14px', lineHeight: 1.6, ... }}>

// ✅ Correct: use Tailwind class names
<div className="text-sm px-4 py-3 leading-relaxed">
```

### Anti-pattern 3: Inventing custom color class names

```tsx
// ❌ Forbidden: using undefined Tailwind colors
<div className="text-blue-500 bg-gray-100">

// ✅ Correct: use the semantic palette
<div className="text-brand-main bg-surface-card">
```

### Anti-pattern 4: Hardcoded CSS variable values

```tsx
// ❌ Forbidden: bypassing semantic class names to write variables directly
<div style={{ color: 'hsl(var(--brand))' }}>

// ✅ Correct: use semantic class names (variables only in rare necessary cases such as SVG fill)
<div className="text-brand-main">
<svg style={{ color: 'hsl(var(--brand))' }}>  // SVG is allowed
```

---

## Rule 7 — Theme Development Guidelines

Adding a theme only requires modifying **one file**: `src/index.css`.

```
1. Add a [data-theme="xxx"] block in index.css
2. Define all the CSS variables (refer to the variable list of an existing theme)
3. Add an entry to the THEMES array in stores/themeStore.ts
4. Do not modify any component code
```

### Complete list of variables every theme must define

```
--brand, --brand-hover, --brand-soft, --brand-text
--surface-app, --surface-card, --surface-hover, --surface-sidebar
--ink-primary, --ink-secondary, --ink-muted, --ink-sidebar, --ink-sidebar-active
--edge-default, --edge-hover, --edge-sidebar
--danger, --danger-soft, --success, --success-soft, --warning, --warning-soft
--radius-card, --radius-btn, --radius-input
--shadow-card, --shadow-card-hover, --shadow-dialog
--font-ui, --font-mono
```

---

## Rule 8 — TypeScript Standards

```tsx
// ✅ Type-only imports
import type { Issue, User } from '@/types/issue';

// ✅ Event handling
const handleClick = (id: string) => { ... };
<button onClick={() => handleClick(item.id)}>

// ✅ Conditional rendering
{loading && <Spinner />}
{error && <ErrorBanner message={error} />}
{items.length === 0 ? <EmptyState /> : <ItemList items={items} />}
```

**Strictly forbidden**:
- The `any` type (unless it truly cannot be inferred and a comment explains why)
- `as` type assertions (use type guards instead)
- Unused imports

---

## Rule 9 — Component State Hierarchy

```
Component-local state    useState
Cross-component shared   Zustand store
Server data              TanStack Query (useQuery / useMutation)
URL parameters           TanStack Router (useSearch)
Form state               react-hook-form + zod
```

---

## Rule 10 — Pre-Commit Checklist

```
[ ] No hardcoded color values (search for #[0-9a-fA-F]{3,6})
[ ] No hardcoded Chinese or English strings (search for Chinese or English sentences)
[ ] All className attributes use semantic Tailwind class names
[ ] Component files < 300 lines (split into subcomponents if longer)
[ ] New translation keys exist in both en and zh
[ ] No TypeScript compilation errors (npx tsc --noEmit)
[ ] No unused imports
```

---

## Rule 11 — Spacing, Layout, and Scrollbars

### 11.1 Height Constraints

**Fixed pixel heights are forbidden** in canvas-level business components.

```tsx
// ❌ Forbidden: fixed pixel heights — collapse or overflow on different screen sizes
<div className="h-[800px]">
<div style={{ height: 'calc(100vh - 200px)' }}>

// ✅ Correct: use Flexbox for adaptive sizing
<div className="h-full flex flex-col">
  <Header className="shrink-0" />           {/* fixed-height content */}
  <Content className="flex-1 overflow-y-auto" />  {/* adaptive scrolling */}
</div>

// ✅ Full-screen locked layout
<div className="h-screen flex overflow-hidden">
  <Sidebar className="w-[220px] shrink-0" />
  <Main className="flex-1 overflow-y-auto" />
</div>
```

### 11.2 Local Scrolling

Any container that declares `overflow-y-auto` or `overflow-x-auto` **must** consistently use the global scrollbar style.

```tsx
// ❌ Forbidden: bare overflow-auto, scrollbar styling is not controlled by the theme
<div className="flex-1 overflow-y-auto">

// ✅ Correct: the theme automatically controls the scrollbar appearance through CSS variables
// The global CSS already defines:
// ::-webkit-scrollbar { width: 6px; }
// ::-webkit-scrollbar-thumb { background: hsl(var(--edge-default)); border-radius: 3px; }
<div className="flex-1 overflow-y-auto">  // automatically inherits the theme scrollbar
```

### 11.3 Board Swimlane-specific

```tsx
// Board container: horizontal scrolling + equal-height columns
<div className="flex gap-3 overflow-x-auto pb-2 h-full">
  {columns.map(col => (
    <div key={col.id} className="w-[270px] shrink-0 flex flex-col max-h-full">
      <ColumnHeader className="shrink-0" />
      <div className="flex-1 overflow-y-auto">  {/* card area scrolls independently */}
        {col.cards.map(card => <BoardCard key={card.id} />)}
      </div>
    </div>
  ))}
</div>
```

### 11.4 Right-side Panel / Slide-out Drawer

```tsx
// Full-screen right-side panel
<div className="fixed inset-0 z-50 flex justify-end">
  <div className="absolute inset-0 bg-black/20" onClick={onClose} />  {/* overlay */}
  <div className="relative w-[520px] h-full bg-surface-card shadow-dialog overflow-y-auto">
    {/* panel content */}
  </div>
</div>
```

---

## Quick Reference: Commonly Used Semantic Class Names

```tsx
// Page background
<div className="bg-surface-app min-h-screen">

// Card
<div className="card p-6">

// Text
<h1 className="text-ink-primary text-xl font-bold">
<p className="text-ink-secondary text-sm">
<span className="text-ink-muted text-xs">

// Buttons
<button className="btn-brand">Primary</button>
<button className="btn-secondary">Secondary</button>
<button className="btn-ghost">Ghost</button>
<button className="btn-danger">Danger</button>

// Input
<input className="input" />
<input className="input-error" />  // error state

// Border
<div className="border border-edge rounded-card">

// Layout
<div className="flex items-center gap-3">
<div className="grid grid-cols-3 gap-4">

// Status badges
<span className="badge bg-danger-soft text-danger">High</span>
<span className="badge bg-warning-soft text-warning">Medium</span>
<span className="badge bg-success-soft text-success">Low</span>
```
