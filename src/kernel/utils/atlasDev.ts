/**
 * ATLAS_DEV gate — domestic dev/debug capability switch.
 *
 * Replaces the legacy `process.env.USER_TYPE === 'ant'` (Anthropic-internal
 * employee marker) gates. In Atlas builds USER_TYPE is never set, so
 * those branches were dead; dev/observability features are now opt-in via
 * `ATLAS_DEV=1` (or `true`). Default (unset) keeps every gated feature
 * hidden — identical to the previous external behavior.
 */
export function isAtlasDev(): boolean {
  const v = process.env.ATLAS_DEV
  return v === '1' || v === 'true'
}
