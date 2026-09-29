/**
 * Telemetry events — no-op stub
 *
 * logOTelEvent is discarded. redactIfDisabled is kept as a pure utility
 * (no data leaves the process).
 */

export function redactIfDisabled(content: string): string {
  return content
}

export async function logOTelEvent(
  _eventName: string,
  _metadata: { [key: string]: string | undefined } = {},
): Promise<void> {
  /* no-op */
}