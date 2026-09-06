import type { ApiResponse } from '@/types/auth';

/**
 * Extract a user-friendly error message from an API error.
 * Maps backend error codes to i18n keys, falling back to the raw message.
 */
export function getErrorMessage(
  err: unknown,
  t: { errors: Record<string, string> },
): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const resp = (err as { response?: { data?: ApiResponse<unknown> } }).response;
    if (resp?.data?.code) {
      const code = String(resp.data.code);
      return t.errors[code] || resp.data.message || t.errors.default;
    }
    if (resp?.data?.message) {
      return resp.data.message;
    }
  }
  return t.errors.default;
}

/**
 * Map an LLM error code (auth / quota / rate_limit / model_not_found /
 * context / network / timeout / config / generic) to the localized message
 * from the i18n dictionary. Falls back to the generic message.
 *
 * Per the project i18n architecture (docs/ai-analysis-design.md, §3), the
 * backend only sends the machine `code`; display text lives in
 * translations.ts → app.llmErrors, so adding a language never touches code.
 */
export function getLlmErrorMessage(
  code: string | undefined | null,
  t: { llmErrors?: Record<string, string>; aiUnavailable?: string },
): string {
  if (code && t.llmErrors?.[code]) return t.llmErrors[code];
  return t.llmErrors?.generic || t.aiUnavailable || 'AI service is temporarily unavailable.';
}
