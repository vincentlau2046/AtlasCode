// The GrowthBook client key was internal/external variant-specific; the
// internal variant (gated on the internal user type and ENABLE_GROWTHBOOK_DEV)
// was removed, so the standard key is returned.
export function getGrowthBookClientKey(): string {
  return 'sdk-zAZezfDKGoZuXXKe'
}
