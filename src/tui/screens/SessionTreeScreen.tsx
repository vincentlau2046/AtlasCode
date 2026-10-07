/* eslint-disable custom-rules/no-sync-fs -- W4 全量 lint 复原（§8.74.21）：legacy-debt 豁免（sync→async 改写违行为零改动纪律，W-opt 波再议） */
// SessionTreeScreen——/sessionlist 打开的 session 管理列表（17-TUI设计方案 v5 单一场景）
//
// 场景不变量：
// - 一个界面：浏览/进入/fork 全在此列表
// - 一条进入路径：enter（包括 fork 产物）
// - fork 不切换：fork 只刷新列表 + 置顶 + 光标定位
// - 反馈底部操作行（0.1.39-S1）：[f 再按确认] → forking… → ✓/✗ 收敛在
//   底部单一固定操作行（行内只剩数据 chip，操作提示不被列宽截断）
// - summary 二级行（0.1.39-S3）：x 键展开光标行摘要（变高行模型：展开行占
//   2 个物理行，窗口/clamp 全走 slot 前缀和单一事实源，光标-窗口 1:1 不变量
//   在变高下依然按构造成立）

import * as React from 'react'
import { Box, Text, useInput } from '../ink.js'
import { readFileSync, existsSync } from 'fs'
import type { LogOption } from '../types/logs.js'
import type { UUID } from 'crypto'
import { getGlobalConfig } from '../utils/config.js'
import { formatFileSize } from '../utils/format.js'
import { resolveThemeSetting } from '../utils/systemTheme.js'
import { getTheme, type Theme } from '../utils/theme.js'
import {
  loadSameRepoAllMessageLogs,
  isLiteLog,
  loadFullLog,
  countVisibleMessages,
} from '../utils/sessionStorage.js'
import type { TranscriptMessage } from '../types/logs.js'
import { getCurrentWorktreeSession } from '../utils/worktree.js'
import { getOriginalCwd, getSessionId } from 'src/bootstrap'
import { getLogDisplayTitle } from '../utils/log.js'
import { stripDisplayTagsAllowEmpty } from '../utils/displayTags.js'
import { saveCustomTitle } from '../utils/sessionStorage.js'
import {
  createFork,
  getUniqueForkName,
} from '../commands/branch/branch.js'

type Props = {
  onBack: () => void
  onResume: (sessionId: UUID, log: LogOption, entrypoint: 'slash_command_session_id') => Promise<void>
  /** 0.1.39-S5 可选键：agentic（LLM）搜索——本地同步过滤零命中且用户按
   * enter 时调用（调用方传入，屏面保持纯/本地；不传则搜索仅本地）。
   * 参照 LogSelector 的 onAgenticSearch prop 模式（agenticSessionSearch 接线）。 */
  onAgenticSearch?: (query: string, logs: LogOption[]) => Promise<LogOption[]>
}

type RowState =
  | { kind: 'idle' }
  | { kind: 'confirm' }
  | { kind: 'forking' }
  | { kind: 'done' }
  | { kind: 'error'; message: string }

/**
 * 一次读取 JSONL 文件，同时提取 forkedFrom（首行）和消息计数（非空行数）。
 * 合并 isBranchSession + messageCount 两项 I/O 为一次读，避免重复打开文件。
 *
 * 消息计数用非空行数近似：JSONL 每行一条消息，空行不计。
 * 这比 countVisibleMessages（需解析 JSON + 判 hasVisibleContent）轻得多，
 * 但包含了 summary/custom-title/ai-title 等元数据行——实际对话消息数会略少。
 * 列表场景下这个近似足够（用户只看体量级别：3 条 vs 100 条 vs 500 条）。
 *
 * 对已 enrich 的 log（messageCount > 0）跳过文件读取，直接用已有值。
 */
function getSessionFileMeta(log: LogOption): { isBranch: boolean; messageCount: number } {
  // 已 enrich 的 log 有真实 messageCount，直接用
  if (!log.isLite && log.messageCount > 0) {
    // isBranch 仍需从首行读（enrichLog 不提取 forkedFrom）
    return { isBranch: checkBranchFromFile(log.fullPath), messageCount: log.messageCount }
  }
  if (!log.fullPath || !existsSync(log.fullPath)) {
    return { isBranch: false, messageCount: log.messageCount ?? 0 }
  }
  try {
    const content = readFileSync(log.fullPath, 'utf-8')
    const lines = content.split('\n')
    // 首行 forkedFrom 检测
    const firstLine = lines.find(l => l.trim())
    let isBranch = false
    if (firstLine) {
      try { isBranch = !!JSON.parse(firstLine)?.forkedFrom?.sessionId } catch { /* 首行可能截断 */ }
    }
    // 非空行计数（近似消息数）
    let count = 0
    for (const line of lines) {
      if (line.trim()) count++
    }
    return { isBranch, messageCount: count }
  } catch {
    return { isBranch: false, messageCount: log.messageCount ?? 0 }
  }
}

/** 仅检查首行 forkedFrom（enrich 过的 log 用，不重复数行） */
function checkBranchFromFile(fullPath?: string): boolean {
  if (!fullPath || !existsSync(fullPath)) return false
  try {
    const firstLine = readFileSync(fullPath, 'utf-8').split('\n').find(l => l.trim())
    if (!firstLine) return false
    return !!JSON.parse(firstLine)?.forkedFrom?.sessionId
  } catch {
    return false
  }
}

// ── 可见宽度计算与截断（CJK/emoji 宽字符感知，保证表格对齐不换行） ──

function charWidth(ch: string): number {
  const code = ch.codePointAt(0) ?? 0
  // CJK 统一表意文字及全角区间按 2 列计
  if (
    (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
    (code >= 0x2e80 && code <= 0xa4cf) || // CJK 部首～Yi
    (code >= 0xac00 && code <= 0xd7a3) || // Hangul 音节
    (code >= 0xf900 && code <= 0xfaff) || // CJK 兼容表意
    (code >= 0xfe30 && code <= 0xfe4f) || // CJK 兼容形式
    (code >= 0xff00 && code <= 0xff60) || // 全角形式
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x3fffd)  // CJK 扩展 B-F
  ) return 2
  // emoji 常见区间按 2 列计
  if (code >= 0x1f300 && code <= 0x1faff) return 2
  return 1
}

export function visibleWidth(s: string): number {
  let w = 0
  for (const ch of s) w += charWidth(ch)
  return w
}

/** 截断到指定可见宽度（超宽补 …），保证输出宽度 <= maxWidth */
export function truncateToVisibleWidth(s: string, maxWidth: number): string {
  if (maxWidth <= 0) return ''
  let w = 0
  let out = ''
  for (const ch of s) {
    const cw = charWidth(ch)
    if (w + cw > maxWidth - 1) return out + '…'
    out += ch
    w += cw
  }
  return out
}

/** 右侧补空格到指定可见宽度（表格列对齐） */
export function padToVisibleWidth(s: string, width: number): string {
  const cur = visibleWidth(s)
  if (cur >= width) return truncateToVisibleWidth(s, width)
  return s + ' '.repeat(width - cur)
}

/** 左侧补空格到指定可见宽度（右对齐列，如消息数） */
function padLeftToVisibleWidth(s: string, width: number): string {
  const cur = visibleWidth(s)
  if (cur >= width) return truncateToVisibleWidth(s, width)
  return ' '.repeat(width - cur) + s
}

/** 绝对时间 M/D HH:mm（≤11 字符）——「最近活跃」列 >7 天时使用（保定位能力）。 */
function formatShortActive(date: Date): string {
  const m = date.getMonth() + 1
  const d = date.getDate()
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${m}/${d} ${h}:${min}`
}

/** 「最近活跃」列：≤7 天相对（now/5m/2h/6d，扫新近性），>7 天绝对（≤11 字符）。
 * 相对时间只用于近 7 天——更老的会话保留绝对日期时间以保准确定位。 */
function formatActive(date: Date, now: number): string {
  const ageMs = now - date.getTime()
  const m = Math.floor(ageMs / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  return formatShortActive(date)
}

/** 「创建」列：绝对 M/D/YYYY（≤10 字符），数据源 = 首条消息时间戳（P0-B）。 */
function formatCreated(date: Date): string {
  const m = date.getMonth() + 1
  const d = date.getDate()
  return `${m}/${d}/${date.getFullYear()}`
}

/** 列宽自适应（0.1.39-S2，替换 0.1.38 窄终端 <80 硬砍列）：
 * 固定前缀（光标+图标）与「最近活跃」列恒显；可选列按信息密度从低到高
 * 渐进隐藏（消息 → 分支 → 创建），名称列吃掉剩余宽度（下限 16 可见列）。
 * gap-B（0.1.39 gate）：名称列另扣比例 chip 槽 round(budget×0.3)（行尾 chip 段
 * 预算，砍列阈值不含）。纯面（零 I/O），供单测判别 + 渲染段消费。 */
export function computeColumnLayout(termCols: number): {
  nameW: number
  showCreated: boolean
  showBranch: boolean
  showMsg: boolean
} {
  const NAME_MIN = 16
  // 每列预算 = 列宽 + 前导 gap（名称列后接可选列，活跃列前导 gap 恒占）
  const ACTIVE_SLOT = 12 // gap + ACTIVE_W(11)
  const CREATED_SLOT = 12 // gap + CREATED_W(11)
  const BRANCH_SLOT = 13 // gap + BRANCH_W(12)
  const MSG_SLOT = 6 // gap + MSG_W(5)
  const LEFT = 4 // CURSOR_W(2) + ICON_W(2)，无 gap 拼接
  const PAD = 4 // paddingX 2×2
  const budget = termCols - PAD - LEFT - ACTIVE_SLOT
  let showCreated = true
  let showBranch = true
  let showMsg = true
  // 从最低密度列砍起：msg → branch → created
  if (budget < NAME_MIN + CREATED_SLOT + BRANCH_SLOT + MSG_SLOT) {
    showMsg = false
    if (budget < NAME_MIN + CREATED_SLOT + BRANCH_SLOT) {
      showBranch = false
      if (budget < NAME_MIN + CREATED_SLOT) {
        showCreated = false
      }
    }
  }
  let optional = 0
  if (showCreated) optional += CREATED_SLOT
  if (showBranch) optional += BRANCH_SLOT
  if (showMsg) optional += MSG_SLOT
  // gap-B（0.1.39 gate）：行尾标志 chip 段（tag/@agent/[C]/[PR #n]/(size)/[wt:]）
  // 预算随终端宽比例预留（≈30% budget）：wide 200 ≈ 54（全 chip 行最坏 ≈53 容纳，
  // e2e SL-S5-BADGES-chips）/ 100 列 ≈ 24（名称列仍 ≥25 不塌缩，无 chip 行不浪费死空）/
  // 窄档钳下限 16。仅收缩 nameW——砍列阈值在上不含此槽（showX 布尔零回归）；
  // 无预留则 nameW 吃全预算 → fixedW≈termCols → maxFlags≈0 行尾 chip 段恒截断。
  const flagsSlot = Math.round(budget * 0.3)
  const nameW = Math.max(NAME_MIN, budget - optional - flagsSlot)
  return { nameW, showCreated, showBranch, showMsg }
}

// ── S4 代理身份配色（theme 精确 8 色映射 + idle 圆点，替换 0.1.38 chalk 保守映射）──
// theme 代理色板字段带 _FOR_SUBAGENTS_ONLY 后缀（8 值域与 agentColor 值一一对应，
// 精确映射不近似——0.1.38 的 purple/pink→magenta、orange→yellow 对撞色在此消除）。

const AGENT_COLOR_THEME_FIELD: Record<string, keyof Theme> = {
  red: 'red_FOR_SUBAGENTS_ONLY',
  blue: 'blue_FOR_SUBAGENTS_ONLY',
  green: 'green_FOR_SUBAGENTS_ONLY',
  yellow: 'yellow_FOR_SUBAGENTS_ONLY',
  purple: 'purple_FOR_SUBAGENTS_ONLY',
  orange: 'orange_FOR_SUBAGENTS_ONLY',
  pink: 'pink_FOR_SUBAGENTS_ONLY',
  cyan: 'cyan_FOR_SUBAGENTS_ONLY',
}

/** agentColor（8 值域）→ theme 色板精确值（纯面判别锚点；域外/缺失 → undefined
 * 回落行默认色）。theme 入参注入 → 零 config 访问可单测。 */
export function agentColorToThemeColor(
  agentColor: string | undefined,
  theme: Theme,
): string | undefined {
  const field = agentColor ? AGENT_COLOR_THEME_FIELD[agentColor] : undefined
  return field ? theme[field] : undefined
}

/** 行配色裁定（S4 纯面）：选中 magentaBright / 焦点 cyan 优先于身份色；
 * idle 代理行 = 行整体 theme 身份色 + 实心圆点 ●（同色，一眼辨身份）；
 * 非代理行仅选中/当前行实心（当前行圆点 cyan），其余空心 ○。 */
export function agentRowColors(
  log: LogOption,
  isSelected: boolean,
  isFocused: boolean,
  isCurrent: boolean,
  theme: Theme,
): { rowColor?: string; dotColor?: string; dotGlyph: string } {
  const identity = agentColorToThemeColor(log.agentColor, theme)
  const rowColor = isSelected ? 'magentaBright'
    : isFocused ? 'cyan'
    : identity
  const dotGlyph = identity || isSelected || isCurrent ? '● ' : '○ '
  const dotColor = isSelected ? 'magentaBright'
    : identity !== undefined ? identity
    : isCurrent ? 'cyan'
    : undefined
  return { rowColor, dotColor, dotGlyph }
}

/** 底部操作行（单行固定）缺省提示（0.1.39-S1：fork 状态机从行内移到此处，
 * 提示行与错误行合并为单一固定行 → 底部行数恒定，光标-窗口不变量不受
 * 条件行破坏；「操作行单行」e2e 判据）。 */
export const SESSION_ROW_HINT =
  '🖱 点击移动光标 · 滚轮/↑↓ 滚动 · enter 选中/进入 · f fork · x 摘要 · q 返回'

/** 操作行纯面（S1 判别锚点）：行内只剩数据 chip，时效性操作提示（3s confirm
 * 窗口、forking、失败信息）全部收敛到底部操作行——不被列宽截断、不占行高。
 * idle 回落提示行（与提示合并 = 恒定单行）。 */
export function buildActionRow(
  state: RowState,
  title: string,
): { text: string; color?: string } {
  switch (state.kind) {
    case 'confirm':
      return { text: `✋ ${title} · [再按 f 确认 fork · 3s 自动取消]`, color: 'yellow' }
    case 'forking':
      return { text: `→ forking ${title}…`, color: 'yellow' }
    case 'done':
      return { text: `✓ 已创建分支 ${title}`, color: 'green' }
    case 'error':
      return { text: `✗ fork 失败 · ${state.message}`, color: 'red' }
    case 'idle':
    default:
      return { text: SESSION_ROW_HINT }
  }
}

// ── S3 变高行模型（summary 二级行）：行→物理行 slot 的单一事实源 ──
// 展开行 = 主行 + 二级摘要行 = 2 slot，普通行 = 1 slot。窗口计算与光标
// clamp 全走 slot 前缀和 → 渲染段物理行数恒 ≤ 视口行数 → 无原生 LF 滚动，
// 光标-窗口 1:1 不变量在变高下按构造成立。

/** 行 slot 成本（纯面判别锚点）：展开行 2，其余 1。 */
export function rowSlotCost(idx: number, expandedIdx: number | null): number {
  return idx === expandedIdx ? 2 : 1
}

/** 行 idx 之前的 slot 总数（行 idx 的 slot 起点偏移）。
 * [0,idx) 每行 1 slot，若展开行落在 [0,idx) 内额外 +1。 */
export function slotPrefix(idx: number, expandedIdx: number | null, count: number): number {
  const n = Math.min(Math.max(idx, 0), count)
  let slots = n
  if (expandedIdx !== null && expandedIdx < n) slots += 1
  return slots
}

/** 视口 slot 预算内可容纳的数据行窗口 [start, end)：
 * 装不下剩余 slot 的行不渲染（不截行——半行跨视口会触发原生 LF 滚动脱轨）。
 * offset 超界（列表刷新后行变少）钳到最后一行。 */
export function computeRenderWindow(
  count: number,
  offset: number,
  expandedIdx: number | null,
  visibleRows: number,
): { start: number; end: number } {
  if (count <= 0) return { start: 0, end: 0 }
  const start = Math.max(0, Math.min(offset, count - 1))
  let end = start
  let slots = 0
  while (end < count) {
    const cost = rowSlotCost(end, expandedIdx)
    if (slots + cost > visibleRows) break
    slots += cost
    end += 1
  }
  return { start, end }
}

/** 变高窗口光标 clamp：保证光标行（含其二级行成本）完整落在窗口 slot 区间。
 * 光标在窗口前 → 窗口起点跳到光标；否则逐行前推窗口直至容纳（offset 推过
 * 光标后由第一分支兜住，终止有界）。 */
export function clampWindowToCursor(
  focusedIdx: number,
  offset: number,
  expandedIdx: number | null,
  visibleRows: number,
  count: number,
): number {
  if (count <= 0 || visibleRows <= 0) return 0
  const cursor = Math.max(0, Math.min(focusedIdx, count - 1))
  let off = Math.max(0, Math.min(offset, count - 1))
  for (let guard = 0; guard <= count + 1; guard++) {
    const cStart = slotPrefix(cursor, expandedIdx, count)
    if (cStart < slotPrefix(off, expandedIdx, count)) return cursor
    const win = computeRenderWindow(count, off, expandedIdx, visibleRows)
    const cEnd = cStart + rowSlotCost(cursor, expandedIdx)
    if (cEnd <= slotPrefix(win.end, expandedIdx, count)) return off
    off += 1
  }
  return Math.max(0, count - 1)
}

/** 二级行内容（纯面判别锚点）：压缩摘要（log.summary）优先；缺省回落首个
 * 用户输入（去展示 tag，与标题链同源）；再无则占位——恒非空，展开行恒
 * 占 2 slot（窗口不变量稳定，不因内容缺失塌成 1 slot）。 */
export function getSummaryLine(log: LogOption): string {
  const s = (log.summary ?? '').trim()
  if (s) return s
  const fp = log.firstPrompt ? stripDisplayTagsAllowEmpty(log.firstPrompt) : ''
  if (fp) return fp
  return '（无摘要）'
}

// ── S5 搜索/过滤/排序 + 按需精确计数（纯面） ──

/** 排序键（s 键循环切换）：最近活跃（0.1.38 P0-B 默认）→ 创建 → 消息数 → 名称 */
export type SessionSortKey = 'modified' | 'created' | 'messages' | 'title'
export const SESSION_SORT_KEYS: readonly SessionSortKey[] = [
  'modified',
  'created',
  'messages',
  'title',
]
export const SESSION_SORT_LABELS: Record<SessionSortKey, string> = {
  modified: '最近活跃',
  created: '创建',
  messages: '消息数',
  title: '名称',
}

export function nextSortKey(current: SessionSortKey): SessionSortKey {
  const i = SESSION_SORT_KEYS.indexOf(current)
  return SESSION_SORT_KEYS[(i + 1) % SESSION_SORT_KEYS.length]!
}

/** 按键排序（返回新数组不 mutate 入参）：时间/消息数降序，名称升序。 */
export function sortLogsBy(logs: LogOption[], key: SessionSortKey): LogOption[] {
  const out = [...logs]
  switch (key) {
    case 'modified':
      out.sort((a, b) => b.modified.getTime() - a.modified.getTime())
      break
    case 'created':
      out.sort((a, b) => b.created.getTime() - a.created.getTime())
      break
    case 'messages':
      out.sort((a, b) => (b.messageCount ?? 0) - (a.messageCount ?? 0))
      break
    case 'title':
      out.sort((a, b) =>
        getLogDisplayTitle(a).localeCompare(getLogDisplayTitle(b)),
      )
      break
  }
  return out
}

/** 本地同步过滤（S5 方案 A：零 I/O 零 LLM，输入每击实时过滤）：
 * 标题链/摘要/首输入/分支/tag/代理/sessionId 大小写不敏感子串命中。 */
export function filterLogs(logs: LogOption[], query: string): LogOption[] {
  const q = query.trim().toLowerCase()
  if (!q) return logs
  return logs.filter(l =>
    [
      getLogDisplayTitle(l),
      l.summary ?? '',
      l.firstPrompt ?? '',
      l.gitBranch ?? '',
      l.tag ?? '',
      l.agentSetting ?? '',
      l.sessionId ?? '',
    ].join(' ').toLowerCase().includes(q),
  )
}

/** LRU 缓存（S5 按需精确消息数消费）：插入序淘汰，重复 set 刷新新近位。
 * 纯面（零 I/O，单测判别淘汰序）。 */
export function makeLru<V>(max: number): {
  get: (k: string) => V | undefined
  set: (k: string, v: V) => void
  has: (k: string) => boolean
} {
  const m = new Map<string, V>()
  return {
    get: k => m.get(k),
    set: (k, v) => {
      if (m.has(k)) m.delete(k)
      m.set(k, v)
      if (m.size > max) {
        const oldest = m.keys().next().value
        if (oldest !== undefined) m.delete(oldest)
      }
    },
    has: k => m.has(k),
  }
}

// 顶部/底部固定行预算（输入 handler 与渲染段共用单一事实源——旧输入段用
// HEADER_ROWS=3 而渲染段用 4，输入侧窗口比渲染侧多 1 行 → 末行不可达，
// 统一后两侧同预算）。
const HEADER_ROWS = 4  // 标题 + 列头 + marginTop×2
const FOOTER_ROWS = 2  // 底部操作行（S1 单行固定）+ marginTop

export function SessionTreeScreen({
  onBack,
  onResume,
  onAgenticSearch,
}: Props): React.ReactNode {
  const [logs, setLogs] = React.useState<LogOption[]>([])
  const [loading, setLoading] = React.useState(true)
  const [focusedIdx, setFocusedIdx] = React.useState(0)
  // 两段式 enter：第一次 enter 选中该行（selectedIdx），第二次 enter 进入。
  // null = 未选中。↑↓/点击移动光标时清除选中。
  const [selectedIdx, setSelectedIdx] = React.useState<number | null>(null)
  const [rowStates, setRowStates] = React.useState<Map<string, RowState>>(new Map())
  // 虚拟窗口滚动偏移（根治"光标与显示脱轨"，渲染段说明原理）
  const [scrollOffset, setScrollOffset] = React.useState(0)
  // S3：summary 二级行展开态（x 键切换）。绑定光标行——移动光标时展开跟随
  // 新焦点行（行级属性语义，不做 per-session 记忆）；expandedIdx = 展开时的
  // 焦点行索引，窗口/clamp 全走 S3 纯面（rowSlotCost/slotPrefix/…）。
  const [expanded, setExpanded] = React.useState(false)
  const expandedIdx = expanded ? focusedIdx : null
  // S5：搜索/过滤/排序态。/ 进搜索模式（输入字符实时本地过滤，零 I/O）；
  // s 循环切换排序键；本地零命中 + enter + 可选键 onAgenticSearch（LLM 面，
  // 调用方注入，屏面不直接依赖网关）。
  const [searchMode, setSearchMode] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [sortKey, setSortKey] = React.useState<SessionSortKey>('modified')
  const [agenticResults, setAgenticResults] = React.useState<LogOption[] | null>(null)
  // S5 按需精确消息数：LRU 缓存（焦点行/展开行触发，不预读全量）；
  // 命中后 re-render 取用（精确值覆盖 getSessionFileMeta 的行数近似值）
  const exactCountCacheRef = React.useRef(makeLru<number>(64))
  const [, bumpExactCounts] = React.useReducer((x: number) => x + 1, 0)
  const confirmTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const forkInFlightRef = React.useRef(false)
  // 缓存每条 log 的 { isBranch, messageCount }，loadLogs 时填充，渲染段直接读
  const fileMetaCacheRef = React.useRef<Map<string, { isBranch: boolean; messageCount: number }>>(new Map())

  const setRowState = React.useCallback((sid: string, s: RowState) => {
    setRowStates(prev => {
      const next = new Map(prev)
      next.set(sid, s)
      return next
    })
  }, [])

  const loadLogs = React.useCallback(async () => {
    const wt = getCurrentWorktreeSession()
    const paths = wt ? [wt.worktreePath] : [getOriginalCwd()]
    // P0-A：加载全部有效 session（无 50 截断）；P0-B：按最后消息时间戳排序
    // （非文件 mtime）；P0-C1：纯读路径——列表打开不回写任何 session 文件
    // （旧 deriveAutoTitle + saveCustomTitle 回写会把每个 session 的 mtime
    // 顶到"现在"，排序塌成 tie-break）。标题显示走 getLogDisplayTitle 既有
    // fallback 链（agentName→customTitle→summary→firstPrompt(去 tag)→
    // sessionId 前 8 位），渲染层已 truncateToVisibleWidth 截断。
    const l = await loadSameRepoAllMessageLogs(paths)
    // 填充消息计数 + 分支标记。
    // enrichLog 设 isLite=false 但从不填 messageCount（保持 0），
    // 所以不能用 isLite 判断——改为检查 messageCount===0。
    // getSessionFileMeta 合并 forkedFrom + 行计数为一次读；结果缓存到
    // fileMetaCacheRef，渲染段直接读取不再重复打开文件。
    for (const log of l) {
      if (log.messageCount === 0 && log.fullPath) {
        const meta = getSessionFileMeta(log)
        ;(log as { messageCount?: number }).messageCount = meta.messageCount
        fileMetaCacheRef.current.set(log.sessionId ?? '', meta)
      } else {
        // messageCount 已有值（极少情况），只补 isBranch
        fileMetaCacheRef.current.set(log.sessionId ?? '', {
          isBranch: checkBranchFromFile(log.fullPath),
          messageCount: log.messageCount,
        })
      }
    }
    setLogs(l)
    setLoading(false)
  }, [])

  React.useEffect(() => {
    void loadLogs()
    // 卸载时清理确认计时器
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
    }
  }, [loadLogs])

  const doFork = React.useCallback(async (target: LogOption) => {
    if (!target.sessionId || !target.fullPath) return
    if (forkInFlightRef.current) return
    forkInFlightRef.current = true
    setRowState(target.sessionId, { kind: 'forking' })
    try {
      const { sessionId, forkPath } = await createFork(undefined, {
        sessionId: target.sessionId as UUID,
        fullPath: target.fullPath,
      })
      // 自动命名：原名 + " (Branch)"（getUniqueForkName 处理重名 → Branch 2/3...）
      const baseName = getLogDisplayTitle(target)
      const effectiveTitle = await getUniqueForkName(baseName)
      await saveCustomTitle(sessionId, effectiveTitle, forkPath)

      // 刷新列表 → 新 fork 按 modified 天然置顶；光标与窗口回到顶部。
      // selectedIdx 必须清空：旧值指向旧数组（重排前）的行，
      // 二次 enter 会进入错误 session 或越界。
      await loadLogs()
      setScrollOffset(0)
      setFocusedIdx(0)
      setSelectedIdx(null)
      setRowState(sessionId, { kind: 'done' })
      setTimeout(() => setRowState(sessionId, { kind: 'idle' }), 2000)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // S1：错误信息收敛到操作行（error 态自带 message，旧 bottomMessage 行已废）
      setRowState(target.sessionId, { kind: 'error', message })
      setTimeout(() => setRowState(target.sessionId, { kind: 'idle' }), 2000)
    } finally {
      forkInFlightRef.current = false
    }
  }, [loadLogs, setRowState])

  // ── 鼠标交互（点击移光标，进入统一走 enter） ──
  // 双击进入已砍除：ink 按键层把 clickCount>=2 截获给 onMultiClick（选词），
  // DOM onClick 结构性收不到双击。行 Box 加 noSelect 避免双击产生误导性选词高亮。
  function handleRowClick(idx: number): void {
    setFocusedIdx(idx)
    setSelectedIdx(null)
  }

  // ── S5 视图派生 + 按需精确计数（state 纯函数，输入 handler 与渲染段共用） ──
  const computeViewLogs = React.useCallback(
    (base: LogOption[], q: string, sk: SessionSortKey, agentic: LogOption[] | null): LogOption[] => {
      const local = q ? filterLogs(base, q) : base
      // agentic 结果只在「本地零命中」时兜底展示（query 变化会清 agentic 态）
      const chosen = agentic && local.length === 0 ? agentic : local
      return sortLogsBy(chosen, sk)
    },
    [],
  )

  /** 按需全读解析可见消息数（deferred 项 0.1.39 落）：lite log 走 loadFullLog
   * 真盘读，full log 零 I/O；结果进 LRU（重复键刷新新近位），失败静默——
   * 计数列回落行数近似值，不阻塞交互。 */
  const ensureExactCount = React.useCallback(
    async (log: LogOption): Promise<void> => {
      const sid = log.sessionId ?? ''
      if (!sid) return
      if (exactCountCacheRef.current.has(sid)) return
      try {
        const full = isLiteLog(log) ? await loadFullLog(log) : log
        exactCountCacheRef.current.set(
          sid,
          countVisibleMessages(full.messages as unknown as TranscriptMessage[]),
        )
        bumpExactCounts()
      } catch {
        // 按需增强失败 = 保持近似值（行计数），不阻塞
      }
    },
    [bumpExactCounts],
  )

  // ── 光标-窗口不变量（S3 变高版）──
  // 任何光标移动后，clampWindowToCursor（S3 纯面，slot 前缀和）调整
  // scrollOffset 使光标行（含展开二级行成本）完整落在窗口内 → 光标永远可见，
  // 只渲染可视区间行且物理行数 ≤ 视口 → 无溢出 → 无原生 LF 滚动 →
  // 光标逻辑索引与终端物理行按构造对齐，脱轨不可能发生。

  useInput((input, key, event) => {
    if (loading) return
    // S5：光标/交互作用于当前视图（过滤+排序后），非全量 logs
    const view = computeViewLogs(logs, query, sortKey, agenticResults)

    // ── S5 搜索模式（/ 进入）：可打印字符捕获进 query，实时本地过滤 ──
    // 置于 current guard 之前：本地零命中的空视图无光标行，但搜索模式必须
    // 仍可达（backspace/esc/enter/字符不可达会卡死用户，无法退出）
    if (searchMode) {
      if (key.backspace) {
        setQuery(q => q.slice(0, -1))
        setAgenticResults(null)
        setFocusedIdx(0)
      } else if (key.escape || input === '/') {
        setSearchMode(false)
        setQuery('')
        setAgenticResults(null)
        setFocusedIdx(0)
      } else if (key.return) {
        // 本地零命中 + 可选键 → LLM 语义搜索（调用方注入，屏面不依赖网关）
        if (onAgenticSearch && query.trim()) {
          const localCount = filterLogs(logs, query).length
          if (localCount === 0) {
            void onAgenticSearch(query, logs)
              .then(r => setAgenticResults(r))
              .catch(() => {
                /* LLM 面不可达/超时 = 保持本地零命中展示，不阻塞 */
              })
          }
        }
      } else if (
        input.length === 1 &&
        !key.ctrl &&
        !key.meta &&
        !key.backspace &&
        !key.return &&
        !key.escape &&
        input >= ' '
      ) {
        setQuery(q => q + input)
        setAgenticResults(null)
        setFocusedIdx(0)
      }
      event.stopImmediatePropagation()
      return
    }

    const current = view[focusedIdx]
    if (!current) return
    const state = rowStates.get(current.sessionId ?? '')?.kind ?? 'idle'
    // forking 期间所有操作键忽略（防半写状态退出/重复 fork）
    if (state === 'forking') return

    if (input === '/') {
      // S5：进搜索模式（清空旧 query，实时过滤随击键生效）
      setSearchMode(true)
      setQuery('')
      setAgenticResults(null)
      setFocusedIdx(0)
      event.stopImmediatePropagation()
      return
    } else if (input === 's') {
      // S5：循环切换排序键（视图重排，光标回顶）
      setSortKey(sk => nextSortKey(sk))
      setFocusedIdx(0)
      setScrollOffset(0)
      event.stopImmediatePropagation()
      return
    }

    // 虚拟窗口行数：终端行数减去头部（标题+列头）和底部（操作行）——
    // HEADER_ROWS/FOOTER_ROWS 与渲染段共用模块常量（单源，防两侧漂移）
    const termRows = process.stdout.rows ?? 24
    const visibleRows = Math.max(1, termRows - HEADER_ROWS - FOOTER_ROWS)
    const clamp = (next: number, off: number) =>
      clampWindowToCursor(next, off, expandedIdx, visibleRows, view.length)

    if (key.upArrow || key.wheelUp) {
      setSelectedIdx(null)
      setFocusedIdx(i => {
        const next = Math.max(0, i - 1)
        setScrollOffset(off => clamp(next, off))
        // S5：焦点行按需精确消息数（LRU 命中即返，未命中触发全读解析）
        void ensureExactCount(view[next])
        return next
      })
      // 独占按键：ink useInput 是全局 emitter，后续 listener（滚动/翻页等）
      // 不得再处理同一事件（修复上下键同时控制导航与翻页的冲突）
      event.stopImmediatePropagation()
    } else if (key.downArrow || key.wheelDown) {
      setSelectedIdx(null)
      setFocusedIdx(i => {
        const next = Math.min(view.length - 1, i + 1)
        setScrollOffset(off => clamp(next, off))
        void ensureExactCount(view[next])
        return next
      })
      event.stopImmediatePropagation()
    } else if (key.pageUp) {
      setSelectedIdx(null)
      setFocusedIdx(i => {
        const next = Math.max(0, i - visibleRows)
        setScrollOffset(off => clamp(next, off))
        void ensureExactCount(view[next])
        return next
      })
      event.stopImmediatePropagation()
    } else if (key.pageDown) {
      setSelectedIdx(null)
      setFocusedIdx(i => {
        const next = Math.min(view.length - 1, i + visibleRows)
        setScrollOffset(off => clamp(next, off))
        void ensureExactCount(view[next])
        return next
      })
      event.stopImmediatePropagation()
    } else if (input === 'x') {
      // S3：切换光标行 summary 二级行。退化解守：视口不足 2 行时展开行
      // （2 slot）放不下 → 忽略展开（只收不放），保窗口不变量。
      setExpanded(e => (e ? false : visibleRows >= 2))
      event.stopImmediatePropagation()
    } else if (key.escape || input === 'q') {
      onBack()
      event.stopImmediatePropagation()
    } else if (key.return) {
      // 两段式 enter：第一次选中当前行，第二次（同一行）才进入。
      if (selectedIdx === focusedIdx && current.sessionId) {
        // 第二次 enter → 进入。lite log 的 messages 为空，resume 第一行
        // deserializeMessages(log.messages) 拿到空数组会静默失败。必须先
        // loadFullLog 加载完整消息再传给 resume（与 /resume 命令
        // resume.tsx:144 的做法一致）。
        void (async () => {
          const fullLog = isLiteLog(current) ? await loadFullLog(current) : current
          void onResume(current.sessionId as UUID, fullLog, 'slash_command_session_id')
        })()
      } else {
        // 第一次 enter → 选中
        setSelectedIdx(focusedIdx)
      }
      event.stopImmediatePropagation()
    } else if (input === 'f' && current.sessionId && current.fullPath) {
      const sid = current.sessionId
      if (state === 'confirm') {
        // 第二次 f → 执行
        if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
        void doFork(current)
      } else {
        // 第一次 f → 行内提示，3s 超时取消。
        // 先清旧 timer：confirmTimerRef 全局单值，若另一行还挂着 confirm
        // 超时不清掉，旧行会永久卡在 confirm（timer 被本行覆盖）。
        if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
        setRowState(sid, { kind: 'confirm' })
        confirmTimerRef.current = setTimeout(() => {
          setRowState(sid, { kind: 'idle' })
        }, 3000)
      }
      event.stopImmediatePropagation()
    }
  })

  if (loading) {
    return (
      <Box flexDirection="column" paddingX={2} paddingTop={1}>
        <Text color="cyan" bold>🌲 Sessions</Text>
        <Text dimColor>Loading sessions…</Text>
      </Box>
    )
  }

  const currentSessionId = getSessionId()

  // ── S5 视图：全量 logs → 本地过滤（query）→ agentic 兜底（本地零命中）→ 排序 ──
  const viewLogs = computeViewLogs(logs, query, sortKey, agenticResults)

  // ── 表格化布局：列宽自适应（0.1.39-S2，替换 0.1.38 窄终端硬砍列）──
  // 宽度档位由 computeColumnLayout 纯面裁定（msg→branch→created 渐进隐藏 +
  // 名称列伸缩），e2e 宽/窄两档走查同一实现。
  const termCols = process.stdout.columns ?? 100
  const termRows = process.stdout.rows ?? 24
  const layout = computeColumnLayout(termCols)

  // 列宽定义（gap=1 空格分隔）
  const CURSOR_W = 2   // "> " / "  "
  const ICON_W   = 2   // "● " / "○ "
  const NAME_W   = layout.nameW
  const CREATED_W = 11  // formatCreated: M/D/YYYY ≤ 10
  const ACTIVE_W = 11  // formatActive: now/5m/2h/6d 或 M/D HH:mm ≤ 11
  const BRANCH_W = 12
  const MSG_W    = 5   // 右对齐，最多 5 位
  const GAP      = 1

  // 可选列可见性（S2 自适应，替代 NARROW 硬砍）
  const showCreated = layout.showCreated
  const showBranch  = layout.showBranch
  const showMsg     = layout.showMsg


  // ── 虚拟窗口（S3 变高版）──
  // 只渲染视口 slot 预算内能装下的数据行（computeRenderWindow，S3 纯面）。
  // 展开行占 2 物理行（主行+二级行），窗口按 slot 预算收敛 →
  // 渲染物理行数恒 ≤ 视口行数 → 无内容溢出 → 无原生 LF 滚动 →
  // 光标逻辑索引与终端物理行 1:1 对齐，脱轨按构造不可能发生。
  const visibleRows = Math.max(1, termRows - HEADER_ROWS - FOOTER_ROWS)
  // 确保 scrollOffset 在合法范围（列表/视图刷新后行数可能变少）
  const effectiveOffset = Math.min(scrollOffset, Math.max(0, viewLogs.length - visibleRows))
  const win = computeRenderWindow(viewLogs.length, effectiveOffset, expandedIdx, visibleRows)
  const startIdx = win.start
  const endIdx = win.end

  // 固定列总宽（用于计算标志段剩余宽度）
  let fixedW = CURSOR_W + ICON_W + NAME_W + ACTIVE_W
  let gapCount = 3  // cursor-icon 不分离，每列一个 gap
  if (showCreated) { fixedW += CREATED_W; gapCount++ }
  if (showBranch)  { fixedW += BRANCH_W; gapCount++ }
  if (showMsg)     { fixedW += MSG_W; gapCount++ }
  fixedW += gapCount * GAP

  // 列头行（dim 色，与数据行列宽对齐）。S5：尾部追加排序键/过滤指示
  //（操作行单行不变量不动，指示面走列头行），整行截断防溢出。
  const sortIndicator = ` · 排序:${SESSION_SORT_LABELS[sortKey]}`
  const filterIndicator = query ? ` · 过滤:"${query}"` : ''
  const headerLine = truncateToVisibleWidth(
    '  '  // cursor 占位
    + '  '                   // icon 占位
    + padToVisibleWidth('名称', NAME_W) + ' '
    + (showCreated ? padToVisibleWidth('创建', CREATED_W) + ' ' : '')
    + padToVisibleWidth('最近活跃', ACTIVE_W)
    + (showBranch ? ' ' + padToVisibleWidth('分支', BRANCH_W) : '')
    + (showMsg ? ' ' + padLeftToVisibleWidth('消息', MSG_W) : '')
    + sortIndicator
    + filterIndicator,
    Math.max(10, termCols - 4),
  )

  // 相对时间基准（一次渲染取一次，各行同基准不抖动）
  const nowMs = Date.now()

  // S4：代理身份配色走 theme 精确 8 色板（每次渲染取一次，各行共享）
  const theme = getTheme(resolveThemeSetting(getGlobalConfig().theme))

  // ── 底部操作行（S1 单行固定）：取最高优先非 idle 态（forking > confirm >
  // done > error），idle 回落提示行——旧 bottomMessage 错误行已并入，
  // 底部行数恒定，光标-窗口不变量不受条件行破坏 ──
  const STATE_PRIORITY: Record<RowState['kind'], number> = {
    forking: 4,
    confirm: 3,
    done: 2,
    error: 1,
    idle: 0,
  }
  let activeState: RowState = { kind: 'idle' }
  let activeSid = ''
  for (const [sid, s] of rowStates) {
    if (STATE_PRIORITY[s.kind] > STATE_PRIORITY[activeState.kind]) {
      activeState = s
      activeSid = sid
    }
  }
  const actionLog = activeSid ? logs.find(l => l.sessionId === activeSid) : undefined
  const actionRow = buildActionRow(
    activeState,
    actionLog ? getLogDisplayTitle(actionLog) || 'untitled' : 'untitled',
  )
  // S5：搜索模式时操作行被搜索态行占用（query 回显 + 退出提示 + 可选 LLM 键）。
  // 搜索态 fork 键不可达（输入段 searchMode 分支独占），状态行无入口，展示无歧义。
  const searchActionText = searchMode
    ? `搜索:"${query}"${onAgenticSearch ? ' · enter 触发语义搜索' : ''} · esc 退出`
    : undefined
  const actionText = truncateToVisibleWidth(
    searchActionText ?? actionRow.text,
    Math.max(10, termCols - 4),
  )
  const actionColor = searchMode ? 'cyan' : actionRow.color

  return (
    <Box flexDirection="column" paddingX={2} paddingTop={1}>
      <Text color="cyan" bold>🌲 Sessions</Text>
      <Text dimColor>{headerLine}</Text>
      <Box flexDirection="column" marginTop={1}>
        {logs.slice(startIdx, endIdx).map((log, _sliceIdx) => {
          const i = startIdx + _sliceIdx
          const sid = log.sessionId ?? ''
          const isFocused = i === focusedIdx
          const isSelected = i === selectedIdx
          const isCurrent = sid === currentSessionId
          const cached = fileMetaCacheRef.current.get(sid)
          const isBranch = cached?.isBranch ?? false
          // 选中态需要结构性标记：仅颜色（cyan→magenta）在部分终端主题下
          // 感知差异太弱，用户看不到"点亮"。光标符号随选中态变化，
          // 与颜色双重编码，任何主题下都可辨。
          const cursor = isSelected ? '» ' : isFocused ? '> ' : '  '
          // S4：圆点 = 身份标记（idle 代理行实心 ● 染 theme 身份色；非代理行
          // 仅选中/当前实心，当前行圆点 cyan），与行文字拆分渲染独立着色
          const { rowColor, dotColor, dotGlyph } = agentRowColors(
            log, isSelected, isFocused, isCurrent, theme,
          )
          const title = truncateToVisibleWidth(getLogDisplayTitle(log) || 'untitled', NAME_W)
          const created = formatCreated(log.created)
          const active = formatActive(log.modified, nowMs)
          const branch = log.gitBranch
            ? truncateToVisibleWidth(log.gitBranch, BRANCH_W)
            : '—'
          // S5：LRU 精确消息数优先（焦点/翻页触发按需全读解析），回落行数近似
          const exactCount = exactCountCacheRef.current.get(sid)
          const msgCount = String(
            exactCount ?? cached?.messageCount ?? log.messageCount ?? 0,
          )

          // 拼接固定宽度列 → 单一字符串 → 单个 <Text>，Ink 不会拆行。
          // 前 4 字符 = 光标(2)+圆点(2) 恒 ASCII，渲染段按 slice(0,2)/slice(2,4)
          // 拆出光标与圆点独立着色（S4），余段整行行色。
          let line = cursor + dotGlyph
            + padToVisibleWidth(title, NAME_W) + ' '
            + (showCreated ? padToVisibleWidth(created, CREATED_W) + ' ' : '')
            + padToVisibleWidth(active, ACTIVE_W)
          if (showBranch) line += ' ' + padToVisibleWidth(branch, BRANCH_W)
          if (showMsg)    line += ' ' + padLeftToVisibleWidth(msgCount, MSG_W)

          // 标志段（0.1.39-S1）：状态机已移底部操作行，行内只留数据 chip
          //（Branch/current/#tag/@agent/[C] 从左到右，超剩余宽度截断）
          let flags = ''
          if (isBranch)        flags += ' (Branch)'
          if (isCurrent)       flags += ' (current)'
          if (log.tag)         flags += ` #${log.tag}`
          if (log.agentSetting) flags += ` @${log.agentSetting}`
          if (log.mode === 'coordinator') flags += ' [C]'
          // 0.1.39-S5 裁定 B 增补显示面：数据层 0.1.38 enrichLog 已接线
          //（prNumber/fileSize/worktreeSession 进 LogOption），此处补渲染 chip
          if (log.prNumber) flags += ` [PR #${log.prNumber}]`
          if (log.fileSize) flags += ` (${formatFileSize(log.fileSize)})`
          if (log.worktreeSession?.worktreeName) {
            flags += ` [wt:${log.worktreeSession.worktreeName}]`
          }

          // 标志段截断到剩余宽度
          const maxFlags = termCols - 2 /*paddingX*/ - fixedW
          if (visibleWidth(flags) > maxFlags) {
            flags = truncateToVisibleWidth(flags, maxFlags)
          }
          line += ' ' + flags

          // S4：行色/圆点色/圆点字形已由上方 agentRowColors 裁定
          //（选中 magentaBright / 焦点 cyan 优先；idle 代理行 = theme 身份色 + 实心 ●）

          // S3：展开行渲染二级摘要行（dim，缩进到名称列起点 4 空格 + └）。
          // 二级行宽 = 终端宽 - paddingX(4) - 缩进+└+gap(6)，wrap=truncate 防溢。
          const summaryLine =
            '    └ ' +
            truncateToVisibleWidth(getSummaryLine(log), termCols - 4 - 6)
          return (
            <React.Fragment key={sid || i}>
              <Box noSelect onClick={() => handleRowClick(i)}>
                <Box flexDirection="row" noSelect>
                  <Text color={rowColor} bold={isFocused || isSelected}>
                    {line.slice(0, 2)}
                  </Text>
                  <Text color={dotColor} bold={isFocused || isSelected}>
                    {line.slice(2, 4)}
                  </Text>
                  <Text color={rowColor} bold={isFocused || isSelected} wrap="truncate">
                    {line.slice(4)}
                  </Text>
                </Box>
              </Box>
              {i === expandedIdx && (
                <Box noSelect>
                  <Text dimColor wrap="truncate">
                    {summaryLine}
                  </Text>
                </Box>
              )}
            </React.Fragment>
          )
        })}
        {viewLogs.length === 0 && (
          <Text dimColor>
            {query ? `No sessions match "${query}"` : 'No sessions found'}
          </Text>
        )}
      </Box>
      <Box marginTop={1}>
        <Text color={actionColor} dimColor={!actionColor} wrap="truncate">
          {actionText}
        </Text>
      </Box>
    </Box>
  )
}
