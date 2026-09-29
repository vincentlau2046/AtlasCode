/**
 * W3-3d（§8.74.4/§8.74.20）：gelu 活探针（live-gateway 门控，G-α v0.1.0 冒烟清单项）。
 *
 * 门控 = modelProvider.healthCheck('small')：可达 → 跑真 LLM 一轮完整 tool 回合
 * （组合根真链：getCoreDependencies → createAgentLoopDeps（注册表 + 权限门 +
 * hooks 真接线，零 fake——与 gelu fixture 探针的 provider-only-fake 纪律相对，
 * 本探针 provider 亦为真）→ queryAgentLoop 双轮：tool 调用 → 终文终止）；
 * 不可达 → skip-clean（不红，旧仓 agent-loop live 门控同形）。
 * 全角色池同指 IFF 端点（settings modelRoles 实测 2026-09-30），单角色门控
 * 覆盖全角色。
 *
 * tier-aware efficacy 断言（H6 先例 = L4 eval tier-aware 裁定）：
 *   - native 路：模型发原生 tool_use → echo 工具真执行 → tool_result 含
 *     'echo:live-gelu-ok'（工具管线活执行，最强信号）
 *   - text 路：弱模型把工具调用写成 TEXT（engine 无 text→tool 解析器，不真执行）
 *     → assistant 文本含 'live-gelu-ok'（模型自述调用 = 回合完成证据）
 *   - 任一路过 = 活链端到端（LLM 往返 + 消息管线 + 终止判定全活）；native 路
 *     另证工具管线真执行。路径命中经 console.log 记面（G-α 冒烟留痕）。
 *
 * 零行为纪律边界：本探针不注入 fake provider / 不定化 env（活跑 = 用真配置）；
 * func 层真 I/O 口径（组合根装配 8 域真链，同 gelu fixture 探针分层）。
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { queryAgentLoop, type Message } from '../../src/engine'
import {
  createAgentLoopDeps,
  getCoreDependencies,
  resetCoreDependencies,
  type AgentLoopDepsBundle,
} from '../../src/atlascode'
import { getModelProvider } from '../../src/modelprovider'
import type { Tool } from '../../src/shared'

const GATE_ROLE = 'small'
// 门控语义（§8.74.20 裁定）：healthCheck 走 roles lane = 组合根 D18 注册的
// settings-based endpoint source——裸测试进程（未 compose）池为空恒 false。
// 故先 compose（func 层真装配，离线确定，CI 可跑）再 healthCheck 门控。
getCoreDependencies()
const gatewayUp = await getModelProvider()
  .healthCheck(GATE_ROLE)
  .then(h => h.ok)
  .catch(() => false)

// echo 工具（func 层文件自足惯例；活探针鲁棒化 = 显式 inputSchema + 结果
// stringify 全参——弱模型选参名漂移时 marker 仍留痕，非仅 args.msg 面）
function makeEchoTool(): Tool {
  return {
    name: 'echo',
    inputSchema: {
      type: 'object',
      properties: {
        msg: { type: 'string', description: 'The exact text to echo back verbatim.' },
      },
      required: ['msg'],
    },
    maxResultSizeChars: 10000,
    isEnabled: () => true,
    isConcurrencySafe: () => true,
    isReadOnly: () => true,
    description: async () => 'Echo tool: echoes back the given text via msg.',
    call: async (args: unknown) => ({
      data: `echo:${JSON.stringify((args as object) ?? {})}`,
    }),
    mapToolResultToToolResultBlockParam: (content: unknown, toolUseID: string) => ({
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: String(content),
    }),
    checkPermissions: async () => {
      return { behavior: 'allow' }
    },
  } as unknown as Tool
}

function userMsg(content: string): Message {
  return {
    uuid: 'live-gelu-u1',
    type: 'user',
    role: 'user',
    timestamp: new Date().toISOString(),
    message: { content },
  } as unknown as Message
}

const suite = gatewayUp ? describe : describe.skip
suite(
  `G-α gelu 活探针（live IFF 网关${gatewayUp ? '可达' : '不可达 → skip-clean'}）`,
  () => {
    let bundle: AgentLoopDepsBundle

    beforeAll(async () => {
      // 组合根装配（8 域真链）→ 构建器（注册表 + 权限门 + hooks 真接线）
      getCoreDependencies()
      // role = 门控角色（池头 = iff/Qwen38-27B-TXT）；baseTools 空注入
      // （本探针最小活面：模型可见工具 = args.tools 的 echo，非全量 49 本体）
      bundle = await createAgentLoopDeps({
        role: GATE_ROLE,
        toolRegistryDeps: { baseTools: [] },
      })
    })

    afterAll(() => {
      resetCoreDependencies()
    })

    test('真 LLM 一轮完整 tool 回合（echo 工具调用 + 终文终止）', async () => {
      const r = await queryAgentLoop(
        bundle.deps,
        {
          messages: [
            userMsg(
              'Use the echo tool to echo the exact text: live-gelu-ok. Then reply exactly: GELU-LIVE-DONE',
            ),
          ],
          tools: [makeEchoTool()],
          // 活探针显式轮上界（防弱模型反复调用挂死；正常 2 轮：tool → 终文）
          maxTurns: 4,
        },
      )
      expect(r.terminated, '回合应自然终止（无 tool_use 终文轮）').toBe(true)
      expect(r.turns).toBeGreaterThanOrEqual(1)

      // tier-aware：native tool_result 路 或 text 自述路（任一击中 = 回合完成）
      const toolHit = r.messages.some(
        m =>
          m.type === 'user' &&
          Array.isArray(m.message.content) &&
          (m.message.content as Array<{ type?: string; content?: unknown }>).some(
            c =>
              c.type === 'tool_result' &&
              String(c.content ?? '').includes('live-gelu-ok'),
          ),
      )
      const textHit = r.messages.some(m => {
        if (m.type !== 'assistant') return false
        const c = m.message.content
        const flat =
          typeof c === 'string'
            ? c
            : Array.isArray(c)
              ? c
                  .map(b => (b as { text?: string })?.text ?? '')
                  .join('')
              : ''
        return flat.includes('live-gelu-ok')
      })
      console.log(
        `[live-gelu] 路径命中: native=${toolHit} text=${textHit} turns=${r.turns}`,
      )
      expect(
        toolHit || textHit,
        '活回合未完成：tool_result 与 assistant 文本均未含 live-gelu-ok（模型未调用/未提及 echo 工具）',
      ).toBe(true)
    }, 180000) // 本地 27B 双轮 ~60-120s，余量至 180s
  },
)
