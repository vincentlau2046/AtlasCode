#!/usr/bin/env node
/* eslint-disable custom-rules/no-process-exit -- W4 全量 lint 复原（§8.74.21）：CLI/壳合法进程出口点（exit 分发层/关闭工具/对话框退出动作），登记延后（exit 助手收敛 W-opt 波再议） */
/**
 * bin 入口（package.json "atlascode" → dist/cli.js；build 根路径不变）— 薄壳。
 *
 * S-C2 落盘（S-C1 前向接缝核销）：dev 面嗅探（cli 域 dev.ts 5 flag）→ 命中
 * 走 dev 面；未命中交接主面（dispatch.main → parse.runCli commander 解析）。
 * 旧仓时序保真：debug 守卫（旧 main.tsx 顶层 L244）= 本壳首行，任何命令
 * 执行前生效。
 *
 * G-1（§8.74.31，#197）：TUI 启动支并入 bin——atlas / atlascode（无参）与
 * atlas code 起 TUI（懒闭包动态 import ui/main，launcher.ts 同款）。原 S-C1
 * 裁定「TUI 不经 bin」废止：三命令齐归 bin（package.json 增 atlascode）。
 * 基线移位登记：dist/cli.js 由 0 bytes 占位转真内容（四件套 build 项口径）。
 *
 * W3-3d G-α 修波（§8.74.16 G）：主面交接前组合根接线（getCoreDependencies
 * lazy 单例）。缺此步时 modelprovider EndpointConfigSource 窗口停默认空
 * stub（roles.ts emptyEndpointConfigSource）→ role 池恒空 → "No models
 * configured for role ... (empty pool)" 假阴性（~/.atlas/settings.json 已配
 * modelRoles/providers 也读不到）——G-α 真跑首跑发现。组合根 ①-⑨ 全步覆盖
 * executor port / hooks bootstrap（runHooks fail-fast 面）/ permissions /
 * sandbox access / settings 面（旧仓语义 = headless 在完全接线进程内运行；
 * 交互 TUI 支经 tui/factory 同款装配，本支 = atlascode/compose 消费面）。
 * 落位壳入口（atlascode 域）而非 cli 公共域分派：cli allow 面不含
 * atlascode（公共层不反向依赖壳，eslint boundaries/element-types 硬约束）。
 * dev 面（--tools/--skills/--check/--e2e/--auth-help）暂不接线：现 5 flag
 * 均无模型车道消费（--e2e = Ascend mock 探针非 gateway 面）；dev 面将来
 * 若消费模型车道，随该切片在此扩接线（残留守登记）。
 */
import { enforceNoDebugGuard, hasDevFlag, main, runDevCli } from '../cli'
import { getCoreDependencies } from './compose'
import { mountDomains } from './mount'

async function binMain(): Promise<void> {
  enforceNoDebugGuard()
  // M3-S5：挂载 ascend 域包（先于组合根 + agent loop；getDomainMount() 消费面
  // 在 loopDeps 读 ascendTools / compose 读 skills+prompt+executor）
  mountDomains()
  const argv = process.argv.slice(2)
  if (hasDevFlag(argv)) {
    await runDevCli()
    return
  }
  // G-1（§8.74.31，#197）：交互 TUI 启动面——atlas / atlascode（无参）与
  // atlas code（子命令）起 TUI。TUI 支 = launcher.ts 同款懒闭包（动态 import
  // ui/main，执行期才触 tui 全闭包，headless 支零 TUI 重量）。`code` 子命令
  // 剥 token：TUI main 自读 process.argv（把剥后 positional 当初始 prompt）。
  // 其余（-p / --flag / 子命令）仍走 CLI 公共域 main()。L3 边界：TUI 接线落
  // 壳（atlascode 域），cli 公共域不反向依赖壳（parse.ts 交互支前向缝保留
  // = 直调 main() 兜底，不经 bin 的三命令路径不可达）。
  const isTuiInvocation = argv.length === 0 || argv[0] === 'code'
  if (isTuiInvocation) {
    if (argv[0] === 'code') {
      process.argv = [process.argv[0]!, process.argv[1]!, ...argv.slice(1)]
    }
    // P0-1 修（TUI 车道空回合）：TUI 支挂 ui/main 前先 wire 壳组合根
    // （getCoreDependencies 8 域装配含 ⑤ hooks bootstrap）。旧路径 TUI 支只挂
    // tuiMain 不接线 → hooks 域 bootstrap 未设 → 首轮工具执行 pre-hook 抛
    // 「hooks bootstrap 未注入」reject 整个 agent loop（round_end 永不发射 /
    // record 永不执行）→ 空回合（斗兽棋确定性复现，斗兽棋→Write/Bash 2 tool_use
    // 后 preToolUse 断）。headless 支（下行 getCoreDependencies）同款接线，TUI 支对齐
    // （懒单例幂等，重复调用零副作用；tui 域 init 的 setEndpointConfigSource
    // 晚于本调用 = 后写者胜，#202/#203 模型池行为不变）。
    getCoreDependencies()
    const { main: tuiMain } = await import('./ui/main.js')
    await tuiMain()
    return
  }
  getCoreDependencies()
  await main()
}

void binMain().catch((err) => {
  console.error(err)
  process.exit(1)
})
