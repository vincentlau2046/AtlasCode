/**
 * FX-30 + FX-34（0.1.50，工单 §1.5 verify 项）resume 链健壮性回归守卫：
 *
 * FX-30（seen 环）：自引用 message transcript → resume 不死循环。
 *  定因：buildConversationChain（load.ts:317）seen 环检测在场（seen Set +
 *  环点 break + error 日志「Cycle detected in parentUuid chain」）；叶计算
 *  （load.ts:1182+）独立 seen 环守卫；recoverOrphanedParallelToolResults
 *  仅 Map 查键（无无界走链）→ 三面全环安全。
 *  定因细化（探针实证）：自引用 = 父链损坏，环点前缀（u1/a1/u2）经该
 *  损坏链不可达——守卫契约（旧仓 L2069 语义「Returning partial
 *  transcript」）= 终止 + error 日志（非静默）+ 返回**可达**部分
 *  transcript（环点后后缀 u3 全保留、环点不重复）；「截断」仅在环边界
 *  外（数据损坏面），可达前缀零丢失。
 * FX-34（dead-end 桥接）：snip 间隙大 session → resume 锚 live 会话 +
 *  不串入无关子会话。
 *  定因：applySnipRemovals（load.ts:229，loadTranscriptFile 管线 L1159
 *  调用）removedUuids 重放 + 悬空 parentUuid 经 deletedParent 反向走链
 *  重锚（路径压缩）；叶 = findLatestMessage 时间戳最新叶（dead-end 死支
 *  非最新 → 不锚）；分支隔离 = 单亲链走 + 恢复支仅同 message.id 族。
 *
 * verify 结论 = 两 gap 已 cover（0 产品码）；本测试 = 回归守卫（钉住
 * 环安全 + 间隙重建 + 分支隔离），回执 f4 按 verify=已 cover 口径核销。
 *
 * 分层纪律：unit 层——mkdtemp 假 JSONL（repo 先例：engine-tasks 等）；
 * 零网络 / 零真盘。
 */
import { afterAll, test, expect } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  loadTranscriptFile,
  buildConversationChain,
  setSessionEnv,
  getSessionEnv,
} from '../../src/engine'

const tmp = mkdtempSync(join(tmpdir(), 'atlas-fx3034-'))
setSessionEnv({ getProjectsDir: () => tmp })
process.env.TEST_ENABLE_SESSION_PERSISTENCE = '1'

function stamp(
  sessionId: string,
  extra: Record<string, unknown>,
): string {
  const l = {
    type: 'user',
    userType: 'atlas',
    sessionId,
    version: '0.1.50',
    cwd: '/tmp',
    isSidechain: false,
    parentUuid: null,
    ...extra,
  }
  return JSON.stringify(l)
}

/** 写 JSONL 并走全管线（entry 分发 + applySnipRemovals + 叶计算）取链。 */
async function loadChain(
  name: string,
  lines: string[],
  leafSession: string,
): Promise<string[]> {
  const file = join(tmp, name)
  writeFileSync(file, lines.join('\n') + '\n')
  getSessionEnv().switchSession(leafSession)
  const loaded = await loadTranscriptFile(file)
  const leaves = [...loaded.messages.values()].filter(m =>
    loaded.leafUuids.has(m.uuid),
  )
  let latest: { uuid: string; timestamp: string } | undefined
  for (const m of leaves) {
    if (
      !latest ||
      Date.parse(m.timestamp) > Date.parse(latest.timestamp)
    ) {
      latest = m
    }
  }
  expect(latest, `${name}: 无叶可锚（叶计算环守卫/叶集异常）`).toBeDefined()
  const chain = buildConversationChain(
    loaded.messages,
    loaded.messages.get(latest!.uuid)!,
  )
  return chain.map(m => m.uuid)
}

// ── FX-30：自引用 message（a2.parentUuid = a2）─────────────────────
const fx30Lines = [
  stamp('fx30-selfref', {
    uuid: 'u1',
    timestamp: '2026-01-01T00:00:01Z',
    message: { role: 'user', content: [{ type: 'text', text: 'go' }] },
  }),
  stamp('fx30-selfref', {
    parentUuid: 'u1',
    uuid: 'a1',
    type: 'assistant',
    timestamp: '2026-01-01T00:00:02Z',
    message: {
      role: 'assistant',
      id: 'm1',
      model: 'probe',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'ok' }],
    },
  }),
  stamp('fx30-selfref', {
    parentUuid: 'a1',
    uuid: 'u2',
    timestamp: '2026-01-01T00:00:03Z',
    message: { role: 'user', content: [{ type: 'text', text: 'next' }] },
  }),
  // 自引用环：a2 的 parentUuid 指向自身（PAC 主诉：自引用 message 截断）
  stamp('fx30-selfref', {
    parentUuid: 'a2',
    uuid: 'a2',
    type: 'assistant',
    timestamp: '2026-01-01T00:00:04Z',
    message: {
      role: 'assistant',
      id: 'm2',
      model: 'probe',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'self' }],
    },
  }),
  stamp('fx30-selfref', {
    parentUuid: 'a2',
    uuid: 'u3',
    timestamp: '2026-01-01T00:00:05Z',
    message: { role: 'user', content: [{ type: 'text', text: 'tail' }] },
  }),
]

test('FX-30 自引用 message：走链终止（不死循环）+ 环点不重复 + 可达后缀全保留', async () => {
  // 测试自身完成 = 无死循环证明（无 seen 守卫时本输入必挂死）。
  // 自引用 = a2.parentUuid=a2（父链损坏）：环点前缀 u1/a1/u2 经损坏链
  // 不可达（partial transcript = 守卫契约，error 日志非静默）；可达面
  // （环点 a2 + 后后缀 u3）零丢失、a2 恰现一次。
  const chain = await loadChain(
    'fx30-selfref.jsonl',
    fx30Lines,
    'fx30-selfref',
  )
  expect(chain).toEqual(['a2', 'u3'])
  expect(chain.filter(u => u === 'a2')).toHaveLength(1)
})

// ── FX-34：snip 间隙（m1/m2 被删）+ dead-end 侧支（b1）────────────
const fx34Lines = [
  stamp('fx34-gap', {
    uuid: 'u1',
    timestamp: '2026-01-01T00:00:01Z',
    message: { role: 'user', content: [{ type: 'text', text: 'root' }] },
  }),
  stamp('fx34-gap', {
    parentUuid: 'u1',
    uuid: 'a1',
    type: 'assistant',
    timestamp: '2026-01-01T00:00:02Z',
    message: {
      role: 'assistant',
      id: 'ma1',
      model: 'probe',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'mid' }],
    },
  }),
  // dead-end 侧支（无关子会话：isSidechain 支，无后续 → 死端叶，非最新）
  stamp('fx34-gap', {
    parentUuid: 'a1',
    uuid: 'b1',
    type: 'assistant',
    isSidechain: true,
    timestamp: '2026-01-01T00:00:03Z',
    message: {
      role: 'assistant',
      id: 'mb1',
      model: 'probe',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'side branch' }],
    },
  }),
  // snip 删除区（m1/m2）：盘上仍在（append-only），由 snip 边界重放删除
  stamp('fx34-gap', {
    parentUuid: 'a1',
    uuid: 'm1',
    type: 'assistant',
    timestamp: '2026-01-01T00:00:04Z',
    message: {
      role: 'assistant',
      id: 'mm1',
      model: 'probe',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'removed 1' }],
    },
  }),
  stamp('fx34-gap', {
    parentUuid: 'm1',
    uuid: 'm2',
    timestamp: '2026-01-01T00:00:05Z',
    message: { role: 'user', content: [{ type: 'text', text: 'removed 2' }] },
  }),
  // 间隙后存活消息 u2：parentUuid 悬空指向间隙内 m2；snip 边界骑 u2
  // （snipMetadata.removedUuids 重放面）
  stamp('fx34-gap', {
    parentUuid: 'm2',
    uuid: 'u2',
    timestamp: '2026-01-01T00:00:06Z',
    snipMetadata: { removedUuids: ['m1', 'm2'] },
    message: { role: 'user', content: [{ type: 'text', text: 'after gap' }] },
  }),
  stamp('fx34-gap', {
    parentUuid: 'u2',
    uuid: 'a2',
    type: 'assistant',
    timestamp: '2026-01-01T00:00:07Z',
    message: {
      role: 'assistant',
      id: 'ma2',
      model: 'probe',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'live' }],
    },
  }),
  stamp('fx34-gap', {
    parentUuid: 'a2',
    uuid: 'u3',
    timestamp: '2026-01-01T00:00:08Z',
    message: { role: 'user', content: [{ type: 'text', text: 'live leaf' }] },
  }),
]

test('FX-34 snip 间隙 + dead-end 侧支：resume 锚 live 叶 + 间隙重锚 + 侧支不串入', async () => {
  const chain = await loadChain('fx34-gap.jsonl', fx34Lines, 'fx34-gap')
  // 间隙重锚：m1/m2 经 snip 重放删除，u2 悬空父链重锚到 a1（前缀不孤儿）
  expect(chain).toEqual(['u1', 'a1', 'u2', 'a2', 'u3'])
  // 锚 live 叶（u3 最新）：dead-end 侧支 b1 / 已删 m1/m2 不串入
  expect(chain).not.toContain('b1')
  expect(chain).not.toContain('m1')
  expect(chain).not.toContain('m2')
})

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})
