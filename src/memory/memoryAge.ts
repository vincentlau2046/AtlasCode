/**
 * memoryAge — 从旧仓 memdir/memoryAge.ts 迁入（纯函数，无外部依赖）
 */
import { statSync } from 'fs'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Return memory age in days (float). Missing file → undefined.
 */
export function memoryAgeDays(filePath: string): number | undefined {
  try {
    const stat = statSync(filePath)
    // Clamp to 0: filesystem mtime precision can exceed Date.now() resolution,
    // yielding a tiny negative delta for just-created files (age can't be < 0).
    return Math.max(0, Date.now() - stat.mtimeMs) / DAY_MS
  } catch {
    return undefined
  }
}

/**
 * Return memory age in days (rounded) with descriptive bucket.
 */
export function memoryAge(filePath: string): { days: number; text: string } | undefined {
  const days = memoryAgeDays(filePath)
  if (days === undefined) return undefined
  return {
    days: Math.round(days),
    text: memoryFreshnessText(days),
  }
}

/**
 * Freshness label from a raw age in days.
 */
export function memoryFreshnessText(days: number): string {
  if (days < 1) return 'today'
  if (days < 2) return 'yesterday'
  if (days < 7) return `${Math.floor(days)} days ago`
  if (days < 14) return 'last week'
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`
  if (days < 60) return 'last month'
  if (days < 365) return `${Math.floor(days / 30)} months ago`
  return `${Math.floor(days / 365)} years ago`
}

/**
 * A single-line freshness note (empty if age unknown).
 */
export function memoryFreshnessNote(filePath: string): string {
  const age = memoryAge(filePath)
  if (!age) return ''
  return `(updated ${age.text})`
}
