/**
 * The "stuck" skill (diagnose frozen/slow sessions and post to an internal
 * Slack channel) was an internal-only capability. The gate has been removed,
 * so this registration is now a no-op.
 */
export function registerStuckSkill(): void {
  // No-op: the stuck skill is no longer registered.
}
