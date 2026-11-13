/**
 * 0.1.106 S3b 切片 1 —— bootstrapState → kernel/state 端口适配器。
 *
 * 真状态实现留在 tui/bootstrapState.ts（本文件仅包装，零行为变更）；两个
 * 组合根（tui/factory.ts TUI 车道 + atlascode/compose.ts headless 车道）
 * 经本适配器注入 kernel/state（lock-face 必答④ 三 lane 拓扑；probe 车道
 * 以缺省 NoopSeam 运行，真状态未注入 fail-fast 由 injection.ts 保证）。
 */
import {
  addInvokedSkill,
  clearInvokedSkillsForAgent,
  getInvokedSkillsForAgent,
  flushInteractionTime,
  getLastInteractionTime,
  updateLastInteractionTime,
  getActiveTimeCounter,
  getAgentColorMap,
  getLocCounter,
  getInitialMainLoopModel,
  getMainLoopModelOverride,
  setMainLoopModelOverride,
  getIsRemoteMode,
  setIsRemoteMode,
  getTurnClassifierCount,
  getTurnClassifierDurationMs,
  getTurnHookCount,
  getTurnHookDurationMs,
  getTurnToolCount,
  getTurnToolDurationMs,
  resetTurnClassifierDuration,
  resetTurnHookDuration,
  resetTurnToolDuration,
  addToTurnHookDuration,
  addToTurnClassifierDuration,
  clearSystemPromptSectionState,
  getSystemPromptSectionCache,
  setSystemPromptSectionCacheEntry,
  addSlowOperation,
  waitForScrollIdle,
  setLastAPIRequest,
  setLastAPIRequestMessages,
} from './bootstrapState.js'
import type {
  KernelBootstrapNoopSeam,
  KernelBootstrapStatePort,
} from '../kernel/state/ports.js'
import type { InvokedSkillRecord } from '../kernel/state/ports.js'

export function createKernelBootstrapStatePort(): KernelBootstrapStatePort {
  return {
    addInvokedSkill,
    clearInvokedSkillsForAgent,
    getInvokedSkillsForAgent,
    flushInteractionTime,
    getLastInteractionTime,
    updateLastInteractionTime,
    getActiveTimeCounter,
    getAgentColorMap,
    getLocCounter,
    getInitialMainLoopModel,
    getMainLoopModelOverride,
    setMainLoopModelOverride,
    getIsRemoteMode,
    setIsRemoteMode,
    getTurnClassifierCount,
    getTurnClassifierDurationMs,
    getTurnHookCount,
    getTurnHookDurationMs,
    getTurnToolCount,
    getTurnToolDurationMs,
    resetTurnClassifierDuration,
    resetTurnHookDuration,
    resetTurnToolDuration,
    addToTurnHookDuration,
    addToTurnClassifierDuration,
    clearSystemPromptSectionState,
    getSystemPromptSectionCache,
    setSystemPromptSectionCacheEntry,
  }
}

export function createKernelBootstrapNoopSeam(): KernelBootstrapNoopSeam {
  return {
    addSlowOperation: () => {
      addSlowOperation()
    },
    waitForScrollIdle: () => {
      void waitForScrollIdle()
    },
    setLastAPIRequest: () => {
      setLastAPIRequest()
    },
    setLastAPIRequestMessages: () => {
      setLastAPIRequestMessages()
    },
  }
}

// InvokedSkillRecord 型随 kernel/state 收编（消费面 re-export 兜底在
// bootstrapState.ts）；此处仅为适配器签名引入。
export type { InvokedSkillRecord }
