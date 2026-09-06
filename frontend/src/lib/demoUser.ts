/**
 * Demo-user detection — mirrors the backend's configurable demo identity.
 *
 * Demo behaviour only exists in a build explicitly compiled for the cloud
 * live-demo host (`VITE_ENABLE_DEMO_MODE=true`): the "Try demo" guest entry,
 * read-only demo account, AI quotas/banners and the guided AI tour are all
 * gated behind `demoModeEnabled` so a plain self-hosted/open-source install
 * behaves like a normal product (register + use, no demo chrome).
 *
 * When demo mode is on, the email suffix decides who is the shared demo
 * visitor (`@tomihub.demo` on the cloud AI demo). The suffix is read from the
 * same env name the backend uses (Spring maps DEMO_EMAIL_SUFFIX); Vite
 * exposes it as VITE_DEMO_EMAIL_SUFFIX at build time.
 */

export const demoModeEnabled: boolean =
  (import.meta.env.VITE_ENABLE_DEMO_MODE ?? 'false') === 'true';

export const demoEmailSuffix: string =
  import.meta.env.VITE_DEMO_EMAIL_SUFFIX ?? '@tomihub.demo';

export function isDemoUser(email: string | null | undefined): boolean {
  // Without demo mode there is no shared demo visitor — everyone is a real user.
  if (!demoModeEnabled || !email) return false;
  const suffix = demoEmailSuffix.startsWith('@') ? demoEmailSuffix : '@' + demoEmailSuffix;
  return email.toLowerCase().endsWith(suffix.toLowerCase());
}
