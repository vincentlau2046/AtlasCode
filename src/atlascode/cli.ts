#!/usr/bin/env bun
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
 */
import { enforceNoDebugGuard, hasDevFlag, main, runDevCli } from '../cli'

async function binMain(): Promise<void> {
  enforceNoDebugGuard()
  const argv = process.argv.slice(2)
  if (hasDevFlag(argv)) {
    await runDevCli()
    return
  }
  await main()
}

void binMain().catch((err) => {
  console.error(err)
  process.exit(1)
})
