/**
 * AI feature gate — compile-time-ish runtime switch driven by Vite env.
 *
 * `VITE_ENABLE_AI_FEATURES`:
 *   - unset / "true"  → AI features visible (default; full TomiHub with ai-brain)
 *   - "false"         → AI features hidden (no-AI self-hosted build, batch-1 open
 *                       source; pure project management)
 *
 * Usage: `import { aiEnabled } from '@/lib/aiGate';`
 *   {aiEnabled && <AiWidget/>}
 */

export const aiEnabled: boolean =
  (import.meta.env.VITE_ENABLE_AI_FEATURES ?? 'true') !== 'false';

/** True when the AI endpoints are expected to be reachable (nginx routes them). */
export const aiApiBase = '/api/v1/ai';
