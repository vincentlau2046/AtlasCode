/**
 * 0.1.106 S3b 内核态分层切片 1 —— bootstrapState 端口缝（lock-face 必答②终形）。
 *
 * 三态判形（docs/2026-11-13-01106-s3b-lockface-main.md 必答①，
 * 附件 bs-export-triage.csv 115 行逐件）：
 *   - 真状态 29 名（28 函数 + InvokedSkillRecord 类型）→ 本文件 KernelBootstrapStatePort
 *   - no-op 86 名 → 留 tui 桥原位；唯首车缝消费 4 名入 KernelBootstrapNoopSeam
 *   - 分歧 3 名（getAllowedSettingSources / getFlagSettingsPath /
 *     setAllowedSettingSources，S3a 护栏锁定）→ 禁入本缝接口
 *     （格 2 负断言：缝接口名集 ∩ 分歧名集 = ∅，tests/unit/kernel-state-seam.test.ts）
 *
 * 缺省语义逐件写死（两态相反，工单 §6 硬约束 B）：
 *   - 真状态（StatePort）：未注入 = 显式抛错（fail-fast，injection.ts）
 *   - no-op（NoopSeam）：未注入 = 缺省空实现，合法（injection.ts DEFAULT_NOOP_SEAM）
 *
 * 本域零 tui import（签名面本地重述，实现留在 src/tui/bootstrapState.ts，
 * tui 桥组合根构造真实现注入——kernel 不感知实现）。
 */

/** FX-04 invoked-skill 记录（原 tui/bootstrapState.ts:48 定义，本域收编 +
 * bootstrapState re-export 兜底，消费者零改动）。 */
export interface InvokedSkillRecord {
  skillName: string
  skillPath: string
  content: string
  invokedAt: number
}

/** 真状态端口：bootstrapState 中引用模块级可变状态的 28 函数。 */
export interface KernelBootstrapStatePort {
  // ── FX-04 invoked-skill 三件 ──
  addInvokedSkill(
    skillName: string,
    skillPath: string,
    content: string,
    agentId: string | null,
  ): void
  clearInvokedSkillsForAgent(agentId: string | null): void
  getInvokedSkillsForAgent(
    agentId: string | null | undefined,
  ): Map<string, InvokedSkillRecord>
  // ── 交互时间三件（0.1.87 插入件 I 契约）──
  flushInteractionTime(): void
  getLastInteractionTime(): number
  updateLastInteractionTime(force?: boolean): void
  // ── 计数器三件 ──
  getActiveTimeCounter(): unknown
  getAgentColorMap(): unknown
  getLocCounter(): unknown
  // ── 主循环模型 ──
  getInitialMainLoopModel(): string | null
  getMainLoopModelOverride(): string | undefined
  setMainLoopModelOverride(model: string | undefined): void
  // ── remote mode（本 build 恒 false 面，见 bootstrapState:146 注）──
  getIsRemoteMode(): boolean
  setIsRemoteMode(v: boolean): void
  // ── turn 累加器族 11 ──
  getTurnClassifierCount(): number
  getTurnClassifierDurationMs(): number
  getTurnHookCount(): number
  getTurnHookDurationMs(): number
  getTurnToolCount(): number
  getTurnToolDurationMs(): number
  resetTurnClassifierDuration(): void
  resetTurnHookDuration(): void
  resetTurnToolDuration(): void
  addToTurnHookDuration(durationMs: number): void
  addToTurnClassifierDuration(durationMs: number): void
  // ── system prompt section cache 三件 ──
  clearSystemPromptSectionState(): void
  getSystemPromptSectionCache(): unknown
  setSystemPromptSectionCacheEntry(name: string, value: string | null): void
}

/** no-op 占位缝：首车（切片 2 出口 59 文件）直接消费的 4 名 bootstrapState
 * no-op 占位（bs-export-triage.csv 判形全 no-op）。缺省空实现合法。
 * 切片 2：签名按消费点原形保真（tui stub 为 any 吞参，透传参 = 调用面
 * 零改动；适配器 forward 原函数返回值）。 */
export interface KernelBootstrapNoopSeam {
  addSlowOperation(description: string, durationMs: number): void
  waitForScrollIdle(): Promise<void> | void
  setLastAPIRequest(params: unknown): void
  setLastAPIRequestMessages(messages: unknown): void
}
