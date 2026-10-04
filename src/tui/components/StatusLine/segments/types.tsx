// Atlas TUI 状态栏——通道 B 原生 segment 渲染框架
// 17-TUI设计方案 §9.1 双通道架构：通道 B 按 statusline.json 的 line1/line2
// 数组装配 segment 组件。每个 segment 是纯函数组件。
//
// 红线（§9.9.1）：本目录全部在 src/components/StatusLine/ 下（APP/UI 层），
// 禁止在 src/core/ 下新增 TUI 相关文件。

import * as React from 'react'
import type { TextProps } from '../../../ink.js'
import { Text } from '../../../ink.js'

// ── Segment 类型定义 ──────────────────────────────────────────────

/** Segment 渲染上下文：从 buildStatusLineCommandInput 的产出 + 终端宽度 */
export interface SegmentRenderContext {
  /** buildStatusLineCommandInput() 的完整返回（现状是 any，逐步收紧） */
  input: StatusLineCommandInputLike
  /** 可见终端宽度（columns） */
  width: number
  /** 密度模式 */
  density: 'simple' | 'detailed'
  /** 消息数组（TokSegment 反算 tok/s 用） */
  messages?: unknown[]
}

/** 对 StatusLineCommandInput 的结构化视图（字段名锁定，§9.9.1 接口契约红线） */
export interface StatusLineCommandInputLike {
  model?: { id: string; display_name: string }
  workspace?: { current_dir: string; project_dir: string; added_dirs: string[] }
  cost?: {
    total_duration_ms: number
    total_api_duration_ms: number
    total_lines_added: number
    total_lines_removed: number
  }
  context_window?: {
    total_input_tokens: number
    total_output_tokens: number
    context_window_size: number
    current_usage: {
      input_tokens: number
      output_tokens: number
      cache_creation_input_tokens: number
      cache_read_input_tokens: number
    } | null
    used_percentage: number | null
    remaining_percentage: number | null
  }
  exceeds_200k_tokens: boolean
  permission_mode?: string
  vim?: { mode: string }
  agent?: { name: string }
  worktree?: {
    name: string
    path: string
    branch: string
    original_cwd: string
    original_branch: string
  }
  output_style?: { name: string }
  session_name?: string
  version: string
}

/** Segment 组件签名——与 ccstatusline widget 同构（§9.7 开源印证） */
export type SegmentComponent = (
  ctx: SegmentRenderContext,
) => React.ReactNode

/** statusline.json 的 segment 配置项 */
export interface SegmentConfig {
  /** segment 标识名，对应 registry 里的 key */
  type: string
  /** 可选自定义显示文本（覆盖 segment 默认行为） */
  label?: string
  /** 可选颜色覆盖 */
  color?: string
}

/** statusline.json 结构 */
export interface StatusLineJsonConfig {
  simple?: {
    line1: SegmentConfig[]
  }
  detailed?: {
    line1: SegmentConfig[]
    line2: SegmentConfig[]
  }
}

// ── 默认 segment 配置（故障自愈降级用，§9.1.1） ────────────────────

// B1（2026-10-05 §4b）：role-fallback 独立段删除——回退信任线折入 model 段
// （ModelSegment 尾部黄 ↦ 尾标，§P0b①）
export const DEFAULT_SIMPLE_LINE1: SegmentConfig[] = [
  { type: 'model' },
  { type: 'thinking-level' },
  { type: 'permission-mode' },
  { type: 'context-bar' },
  { type: 'auto-compact-warning' },
  { type: 'cwd' },
]

export const DEFAULT_DETAILED_LINE1: SegmentConfig[] = [
  { type: 'model' },
  { type: 'thinking-level' },
  { type: 'permission-mode' },
  { type: 'context-bar' },
  { type: 'auto-compact-warning' },
  { type: 'cwd' },
]

export const DEFAULT_DETAILED_LINE2: SegmentConfig[] = [
  { type: 'git-combined' },
  { type: 'session-duration' },
  { type: 'tools-count' },
  { type: 'tok-s' },
  { type: 'tokens-in' },
  { type: 'tokens-out' },
]

// ── 辅助：色阶映射（§4.3 色阶约定，复用 theme.ts success/warning/error） ──

export function contextColorForPercentage(pct: number | null): string {
  if (pct == null) return 'gray'
  if (pct < 50) return 'green' // success
  if (pct <= 70) return 'yellow' // warning
  return 'red' // error
}

// ── 辅助：可见宽度截断（§9.7 借鉴 ccstatusline truncateStyledText） ──

export function truncateToWidth(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return ''
  // 简单按字符截断（CJK 宽度计算后续接入 stringWidth）
  if (text.length <= maxWidth) return text
  return text.slice(0, Math.max(0, maxWidth - 1)) + '…'
}

// ── Segment 渲染容器 ──────────────────────────────────────────────

/**
 * Segment 宿主组件——给每个 segment 一个独立的 fiber/hook 边界。
 * segment 组件内部会使用 hook（useSyncExternalStore/useRef/useAppState），
 * 若直接在 render 里以普通函数调用 component(ctx)，其 hook 会被拍扁进
 * 调用方（StatusLineInner）的 hook 链表；一旦 segment 集合随密度切换
 * （simple 无 line2 / detailed 有 line2）发生增减，调用方的 hook 数量
 * 与顺序变化即触发 Rules-of-Hooks 违例（useSyncExternalStore 内部
 * areHookInputsEqual 读到的 prevDeps 为 undefined → 运行时 TypeError）。
 * 用独立组件包裹后，每个 segment 的 hook 归入各自 fiber，增减 segment
 * 只影响对应宿主组件的 mount/unmount，不再扰动父级序列。
 *
 * 返回值是「内联文本片段」（` · ` + segment 的 <Text color>…</Text>），
 * 不是独立 flex 列。renderSegmentLine 用单个 <Text> 包裹所有宿主，
 * squashTextNodesToSegments 把它们拍平成一段连续文本，整行按容器宽度
 * 自然换行（而非每个 segment 各自截断成「表格化」乱码）。
 */
function SegmentHost({
  component,
  ctx,
  showSeparator,
}: {
  component: SegmentComponent
  ctx: SegmentRenderContext
  /** 是否在 segment 前插入 dim `·` 分隔符（由 renderSegmentLine 按 i>0 传入） */
  showSeparator?: boolean
}): React.ReactNode {
  const node = component(ctx)
  // segment 返回 null/false 时整体不渲染（分隔符一并消失），
  // 保证「空 segment 不留分隔符残余」。
  if (node == null || node === false) return null
  // 注意：非首 segment 一律带前导 ` · `。当中间某 segment 返回 null 时，
  // 其后首个有内容的 segment 仍会带 `·`（因 i>0 判定不看前序是否为空）。
  // 这是为保 hook 安全（不在 renderSegmentLine 里急切调 component 探测
  // 空值）而接受的小取舍；line2 的 git-combined 在非 git 仓库为 null 是
  // 唯一常见场景，视觉上多一个前导点可接受。
  return (
    <>
      {showSeparator && <Text dimColor> · </Text>}
      {node}
    </>
  )
}

/**
 * 将 segment 配置数组渲染为**单行连续文本**：所有 segment 装进一个 <Text>，
 * `·` 作内联分隔，segment 的着色 <Text> 作嵌套子节点。Ink 的
 * squashTextNodesToSegments 会把整棵子树拍平成一段 plainText，按容器
 * 宽度整体换行（per-segment 色彩按字符位置回填）——彻底告别 <Box gap>
 * 把每个 segment 当独立 flex 列、各自截断成「表格化」乱码的旧行为。
 *
 * SegmentHost 仍是独立组件（保 hook 隔离，见其注释）；它的 Fragment
 * 被 React 拍平进外层 <Text>，成为内联文本片段。
 */
export function renderSegmentLine(
  configs: SegmentConfig[],
  ctx: SegmentRenderContext,
  registry: Map<string, SegmentComponent>,
): React.ReactNode {
  return (
    <Text>
      {configs.map((cfg, i) => {
        const component = registry.get(cfg.type)
        if (!component) {
          // 未知 segment 类型：静默跳过（不崩 UI）
          return null
        }
        return (
          <SegmentHost
            key={`${cfg.type}-${i}`}
            component={component}
            ctx={ctx}
            showSeparator={i > 0}
          />
        )
      })}
    </Text>
  )
}
