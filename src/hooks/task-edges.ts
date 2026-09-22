/**
 * hooks 域 — 2 条 task 边斩断注入端口（C-Deep 切片 3 T6，§8.14 ①②）
 *
 * L3：hooks 域不 import task 域。旧仓 hooks 直触 task TaskOutput 的 2 条边：
 *  ① L219-221 asyncRewake 分支 `shellCommand.taskOutput.getStdout()/getStderr()/cleanup()`
 *     → HookOutputCapture 窄面注入（组合根注入 task 域 TaskOutput 适配实现）
 *  ② L989 `new TaskOutput('hook_<pid>')` 直构 → createHookOutput(taskId) 工厂注入
 *     （组合根注入 task 域 createTaskOutput 适配实现）
 * 未注入 fail-fast（loud ≠ hollow，H6 防腐）——用到 task 输出路径却未注入 = 配置错误。
 */

/** ① 异步唤醒钩子读取 task 输出的窄面（TaskOutput 12 成员的钩子子集）。 */
export type HookOutputCapture = {
  getStdout: () => Promise<string>
  getStderr: () => string
  cleanup: () => void
}

/** ② 构造 per-process task 输出的工厂（旧仓 `new TaskOutput('hook_<pid>')`）。 */
export type CreateHookOutput = (taskId: string) => unknown

let _captureFactory: ((taskId: string) => HookOutputCapture) | null = null
let _createHookOutput: CreateHookOutput | null = null

/** 组合根注入 ①（task 域 TaskOutput → HookOutputCapture 适配）。 */
export function setHookOutputCaptureFactory(
  factory: (taskId: string) => HookOutputCapture,
): void {
  _captureFactory = factory
}

/** 读 ①。未注入 fail-fast。 */
export function getHookOutputCapture(taskId: string): HookOutputCapture {
  if (!_captureFactory) {
    throw new Error(
      'hooks HookOutputCapture 未注入 — 组合根须先 setHookOutputCaptureFactory（§8.14 ①，task 边斩断）',
    )
  }
  return _captureFactory(taskId)
}

/** 组合根注入 ②（task 域 createTaskOutput 适配）。 */
export function setCreateHookOutput(create: CreateHookOutput): void {
  _createHookOutput = create
}

/** 读 ②。未注入 fail-fast。 */
export function createHookOutput(taskId: string): unknown {
  if (!_createHookOutput) {
    throw new Error(
      'hooks createHookOutput 未注入 — 组合根须先 setCreateHookOutput（§8.14 ②，task 边斩断）',
    )
  }
  return _createHookOutput(taskId)
}

/** 测试复位（teardown 用）。 */
export function resetTaskEdges(): void {
  _captureFactory = null
  _createHookOutput = null
}
