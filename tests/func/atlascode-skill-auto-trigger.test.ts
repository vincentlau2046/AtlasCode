/**
 * S5-4（#249）：NL 自动触发 e2e 验真（live-gateway 门控，v0.1.13 验收面）。
 *
 * 验真命题：模型见到 skill 目录（catalog：name + description + whenToUse）后，
 * 对一条匹配某技能的自然语言任务应「自动触发」——发起 Skill 工具调用 / 点名该技能。
 * 这正是 S5 波的核心面（catalog 注入 + 模型自判），S5-1 已把 skill_listing 附件
 * 持久化进 jsonl 保证跨会话一致；本探针验「catalog + NL 任务 → 触发对技能」。
 *
 * 门控 = modelProvider.healthCheck('small')：可达 → 真 LLM 一轮；不可达 → skip-clean
 * （不红，与 gelu 活探针同构）。与 atlascode-tui-live-gelu 同形（getCoreDependencies
 * → createAgentLoopDeps → queryAgentLoop），差异：baseTools 空、tools 注入 stand-in
 * Skill 工具（镜像真 SkillTool 面 name 'Skill' + schema { skill, args? }），catalog
 * 以注入式 user 面给出（镜像 skill_listing 附件；与任务同 turn，避免双 user 面歧义）。
 *
 * tier-aware 断言（memory l4-eval-tier-aware-assertion）：
 *   - native 路：模型发原生 Skill tool_use → stand-in call 回显 'Launching skill: <name>'
 *     → tool_result 含判别技能名（最强信号：模型真决定调用该技能）
 *   - text 路：弱模型把工具调用写成 TEXT（engine 无 text→tool 解析器）→ assistant
 *     文本提及判别技能名（模型自述点名 = 触发证据）
 *   - 任一路提及判别技能名（convcommit，目录点名非泛指词）= NL 自动触发成立。
 *     判别名用 catalog 里的特异 id（convcommit / slowquery）而非泛指词，防 prose 假阳。
 *
 * 零行为纪律：不注入 fake provider / 不定化 env（活跑用真配置）；func 层真 I/O 口径
 * （组合根真链，provider 亦为真）。
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
// 判别技能名（catalog 特異 id，非自然 prose 词 → 提及即触发信号，非泛指假阳）
const TARGET_SKILL = 'convcommit'
const DISTRACTOR_SKILL = 'slowquery'

// 门控语义同 live-gelu：healthCheck 走 roles lane = 组合根注册的 settings-based
// endpoint source，裸测试进程（未 compose）池为空恒 false。故先 compose（离线确定，
// CI 可跑）再 healthCheck 门控。
getCoreDependencies()
const gatewayUp = await getModelProvider()
  .healthCheck(GATE_ROLE)
  .then(h => h.ok)
  .catch(() => false)

// stand-in Skill 工具：镜像真 SkillTool 面（name 'Skill' + schema { skill, args? }）。
// call 回显 'Launching skill: <name>' 使判别名进入 tool_result（native 路可检）；
// 不真加载技能（S5-4 验「触发决策」，非技能本体执行——本体归 L4 efficacy 层）。
function makeSkillTool(): Tool {
  return {
    name: 'Skill',
    inputSchema: {
      type: 'object',
      properties: {
        skill: {
          type: 'string',
          description: 'The skill name. E.g. "convcommit" or "slowquery"',
        },
        args: { type: 'string', description: 'Optional arguments for the skill' },
      },
      required: ['skill'],
    },
    maxResultSizeChars: 10000,
    isEnabled: () => true,
    isConcurrencySafe: () => true,
    isReadOnly: () => true,
    description: async () =>
      'Invoke a skill by name from the available catalog (Skill({ skill })).',
    call: async (args: unknown) => {
      const skill = String((args as { skill?: string })?.skill ?? '')
      return { data: `Launching skill: ${skill}` }
    },
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

function userMsg(content: string, uuid: string): Message {
  return {
    uuid,
    type: 'user',
    role: 'user',
    timestamp: new Date().toISOString(),
    message: { content },
  } as unknown as Message
}

// catalog（镜像 skill_listing 附件面：name + description + whenToUse）。
// 两技能：convcommit（提交信息，匹配任务）+ slowquery（SQL 调优，distractor）。
const CATALOG = [
  'Available skills (invoke the matching one via the Skill tool):',
  `- ${TARGET_SKILL}: Writes git commit messages in Conventional Commits style (type(scope): subject). Use when: the user asks to write or reword a commit message.`,
  `- ${DISTRACTOR_SKILL}: Rewrites slow SQL queries for performance (index hints, join reordering). Use when: the user asks to optimize a slow database query.`,
].join('\n')

// NL 任务：不点名技能 id，仅描述工作 → 模型须从 catalog 自判匹配 convcommit（真·自动触发）。
const TASK =
  'I just finished my change in the working tree. Write me the commit message for it.'

const suite = gatewayUp ? describe : describe.skip
suite(
  `S5-4 NL 自动触发 e2e（live IFF 网关${gatewayUp ? '可达' : '不可达 → skip-clean'}）`,
  () => {
    let bundle: AgentLoopDepsBundle

    beforeAll(async () => {
      getCoreDependencies()
      // role = 门控角色；baseTools 空（本探针最小活面：模型可见工具 = args.tools 的
      // stand-in Skill，非全量本体）；catalog 经 user 面注入。
      bundle = await createAgentLoopDeps({
        role: GATE_ROLE,
        toolRegistryDeps: { baseTools: [] },
      })
    })

    afterAll(() => {
      resetCoreDependencies()
    })

    test('NL 任务匹配技能 → 模型自动触发（Skill tool call / 技能名点名）', async () => {
      const r = await queryAgentLoop(
        bundle.deps,
        {
          messages: [userMsg(`${CATALOG}\n\n---\nTask: ${TASK}`, 'auto-trigger-u1')],
          tools: [makeSkillTool()],
          // 活探针显式轮上界（防弱模型反复调用挂死；正常 2 轮：tool_use → 终文）
          maxTurns: 4,
        },
      )
      expect(r.terminated, '探针应自然终止（无 tool_use 终文轮）').toBe(true)
      expect(r.turns).toBeGreaterThanOrEqual(1)

      // native 路：tool_result 含判别技能名（stand-in 回显 'Launching skill: <name>'）
      const toolHit = r.messages.some(
        m =>
          m.type === 'user' &&
          Array.isArray(m.message.content) &&
          (m.message.content as Array<{ type?: string; content?: unknown }>).some(
            c =>
              c.type === 'tool_result' &&
              String(c.content ?? '').includes(TARGET_SKILL),
          ),
      )
      // text 路：assistant 文本提及判别技能名
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
        return flat.includes(TARGET_SKILL)
      })
      console.log(
        `[auto-trigger] 路径命中: native=${toolHit} text=${textHit} turns=${r.turns}`,
      )
      expect(
        toolHit || textHit,
        `NL 自动触发未成立：tool_result 与 assistant 文本均未提及判别技能名 ${TARGET_SKILL}（模型未从 catalog 自判匹配技能）`,
      ).toBe(true)
    }, 180000) // 本地 27B 目录读 + 工具调用 ~60-120s，余量至 180s
  },
)
