#!/usr/bin/env bun
/* eslint-disable custom-rules/no-process-exit -- W4 全量 lint 复原（§8.74.21）：CLI/壳合法进程出口点（exit 分发层/关闭工具/对话框退出动作），登记延后（exit 助手收敛 W-opt 波再议） */
/**
 * bin 入口（package.json "atlascode" → dist/cli.js；build 根路径不变）— 薄壳。
 *
 * S-C2 落盘（S-C1 前向接缝核销）：dev 面嗅探（cli 域 dev.ts 5 flag）→ 命中
 * 走 dev 面；未命中交接主面（dispatch.main → parse.runCli commander 解析）。
 * 旧仓时序保真：debug 守卫（旧 main.tsx 顶层 L244）= 本壳首行，任何命令
 * 执行前生效。
 *
 * 裁定（S-C1 保留）：TUI 默认启动支归 launcher 薄壳（#152 壳波），不经 bin。
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

async function binMain(): Promise<void> {
  enforceNoDebugGuard()
  const argv = process.argv.slice(2)
  if (hasDevFlag(argv)) {
    await runDevCli()
    return
  }
  getCoreDependencies()
  await main()
}

void binMain().catch((err) => {
  console.error(err)
  process.exit(1)
})
