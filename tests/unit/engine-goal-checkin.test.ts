/**
 * 0.1.63 /goal 演化波 P4 — check-in 定时器判别单测。
 *
 * 判别矩阵（工单 §2）：
 *   P4 check-in：短常数 override（秒级）→ 定时器触发 check-in 回合（2.1.246
 *   提示词注入在场断言）+ 退避序列 30m→1h→2h 断言（短常数等比）+ 预算 3
 *   断言 + 用户消息 +3 刷新 + ATLAS_GOAL_CHECKIN_MINUTES=0 关断。
 *
 * 判别力 = 纯函数（env 解析 / 退避等比 / 预算门 / 刷新 / 提示词文本）。
 * I/O-free → unit 层。env 面 beforeEach 清 ATLAS_GOAL_CHECKIN_MINUTES。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  getGoalCheckInMinutes,
  getCheckInDelayMs,
  GOAL_CHECKIN_BACKOFF_MULTIPLIERS,
  MAX_GOAL_CHECKINS,
  CHECKIN_REFRESH_AMOUNT,
  goalCheckInPrompt,
  resetCheckInState,
  recordCheckIn,
  refreshOnUserMessage,
  getRemainingCheckIns,
  canCheckIn,
  getCheckInStateForTesting,
} from '../../src/engine/goal/goalCheckIn'
import { DEFAULT_GOAL_CHECKIN_MINUTES } from '../../src/engine/goal/goalCheckIn'

beforeEach(() => {
  delete process.env.ATLAS_GOAL_CHECKIN_MINUTES
  resetCheckInState()
})

afterEach(() => {
  delete process.env.ATLAS_GOAL_CHECKIN_MINUTES
  resetCheckInState()
})

describe('P4 check-in 定时器（env + 退避 + 预算 + 刷新 + 提示词）', () => {
  describe('env 解析（ATLAS_GOAL_CHECKIN_MINUTES）', () => {
    test('缺省 = 30 分钟（DEFAULT_GOAL_CHECKIN_MINUTES）', () => {
      expect(getGoalCheckInMinutes()).toBe(30)
      expect(DEFAULT_GOAL_CHECKIN_MINUTES).toBe(30)
    })

    test('env override = 秒级短常数（测试可测性，工单 §2 短常数 override）', () => {
      process.env.ATLAS_GOAL_CHECKIN_MINUTES = '0.1'
      expect(getGoalCheckInMinutes()).toBe(0.1)
    })

    test('env=0 = 关断（disabled，上游同构 =0 关断语义）', () => {
      process.env.ATLAS_GOAL_CHECKIN_MINUTES = '0'
      expect(getGoalCheckInMinutes()).toBe(0)
      // canCheckIn 门控：baseMinutes=0 → 永 false（关断）
      expect(canCheckIn()).toBe(false)
    })

    test('非法值（NaN/负数）= 回落缺省 30（fail-safe，不误关）', () => {
      process.env.ATLAS_GOAL_CHECKIN_MINUTES = 'not-a-number'
      expect(getGoalCheckInMinutes()).toBe(30)
      process.env.ATLAS_GOAL_CHECKIN_MINUTES = '-5'
      expect(getGoalCheckInMinutes()).toBe(30)
    })
  })

  describe('退避序列（30m→1h→2h 等比 1:2:4）', () => {
    test('GOAL_CHECKIN_BACKOFF_MULTIPLIERS = [1, 2, 4]（3 槽 = 预算 3）', () => {
      expect(GOAL_CHECKIN_BACKOFF_MULTIPLIERS).toEqual([1, 2, 4])
      expect(GOAL_CHECKIN_BACKOFF_MULTIPLIERS.length).toBe(MAX_GOAL_CHECKINS)
    })

    test('base=30 → [30m, 60m, 120m]（1800000/3600000/7200000 ms）', () => {
      expect(getCheckInDelayMs(0, 30)).toBe(30 * 60_000) // 30m
      expect(getCheckInDelayMs(1, 30)).toBe(60 * 60_000) // 1h
      expect(getCheckInDelayMs(2, 30)).toBe(120 * 60_000) // 2h
    })

    test('短常数等比保持（base=0.1min=6s → [6s, 12s, 24s]）', () => {
      const base = 0.1
      const d0 = getCheckInDelayMs(0, base)
      const d1 = getCheckInDelayMs(1, base)
      const d2 = getCheckInDelayMs(2, base)
      // 等比 1:2:4 保持
      expect(d1 / d0).toBe(2)
      expect(d2 / d0).toBe(4)
      expect(d0).toBe(6_000) // 0.1 min = 6s
      expect(d1).toBe(12_000)
      expect(d2).toBe(24_000)
    })

    test('超预算索引（index≥3）= Infinity（无第 4 次退避槽）', () => {
      expect(getCheckInDelayMs(3, 30)).toBe(Infinity)
      expect(getCheckInDelayMs(99, 30)).toBe(Infinity)
    })
  })

  describe('预算 3 + 刷新 +3', () => {
    test('初始 = 预算 3（MAX_GOAL_CHECKINS）', () => {
      expect(MAX_GOAL_CHECKINS).toBe(3)
      expect(getRemainingCheckIns()).toBe(3)
      expect(canCheckIn()).toBe(true)
    })

    test('recordCheckIn 递减 → 3 次后预算耗尽 canCheckIn=false', () => {
      recordCheckIn()
      expect(getRemainingCheckIns()).toBe(2)
      expect(canCheckIn()).toBe(true)
      recordCheckIn()
      expect(getRemainingCheckIns()).toBe(1)
      recordCheckIn()
      expect(getRemainingCheckIns()).toBe(0)
      // 预算耗尽 → 不再 check-in
      expect(canCheckIn()).toBe(false)
    })

    test('用户消息 +3 刷新（refreshOnUserMessage 重置计数）', () => {
      // 耗尽 3 次
      recordCheckIn()
      recordCheckIn()
      recordCheckIn()
      expect(canCheckIn()).toBe(false)
      // 用户发消息 → +3 刷新
      refreshOnUserMessage()
      expect(CHECKIN_REFRESH_AMOUNT).toBe(3)
      expect(getRemainingCheckIns()).toBe(3)
      expect(canCheckIn()).toBe(true)
    })

    test('refreshOnUserMessage 幂等（多次调用不叠加 >3）', () => {
      refreshOnUserMessage()
      refreshOnUserMessage()
      expect(getRemainingCheckIns()).toBe(3) // 不叠加
    })

    test('resetCheckInState = 归零（arm/clear 时消费）', () => {
      recordCheckIn()
      recordCheckIn()
      resetCheckInState()
      expect(getRemainingCheckIns()).toBe(3)
      const state = getCheckInStateForTesting()
      expect(state.checkInCount).toBe(0)
    })
  })

  describe('2.1.246 Autonomous loop check 提示词（国产适配裁剪面）', () => {
    test('goalCheckInPrompt 含 goal 条件 + steward 语义', () => {
      const prompt = goalCheckInPrompt('ship the parser module')
      expect(prompt).toContain('ship the parser module')
      // steward-not-initiator 语义（2.1.246 核心）：check-in 非 new work
      expect(prompt.toLowerCase()).toContain('goal')
      expect(prompt.toLowerCase()).toContain('check')
    })

    test('国产适配裁剪：无 1P 引用（无 cloud PR / 分支扫查语境）', () => {
      const prompt = goalCheckInPrompt('test condition')
      // 1P 裁除面：不出现云 PR 维护 / 分支扫查语境
      expect(prompt.toLowerCase()).not.toContain('pull request')
      expect(prompt.toLowerCase()).not.toContain('pr review')
      expect(prompt.toLowerCase()).not.toContain('branch scan')
    })

    test('BR-8：无字面 + 号（品牌串标准）', () => {
      const prompt = goalCheckInPrompt('condition')
      expect(prompt).not.toContain('+')
    })

    test('repeated invocations 收敛语义在场（3 次 no-op 降级）', () => {
      const prompt = goalCheckInPrompt('condition')
      // 2.1.246 repeated invocations convergence
      expect(prompt.toLowerCase()).toContain('progress') // progress 判别面
    })
  })
})
