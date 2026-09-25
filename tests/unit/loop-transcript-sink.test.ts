/**
 * S-E3（§8.52 A11/A12/A13）loop transcript 写面 + SessionEnv 活态 cwd +
 * killShellTasks 队列清理 契约测试（执行前分析 T-1..T-7 冻结口径）。
 *
 * 非 tautology：断言的是 loop 的 record 调用点时序/内容/门判据（旧仓 QueryEngine
 * 7 点收敛面 + loop.ts:377 persistReplacements 门）与队列谓词面（真队列 + 假
 * TaskAppState），fake 仅 LLM（ModelProvider 接口替身）+ fake transcript sink
 * （调用记录器，非自证写面）。I/O-free（队列/任务态内存面；diskOutput env
 * 仅路径计算注入，无真 I/O）→ unit 层。
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import {
  killShellTasksForAgent,
  compactConversation,
  enqueue,
  getCommandQueueSnapshot,
  queryAgentLoop,
  queryOneRound,
  resetCommandQueue,
  getSessionEnv,
  setSessionEnv,
  type AgentLoopDeps,
  type AutoCompactDeps,
  type CompactionResult,
  type ContentReplacementRecord,
  type LocalShellTaskState,
  type SetAppState,
  type TaskAppState,
} from '../../src/engine'
import { resetDiskOutputEnv, setDiskOutputEnv } from '../../src/task'
import type { ModelProvider } from '../../src/modelprovider'
import type { Message, Tool } from '../../src/shared'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// ── 测试基建（口径同 engine-query-loop / engine-multi-round）────────────────
function fakeProvider(content: unknown[], stopReason = 'end_turn'): ModelProvider {
  const notExercised = async () => {
    throw new Error('fake ModelProvider: 方法未被本测消费')
  }
  return {
    chat: async () => ({
      type: 'assistant',
      uuid: 'fake-uuid',
      timestamp: '2026-09-23T00:00:00Z',
      message: {
        id: 'fake-msg',
        model: 'fake-model',
        role: 'assistant',
        content,
        stop_reason: stopReason,
        usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    }),
    chatStream: notExercised as unknown as ModelProvider['chatStream'],
    healthCheck: notExercised as unknown as ModelProvider['healthCheck'],
    countTokens: notExercised as unknown as ModelProvider['countTokens'],
    listModels: async () => [],
    transcribeAudio: notExercised as unknown as ModelProvider['transcribeAudio'],
    synthesizeSpeech: notExercised as unknown as ModelProvider['synthesizeSpeech'],
    verifyKey: async () => true,
  }
}

function makeEchoTool(): Tool {
  return {
    name: 'echo',
    call: async (args: unknown) => ({ data: `echo:${(args as { msg?: string })?.msg}` }),
    mapToolResultToToolResultBlockParam: (content: unknown, toolUseID: string) => ({
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: String(content),
    }),
  } as unknown as Tool
}

const ECHO_CONTENT = [
  { type: 'text', text: 'let me echo' },
  { type: 'tool_use', id: 'tu-1', name: 'echo', input: { msg: 'hi' } },
]

function userMsg(uuid: string, content: unknown): Message {
  return {
    uuid,
    type: 'user',
    role: 'user',
    timestamp: '2026-01-01T00:00:00Z',
    message: { content },
  }
}

/** 必触发的 autoCompact（口径同 engine-multi-round firingAutoCompact：阈值 167_000）。 */
function firingAutoCompact(extra?: Partial<AutoCompactDeps>): AutoCompactDeps {
  return {
    contextWindow: 200_000,
    countTokens: () => 170_000,
    compact: (msgs) =>
      compactConversation(msgs, {
        summarize: async () => '<analysis>x</analysis><summary>S</summary>',
        countTokens: () => 100,
      }),
    ...extra,
  }
}

describe('S-E3 A11 loop transcript 写面（LoopTranscriptSink 7 点收敛）', () => {
  test('T-1 queryOneRound 轮末 record：恰 1 次，内容 = [assistantMsg, ...resultMessages]（fire-and-forget）', async () => {
    const calls: Array<readonly Message[]> = []
    const deps: AgentLoopDeps = {
      modelProvider: fakeProvider(ECHO_CONTENT, 'tool_calls'),
      role: 'small',
      transcript: {
        record: msgs => {
          calls.push(msgs)
          return Promise.resolve(null)
        },
      },
    }
    const r = await queryOneRound(deps, [makeEchoTool()], [userMsg('u1', 'hi')])
    expect(calls).toHaveLength(1)
    // 内容 = 轮末追加面（assistant + 1 tool_result），不含入参序列
    expect(calls[0]).toHaveLength(2)
    expect(calls[0][0].type).toBe('assistant')
    expect(calls[0][1].type).toBe('user')
    expect(calls[0]).toEqual(r.messages.slice(1))
  })

  test('T-2 queryAgentLoop entry record 先于首次 LLM 调用（旧 L450 crash-resumable）', async () => {
    const order: string[] = []
    const inner = fakeProvider([{ type: 'text', text: 'done' }])
    const provider: ModelProvider = {
      ...inner,
      chat: async (...a: Parameters<ModelProvider['chat']>) => {
        order.push('llm')
        return inner.chat(...a)
      },
    }
    const deps: AgentLoopDeps = {
      modelProvider: provider,
      role: 'small',
      transcript: {
        record: msgs => {
          order.push(`record:${msgs.length}`)
          return Promise.resolve(null)
        },
      },
    }
    await queryAgentLoop(deps, { messages: [userMsg('u1', 'hi')] })
    expect(order[0]).toBe('record:1') // entry persist（入参序列 1 条）
    expect(order[1]).toBe('llm') // 首个 API 响应前已落盘
  })

  test('T-3 compact 支 record：post-compact 序列含 boundary marker（subtype 判别式，A11-Δ1）', async () => {
    const calls: Array<readonly Message[]> = []
    const deps: AgentLoopDeps = {
      modelProvider: fakeProvider([{ type: 'text', text: 'ok' }]),
      role: 'small',
      transcript: {
        record: msgs => {
          calls.push(msgs)
          return Promise.resolve(null)
        },
      },
    }
    const r = await queryAgentLoop(deps, {
      messages: [userMsg('u1', 'seed')],
      context: { autoCompact: firingAutoCompact() },
    })
    // record 三次：entry（1 条）+ compact 支（boundary + summary = 2 条）+
    // 轮末追加面（assistant 1 条，fire-and-forget）
    expect(calls).toHaveLength(3)
    const compactCall = calls.find(c => (c[0] as { subtype?: string }).subtype === 'compact_boundary')
    expect(compactCall).toBeDefined() // 判别式定位（非索引，抗调用点序变化）
    expect(compactCall).toHaveLength(2)
    const boundary = compactCall![0] as { type?: string; subtype?: string; compactMetadata?: unknown }
    expect(boundary.type).toBe('system')
    expect(boundary.subtype).toBe('compact_boundary') // 判别式（#15 scanner 标记字节面同源）
    expect(boundary.compactMetadata).toBeDefined()
    // compact 支 record 的序列 = 终态消息序列头（同一引用链）
    expect(compactCall![0]).toBe(r.messages[0])
  })

  describe('T-4 contentReplacements persistReplacements 门（旧 loop.ts:360-363 前缀判据）', () => {
    function gateCase(querySource: string | undefined, withReplacements: boolean) {
      let recCalls = 0
      let lastRec: readonly ContentReplacementRecord[] = []
      const deps: AgentLoopDeps = {
        modelProvider: fakeProvider([{ type: 'text', text: 'ok' }]),
        role: 'small',
        transcript: {
          record: async () => {},
          recordContentReplacement: async recs => {
            recCalls++
            lastRec = recs
          },
        },
      }
      const replacements: ContentReplacementRecord[] = [
        { kind: 'tool-result', toolUseId: 'tu-9', replacement: '<trunc>' },
      ]
      const compact: AutoCompactDeps['compact'] = async (msgs): Promise<CompactionResult> => {
        const result = await compactConversation(msgs, {
          summarize: async () => '<summary>S</summary>',
        })
        if (withReplacements) result.contentReplacements = replacements
        return result
      }
      const ac = { ...firingAutoCompact(), compact, querySource }
      return {
        run: () =>
          queryAgentLoop(deps, {
            messages: [userMsg('u1', 'seed')],
            context: { autoCompact: ac },
          }),
        calls: () => recCalls,
        last: () => lastRec,
      }
    }

    test('agent: 前缀 → persist（阳性，路由 sidechain 语义）', async () => {
      const g = gateCase('agent:abc', true)
      await g.run()
      expect(g.calls()).toBe(1)
      expect(g.last()).toEqual([{ kind: 'tool-result', toolUseId: 'tu-9', replacement: '<trunc>' }])
    })

    test('repl_main_thread → persist（阳性，主线程 session 文件语义）', async () => {
      const g = gateCase('repl_main_thread', true)
      await g.run()
      expect(g.calls()).toBe(1)
    })

    test('其余 querySource（cli）→ 不 persist（阴性，ephemeral 调用方）', async () => {
      const g = gateCase('cli', true)
      await g.run()
      expect(g.calls()).toBe(0)
    })

    test('querySource 未注入（undefined）→ 不 persist（阴性）', async () => {
      const g = gateCase(undefined, true)
      await g.run()
      expect(g.calls()).toBe(0)
    })

    test('compact 无 contentReplacements（本波零 producer 前向接缝）→ 不触发写面', async () => {
      const g = gateCase('agent:abc', false)
      await g.run()
      expect(g.calls()).toBe(0)
    })
  })

  test('T-5 未注入 sink：loop 全流不抛（窄 spine 无持久化安全缺省，同 checkPermission/hooks 惯例）', async () => {
    const deps: AgentLoopDeps = {
      modelProvider: fakeProvider([{ type: 'text', text: 'done' }]),
      role: 'small',
    }
    const r1 = await queryOneRound(deps, [makeEchoTool()], [userMsg('u1', 'q')])
    expect(r1.stopReason).toBe('end_turn')
    const r2 = await queryAgentLoop(deps, { messages: [userMsg('u1', 'q')] })
    expect(r2.terminated).toBe(true)
  })
})

describe('S-E3 A12 SessionEnv.getCwd 活态面', () => {
  // 缺省断言须先于活源注入（注入为 Partial 合并，进程内不可逆）
  test('T-6a 域缺省 = process.cwd() 活读（无 bootstrap 约束自包含）', () => {
    expect(getSessionEnv().getCwd()).toBe(process.cwd())
  })
  test('T-6b 注入活源逐调用反射（活态语义非冻结值）', () => {
    let live = '/tmp/live-a'
    setSessionEnv({ getCwd: () => live })
    expect(getSessionEnv().getCwd()).toBe('/tmp/live-a')
    live = '/tmp/live-b'
    expect(getSessionEnv().getCwd()).toBe('/tmp/live-b')
  })
})

describe('S-E3 A13 killShellTasksForAgent 队列清理（dequeueAllMatching 裁面恢复）', () => {
  const taskTmp = mkdtempSync(join(tmpdir(), 'atlas-loop-transcript-unit-'))
  beforeAll(() => {
    // killTask → void evictTaskOutput 仅路径计算面（engine-tasks 同口径），无真 I/O
    setDiskOutputEnv({
      getProjectTempDir: () => taskTmp,
      getSessionId: () => 'unit-session',
    })
  })
  afterAll(() => {
    resetDiskOutputEnv()
    rmSync(taskTmp, { recursive: true, force: true })
  })

  function makeLocalBashTask(taskId: string, agentId?: string): LocalShellTaskState {
    return {
      id: taskId,
      type: 'local_bash',
      status: 'running',
      description: 'fake shell',
      startTime: 1,
      outputFile: '',
      outputOffset: 0,
      notified: false,
      command: 'echo hi',
      completionStatusSentInAttachment: false,
      shellCommand: null,
      lastReportedTotalLines: 0,
      isBackgrounded: false,
      agentId,
    }
  }

  test('T-7 队列滞留恰 {他 agent, 主线程} + 本 agent running task 置 killed', () => {
    resetCommandQueue()
    try {
      enqueue({ value: 'n-a1', mode: 'task-notification', agentId: 'a1' })
      enqueue({ value: 'n-a2', mode: 'task-notification', agentId: 'a2' })
      enqueue({ value: 'n-main', mode: 'task-notification' }) // 主线程（agentId undefined）

      let state: TaskAppState = { tasks: { t1: makeLocalBashTask('t1', 'a1') } }
      const setAppState: SetAppState = f => {
        state = f(state)
      }
      killShellTasksForAgent('a1', () => state, setAppState)

      // 谓词面：仅 agentId==='a1' 的队列命令被清（drain 侧谓词真队列复核）
      expect(getCommandQueueSnapshot().map(c => c.value)).toEqual(['n-a2', 'n-main'])
      // task 面：本 agent running local_bash 置 killed（killTask 链）
      expect(state.tasks.t1.status).toBe('killed')
      expect(state.tasks.t1.notified).toBe(true)
    } finally {
      resetCommandQueue()
    }
  })
})
