# R2 Redmine Plugin Design (Draft for Review)

> Status: Pending review (2026-08-24)
> Strategic position: the second step of the wedge trilogy (mirror → plugin → replace).
> R1 verified: Redmine 7 data mirror → ai_pm (redmine_connector), AI health/risk analysis already runs on the mirrored data.
> Design goal of this doc: **let Redmine users use AI-Brain directly in their familiar environment, with zero migration cost.**
>
> **Change**: v1.0 → v1.1 — deployment form decided as **self-hosted** (TomiHub and the customer's Redmine on the same intranet),
> sync direction = R1 pull side; added the "TomiHub full-experience hooks" gap design (prevents the plugin from killing the replace strategy);
> contract aligned with R1's actual storage (projects.settings.redmine_project_id); decision point 2 settled, moved out of pending decisions.
>
> **Change**: v1.1 → v1.2 — decision point 1 settled: **plugin MIT open source**; added §3.2 mechanism for guiding users to TomiHub
> (guidance matrix + source marker + conversion funnel), clarifying the structural argument that "MIT open source and guidance do not conflict".
>
> **Change**: v1.2 → v1.3 — decision points 3/4 settled: **R2a does not render the radar chart** (only score + grade + Top3 +
> placeholder guidance card; radar chart reserved for the R2b paid tier as the flagship visual, upholding the §3.1 gap); **Issue AI analysis language
> follows the Redmine user's language** (the plugin passes through lang, reusing the aiLanguage mechanism). Pending decisions cleared; entering R2a implementation scheduling.
>
> **Change**: v1.3 → v1.4 — Phase A landed: sync/summary endpoints implemented in **ai-brain** (not core;
> sync logic and health cache both live on its side); HITL option A landing point corrected to "endpoints don't pass through the Java filter, naturally no gate";
> added Celery `run_redmine_sync_for_tenant`; 6 route tests passed.

---

## 1. Positioning and Principles

**In one sentence**: your Redmine doesn't need replacing — add a layer of AI escort.

**Three design principles**:
1. **The plugin only displays read-only; all analysis happens on the TomiHub side** — the plugin does no AI computation, it only pulls analysis results (lightweight, easy to maintain, no closed-source IP leakage)
2. **Zero learning cost** — users never leave the Redmine workflow; health badges and risk bars are "passively visible" and don't require users to actively look for them
3. **Free hooks + paid depth** — the free tier shows "what the problem is", the paid tier provides "why and what to do" (Issue AI analysis, reports)

---

## 1.1 Deployment Form (v1.1 decision: self-hosted)

> **Change**: v1.0 §10 decision point 2 → v1.1 elevated to an already-decided architecture-level decision.

**This design only supports the self-hosted form**:

```
Customer environment (same intranet):
  Redmine (customer's existing instance, untouched)
    ▲ REST pull (R1 connector, TomiHub side actively reaches out over the network to pull data)
    │
  TomiHub self-hosted instance (docker compose: core + ai-brain + postgres)
    ▲ HTTPS REST (plugin only pulls results read-only, X-Api-Key)
    │
  redmine_tomihub plugin (Ruby, installed into the Redmine process, display-only)
```

**Three architecture constraints (determined by the above)**:
1. **Sync direction = TomiHub pull side**: TomiHub and Redmine on the same intranet, the R1 connector
   actively does `GET Redmine REST` (`run_full`/`run_incremental` already implemented). The plugin only
   "triggers" sync from the config page; it doesn't carry data transfer.
2. **The TomiHub address configured in the plugin = the customer's self-hosted instance address** (e.g. `http://10.0.0.8:8080`),
   filled in by the customer admin; the official cloud SaaS form is **deferred** (not in this phase, see §9 risks).
3. **Periodic incremental sync = scheduled on the TomiHub side**: reuses ai-brain Celery's
   `redmine-incremental-sync` beat (migration 071 already has it) to periodically pull from the same-intranet Redmine;
   the plugin needs no resident polling.

---

## 2. User Experience (Usage Scenarios)

**Install** (admin, 10 minutes):
```bash
git clone ... plugins/redmine_tomihub
bundle install
bundle exec rake redmine:plugins:migrate RAILS_ENV=production
systemctl restart redmine
```

**Configuration** (once): Administration → Plugins → TomiHub settings:
```
TomiHub URL:   http://10.0.0.8:8080     ← customer self-hosted instance (same intranet as Redmine)
API Key:       th_xxxxxxxx (read-only key, bound to the mirror tenant)
[Test connection] [Sync now]
```

> **Change** v1.1: TomiHub address clarified as the **customer self-hosted instance** address (not the official cloud); "Sync now"
> only triggers the R1 connector pull on the TomiHub side (async task), the plugin doesn't carry data transfer.

**Daily use**:
| Scenario | What the user sees |
|------|---------|
| Opens a project page | Health bar at top: `Health 60/100 · at risk` + Top 3 risks ("3 bugs backlogged · 2 tasks stalled") |
| Opens an Issue | "🔍 AI Analysis" button at the bottom of details → attribution + resolution suggestions (paid) |
| Monday morning | Risks already refreshed by TomiHub's overnight analysis; the plugin opens instantly (reads cache) |
| No config/inactive | Guidance bar shown: "Connect TomiHub AI escort →" (leads to config/trial) |

---

## 3. Feature Tiers (Free Hooks → Paid Depth)

| Tier | Feature | Status |
|------|------|------|
| **F1 Free (acquisition hook)** | Project health badge (score + grade) + Top 3 risk titles (details locked) + six-dimension radar placeholder guidance card (no data, only "View in TomiHub →") | R2a implementation |
| F2 Free | "Sync now" button + sync status notice | R2a implementation |
| **P1 Paid (trial/official License)** | Issue AI analysis (attribution/suggestions/risk rating) | R2b implementation |
| P2 Paid | Project AI report push (weekly report delivered straight to the Redmine project page) | R2c implementation |
| P3 Paid | Knowledge graph correlation display (wiki-related Issue recommendations) | R2c implementation |

License validation happens on the **TomiHub side**: the plugin's requests carry the API Key → TomiHub judges that tenant's license status → when not activated, paid endpoints return 403 + guidance copy ("7-day trial →"). The plugin implements no paid logic whatsoever.

### 3.1 TomiHub Full-Experience Hooks (new in v1.1)

> **Change**: v1.0 had no such section → added in v1.1. Strategically prevents "the plugin becomes too complete → users have no incentive to migrate".

The plugin only provides a **summary layer**; full analysis only lives in the TomiHub UI — creating an experience gap that makes the plugin
the "fishhook" and TomiHub the "fish" (wedge → replace loop, open-core-plan §3.5):

| Capability | Plugin (summary layer) | TomiHub UI (full layer) |
|------|---------------|---------------------|
| Health | Score + grade + Top 3 risks | Full six-dimension radar + historical trends + dimension attribution |
| Issue | Per-issue attribution/suggestions (paid) | Panoramic analysis, related issues, knowledge graph |
| Reports | Weekly report summary (paid) | Custom reports, cross-project comparison, export |
| Views | Current project | Cross-project views, global dashboard, combined views |

A fixed guidance line sits in the corner of every summary card in the plugin:
> 「View full analysis in TomiHub →」(links to the corresponding project page of the customer's self-hosted TomiHub)

The free tier (F1/P1 not activated) doesn't even give full summaries — it only shows the "Health 60/100 · at risk" grade;
risk details fall under paid/trial.

### 3.2 Mechanism for Guiding Users to TomiHub (new in v1.1)

> **Change**: v1.0 had no such section → added in v1.1. Answers "how a MIT-open-source plugin leads users to TomiHub".

**Core insight: MIT open source and guidance do not conflict.** The code for full analysis (six-dimension radar/knowledge graph/cross-project/custom
reports) lives in the **closed-source ai-brain**, and the plugin can only ever get summaries — someone who forks the plugin to strip the guidance
still only gets summaries (no ai-brain means no full features), so forking is pointless. Guidance is **determined by the product structure, not locked in by code**.

**Guidance matrix (by user state × display location)**:

| User state | Project page | Issue page | Settings page |
|---------|--------|---------|--------|
| Not configured | Guidance bar at top: 「Connect TomiHub AI escort →」(goes to settings page) | — | Config form + [Test connection] |
| Configured · Free | Health badge (score + grade) + risk titles (details locked) + card corner badge 「Full analysis →」 | 「🔍 AI Analysis」button shows 「Unlock with trial →」 | 「Currently free · Upgrade →」 |
| In trial | Full summary + corner badge 「Trial: X days left · Renew →」 | Full attribution/suggestions | Trial status + [Upgrade now] |
| Paid | Full summary | Full attribution/suggestions | Official License status |

**Guidance touchpoints (all links uniformly carry the source marker)**:

```
Format: {tomihub_url}/projects/{project_id}?from=redmine-plugin&lang={zh|en|ja}
```
- TomiHub side recognizes `from=redmine-plugin` → landing page shows "from Redmine plugin"
  + the corresponding project page + trial signup banner (reuses existing landing logic, no new mechanism)
- The plugin side stores no TomiHub credentials, only the URL + read-only API Key — guidance is always "jump over there", never routed back

**The free hook's "visible but untouchable" design (key to conversion)**:
- The free tier **shows** health score, grade, risk titles (e.g. "3 bugs backlogged")
- **Hides** risk details, attribution, suggestions, historical trends — shows "🔒 Unlock attribution · 7-day trial →"
- In this way "a problem exists" is freely visible (hook), while "why/how" is guided to TomiHub (paid)

**Conversion funnel (observable metrics)**:
```
Plugin install → config succeeds → health badge appears on the project page (value proof)
        → click 「Full analysis/Unlock with trial」→ corresponding TomiHub project page (from=redmine-plugin)
        → apply for 7-day trial → activate License → pay
```
- Plugin-side telemetry: config completion rate, badge impression count, guidance click rate (local counters, can be reported with requests)
- TomiHub side: trial/purchase conversion rate for `from=redmine-plugin` sources

---

## 4. Technical Architecture

```
Customer environment (same intranet, v1.1 self-hosted form):
┌─ Redmine ──────────────────────────────┐
│ redmine_tomihub plugin (Rails, read-only display)  │
│  · Project page hook → health badge + risk bar       │
│  · Issue hook → AI analysis button             │
│  · Settings page → TomiHub address + API Key      │
└──────────┬─────────────────────────────┘
           │ ① HTTPS REST (read-only pull of results, X-Api-Key)
┌──────────▼─────────────────────────────┐
│ TomiHub self-hosted instance (same intranet as Redmine)   │
│  · core: redmine sync API (wraps R1 logic) │
│  · ai-brain: aggregation/summary API (new)          │
│  · License: tenant status validation (existing)         │
│  · R1 connector: data mirror (verified)      │
└──────────┬─────────────────────────────┘
           │ ② REST pull (TomiHub → Redmine, R1 connector)
┌──────────▼─────────────────────────────┐
│ Redmine REST API (issues/journals/…)   │
└────────────────────────────────────────┘
```

**Data flow** (v1.1, sync direction = TomiHub pull side):
1. Click "Sync now" on the config page → plugin calls the TomiHub sync API → the **TomiHub side** R1 connector
   actively pulls the customer's Redmine data (async task, reachable over the same intranet)
2. TomiHub runs ai-brain analysis on the mirrored data nightly/on demand (existing 2h schedule + manual trigger;
   periodic incremental reuses Celery's `redmine-incremental-sync` beat, migration 071)
3. Plugin opens the project page → pulls the aggregated summary (cached result, opens instantly) — direction ①, TomiHub → plugin
4. Paid features → request with key → License validation → analysis result

> **Change** v1.1: the original architecture drew sync as a one-way "plugin→TomiHub sync API→pull Redmine" flow; now clarified
> as **two data flows in opposite directions**: ① plugin read-only pulls results (TomiHub → plugin),
> ② R1 connector pulls Redmine (TomiHub → Redmine, only feasible self-hosted on the same intranet).

---

## 5. Redmine Plugin Project Structure (Redmine 7 compatible)

```
plugins/redmine_tomihub/
├── init.rb                          # registers plugin + menus + hooks
├── config/routes.rb                 # settings + ajax routes
├── config/locales/{en,zh,ja}.yml    # trilingual
├── app/controllers/
│   └── tomihub_settings_controller.rb   # settings save/test connection/trigger sync
├── app/views/
│   ├── settings/_redmine_tomihub.html.erb   # settings form
│   ├── projects/_tomihub_health.html.erb    # health badge + risk bar
│   └── issues/_tomihub_ai.html.erb          # AI analysis panel (paid)
├── assets/javascripts/redmine_tomihub.js    # ajax pull and render
└── lib/redmine_tomihub/client.rb            # TomiHub REST client (thin wrapper)
```

**Redmine view hooks** (attached to existing pages, no template overrides):
- `view_projects_show_top` → health badge + risk bar
- `view_issues_show_details_bottom` → AI analysis panel
- `view_layouts_base_html_head` → JS injection

**Redmine 7 compatibility essentials** (pain points distilled from R1, avoided up front):
- REST calls go through the plugin's Ruby HTTP (Faraday/net-http), decoupled from the Redmine version
- The plugin's own REST write operations (settings save) use standard Rails forms, never touching the Redmine REST API
- Compatible with Ruby 3.3 / Rails 7.2 (Redmine 7 baseline)

---

## 6. TomiHub-side API Contract (new/existing)

| # | Endpoint | Purpose | Status |
|---|------|------|------|
| 1 | `POST /api/v1/redmine/sync` | Plugin triggers mirror sync (body: redmine_url, redmine_api_key, project_keys; auth: X-Api-Key → tenant). **Prerequisite: TomiHub self-hosted and on the same intranet as Redmine** (settled in v1.1) | 🆕 New (wraps R1 cli logic as an HTTP endpoint, implemented on the core or brain side) |
| 2 | `GET /api/v1/ai/redmine/project-summary?redmine_id=N` | Aggregated return: health score/grade/six dimensions/health cache time + Top N risks (with issue_ids→redmine_id mapping) + stats (open/done/bugs) | 🆕 New (ai-brain, reads ai_analyses cache + projects mapping) |
| 3 | `GET /api/v1/ai/redmine/issue-analysis?redmine_id=N` | Single Issue AI analysis (attribution/suggestions/risk) — **paid endpoint, License validation** | 🆕 New (reuses ai-brain's issue review capability) |
| 4 | `GET /api/v1/license/status` | Plugin determines whether the tenant is activated (free/trial/official) | ✅ Existing |
| 5 | `GET /api/v1/ai/project-health`, `project-risk` | Underlying analysis endpoints | ✅ Existing (reused internally by the aggregation endpoint) |

**Key conventions**:
- `redmine_id` = the source-system id written to `issues.custom_fields.redmine_id` during R1 sync;
  **the project side stores it in `projects.settings.redmine_project_id` (JSONB, as R1 implements it)** —
  the plugin only knows the Redmine-side id; the aggregation endpoint handles the mapping to the TomiHub internal id.
  > ~~`projects.custom_fields.redmine_id`~~(v1.1 correction: projects has no custom_fields column,
  > R1 actually writes to the settings JSONB, see `redmine_connector/mapper.py`)
- Auth: the API Key configured in the plugin is bound to the mirror tenant (reuses the `api_keys` table + `X-Api-Key` header);
  the key uses `scopes="redmine-readonly"` + `hitlMode="manual"` (**not auto**; the `scopes` column already exists from migration 049,
  ~~new scope migration 072~~ cancelled in v1.3)
- **HITL (v1.3 decision: option A; v1.4 implementation landing-point correction)**: ~~only `POST /api/v1/redmine/sync` added to the Java
  ApiKeyAuthFilter whitelist~~ → **landing in ai-brain** (`api/routes/redmine_sync_routes.py`):
  the sync endpoint doesn't pass through the Java filter chain, so it naturally has no HITL gate (sync writes no business data + admin manually
  triggers it, consistent with option A's intent); R3 write-back endpoints need an additional confirmation mechanism if they go through
  ai-brain, or automatically have HITL if they go through core (see R2a plan §Phase A)
- Inactive tenant: paid endpoints return 403 + `{code: "license_required", message: guidance copy, trial_url}`; free endpoints work normally

---

## 7. Security Design

| Threat | Countermeasure |
|------|------|
| API Key leakage (Redmine compromised) | key is read-only scope + limited to that tenant's mirror data + revocable |
| Cross-tenant data access | key→tenant binding; aggregation endpoints enforce tenant isolation (reuse TenantContextHolder) |
| Plugin SSRF (customer fills in a malicious TomiHub address) | Client-side configuration, risk borne by themselves; no user credentials stored |
| Paid feature bypass | License validation on the TomiHub side; the plugin only displays the 403 guidance |
| Sync storm | Sync endpoint rate-limited (once per 10 minutes per tenant) + async task queue |
| **Plugin key bypassing HITL for write operations** | **v1.3 decision: option A (v1.4 landing-point correction)** — plugin key stays `hitlMode=manual` + `scopes=redmine-readonly`, **never auto**; the sync endpoint is implemented in ai-brain (doesn't pass through the Java filter, naturally no HITL gate — limited to triggering sync, writes no business data, manually triggered by admin); R3 write-back endpoints continue through HITL (automatic if via core, needs an additional confirmation mechanism if via ai-brain), the gate is fully preserved |

---

## 8. Milestones and Acceptance

| Phase | Content | Acceptance criteria |
|------|------|---------|
| **R2a Free tier** (1-2 weeks) | Plugin skeleton + settings page + health badge (score + grade + Top3) + six-dimension radar placeholder guidance card + sync trigger + TomiHub aggregation endpoint + api_keys scope migration + `X-Api-Key` auth pre-check | ① A fresh Redmine 7 installs the plugin → configures self-hosted TomiHub → syncs → health badge appears on the project page (same data as the TomiHub UI) ② Guidance bar shown when not configured ③ Chinese/English/Japanese trilingual ④ Sync direction verified: TomiHub-side active pull succeeds (same intranet) ⑤ Guidance links carry `from=redmine-plugin` and redirect correctly ⑥ Radar chart does not appear in the plugin (placeholder card only) |
| **R2b Paid tier** (1 week) | Issue AI analysis panel + License validation flow + trial guidance | ① Inactive tenant clicks AI analysis → trial guidance copy shown ② Trial tenant → full attribution/suggestions ③ read-only key cannot write |
| **R2c Depth** (later) | Weekly report push + knowledge graph recommendations | Decided later based on R2a/b data feedback |
| **Listing & marketing** (parallel with R2a) | Redmine plugin directory listing + GitHub open source + landing page | Searchable in the plugin directory; the official site has a "Redmine AI escort" landing page |

---

## 9. Risks and Boundaries

| Risk | Response |
|------|------|
| Redmine 7 hook location changes | R1 pain points already verified the API layer; hooks use the three most stable ones, tested on a real `redmine:7.0.0` container during R2a development |
| Fragmented customer Redmine versions (5.x/6.x/7.x) | First release only promises Redmine 7; 5.x/6.x compatibility scheduled later via a compatibility matrix |
| Mirror latency makes data "stale" | UI shows "analysis time" (cache timestamp) + manual sync button |
| Customer wants to "use only the viewer without installing TomiHub" | ~~Plugin depends on a TomiHub instance — SaaS (cloud demo) or self-hosted both fine~~ → **v1.1: this phase only supports self-hosted**; official cloud SaaS (incl. cloud demo) deferred, evaluated per customer demand after self-hosted gains volume |
| **TomiHub and Redmine not on the same intranet (SaaS/remote)** | **v1.1 explicitly out of scope**: this phase's architecture depends on bidirectional reachability within the same intranet (TomiHub→Redmine pull). The cloud form would require the plugin to become the push side (direction reversed), set up as a separate project, not mixed into R2 |
| Free tier abused (big enterprises freeloading on badges) | Free tier only shows "a problem exists"; the paid tier has attribution — the hook design is intentional, acceptable |

---

## 10. Decision Log (all settled)

> **Change** v1.3: this section changed from "pending decisions" to "decision log"; all 4 items finalized; no leftover pending points.

1. **Plugin open-source license**: ~~MIT open source (listing + community trust) or closed source? Recommend MIT~~ → **v1.1 decided: MIT open source**.
   The plugin has no IP; open sourcing buys community trust + plugin directory listing; guidance relies on §3.2's structural gap, not code locks.
2. ~~**SaaS form**:~~ → **v1.1 decided: self-hosted** (§1.1); the settings page only offers one preset, "customer self-hosted address"; the official cloud form is deferred and doesn't occupy R2 scope
3. **R2a scope**: ~~Does the health badge include the six-dimension radar chart (inline SVG, no JS dependency)? Recommend only score + grade + Top 3 risks (the simplest hook), radar chart in R2b~~ → **v1.3 decided: R2a only ships score + grade + Top3 + a placeholder guidance card**.
   Rationale: the radar chart is ai-brain's flagship visualization; giving it to the plugin early would destroy the §3.1 gap and weaken the motivation of the "full analysis →" guidance; moreover with sparse data the six dimensions render as 0-score dimensions (misleading look) and static SVG is hard to adapt to Redmine custom themes. The radar chart stays in the **R2b paid tier** as the flagship visual. R2a uses a placeholder card: 「Six-dimension health radar → View in TomiHub →」(pure guidance link, no data, no chart).
4. **Issue AI analysis response language**: ~~Follow the Redmine user's language (zh/en/ja)? Confirm?~~ → **v1.3 decided: follow the Redmine user's language**.
   The plugin passes through `lang={zh|en|ja}` to the aggregation/analysis endpoints, reusing TomiHub's existing aiLanguage mechanism; the server produces copy by lang.

---

## Appendix: Consistency with Open Core

- Plugin = acquisition asset (open source, MIT) → corresponds to the role of TomiLite
- AI-Brain analysis capability = monetization asset (closed source + License) → corresponds to the role of TomiHub
- Conversion path: Redmine users → plugin free tier → trial License → paid License → full TomiHub
- No new pricing system: reuses ¥1,399/year (5 seats) + 7-day trial License
  > Note: Redmine is **site-based** (one Redmine used by many people); seat pricing may be low for single-site teams;
  > pricing terms to be decided in R5; here we only follow the existing system without adding anything new.
- The self-hosted form is consistent with open-core-plan P2 (dual-repo split): plugin + connector open source (Apache-2.0/MIT),
  ai-brain closed-source private image; R2 deliverables naturally land on the open-source side, no extra boundary adjustments needed.
