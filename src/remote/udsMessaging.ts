/**
 * remote 域 — UDS messaging 启动面（remote 波 S-E2a，§8.68 R1③）。
 *
 * 旧仓来源（a8af45b）：src/utils/udsMessaging.ts 2L — **旧仓自身 any stub**：
 *   export const startUdsMessaging : any = (() => ({})) as any
 * 旧消费点 = 旧 setup.ts/main.tsx（CLI/TUI 面，域外 = CLI 波）；新仓零活
 * 消费方 = stub 面落盘 + 登记（H6：无消费点不加接缝——本 stub 为旧面逐字
 * 落盘非新接缝，真实现 = 新旧仓均 0-hit，登记不恢复）。
 */

/** 启动 UDS messaging（stub 面：no-op resolve，旧仓 any stub 逐字）。 */
export async function startUdsMessaging(_socketPath: string): Promise<void> {}
