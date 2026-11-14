/**
 * 渲染仪表化（0.1.110 W-AB4 件 A 分期①，f4 lock-face 批复 工单 §7
 * @273cf8ed；工单 docs/2026-11-14-p0-wave-01110-wab4-render-incremental-ticket.md）。
 *
 * 定性：零行为波（default-off env 门控仪表化）——UX-4 重绘 6.5× 根因定谳
 * 采证面（四候选贡献度分解：①damage 单矩形过宽 ②渲染节流缺失 ③静态区
 * 重入 ④diff 旁路面）。
 *
 * 门形（格 1 四点硬约束）：
 *  - env `ATLAS_RENDER_INSTRUMENTATION_LOG`（值 = JSONL 落盘路径）**模块
 *    顶层一次性读**（terminal.ts SYNC_OUTPUT_SUPPORTED「computed once at
 *    module load」同构）——per-frame 只读模块级布尔，禁 per-frame
 *    process.env 访问。
 *  - 关闭支零分配零 IO：唯一采样点在 ink.tsx onRender 尾（帧级单点，
 *    FrameEvent 发射点旁），先 `if (renderInstrumentationEnabled)` 门后构造
 *    任何对象/字符串——关闭路径无 Date.now、无字符串构造、无对象字面量。
 *  - 钩子粒度 = 帧级单点（diff/写完成后汇总）；diffEach 回调 cell 级零触碰。
 *  - 落盘 = appendFileSync JSONL（ATLAS_FRAME_TIMING_LOG bench 先例同构：
 *    sync 防帧丢；路径由 e2e 传 user-e2e 可控目录，产品零默认写）。
 *
 * bytes 口径（f4 批复注记 2）：仅计 stdout patch 载荷长度（cursor/clear 类
 * 控制序列不计）——**仅作同语料相对比较面，禁绝对量级外宣称**。
 *
 * dmg 口径（f4 批复注记 1）：直接复用 screen.ts `diffRegion()` 同源逻辑
 * （自 diffEach 原内联块逐字提取的单源函数），零镜像漂移。
 *
 * 双通道独立性：与 ATLAS_FRAME_TIMING_LOG bench 通道（interactiveHelpers
 * onFrame）并存不混采——本通道独立 env 名 + 独立落盘，bench 通道零触碰。
 */
import { appendFileSync } from 'fs'
import { diffRegion, type Screen } from './screen.js'
import type { Patch } from './frame.js'

/** literal-inventory envPrefixLiteral 预注册名（docs/literal-inventory.json）。 */
export const RENDER_INSTRUMENTATION_ENV = 'ATLAS_RENDER_INSTRUMENTATION_LOG'

// 模块顶层一次性读（格 1：禁 per-frame process.env 读）。
// eslint-disable-next-line custom-rules/no-process-env-top-level -- 格 1 门形预注册：模块加载期捕获常量（terminal.ts SYNC_OUTPUT_SUPPORTED 同构）
const logPath = process.env[RENDER_INSTRUMENTATION_ENV]

/** 关闭/开启单源布尔（ink.tsx 采样点门 + 本模块内部门同读此值）。 */
export const renderInstrumentationEnabled =
  typeof logPath === 'string' && logPath.length > 0

const epoch = performance.now()

let seq = 0

/** 逐帧指标行（工单格 3 四候选直证面原料 + 格 4 渲染口径单源）。 */
export function recordRenderFrame(params: {
  nextScreen: Screen
  prevScreen: Screen
  viewportH: number
  patches: readonly Patch[]
  frameMs: number
  diffMs: number
  writeMs: number
  commitMs: number
}): void {
  if (!renderInstrumentationEnabled) return
  seq += 1
  const region = diffRegion(params.prevScreen, params.nextScreen)
  const area = region.width * region.height
  const screenArea = params.nextScreen.width * params.nextScreen.height
  let bytes = 0
  let fullReset = false
  for (const patch of params.patches) {
    if (patch.type === 'stdout') bytes += patch.content.length
    else if (patch.type === 'clearTerminal') fullReset = true
  }
  // 候选③ 静态区重入直证：damage 区域与 scrollback 带交叠行数
  // （scrollback = screenH - viewportH；log-update 内部 cursorRestoreScroll
  // 细化不镜像——近似口径，头注声明）。
  const scrollbackRows = Math.max(0, params.nextScreen.height - params.viewportH)
  const overlapEnd = Math.min(region.y + region.height, scrollbackRows)
  const staticRowsTouched = Math.max(0, overlapEnd - region.y)
  // eslint-disable-next-line custom-rules/no-sync-fs -- 仪表化采样，sync 防帧丢（ATLAS_FRAME_TIMING_LOG bench 先例同构）
  appendFileSync(
    logPath!,
    JSON.stringify({
      seq,
      tMs: Math.round((performance.now() - epoch) * 1000) / 1000,
      frameMs: round3(params.frameMs),
      diffMs: round3(params.diffMs),
      writeMs: round3(params.writeMs),
      commitMs: round3(params.commitMs),
      patches: params.patches.length,
      bytes,
      dmg: {
        x: region.x,
        y: region.y,
        w: region.width,
        h: region.height,
        area,
        full: area >= screenArea && screenArea > 0,
      },
      prevScreenH: params.prevScreen.height,
      screenH: params.nextScreen.height,
      viewportH: params.viewportH,
      staticRowsTouched,
      fullReset,
    }) + '\n',
  )
}

/** unmount 终帧（第二 writeDiffToTerminal 调用点 ink.tsx unmount）——seq:-1 单独一行，不入帧率分母。 */
export function recordUnmountFrame(): void {
  if (!renderInstrumentationEnabled) return
  // eslint-disable-next-line custom-rules/no-sync-fs -- 仪表化采样，sync 防帧丢（ATLAS_FRAME_TIMING_LOG bench 先例同构）
  appendFileSync(
    logPath!,
    JSON.stringify({ seq: -1, tMs: Math.round((performance.now() - epoch) * 1000) / 1000 }) + '\n',
  )
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}
