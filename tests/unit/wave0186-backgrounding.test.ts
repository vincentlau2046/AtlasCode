/**
 * 0.1.86 K6 · 任务 E · 后台化/提示（工单 §E：K6-8/9/10）。
 *
 * 件与处置（Main 锁面实证 2026-11-03）：
 *
 * K6-8 中断后 idle-return-hint 又冒出（本文件行为测试面）—— 定因：REPL.tsx
 * idle-return-hint effect 的 timer 回调只查 `messages.length === 0`，无交互
 * 门。中断回合（esc）不更新 lastQueryCompletionTime（只有正常完成才更新），
 * isLoading 翻转触发 effect 重跑时 elapsed 含被中断回合全程 + 空闲段 →
 * remaining ≤ 0 → `Math.max(0, remaining)` 令 timer ~0ms 后立即触发 → hint
 * 冒出。兄弟路径 idle_notification（同文件）已有 fire-time 交互门
 * （`lastUserInteraction > lastQueryCompletionTime` 早退），本路径缺失。
 * 修 = 提取 fire gate 纯函数 `shouldShowIdleReturnHint`（新模块
 * src/tui/utils/idleReturnHint.ts），REPL.tsx timer 回调在 **触发时刻**
 * （非排程时刻）求值：中断 esc 与空闲窗内任意输入都会经 App.tsx 中央输入
 * 处理器 bump lastInteractionTime（ink/components/App.tsx L456 key 事件支）
 * → 交互时间 > 上次完成时间 → 抑制。语义严格对齐兄弟路径（严格 `>` 比较）。
 *
 * K6-9 ←for-agents 页脚 10s 隐藏（登记不修 [B:1P]）—— 上游 2.1.302 的
 * 「← for agents」页脚提示 + 10s 定时隐藏在本 fork 零对应物：全 tui 组件
 * grep 无该提示串、无 10s agent 计数定时器；agent 相关页脚仅
 * PromptInputFooterLeftSide 的 stop-agents（kill 快捷键）与 ↓ manage 提示。
 * 上游 UI 面不存在 → 无修复对象，登记。
 *
 * K6-10 ← 后台化三竞态（登记勘误不硬修）—— 锁面勘误：session 后台化在
 * 本 fork 被 SessionBackgroundHint.tsx 的 `isEnvTruthy("false")` 硬关
 * （L50 isLoading 支 + L67 sessionBgEnabled，de-ant/feature-flag 残留字面
 * 量）→ ctrl+b 双击 → handleBackgroundSession → handleBackgroundQuery →
 * startBackgroundSession 整链不可达（死代码路径）。三竞态全部不可达：
 * ①「停刚发起回合」定因 = handleBackgroundQuery 无条件
 * abortController.abort('background')——且上游 2.1.296 落地语义即「被停
 * 而非后台跑完」，现行为与上游 HEAD 一致；②「同一 prompt 重复运行」定因
 * 面 = 前台 command queue 不清 + 后台 session 带同一 prompt；③「SessionStart
 * hooks 提示丢失 / ↑ 恢复」= foregroundMainSessionTask（LocalMainSessionTask
 * L274）零调用者，恢复路径在本 fork 不存在。gate-off 下修死路径无行为红
 * 可能（违反 RED 纪律）且 ①与上游语义对齐 → 全部登记，gate 复开另立工单。
 *
 * 组合探针（Review Focus 3）：← 前发起回合 + ← + ↑ 恢复 + 重复提交防重
 * 一景串三状态机 —— 在 gate-off 现实下无可达面，随 K6-10 登记搁置；可达面
 * （K6-8 中断后 hint 不冒出）归 e2e PTY 探针（gate ⑤）。
 *
 * gate ① 口径（任务 D 先例）：本组 RED 为「新模块脚手架上的行为断言红」
 * （shouldShowIdleReturnHint 为新增面，修前 import-error 红）；组件级
 * REPL effect 无单测 harness，接线正确性由 tsc + e2e PTY 探针背书。
 */
import { describe, expect, test } from 'bun:test'

import { shouldShowIdleReturnHint } from '../../src/tui/utils/idleReturnHint.js'

describe('K6-8 · idle-return-hint 触发收窄（fire-time 交互门）', () => {
  test('RED→GREEN：中断回合后不冒 hint（交互时间 > 上次完成时间）', () => {
    // T0 = 上一回合正常完成；T1 = 用户提交被中断的 prompt（交互）；
    // T2 = esc 中断（交互，App.tsx key 事件支 bump）。timer 在 T2+ε 触发。
    expect(shouldShowIdleReturnHint({
      lastQueryCompletionTime: 1_000,
      lastInteractionTime: 1_500,
      messageCount: 6,
    })).toBe(false)
  })

  test('正常空闲（完成时间晚于最后交互）仍触发', () => {
    // T1 提交 → T2 完成（lqct 更新）→ 无后续输入 → 到点提示
    expect(shouldShowIdleReturnHint({
      lastQueryCompletionTime: 1_500,
      lastInteractionTime: 1_000,
      messageCount: 6,
    })).toBe(true)
  })

  test('锚：空闲窗内打字不提交也抑制（fire-time 求值的意义）', () => {
    // 排程时（effect 重跑）无交互；等待期间用户打字 → 触发时刻已交互
    expect(shouldShowIdleReturnHint({
      lastQueryCompletionTime: 1_500,
      lastInteractionTime: 2_000,
      messageCount: 6,
    })).toBe(false)
  })

  test('锚：交互时间等于完成时间不抑制（严格 >，对齐兄弟 idle_notification）', () => {
    expect(shouldShowIdleReturnHint({
      lastQueryCompletionTime: 1_500,
      lastInteractionTime: 1_500,
      messageCount: 6,
    })).toBe(true)
  })

  test('锚：空消息面不触发（原 guard 保留进 gate）', () => {
    expect(shouldShowIdleReturnHint({
      lastQueryCompletionTime: 1_000,
      lastInteractionTime: 0,
      messageCount: 0,
    })).toBe(false)
  })

  test('锚：从未交互（0）不抑制正常空闲触发', () => {
    expect(shouldShowIdleReturnHint({
      lastQueryCompletionTime: 1_000,
      lastInteractionTime: 0,
      messageCount: 6,
    })).toBe(true)
  })
})
