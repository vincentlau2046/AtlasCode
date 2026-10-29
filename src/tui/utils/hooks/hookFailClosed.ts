/**
 * K3-A10（0.1.82，上游 300 对齐）：插件 hook 输入不可达时 fail-closed。
 *
 * 上游语义：插件 hook 无法接收/回传值时，其所门控的动作**可拒收**而非
 * 默认放行。工单裁定方向 = fail-closed（拒收优先）——仅当两个条件同时
 * 成立：
 *  1. **插件来源**（pluginRoot 在场）——settings/session 面的投递失败
 *     维持 A5/A6 fail-soft 裁定（本地配置错误不拦用户的门控动作）；
 *  2. **门事件**（结果可阻塞动作的事件集）——非门事件（PostToolUse 等）
 *     的结果本就不消费阻塞信号，拒收无意义，恒 fail-open。
 *
 * hook 本体运行失败（crash/timeout/非零退出）不在本面——那是 A5 的
 * fail-soft 裁定域，不变。
 *
 * ★域内发现（随波报告 surface，不在本件修）：插件 hook 注册/读取桥
 * `registerHookCallbacks` / `getRegisteredHooks`（src/tui/bootstrapState.ts）
 * 自 C-7 桥重建（78624e4）起为 no-op stub——TUI 车道的插件 hook 注册
 * 写入 void。本模块在 pluginRoot 提取管线（getMatchingHooks）落位语义；
 * store 复活（行为激活）交独立裁定。
 */

/** 结果可阻塞动作的 hook 事件集（消费 blockingError / blocked 的面）。 */
const GATE_EVENTS: ReadonlySet<string> = new Set([
  'PreToolUse',
  'UserPromptSubmit',
  'PermissionRequest',
])

/**
 * 输入投递失败时该 hook 是否应 fail-close（拒收其门控的动作）。
 * 插件来源（pluginRoot 在场）× 门事件 → true；其余恒 false（fail-open）。
 */
export function shouldFailClosePluginHook(
  hookEvent: string,
  pluginRoot: string | undefined,
): boolean {
  return pluginRoot !== undefined && GATE_EVENTS.has(hookEvent)
}
