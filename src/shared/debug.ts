/**
 * debug 日志（charter C-4：本期不加第 9 port，logging port 定案前维持占位）。
 *
 * 单一事实源（C1 统一裁定）：C-Deep 填 executor/sandbox stub 时旧仓 Shell.ts
 * 会大量 import logForDebugging——禁止每域各复制一份 no-op（B 波
 * modelprovider/debug.ts 先例已废）。logging port 定案后整文件替换为
 * port 实现（签名不变，调用点零改动）。
 *
 * 0.1.93b 段 R-aux（f4 裁定 2026-11-09，工单 @c22716f6 §3）：最小可注入
 * sink 窗（Port 5/Port 1 set/get 双函数 + 模块级持有先例同型）。背景 =
 * 0.1.93 W-D-A e2e 缺口回执：R-①/②/⑤ 判别格依赖的 swarm 域
 * `[inProcessRunner]` debug 行（~30 处）import 自本文件 = 纯 no-op →
 * 任何 lane 零输出，判别格空转；cli/debugSink.ts 完整 sink（--debug-file
 * 落盘 + ISO 时间戳）此前仅绑 cli 域三文件。
 *
 * 缺省零行为变更（锁面②）：sink 未注入 = 纯 no-op；仅 cli/debugSink 在
 * 启动期（initDebugSink，--debug/--debug-file/env DEBUG 任一启用的既有
 * 组合入口）注册注入。与 C-4 前向兼容——logging port 定案时整文件替换，
 * set/get 窗口随替换面一并删除（登记：architecture-charter C-4 节扩格批注）。
 */

export type DebugLogLevel = 'verbose' | 'debug' | 'info' | 'warn' | 'error'

export type DebugSink = (
  message: string,
  options?: { level?: DebugLogLevel },
) => void

let _sink: DebugSink | null = null

/** 启动期注入（cli/debugSink initDebugSink 唯一生产调用点；测试面可置 null 复位）。 */
export function setDebugSink(sink: DebugSink | null): void {
  _sink = sink
}

/** 当前 sink（诊断/测试断言面；未注入 = null）。 */
export function getDebugSink(): DebugSink | null {
  return _sink
}

/** 经注入 sink 转发；未注入 = no-op（缺省零输出零 I/O，锁面②）。 */
export function logForDebugging(
  message: string,
  options?: { level: DebugLogLevel },
): void {
  if (_sink !== null) {
    _sink(message, options)
  }
}
