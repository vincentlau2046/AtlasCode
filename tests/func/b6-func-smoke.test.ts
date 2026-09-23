/**
 * B6-func 最小组合根 4 功能 smoke（★compose.ts 装配真链，先于 engine 波）
 *
 * §8.16/§8.17 4+7 前置清单 + 6 适配器落地后的端到端验真：经 getCoreDependencies
 * 装配（唯一跨 8 域装配点，注入 executor 三 port + permissions bootstrap env +
 * task diskOutput env + hooks shell port + modelprovider 端点源），port 之下全真
 * （真 spawn / 真 task 域落盘 / 真 fs / placeholder sandbox）。防 H6 空洞等价：
 * 本文件绿 = 组合根真能装配并驱动 8 域一条链。
 *
 * 断言：① echo hi 真 spawn + 真盘读回 ② 组合根构造 sandbox manager（禁用态可工作）
 * ③ mock completion 双腿（非流式 + 流式，§8.13 L-2 收口）④ memory 写后读
 * （真 fs 写 + 只读 store 读回，§8.13 L-1 收口）。
 *
 * 分层纪律：func 层真 I/O（--isolate 每文件独立进程，全局注入窗口不跨文件泄漏）。
 * fake 仅限 modelprovider（setModelProviderForTesting 返固定 completion，非 mock
 * openai transport）——其余域全真。
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  execShell,
  getExecutorSandboxPort,
  resetTaskOutputPort,
  resetBootstrapStatePort,
  resetExecutorSandboxPort,
} from '../../src/executor'
import { getCoreDependencies, resetCoreDependencies } from '../../src/atlascode'
import {
  getModelProvider,
  setModelProviderForTesting,
  resetModelProviderForTesting,
  type ModelProvider,
} from '../../src/modelprovider'
import { resetDiskOutputEnv, _resetTaskOutputDirForTest } from '../../src/task'
import { resetPermissionsBootstrapEnv } from '../../src/permissions'
import { resetHookShellPort } from '../../src/hooks'

// ── fake modelprovider（§8.13 L-2：返固定 completion，非 fake transport）─────
const MOCK_TEXT = 'MOCK-COMPLETION'
function createFakeModelProvider(): ModelProvider {
  const notExercised = async () => {
    throw new Error('fake ModelProvider: 方法未被 B6-func smoke 消费')
  }
  return {
    chat: async () => ({
      type: 'assistant',
      uuid: 'fake-uuid',
      timestamp: new Date().toISOString(),
      message: {
        id: 'fake-msg',
        model: 'fake-model',
        role: 'assistant',
        content: [{ type: 'text', text: MOCK_TEXT }],
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 1,
          output_tokens: 1,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    }),
    chatStream: async function* () {
      yield { type: 'message_start', message: {} }
      yield { type: 'text_delta', text: MOCK_TEXT }
      yield { type: 'message_stop' }
    },
    healthCheck: notExercised,
    countTokens: notExercised,
    listModels: async () => [],
    transcribeAudio: notExercised,
    synthesizeSpeech: notExercised,
    verifyKey: async () => true,
  }
}

let testTmp: string
let core: ReturnType<typeof getCoreDependencies>

beforeAll(() => {
  testTmp = mkdtempSync(join(tmpdir(), 'atlascode-b6func-'))
  // 真 task 输出目录落测试 tmpdir（getAtlasTempDir 读 ATLAS_TMPDIR，memoize 前先设）
  process.env.ATLAS_TMPDIR = testTmp
  // 唯一跨 8 域装配点：注入 4+7 前置清单（§8.14 注入序 permissions→task→hooks）
  core = getCoreDependencies()
})

afterAll(() => {
  // 复位所有注入窗口 + 组合根缓存 + 真 task 输出目录 memo（--isolate 下防串味）
  resetModelProviderForTesting()
  resetCoreDependencies()
  resetTaskOutputPort()
  resetBootstrapStatePort()
  resetExecutorSandboxPort()
  resetPermissionsBootstrapEnv()
  resetDiskOutputEnv()
  _resetTaskOutputDirForTest()
  resetHookShellPort()
  delete process.env.ATLAS_TMPDIR
  rmSync(testTmp, { recursive: true, force: true })
})

describe('B6-func 最小组合根 4 功能 smoke（经 getCoreDependencies 装配真链）', () => {
  test('① echo hi 真 spawn + 真盘读回（executor 三 port 真适配器 + 真 task 域落盘）', async () => {
    const cmd = await execShell('echo hi', new AbortController().signal, {})
    const result = await cmd.result
    expect(result.code).toBe(0)
    // file 模式（无 onStdout）：stdout 真经 fd 落 task 输出文件再读回——
    // result.stdout 即磁盘往返（非 JS 内存缓冲，防 fake 到底的空洞等价）。
    // 注：getStdout() 后 task 域删输出文件（内容冗余，旧仓语义），故不查文件存在。
    expect(result.stdout.trim()).toBe('hi')
    // 落点证：task 输出目录经 diskOutputEnv→getProjectTempDir→getAtlasTempDir
    // 落在测试 ATLAS_TMPDIR（真装配链，非硬编码 fake 路径）
    expect(cmd.taskOutput.path.startsWith(testTmp)).toBe(true)
  })

  test('② 组合根构造 sandbox manager（placeholder runtime 禁用态 + port 链可观测）', () => {
    expect(core.sandboxManager).toBeDefined()
    // 未注入真 bwrap runtime 包（B6-func/D 波单点换入）→ placeholder 禁用态：
    // isSupportedPlatform 恒 false（沙箱关闭非安全降级，旧仓 fallback 语义）
    expect(core.sandboxManager.isSupportedPlatform()).toBe(false)
    expect(core.sandboxManager.isSandboxingEnabled()).toBe(false)
    // 端口链证：executor 沙箱 port（getCoreDependencies 经 adaptSandboxToExecutorPort
    // 注入）忠实转发 manager 状态——组合根装配链 manager→adapter→port 打通
    expect(getExecutorSandboxPort().isSandboxingEnabled()).toBe(false)
  })

  test('③ mock completion 双腿（非流式 + 流式，§8.13 L-2 收口）', async () => {
    setModelProviderForTesting(createFakeModelProvider())
    // 经 getModelProvider 读 seam（非 core.modelProvider——latter 缓存的是装配期真 provider）
    const mp = getModelProvider()

    // 非流式
    const nonStream = await mp.chat({ role: 'small', messages: [] })
    expect(nonStream.message.content[0].text).toBe(MOCK_TEXT)

    // 流式
    const events: Array<{ type: string; text?: string }> = []
    for await (const ev of mp.chatStream({ role: 'small' })) {
      events.push(ev as { type: string; text?: string })
    }
    expect(
      events.some((e) => e.type === 'text_delta' && e.text === MOCK_TEXT),
    ).toBe(true)
  })

  test('④ memory 写后读（真 fs 写 + 只读 store 读回，§8.13 L-1 收口）', async () => {
    // memory store 是只读面（无 write 方法）；写经真 fs，读经 store（真 fs 透传）
    const p = join(testTmp, 'b6-memory.txt')
    await writeFile(p, 'hello memory')
    const content = await core.memoryStore.readFile(p)
    expect(content).toBe('hello memory')
  })
})
