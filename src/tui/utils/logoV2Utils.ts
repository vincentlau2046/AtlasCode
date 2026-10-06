import { getSessionId } from 'src/bootstrap'
import { getDirectConnectServerUrl } from 'src/tui/bootstrapState.js'
import { stringWidth } from '../ink/stringWidth.js'
import type { LogOption } from '../types/logs.js'
import { getCwd } from './cwd.js'
import { getDisplayPath } from './file.js'
import {
  truncate,
  truncateToWidth,
  truncateToWidthNoEllipsis,
} from './format.js'
import { getStoredChangelogFromMemory, parseChangelog } from './releaseNotes.js'
import { gt } from './semver.js'
import { loadMessageLogs } from './sessionStorage.js'
import { getInitialSettings } from './settings/settings.js'

// Layout constants
const MAX_LEFT_WIDTH = 50
const MAX_USERNAME_LENGTH = 20
const BORDER_PADDING = 4
const DIVIDER_WIDTH = 1
const CONTENT_PADDING = 2
// O-12 档 A（0.1.35，spec §0.4）：宽终端（≥160 列）品牌卡条件居中阈值。
// columns≥160 时品牌块组合体左 margin=(cols−cardWidth)/2 居中（宽屏仪式感回归）；
// <160 保持左锚定零回归。
export const WIDE_CENTRAL_MIN_COLUMNS = 160
// O-12 档 C（0.1.35，spec §0.4）：宽终端（≥200 列）右侧重平衡阈值。
// columns≥200 时低权重元素右对齐（tagline 第 2 行 / 版本号+模型合并行）到 feed 列右缘，
// 卡内 meta 压缩（version+model 合并、cwd 下沉 footer ⌂ 段）；<200 保持档 A 形态零回归。
export const WIDE_REBALANCE_MIN_COLUMNS = 200

export type LayoutMode = 'horizontal' | 'compact'

export type LayoutDimensions = {
  leftWidth: number
  rightWidth: number
  totalWidth: number
  /** O-12 档 A：品牌卡左 margin（columns≥160 居中时 >0，否则 0；LogoV2 侧以 marginLeft 施加） */
  leftPad: number
  /** O-12 档 C：宽终端右侧重平衡（columns≥200 horizontal 时 true；LogoV2 侧右对齐低权重 meta） */
  rebalance: boolean
}

/**
 * Determines the layout mode based on terminal width
 */
export function getLayoutMode(columns: number): LayoutMode {
  if (columns >= 70) return 'horizontal'
  return 'compact'
}

/**
 * Calculates layout dimensions for the LogoV2 component
 */
export function calculateLayoutDimensions(
  columns: number,
  layoutMode: LayoutMode,
  optimalLeftWidth: number,
): LayoutDimensions {
  if (layoutMode === 'horizontal') {
    const leftWidth = optimalLeftWidth
    // O-12 档 A（0.1.35 spec §0.4）：宽终端品牌卡条件居中——columns≥160 时
    // 品牌块组合体左 margin=(cols−cardWidth)/2（cardWidth=optimalLeftWidth）；
    // <160 左锚定（leftPad=0，零回归）。居中占用的水平空间计入 usedSpace，
    // 右栏（feed）按剩余可用宽度收缩，保证整行不溢出屏宽。
    const leftPad =
      columns >= WIDE_CENTRAL_MIN_COLUMNS
        ? Math.floor((columns - leftWidth) / 2)
        : 0
    const usedSpace =
      BORDER_PADDING + CONTENT_PADDING + DIVIDER_WIDTH + leftPad + leftWidth
    const availableForRight = columns - usedSpace

    let rightWidth = Math.max(30, availableForRight)
    const totalWidth = Math.min(
      leftPad + leftWidth + rightWidth + DIVIDER_WIDTH + CONTENT_PADDING,
      columns - BORDER_PADDING,
    )

    // Recalculate right width if we had to cap the total
    if (
      totalWidth <
      leftPad + leftWidth + rightWidth + DIVIDER_WIDTH + CONTENT_PADDING
    ) {
      rightWidth =
        totalWidth - leftPad - leftWidth - DIVIDER_WIDTH - CONTENT_PADDING
    }

    // O-12 档 C（0.1.35 spec §0.4）：宽终端（≥200 列）右侧重平衡——
    // 低权重元素（tagline 第 2 行 / 版本号+模型合并行）右对齐到 feed 列右缘 +
    // 卡内 meta 压缩（version+model 合并、cwd 下沉 footer ⌂ 段）。
    // 仅加性布尔维度：右对齐行叠于 feed 列宽度之上，不改变档 A 尺寸公式。
    const rebalance = columns >= WIDE_REBALANCE_MIN_COLUMNS
    return { leftWidth, rightWidth, totalWidth, leftPad, rebalance }
  }

  // Vertical mode
  const totalWidth = Math.min(columns - BORDER_PADDING, MAX_LEFT_WIDTH + 20)
  return {
    leftWidth: totalWidth,
    rightWidth: totalWidth,
    totalWidth,
    leftPad: 0,
    rebalance: false,
  }
}

/**
 * O-12 档 C（0.1.35）：version+model 合并 meta 行（低权重，≥200 列右侧重平衡时
 * 右对齐于 feed 列右缘；版本号自 welcome 边框标题下沉至此，边框标题去版本号）。
 */
export function formatRebalanceMetaLine(
  version: string,
  modelLine: string,
): string {
  return `v${version} · ${modelLine}`
}

/**
 * Calculates optimal left panel width based on content
 */
export function calculateOptimalLeftWidth(
  welcomeMessage: string,
  truncatedCwd: string,
  modelLine: string,
): number {
  const contentWidth = Math.max(
    stringWidth(welcomeMessage),
    stringWidth(truncatedCwd),
    stringWidth(modelLine),
    20, // Minimum for clawd art
  )
  return Math.min(contentWidth + 4, MAX_LEFT_WIDTH) // +4 for padding
}

/**
 * Formats the welcome message based on username
 */
export function formatWelcomeMessage(username: string | null): string {
  if (!username || username.length > MAX_USERNAME_LENGTH) {
    return 'Welcome back!'
  }
  return `Welcome back ${username}!`
}

/**
 * Truncates a path in the middle if it's too long.
 * Width-aware: uses stringWidth() for correct CJK/emoji measurement.
 */
export function truncatePath(path: string, maxLength: number): string {
  if (stringWidth(path) <= maxLength) return path

  const separator = '/'
  const ellipsis = '…'
  const ellipsisWidth = 1 // '…' is always 1 column
  const separatorWidth = 1

  const parts = path.split(separator)
  const first = parts[0] || ''
  const last = parts[parts.length - 1] || ''
  const firstWidth = stringWidth(first)
  const lastWidth = stringWidth(last)

  // Only one part, so show as much of it as we can
  if (parts.length === 1) {
    return truncateToWidth(path, maxLength)
  }

  // We don't have enough space to show the last part, so truncate it
  // But since firstPart is empty (unix) we don't want the extra ellipsis
  if (first === '' && ellipsisWidth + separatorWidth + lastWidth >= maxLength) {
    return `${separator}${truncateToWidth(last, Math.max(1, maxLength - separatorWidth))}`
  }

  // We have a first part so let's show the ellipsis and truncate last part
  if (
    first !== '' &&
    ellipsisWidth * 2 + separatorWidth + lastWidth >= maxLength
  ) {
    return `${ellipsis}${separator}${truncateToWidth(last, Math.max(1, maxLength - ellipsisWidth - separatorWidth))}`
  }

  // Truncate first and leave last
  if (parts.length === 2) {
    const availableForFirst =
      maxLength - ellipsisWidth - separatorWidth - lastWidth
    return `${truncateToWidthNoEllipsis(first, availableForFirst)}${ellipsis}${separator}${last}`
  }

  // Now we start removing middle parts

  let available =
    maxLength - firstWidth - lastWidth - ellipsisWidth - 2 * separatorWidth

  // Just the first and last are too long, so truncate first
  if (available <= 0) {
    const availableForFirst = Math.max(
      0,
      maxLength - lastWidth - ellipsisWidth - 2 * separatorWidth,
    )
    const truncatedFirst = truncateToWidthNoEllipsis(first, availableForFirst)
    return `${truncatedFirst}${separator}${ellipsis}${separator}${last}`
  }

  // Try to keep as many middle parts as possible
  const middleParts = []
  for (let i = parts.length - 2; i > 0; i--) {
    const part = parts[i]
    if (part && stringWidth(part) + separatorWidth <= available) {
      middleParts.unshift(part)
      available -= stringWidth(part) + separatorWidth
    } else {
      break
    }
  }

  if (middleParts.length === 0) {
    return `${first}${separator}${ellipsis}${separator}${last}`
  }

  return `${first}${separator}${ellipsis}${separator}${middleParts.join(separator)}${separator}${last}`
}

// Simple cache for preloaded activity
let cachedActivity: LogOption[] = []
let cachePromise: Promise<LogOption[]> | null = null

/**
 * Preloads recent conversations for display in Logo v2
 */
export async function getRecentActivity(): Promise<LogOption[]> {
  // Return existing promise if already loading
  if (cachePromise) {
    return cachePromise
  }

  const currentSessionId = getSessionId()
  cachePromise = loadMessageLogs(10)
    .then(logs => {
      cachedActivity = logs
        .filter(log => {
          if (log.isSidechain) return false
          if (log.sessionId === currentSessionId) return false
          if (log.summary?.includes('I apologize')) return false

          // Filter out sessions where both summary and firstPrompt are "No prompt" or missing
          const hasSummary = log.summary && log.summary !== 'No prompt'
          const hasFirstPrompt =
            log.firstPrompt && log.firstPrompt !== 'No prompt'
          return hasSummary || hasFirstPrompt
        })
        .slice(0, 3)
      return cachedActivity
    })
    .catch(() => {
      cachedActivity = []
      return cachedActivity
    })

  return cachePromise
}

/**
 * Gets cached activity synchronously
 */
export function getRecentActivitySync(): LogOption[] {
  return cachedActivity
}

/**
 * Formats release notes for display, with smart truncation
 */
export function formatReleaseNoteForDisplay(
  note: string,
  maxWidth: number,
): string {
  // Simply truncate at the max width, same as Recent Activity descriptions
  return truncate(note, maxWidth)
}

/**
 * Gets the common logo display data used by both LogoV2 and CondensedLogo
 */
export function getLogoDisplayData(): {
  version: string
  cwd: string
  billingType: string
  agentName: string | undefined
} {
  const version = process.env.DEMO_VERSION ?? MACRO.VERSION
  const serverUrl = getDirectConnectServerUrl()
  const displayPath = process.env.DEMO_VERSION
    ? '/code/claude'
    : getDisplayPath(getCwd())
  const cwd = serverUrl
    ? `${displayPath} in ${serverUrl.replace(/^https?:\/\//, '')}`
    : displayPath
  const billingType = 'API Usage Billing'
  const agentName = getInitialSettings().agent

  return {
    version,
    cwd,
    billingType,
    agentName,
  }
}

/**
 * Determines how to display model and billing information based on available width
 */
export function formatModelAndBilling(
  modelName: string,
  billingType: string,
  availableWidth: number,
): {
  shouldSplit: boolean
  truncatedModel: string
  truncatedBilling: string
} {
  const separator = ' · '
  const combinedWidth =
    stringWidth(modelName) + separator.length + stringWidth(billingType)
  const shouldSplit = combinedWidth > availableWidth

  if (shouldSplit) {
    return {
      shouldSplit: true,
      truncatedModel: truncate(modelName, availableWidth),
      truncatedBilling: truncate(billingType, availableWidth),
    }
  }

  return {
    shouldSplit: false,
    truncatedModel: truncate(
      modelName,
      Math.max(
        availableWidth - stringWidth(billingType) - separator.length,
        10,
      ),
    ),
    truncatedBilling: billingType,
  }
}

/**
 * Gets recent release notes for Logo v2 display from the stored changelog.
 */
export function getRecentReleaseNotesSync(maxItems: number): string[] {
  const changelog = getStoredChangelogFromMemory()
  if (!changelog) {
    return []
  }

  let parsed
  try {
    parsed = parseChangelog(changelog)
  } catch {
    return []
  }

  // Get notes from recent versions
  const allNotes: string[] = []
  const versions = Object.keys(parsed)
    .sort((a, b) => (gt(a, b) ? -1 : 1))
    .slice(0, 3) // Look at top 3 recent versions

  for (const version of versions) {
    const notes = parsed[version]
    if (notes) {
      allNotes.push(...notes)
    }
  }

  // Return raw notes without filtering or premature truncation
  return allNotes.slice(0, maxItems)
}
