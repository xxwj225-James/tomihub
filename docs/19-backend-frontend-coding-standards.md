# Java & TypeScript Coding Standards

> **Version**: v1.1
> **Mandatory compliance** | Java: `backend/` · TypeScript: `frontend/src/`
> **Date**: 2026-06-08

---

## Part 1 — Java (Spring Boot 3.3)

### J-1 Package Structure

```
com.ai_pm.<module>/
├── controller/     # REST endpoints: param validation only + delegate to Service, no business logic
├── service/        # business logic, transaction boundaries
├── repository/     # MyBatis-Plus Mapper, data access only
├── entity/         # database entities (PO)
├── dto/            # request/response DTOs (record)
├── config/         # Spring configuration
└── security/       # security-related (Filter, Provider)
```

### J-2 Entity Rules

```java
// ✅ Correct
@Data
@TableName("users")
public class User {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    @TableField(fill = FieldFill.INSERT)
    private Instant createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private Instant updatedAt;
}

// ❌ Forbidden
// - business logic written inside entities
// - missing @TableField causing tenant_id not auto-filled
// - using java.util.Date (use Instant)
```

### J-3 DTOs Use Java Records

```java
// ✅ Correct — immutable, concise
public record LoginRequest(
    @NotBlank @Email String email,
    @NotBlank String password,
    boolean rememberMe
) {}

// ❌ Forbidden — don't use @Data class as a DTO
```

### J-3.1 Large-Data Transfer Rules (OOM Defense)

> ⚠ The AI system frequently handles large text (AI analysis results, Agent logs, Mockup HTML). Loading it all synchronously can easily trigger a JVM OOM.

```java
// ❌ Forbidden — shoving oversized data directly into a returned String
@GetMapping("/report")
public ApiResponse<String> getReport() {
    String hugeReport = aiService.generateFullReport();  // may exceed 10MB
    return ApiResponse.success(hugeReport);              // OOM risk
}

// ❌ Forbidden — unbounded SELECT * over the whole table
List<Issue> allIssues = issueRepo.selectList(null);  // 100k rows → OOM
```

**Three hard rules**:

| Scenario | Rule |
|------|------|
| Oversized AI-generated text (>2MB) | Switch to SSE streaming output, or upload to MinIO/S3 and return a presigned URL |
| List queries | Must be paginated (MyBatis-Plus `Page<T>`), max 200 rows per request |
| File uploads | Limit to 10MB, check `MultipartFile.getSize()` in the Controller |

```java
// ✅ Correct — paginated query
@GetMapping("/issues")
public ApiResponse<PageResult<IssueSummary>> list(IssuePageRequest req) {
    Page<Issue> page = new Page<>(req.page(), Math.min(req.size(), 200));
    return ApiResponse.success(issueService.listPage(page, req.filter()));
}

// ✅ Correct — large AI text goes through object storage
@GetMapping("/report/{id}")
public ApiResponse<ReportVO> getReport(@PathVariable String id) {
    ReportVO report = reportService.getById(id);
    if (report.getContentSize() > 2 * 1024 * 1024) {
        report.setContentUrl(storageService.getPresignedUrl(report.getStoragePath()));
        report.setContent(null);  // don't transmit large text in JSON
    }
    return ApiResponse.success(report);
}
```

### J-4 Controller Rules

```java
@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
@Validated
public class AuthController {

    private final AuthService authService;

    @PostMapping("/login")
    public ApiResponse<AuthResponse> login(@Valid @RequestBody LoginRequest req) {
        return ApiResponse.success(authService.login(req));
    }
}
```

```
Rules:
- Always return the ApiResponse<T> wrapper
- Validate parameters with @Valid + Jakarta annotations
- Controllers contain no business logic, only call Services
- Inject with @RequiredArgsConstructor, not @Autowired
```

### J-5 Service Rules

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class AuthService {

    private final UserRepository userRepo;

    @Transactional
    public AuthResponse login(LoginRequest req) {
        // business logic
    }

    @Transactional(readOnly = true)
    public UserVO getCurrentUser(String userId) {
        // read-only query
    }
}
```

```
Rules:
- Write operations must use @Transactional (default)
- Read-only queries use @Transactional(readOnly = true)
- Throw exceptions via BusinessException(code, message)
- Never handle HttpServletRequest/Response inside a Service
```

### J-6 Repository Rules

```java
@Mapper
public interface UserRepository extends BaseMapper<User> {

    @Select("SELECT * FROM users WHERE email = #{email}")
    Optional<User> findByEmail(@Param("email") String email);

    @Select("SELECT EXISTS(SELECT 1 FROM users WHERE email = #{email})")
    boolean existsByEmail(@Param("email") String email);
}
```

```
Rules:
- Interface + @Mapper, extends BaseMapper<T>
- Annotations for simple queries, XML for complex queries
- Single-result queries return Optional
- Annotate parameters with @Param
- Never write business logic in a Mapper
```

### J-7 Exception Handling

```java
// ✅ Unified exception class
public class BusinessException extends RuntimeException {
    private final int code;
    private final HttpStatus httpStatus;

    public BusinessException(int code, String message) {
        this(code, message, HttpStatus.BAD_REQUEST);
    }
}

// ✅ Global exception handler
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<Void>> handle(BusinessException e) {
        return ResponseEntity.status(e.getHttpStatus())
            .body(ApiResponse.error(e.getCode(), e.getMessage()));
    }
}
```

```
Rules:
- Business exceptions are always thrown as BusinessException
- Never try-catch in a Controller to return a different format
- The global exception handler converts them uniformly
```

### J-8 Tenant Context

```java
// ✅ Set in the Gateway Filter
TenantContextHolder.set(tenantId, userId);

// ✅ Read in the Service
String tenantId = TenantContextHolder.getTenantId();

// ❌ Forbidden
// - Manually parsing tenant_id from JWT
// - Passing tenant_id via method parameters (except for cross-service calls)
```

### J-9 Logging Rules

```java
// ✅ Structured logging (automatically carries traceId, tenantId)
log.info("User logged in: email={}, tenants={}", email, tenants.size());
log.warn("Account locked: userId={}, attempts={}", userId, attempts);
log.error("Token validation failed: jti={}", jti, exception);

// ❌ Forbidden
// - System.out.println
// - e.printStackTrace()
// - Logging passwords or plaintext Tokens
```

### J-10 Forbidden Items

```
❌ @Autowired field injection           → @RequiredArgsConstructor
❌ Date / SimpleDateFormat              → Instant / DateTimeFormatter
❌ String-concatenated SQL              → MyBatis-Plus parameterized query
❌ HttpServletRequest via method params → extract it at the Controller layer first
❌ Bare @Transactional without readOnly → annotate it explicitly
```

---

## Part 2 — TypeScript / React

### TS-1 Type Definitions

```typescript
// ✅ Correct — centralized management
// src/types/issue.ts
export type IssueType = 'epic' | 'story' | 'task' | 'bug' | 'sub_task';
export interface IssueSummary { id: string; key: string; title: string; ... }

// ❌ Forbidden — scattered across components
// Forbidden: const [issue, setIssue] = useState<any>(null);
// Forbidden: function handleClick(data: any) { ... }
```

### TS-2 Component Structure

```tsx
// ✅ Standard template
import { useT } from '@/i18n/useT';
import { cn } from '@/lib/cn';
import type { IssueSummary } from '@/types/issue';

interface Props {
  issue: IssueSummary;
  isDragging?: boolean;
  onEdit?: (id: string) => void;
}

export function IssueCard({ issue, isDragging, onEdit }: Props) {
  const t = useT();

  return (
    <div className={cn('card p-4', isDragging && 'shadow-card-hover')}>
      <span className="mono text-ink-muted">{issue.key}</span>
      <h3 className="text-ink-primary font-medium">{issue.title}</h3>
    </div>
  );
}
```

### TS-3 State Management

```
Data source            Tool
────────────────────  ──────────────────
Component-local state  useState
Cross-component share  Zustand store
Server data            TanStack Query
URL params             TanStack Router useSearch
Forms                  react-hook-form + zod
```

```typescript
// ✅ Zustand store rules
interface AuthState {
  user: UserVO | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({ ... }),
    { name: 'ai-pm-auth' }
  )
);
```

### TS-3.1 Zustand Memory Leak Prevention

> ⚠ When users switch frequently between projects/boards without a page refresh, stale data cached in Zustand Stores is never cleaned up automatically, so browser memory keeps growing.

```typescript
// ✅ Correct — every Store holding "project context" must provide reset()
interface ProjectStore {
  issues: IssueSummary[];
  setIssues: (issues: IssueSummary[]) => void;
  reset: () => void;  // ★ required
}

export const useProjectStore = create<ProjectStore>((set) => ({
  issues: [],
  setIssues: (issues) => set({ issues }),
  reset: () => set({ issues: [] }),  // ★ clear the cache
}));

// ✅ The page component's useEffect cleanup must call reset()
export function BoardPage() {
  const reset = useProjectStore((s) => s.reset);

  useEffect(() => {
    return () => reset();  // ★ clear on component unmount
  }, [reset]);

  // ...
}
```

```
Rules:
- Stores holding project/sprint/issue context → must provide reset()
- Page components' useEffect cleanup → must call reset()
- Global Stores (auth, theme, language) → no reset needed
```

### TS-4 API Calls

```typescript
// src/api/issueApi.ts
import http from '@/lib/http';

export const issueApi = {
  list: (projectId: string, params?: IssueFilter) =>
    http.get<ApiResponse<PageResult<IssueSummary>>>('/issues', { params }),
    
  getById: (id: string) =>
    http.get<ApiResponse<IssueDetail>>(`/issues/${id}`),
    
  create: (data: CreateIssueRequest) =>
    http.post<ApiResponse<IssueSummary>>('/issues', data),
};
```

```
Rules:
- All API calls are centralized under src/api/
- Split into per-module files (authApi, issueApi, boardApi...)
- Components never call axios/http directly
- Return types are explicitly annotated
```

### TS-4.1 API Error Messages — i18n Mapping (Mandatory)

**Forbidden** to display the `message` field returned by the backend directly to users. It must be mapped to localized text via `getErrorMessage()`.

```typescript
import { getErrorMessage } from '@/lib/errors';

// ❌ Forbidden: displaying the API message directly
catch (err: any) { setError(err.response?.data?.message); }

// ✅ Only allowed: mapping through i18n
catch (err) { setError(getErrorMessage(err, t.auth)); }
```

When adding a new backend error code:
1. Add both `en` and `zh` under `auth.errors` in `translations.ts` (or the errors object of the relevant module)
2. The backend returns only the numeric `code` + English `message` (for development/debugging only)
3. The frontend uses `getErrorMessage()` to display the localized version

### TS-5 HTTP Interceptors

```typescript
// src/lib/http.ts
// Interceptors already implemented:
// - Request: automatically attaches JWT + X-Tenant-Id
// - Response: 401 auto-refreshes Token + retry queue
// - Response: 403 auto-redirects to tenant selection

// New interceptors must:
// - Not block the existing chain
// - Handle concurrent refreshes (isRefreshing + failedQueue)
```

### TS-6 Routing

```typescript
// ✅ Correct — TanStack Router
<Link to="/dashboard" className="text-brand-main">Dashboard</Link>

// ❌ Forbidden
// - window.location.href = '/login'  (except for the logout redirect)
// - <a href="/login"> (use Link instead)
```

### TS-7 Forbidden Items

```
❌ any type                     → explicit types, add a comment in edge cases
❌ as casts                     → type guard
❌ Hardcoded URL strings        → centralize into api/ functions
❌ fetch/axios in components    → api/ functions
❌ // @ts-ignore               → fix the type error
❌ console.log                  → remove (when done developing)
❌ Unused imports              → clean up before committing
❌ Component files over 300 lines → split into sub-components
```

### TS-8 Pre-Commit Checks

```bash
# All must pass:
npx tsc --noEmit                    # TypeScript check
grep -r "text-gray-\|bg-white\|#" src/  # no hardcoded colors
grep -r '[\x{4e00}-\x{9fff}]' src/   # no hardcoded Chinese (except i18n files)
```

---

## Cross-Language Common Rules

### G-1 Timezone Transmission Standard

> ⚠ Inconsistent timezones between frontend and backend are the root cause of garbled time display. The transport format must be locked down.

```
Rules: every HTTP JSON timestamp must unconditionally use ISO 8601 with a UTC suffix

✅ "2026-06-08T14:30:00Z"       ← Z = UTC+0
❌ "2026-06-08 14:30:00"        ← missing timezone, ambiguous
❌ "2026-06-08T22:30:00+08:00"  ← usable but not recommended, standardize on Z
```

| Layer | Format | Tool |
|---|------|------|
| HTTP JSON transport | `2026-06-08T14:30:00Z` | Jackson `@JsonFormat` / JS `toISOString()` |
| Frontend display | Auto-converted to browser local timezone | `new Date(utcStr).toLocaleString()` |
| PostgreSQL storage | `TIMESTAMPTZ` (auto UTC+0) | Unified at the DB layer |

```java
// ✅ Backend — Jackson global configuration
@JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'", timezone = "UTC")
private Instant createdAt;
```

```typescript
// ✅ Frontend — convert to local time when displaying
const localTime = new Date(utcString).toLocaleString();  // browser auto timezone
```

### G-2 Naming

```
Java                   TypeScript              Purpose
─────────────────────  ──────────────────────  ──────────
UserRepository.java    authApi.ts              modular naming
LoginRequest.java      auth.ts (interface)     centralized types
findByEmail()          getByEmail()            verb first
```

### G-3 Comments

```java
// ✅ Why, not what
// UUID v7: time-sorted to avoid B-tree page splits
private String generateId() { ... }

// ❌ Useless comment
// Set the name
user.setName(name);
```

### G-4 Error Handling

| | Java | TypeScript |
|---|------|-----------|
| Business exceptions | `throw new BusinessException(code, msg)` | `throw new Error(msg)` or show a toast |
| Global handling | `@RestControllerAdvice` | HTTP interceptor `onRejected` |
| User notification | Return `ApiResponse.error()` | toast / error banner |

### G-5 Git Commit Messages

```
feat:    new feature     feat(auth): add two-stage JWT token issuance
fix:     bug fix         fix(board): resolve WIP limit race condition
docs:    documentation   docs: add master table design
refactor: refactoring    refactor: extract cn() utility
style:   UI/styling      style: apply semantic color classes to LoginPage
test:    testing         test: add AuthService unit tests
```
