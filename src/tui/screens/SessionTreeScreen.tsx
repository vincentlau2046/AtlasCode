/* eslint-disable custom-rules/no-sync-fs -- W4 全量 lint 复原（§8.74.21）：legacy-debt 豁免（sync→async 改写违行为零改动纪律，W-opt 波再议） */
// SessionTreeScreen——/sessionlist 打开的 session 管理列表（17-TUI设计方案 v5 单一场景）
//
// 场景不变量：
// - 一个界面：浏览/进入/fork 全在此列表
// - 一条进入路径：enter（包括 fork 产物）
// - fork 不切换：fork 只刷新列表 + 置顶 + 光标定位
// - 反馈原位：[f 确认 fork] → → forking… → ✓/✗ 都在被操作的行上

import * as React from 'react'
import { Box, Text, useInput } from '../ink.js'
import { readFileSync, existsSync } from 'fs'
import type { LogOption } from '../types/logs.js'
import type { UUID } from 'crypto'
import { loadSameRepoMessageLogs, isLiteLog, loadFullLog } from '../utils/sessionStorage.js'
import { getCurrentWorktreeSession } from '../utils/worktree.js'
import { getOriginalCwd, getSessionId } from 'src/bootstrap'
import { getLogDisplayTitle } from '../utils/log.js'
import { saveCustomTitle } from '../utils/sessionStorage.js'
import {
  createFork,
  getUniqueForkName,
} from '../commands/branch/branch.js'

type Props = {
  onBack: () => void
  onResume: (sessionId: UUID, log: LogOption, entrypoint: 'slash_command_session_id') => Promise<void>
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

/** 会话列表专用时间格式：绝对时间 MM/DD HH:mm（≤11 字符）。
 * 相对时间（1h ago）无法准确找回会话，改为直接显示最后修改的日期时间。 */
function formatShortActive(date: Date): string {
  const m = date.getMonth() + 1
  const d = date.getDate()
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${m}/${d} ${h}:${min}`
}

export function SessionTreeScreen({ onBack, onResume }: Props): React.ReactNode {
  const [logs, setLogs] = React.useState<LogOption[]>([])
  const [loading, setLoading] = React.useState(true)
  const [focusedIdx, setFocusedIdx] = React.useState(0)
  // 两段式 enter：第一次 enter 选中该行（selectedIdx），第二次 enter 进入。
  // null = 未选中。↑↓/点击移动光标时清除选中。
  const [selectedIdx, setSelectedIdx] = React.useState<number | null>(null)
  const [rowStates, setRowStates] = React.useState<Map<string, RowState>>(new Map())
  const [bottomMessage, setBottomMessage] = React.useState<string | null>(null)
  // 虚拟窗口滚动偏移（根治"光标与显示脱轨"，渲染段说明原理）
  const [scrollOffset, setScrollOffset] = React.useState(0)
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
    let l = await loadSameRepoMessageLogs(paths)
    // 名称规范化：优先 customTitle；缺失时用 firstPrompt 生成
    // 一个干净的短名称并回写（source:'auto'），后续列表/详情统一显示该名称，
    // 不再裸显示 prompt 原文（长 prompt 截断混乱、不可读）。
    // 回写为异步批量进行，不阻塞列表渲染——先用生成值占位显示。
    for (const log of l) {
      if (log.customTitle || !log.sessionId) continue
      const auto = deriveAutoTitle(log)
      if (auto && log.fullPath) {
        // 先改内存副本（本屏立即可见）
        ;(log as { customTitle?: string }).customTitle = auto
        // 再异步落盘（失败静默，下次进入重试）
        void saveCustomTitle(log.sessionId as UUID, auto, log.fullPath, 'auto')
      }
    }
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

  /** 从 firstPrompt 派生干净短名称（去 tag、压空白、截 24 可见宽度） */
  function deriveAutoTitle(log: LogOption): string | null {
    const raw = log.firstPrompt ?? log.summary ?? ''
    if (!raw.trim()) return null
    // 去 XML tag（<command-name> 等）与系统注入内容
    const cleaned = raw
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!cleaned) return null
    return truncateToVisibleWidth(cleaned, 24)
  }

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
      setRowState(target.sessionId, { kind: 'error', message })
      setBottomMessage(message)
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

  // ── 光标-窗口不变量 ──
  // 任何光标移动后，调整 scrollOffset 使光标落在 [offset, offset+visible) 内。
  // 这保证光标永远可见，且只渲染可视区间行 → 无溢出 → 无原生 LF 滚动 →
  // 光标逻辑索引与终端物理行按构造对齐，脱轨不可能发生。
  function clampScrollToCursor(
    idx: number,
    offset: number,
    visible: number,
  ): number {
    if (visible <= 0) return offset
    if (idx < offset) return idx
    if (idx >= offset + visible) return idx - visible + 1
    return offset
  }

  useInput((input, key, event) => {
    if (loading) return
    const current = logs[focusedIdx]
    if (!current) return
    const state = rowStates.get(current.sessionId ?? '')?.kind ?? 'idle'
    // forking 期间所有操作键忽略（防半写状态退出/重复 fork）
    if (state === 'forking') return

    // 虚拟窗口行数：终端行数减去头部(标题+空行)和底部(提示行)
    const termRows = process.stdout.rows ?? 24
    const HEADER_ROWS = 3  // 标题行 + marginTop + 列表 marginTop
    const FOOTER_ROWS = 2  // 底部提示行 + marginTop
    const visibleRows = Math.max(1, termRows - HEADER_ROWS - FOOTER_ROWS)

    if (key.upArrow || key.wheelUp) {
      setSelectedIdx(null)
      setFocusedIdx(i => {
        const next = Math.max(0, i - 1)
        setScrollOffset(off => clampScrollToCursor(next, off, visibleRows))
        return next
      })
      // 独占按键：ink useInput 是全局 emitter，后续 listener（滚动/翻页等）
      // 不得再处理同一事件（修复上下键同时控制导航与翻页的冲突）
      event.stopImmediatePropagation()
    } else if (key.downArrow || key.wheelDown) {
      setSelectedIdx(null)
      setFocusedIdx(i => {
        const next = Math.min(logs.length - 1, i + 1)
        setScrollOffset(off => clampScrollToCursor(next, off, visibleRows))
        return next
      })
      event.stopImmediatePropagation()
    } else if (key.pageUp) {
      setSelectedIdx(null)
      setFocusedIdx(i => {
        const next = Math.max(0, i - visibleRows)
        setScrollOffset(off => clampScrollToCursor(next, off, visibleRows))
        return next
      })
      event.stopImmediatePropagation()
    } else if (key.pageDown) {
      setSelectedIdx(null)
      setFocusedIdx(i => {
        const next = Math.min(logs.length - 1, i + visibleRows)
        setScrollOffset(off => clampScrollToCursor(next, off, visibleRows))
        return next
      })
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

  // ── 表格化布局：固定列宽，每列独立宽度，信息完整不被截断 ──
  const termCols = process.stdout.columns ?? 100
  const termRows = process.stdout.rows ?? 24
  const NARROW = termCols < 80

  // 列宽定义（gap=1 空格分隔）
  const CURSOR_W = 2   // "> " / "  "
  const ICON_W   = 2   // "● " / "○ "
  const NAME_W   = NARROW ? 20 : 28
  const ACTIVE_W = 11  // formatShortActive: MM/DD HH:mm ≤ 11
  const BRANCH_W = 12
  const MSG_W    = 5   // 右对齐，最多 5 位
  const GAP      = 1

  // 窄终端降级：砍分支列和消息数列
  const showBranch = !NARROW
  const showMsg    = !NARROW


  // ── 虚拟窗口 ──
  // 只渲染 [scrollOffset, scrollOffset+visibleRows) 区间的行。
  // 渲染行数恒 ≤ 视口行数 → 无内容溢出 → 无原生 LF 滚动 →
  // 光标逻辑索引与终端物理行 1:1 对齐，脱轨按构造不可能发生。
  // 列头占 1 行（标题下方 dim 列名行），计入 HEADER_ROWS。
  const HEADER_ROWS = NARROW ? 4 : 4  // 标题 + 列头 + marginTop×2
  const FOOTER_ROWS = 2  // 底部提示行 + marginTop
  const visibleRows = Math.max(1, termRows - HEADER_ROWS - FOOTER_ROWS)
  // 确保 scrollOffset 在合法范围（列表刷新后行数可能变少）
  const effectiveOffset = Math.min(scrollOffset, Math.max(0, logs.length - visibleRows))
  const startIdx = effectiveOffset
  const endIdx = Math.min(logs.length, startIdx + visibleRows)

  // 固定列总宽（用于计算标志段剩余宽度）
  let fixedW = CURSOR_W + ICON_W + NAME_W + ACTIVE_W
  let gapCount = 3  // cursor-icon 不分离，icon-name/name-active 两个 gap
  if (showBranch) { fixedW += BRANCH_W; gapCount++ }
  if (showMsg)    { fixedW += MSG_W; gapCount++ }
  fixedW += gapCount * GAP

  // 列头行（dim 色，与数据行列宽对齐）
  const headerLine = '  '  // cursor 占位
    + '  '                   // icon 占位
    + padToVisibleWidth('名称', NAME_W) + ' '
    + padToVisibleWidth('最近活跃', ACTIVE_W)
    + (showBranch ? ' ' + padToVisibleWidth('分支', BRANCH_W) : '')
    + (showMsg ? ' ' + padLeftToVisibleWidth('消息', MSG_W) : '')

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
          const rowState = rowStates.get(sid)?.kind ?? 'idle'
          const rowStateObj = rowStates.get(sid)
          // 选中态需要结构性标记：仅颜色（cyan→magenta）在部分终端主题下
          // 感知差异太弱，用户看不到"点亮"。光标符号随选中态变化，
          // 与颜色双重编码，任何主题下都可辨。
          const cursor = isSelected ? '» ' : isFocused ? '> ' : '  '
          // 选中态圆点空心→实心（原始方案的点亮效果，被误删后恢复）；
          // 选中行同时是 current 时圆点保持实心，颜色已随选中变亮 magenta 区分
          const statusIcon = isSelected || isCurrent ? '● ' : '○ '
          const title = truncateToVisibleWidth(getLogDisplayTitle(log) || 'untitled', NAME_W)
          const active = formatShortActive(log.modified)
          const branch = log.gitBranch
            ? truncateToVisibleWidth(log.gitBranch, BRANCH_W)
            : '—'
          const msgCount = String(cached?.messageCount ?? log.messageCount ?? 0)

          // 拼接固定宽度列 → 单一字符串 → 单个 <Text>，Ink 不会拆行
          let line = cursor + statusIcon
            + padToVisibleWidth(title, NAME_W) + ' '
            + padToVisibleWidth(active, ACTIVE_W)
          if (showBranch) line += ' ' + padToVisibleWidth(branch, BRANCH_W)
          if (showMsg)    line += ' ' + padLeftToVisibleWidth(msgCount, MSG_W)

          // 标志段（从左到右追加，超剩余宽度截断）
          let flags = ''
          if (isBranch)        flags += ' (Branch)'
          if (isCurrent)       flags += ' (current)'
          if (log.tag)         flags += ` #${log.tag}`
          if (log.agentSetting) flags += ` @${log.agentSetting}`

          // 行内状态机
          let statusColor: string | undefined
          if (rowState === 'confirm') { flags += ' [f 确认 fork]'; statusColor = 'yellow' }
          else if (rowState === 'forking') { flags += ' → forking…'; statusColor = 'yellow' }
          else if (rowState === 'done') { flags += ' ✓ 已创建分支'; statusColor = 'green' }
          else if (rowState === 'error') { flags += ' ✗ fork 失败'; statusColor = 'red' }

          // 标志段截断到剩余宽度
          const maxFlags = termCols - 2 /*paddingX*/ - fixedW
          if (visibleWidth(flags) > maxFlags) {
            flags = truncateToVisibleWidth(flags, maxFlags)
          }
          line += ' ' + flags

          const color = rowStateObj && rowStateObj.kind !== 'idle'
            ? statusColor
            : isSelected ? 'magentaBright'
            : isFocused ? 'cyan' : undefined

          return (
            <Box
              key={sid || i}
              noSelect
              onClick={() => handleRowClick(i)}
            >
              <Text color={color} bold={isFocused || isSelected} wrap="truncate">
                {line}
              </Text>
            </Box>
          )
        })}
        {logs.length === 0 && <Text dimColor>No sessions found</Text>}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>🖱 点击移动光标 · 滚轮/↑↓ 滚动 · enter 选中/进入 · f fork · q 返回</Text>
      </Box>
      {bottomMessage && (
        <Box marginTop={1}>
          <Text color="red" wrap="truncate">✗ {bottomMessage}</Text>
        </Box>
      )}
    </Box>
  )
}
