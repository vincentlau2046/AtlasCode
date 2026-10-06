/**
 * BR-9 动词池四轴重写（0.1.32，spec §7.4）判别单测。
 *
 * 被测：SPINNER_VERBS（四轴 ~130，去 Anthropic 品牌串动词 + 纯荒诞词 +
 * fork 专属梗）+ TURN_COMPLETION_VERBS（8 whimsical 过去式 → 20 新池）。
 * 判别点（gate 镜像）：
 *  - 品牌 gate `grep -rni "clauding" src/` = 0（D-10 后全量生效：原排 insights 已随 multi_clauding→parallel_sessions 改名消除）
 *    的行为镜像：SPINNER_VERBS 无 Anthropic 品牌串动词（原池 L45 的 C 系梗词）
 *  - 纯荒诞词 / fork 专属梗（Beboppin' / Discombobulating / Flibbertigibbeting /
 *    Razzmatazzing / Shenaniganing / Tomfoolering / Whatchamacalliting /
 *    Gitifying / Hyperspacing / Quantumizing）零残留
 *  - 四轴锚点词在池（算力 Tiling/Fusing/Lowering · 意象 Ascending/Summiting ·
 *    哲学 Reasoning/Pondering · 趣味 Crystallizing/Julienning · 通用 Working）
 *  - TURN_COMPLETION_VERBS = 20 新池，旧 whimsical 过去式（Baked/Brewed/
 *    Churned/Cooked/Sautéed）零残留
 *
 * 分层纪律：纯常量断言（无网络/无真实磁盘/无 settings 读取——
 * getSpinnerVerbs 的 settings 覆盖机制为既有行为，本波未改，不新测）。
 */
import { describe, test, expect } from 'bun:test'
import { SPINNER_VERBS } from '../../src/tui/constants/spinnerVerbs'
import { TURN_COMPLETION_VERBS } from '../../src/tui/constants/turnCompletionVerbs'

describe('BR-9 spinner 动词池四轴重写（0.1.32）', () => {
  test('体量 ~130（186→四轴池）且零跨轴重复', () => {
    expect(SPINNER_VERBS.length).toBeGreaterThanOrEqual(125)
    expect(SPINNER_VERBS.length).toBeLessThanOrEqual(135)
    expect(new Set(SPINNER_VERBS).size).toBe(SPINNER_VERBS.length)
  })

  test('Anthropic 品牌串动词 + 纯荒诞词 + fork 专属梗零残留（gate 镜像）', () => {
    const BANNED = [
      'Clauding', // 品牌 gate：grep -rni "clauding" src/ = 0 的池内镜像（D-10 后全量生效）
      "Beboppin'",
      'Discombobulating',
      'Flibbertigibbeting',
      'Razzmatazzing',
      'Shenaniganing',
      'Tomfoolering',
      'Whatchamacalliting',
      'Gitifying',
      'Hyperspacing',
      'Quantumizing',
    ]
    for (const banned of BANNED) {
      expect(SPINNER_VERBS, `SPINNER_VERBS 不得含 ${banned}`).not.toContain(banned)
    }
  })

  test('四轴 + 通用锚点词在池', () => {
    const ANCHORS = [
      // 算力轴（Ascend 算子开发专属动词）
      'Tiling',
      'Fusing',
      'Lowering',
      'Compiling',
      // 意象轴（昇腾光锥攀升/聚焦动势）
      'Ascending',
      'Climbing',
      'Summiting',
      'Converging',
      // 哲学轴（深度思辨）
      'Reasoning',
      'Pondering',
      'Cerebrating',
      // 趣味轴（算力化学/烹饪双关，从 fork 池保留的有调性词）
      'Crystallizing',
      'Julienning',
      'Spelunking',
      // 通用收尾
      'Working',
      'Processing',
    ]
    for (const anchor of ANCHORS) {
      expect(SPINNER_VERBS, `SPINNER_VERBS 应含 ${anchor}`).toContain(anchor)
    }
  })

  test('TURN_COMPLETION_VERBS = 20 新池，旧 whimsical 过去式零残留', () => {
    expect(TURN_COMPLETION_VERBS).toHaveLength(20)
    expect(new Set(TURN_COMPLETION_VERBS).size).toBe(20)
    const BANNED_PAST = ['Baked', 'Brewed', 'Churned', 'Cooked', 'Sautéed']
    for (const banned of BANNED_PAST) {
      expect(
        TURN_COMPLETION_VERBS,
        `TURN_COMPLETION_VERBS 不得含 ${banned}`,
      ).not.toContain(banned)
    }
    for (const anchor of [
      'Compiled',
      'Ascended',
      'Converged',
      'Forged',
      'Reasoned',
      'Processed',
    ]) {
      expect(
        TURN_COMPLETION_VERBS,
        `TURN_COMPLETION_VERBS 应含 ${anchor}`,
      ).toContain(anchor)
    }
  })
})
