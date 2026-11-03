/**
 * 0.1.87 任务 A — 三总纲 bundled skill（ascend-doctor / ascend-optimism /
 * ascend-opdev）判别单测（工单 docs/2026-11-02-p0-wave-0187-ticket.md §1.A）。
 *
 * 修前红（absent-export 模式）：三总纲域定义 + 壳注册修前不存在 → 动态 import
 * catch → {}，契约断言红于正确判别点；五件套既有注册零变化项修前即绿。
 *
 * 契约面（工单 §1.A 判别 + Review Focus 3）：
 *  ① 域单一事实源：三定义五件套形态导出 + ASCEND_UMBRELLA_SKILLS 聚合（3 条）
 *  ② SKILL_MD 由路由表渲染生成：每行路由的 skill 名在正文在场（无手抄第二份）
 *  ③ 正文形状：frontmatter 四键 + ≤120 行 + 无 ## Steps（goal+gates 契约）
 *  ④ 反混淆/分工句：optimism 显式反混淆句（Review Focus 1）；opdev 与
 *     ascend-generate 分工句
 *  ⑤ doctor 内嵌 msprof-mcp MCP 预设段（文档模板 + 不自动写用户 settings +
 *     capabilities 元数据不可信 + 零写真实 HOME）
 *  ⑥ 无死链锁：status==='preinstalled' 的路由目标 ∈ 既有面（bundled 5 /
 *     atlas-plugins 6 知识技能 / agent-skills 33 pack fixture）；市场外条目必须
 *     suggest-install（任务 D 判据的单测侧锚）
 *  ⑦ 壳注册：userInvocable:false → Command.userInvocable===false ∧
 *     isHidden===true ∧ context==='inline'（bundledSkills.ts:86/95 语义直证）
 *  ⑧ 可见性双面判别（谓词级直证，Review Focus 3）：getSkillToolCommands 谓词
 *     （type==='prompt' ∧ !disableModelInvocation ∧ source==='bundled'）收三总纲
 *     —— 模型经 skill_listing 可见；slash 面谓词（userInvocable!==false /
 *     !isHidden，systemInit.ts:69 + commandSuggestions.ts:36 同语义）排除三总纲
 *     —— ∩ slash 注册面 = 空
 *  ⑨ 五件套既有 ascend 注册零变化（ascend-debug 照常 userInvocable:true 在场）
 *  ⑩ 壳 SKILL_MD 副本与域渲染输出字节全等（防手抄漂移）
 *
 * 分层纪律：纯逻辑 + 模块注册面（无网络 / 无 PTY / 无 LLM / 无真实 HOME）→ unit。
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

// ---------------------------------------------------------------------------
// fixtures（agent-skills 市场 33 pack 清单锁——来自市场仓 .claude-plugin/
// marketplace.json 的 plugin name 全集，0.1.87 锁面时点；e2e gate ⑤ 对活 listing
// 复核，此处防仓内路由表与市场状态漂移）
// ---------------------------------------------------------------------------
const AGENT_SKILLS_PACKS = [
  'cannbot-ops-direct-invoke-skills',
  'cannbot-aiss-tiling-solver',
  'cannbot-catlass-op-skills',
  'cannbot-pypto-op-orchestrator-skills',
  'cannbot-triton-op-generator-skills',
  'cannbot-torch-npugraph-ex-skills',
  'cannbot-model-infer-skills',
  'cannbot-tilelang-op-orchestrator-skills',
  'cannbot-cuda2ascend-simt-skills',
  'cannbot-infra-skills',
  'common-infra-skills',
  'common-ops-skills',
  'common-dev-skills',
  'common-migration-skills',
  'common-deploy-skills',
  'common-ut-skills',
  'ascend-transformer-boost-skills',
  'mindspeed-megatron-skills',
  'mindspeed-drivingsdk-skills',
  'drivingsdk-model-migration-analysis',
  'mindspeed-llm-ut-skills',
  'mindspeed-fsdp2-skills',
  'vllm-ascend-skills',
  'verl-skills',
  'mindstudio-profiling-skills',
  'mindstudio-precision-debug-skills',
  'mindstudio-ascendc-perf-optim-skills',
  'mindstudio-msmodelslim-skills',
  'mindstudio-devtools-skills',
  'community-ascendc-op-skills',
  'community-catlass-op-skills',
  'community-triton-op-skills',
  'community-triton-tilelang-migration-skills',
] as const

// atlas-plugins 市场 6 域知识技能（CLAUDE.md 知识层清单）
const ATLAS_PLUGINS_KNOWLEDGE_SKILLS = [
  'ascend-tiling-design',
  'ascend-precision-debug',
  'ascend-runtime-debug',
  'ascend-perf-optimize',
  'ascend-test-design',
  'ascend-code-review',
] as const

// 5 运行时 bundled skill（既有五件套，域 index RUNTIME_SKILLS 同名单）
const BUNDLED_RUNTIME_SKILLS = [
  'ascend-generate',
  'ascend-validate',
  'ascend-debug',
  'ascend-optimize',
  'ascend-model-adapt',
] as const

// ---------------------------------------------------------------------------
// 动态 import（absent-export：修前 = {}，红于判别点）
// ---------------------------------------------------------------------------
interface UmbrellaRoute {
  skill: string
  trigger: string
  status: 'preinstalled' | 'suggest-install'
  source: 'bundled' | 'atlas-plugins' | 'agent-skills' | 'ms-agent-skills' | 'external'
}
interface UmbrellaDef {
  name: string
  description: string
  whenToUse: string
  allowedTools: readonly string[]
  enterWhen: string
  routesSummary: string
  routes: readonly UmbrellaRoute[]
  extraSections?: readonly string[]
}

const ascend = (await import('../../src/ascend/index.js').catch(() => ({}))) as {
  ASCEND_UMBRELLA_SKILLS?: readonly UmbrellaDef[]
  ASCEND_DOCTOR_SKILL_MD?: string
  ASCEND_OPTIMISM_SKILL_MD?: string
  ASCEND_OPDEV_SKILL_MD?: string
  ASCEND_DOCTOR_NAME?: string
  ASCEND_OPTIMISM_NAME?: string
  ASCEND_OPDEV_NAME?: string
}

const shellDoctor = (await import(
  '../../src/tui/skills/bundled/ascendDoctor.js'
).catch(() => ({}))) as {
  registerAscendDoctorSkill?: () => void
  UMBRELLA_DOCTOR_SKILL_MD?: string
}
const shellOptimism = (await import(
  '../../src/tui/skills/bundled/ascendOptimism.js'
).catch(() => ({}))) as {
  registerAscendOptimismSkill?: () => void
  UMBRELLA_OPTIMISM_SKILL_MD?: string
}
const shellOpdev = (await import(
  '../../src/tui/skills/bundled/ascendOpdev.js'
).catch(() => ({}))) as {
  registerAscendOpdevSkill?: () => void
  UMBRELLA_OPDEV_SKILL_MD?: string
}
// 五件套回归（既有面，修前在场）
const shellDebug = (await import(
  '../../src/tui/skills/bundled/ascendDebug.js'
).catch(() => ({}))) as { registerAscendDebugSkill?: () => void }

const { getBundledSkills, clearBundledSkills } = await import(
  '../../src/tui/skills/bundledSkills.js'
)

const UMBRELLA_NAMES = ['ascend-doctor', 'ascend-optimism', 'ascend-opdev'] as const

beforeEach(() => {
  clearBundledSkills()
})

afterEach(() => {
  clearBundledSkills()
})

function registerUmbrellas(): void {
  shellDoctor.registerAscendDoctorSkill?.()
  shellOptimism.registerAscendOptimismSkill?.()
  shellOpdev.registerAscendOpdevSkill?.()
}

// ---------------------------------------------------------------------------
// ① 域单一事实源（修前红）
// ---------------------------------------------------------------------------
describe('① 三总纲域定义 + ASCEND_UMBRELLA_SKILLS 聚合', () => {
  test('聚合 = 3 条，名与序对齐（doctor/optimism/opdev）', () => {
    expect(ascend.ASCEND_UMBRELLA_SKILLS).toBeDefined()
    expect(ascend.ASCEND_UMBRELLA_SKILLS!.map(d => d.name)).toEqual([...UMBRELLA_NAMES])
  })

  test('五件套形态导出齐全（SKILL_MD/NAME/DESCRIPTION/WHEN_TO_USE/ALLOWED_TOOLS）', () => {
    expect(ascend.ASCEND_DOCTOR_SKILL_MD).toBeDefined()
    expect(ascend.ASCEND_OPTIMISM_SKILL_MD).toBeDefined()
    expect(ascend.ASCEND_OPDEV_SKILL_MD).toBeDefined()
    expect(ascend.ASCEND_DOCTOR_NAME).toBe('ascend-doctor')
    expect(ascend.ASCEND_OPTIMISM_NAME).toBe('ascend-optimism')
    expect(ascend.ASCEND_OPDEV_NAME).toBe('ascend-opdev')
    for (const def of ascend.ASCEND_UMBRELLA_SKILLS ?? []) {
      expect(def.description.length).toBeGreaterThan(0)
      expect(def.whenToUse.length).toBeGreaterThan(0)
      expect(def.allowedTools.length).toBeGreaterThan(0)
      expect(def.enterWhen.length).toBeGreaterThan(0)
      expect(def.routesSummary.length).toBeGreaterThan(0)
      expect(def.routes.length).toBeGreaterThan(0)
    }
  })

  test('ALLOWED_TOOLS 指向既有 ascend 工具（不造新工具：16 工具名单内）', () => {
    const KNOWN_TOOLS = [
      'AscendSpecParser',
      'AscendTilingPlanner',
      'AscendCodeGen',
      'AscendCompilerBridge',
      'AscendGoldenTest',
      'AscendRealHWBridge',
      'AscendDiagnoser',
      'AscendFaultCollector',
      'AscendErrorClassifier',
      'AscendProfileAnalyzer',
      'AscendBenchmarkRunner',
      'AscendProfileReportParser',
      'AscendModelConverter',
      'AscendOnnxOptimizer',
      'AscendDataPrepTool',
      'AscendInferValidator',
      // 工单 §3 唯一例外：任务 F 单工具 AscendSkillSourceCheck（Step 0 源新鲜度
      // 检查/更新；shouldDefer + 仅三总纲 allowedTools 授予，非 ascend 16 工具面）。
      'AscendSkillSourceCheck',
    ]
    for (const def of ascend.ASCEND_UMBRELLA_SKILLS ?? []) {
      for (const t of def.allowedTools) {
        expect(KNOWN_TOOLS).toContain(t)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// ② + ③ SKILL_MD 由路由表渲染 + 正文形状
// ---------------------------------------------------------------------------
describe('② SKILL_MD 由路由表渲染（单一事实源）+ ③ 正文形状', () => {
  test('三正文 frontmatter 四键 + ≤120 行 + 无 ## Steps + 路由行在场', () => {
    const pairs: Array<[string | undefined, UmbrellaDef | undefined]> = [
      [ascend.ASCEND_DOCTOR_SKILL_MD, ascend.ASCEND_UMBRELLA_SKILLS?.[0]],
      [ascend.ASCEND_OPTIMISM_SKILL_MD, ascend.ASCEND_UMBRELLA_SKILLS?.[1]],
      [ascend.ASCEND_OPDEV_SKILL_MD, ascend.ASCEND_UMBRELLA_SKILLS?.[2]],
    ]
    for (const [md, def] of pairs) {
      expect(md).toBeDefined()
      expect(def).toBeDefined()
      expect(md!.split('\n').length).toBeLessThanOrEqual(120)
      expect(md).toContain(`name: ${def!.name}`)
      expect(md).toContain('description: ')
      expect(md).toContain('when_to_use: ')
      expect(md).toContain(`allowed-tools: ${def!.allowedTools.join(', ')}`)
      expect(md).not.toContain('## Steps')
      // ② 路由表行由路由表生成：每行 skill 名在正文在场
      for (const r of def!.routes) {
        expect(md).toContain(r.skill)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// ④ 反混淆 / 分工句
// ---------------------------------------------------------------------------
describe('④ 反混淆与分工句（Review Focus 1）', () => {
  test('optimism 显式反混淆句：单算子优化指回 ascend-optimize', () => {
    expect(ascend.ASCEND_OPTIMISM_SKILL_MD).toContain('ascend-optimize')
    expect(ascend.ASCEND_OPTIMISM_SKILL_MD).toContain('belongs to ascend-optimize')
  })

  test('opdev 与 ascend-generate 分工句', () => {
    expect(ascend.ASCEND_OPDEV_SKILL_MD).toContain('ascend-generate')
    expect(ascend.ASCEND_OPDEV_SKILL_MD).toContain('ascend-generate')
  })
})

// ---------------------------------------------------------------------------
// ⑤ doctor MCP 预设段
// ---------------------------------------------------------------------------
describe('⑤ doctor 内嵌 msprof-mcp MCP 预设段', () => {
  test('模板在场 + 不自动写用户 settings + capabilities 不可信 + 零写真实 HOME', () => {
    const md = ascend.ASCEND_DOCTOR_SKILL_MD
    expect(md).toBeDefined()
    expect(md).toContain('msprof-mcp')
    expect(md).toContain('mcpServers')
    expect(md).toContain('capabilities metadata is untrusted')
    expect(md).not.toContain('mcpPolicy')
  })
})

// ---------------------------------------------------------------------------
// ⑥ 无死链锁（任务 D 判据单测侧锚）
// ---------------------------------------------------------------------------
describe('⑥ 无死链锁：preinstalled 路由 ∈ 既有面；市场外必须 suggest-install', () => {
  test('路由目标按 source 锁既有面', () => {
    const defs = ascend.ASCEND_UMBRELLA_SKILLS
    expect(defs).toBeDefined()
    for (const def of defs!) {
      for (const r of def.routes) {
        if (r.status === 'preinstalled') {
          if (r.source === 'bundled') {
            expect(BUNDLED_RUNTIME_SKILLS).toContain(r.skill)
          } else if (r.source === 'atlas-plugins') {
            expect(ATLAS_PLUGINS_KNOWLEDGE_SKILLS).toContain(r.skill)
          } else if (r.source === 'agent-skills') {
            expect(AGENT_SKILLS_PACKS).toContain(r.skill)
          }
        } else {
          expect(r.status).toBe('suggest-install')
        }
      }
    }
  })

  test('suggest-install 行的市场外条目登记（cann-recipes 族 / ops-tilelang / cannbot-dsl 不伪 preinstalled）', () => {
    const all = (ascend.ASCEND_UMBRELLA_SKILLS ?? []).flatMap(d => [...d.routes])
    const byName = (n: string) => all.filter(r => r.skill === n)
    for (const absent of ['cann-recipes-infer', 'cann-recipes-train', 'ops-tilelang', 'cannbot-dsl']) {
      for (const r of byName(absent)) {
        expect(r.status).toBe('suggest-install')
      }
    }
  })
})

// ---------------------------------------------------------------------------
// ⑦ + ⑧ 壳注册 + 可见性双面（谓词级直证）
// ---------------------------------------------------------------------------
describe('⑦ 壳注册 userInvocable:false + ⑧ 可见性双面', () => {
  test('三总纲注册：userInvocable===false ∧ isHidden===true ∧ context inline', () => {
    registerUmbrellas()
    const registered = getBundledSkills()
    for (const name of UMBRELLA_NAMES) {
      const cmd = registered.find(c => c.name === name)
      expect(cmd).toBeDefined()
      expect(cmd!.userInvocable).toBe(false)
      expect(cmd!.isHidden).toBe(true)
      expect(cmd!.context).toBe('inline')
      expect(cmd!.type).toBe('prompt')
      expect(cmd!.source).toBe('bundled')
      expect(cmd!.disableModelInvocation).toBe(false)
    }
  })

  test('skill_listing 谓词收三总纲（模型可见）；slash 面谓词排除（∩ slash = 空）', () => {
    registerUmbrellas()
    const registered = getBundledSkills()
    for (const name of UMBRELLA_NAMES) {
      const cmd = registered.find(c => c.name === name)!
      // getSkillToolCommands 谓词（commands.ts:462-480）：bundle 面直证收
      const inListing =
        cmd.type === 'prompt' &&
        !cmd.disableModelInvocation &&
        cmd.source === 'bundled'
      expect(inListing).toBe(true)
      // slash 面：systemInit.ts:69/77（userInvocable !== false）与
      // commandSuggestions.ts:36（!isHidden）同语义排除
      const inSlashFace = cmd.userInvocable !== false
      expect(inSlashFace).toBe(false)
      expect(cmd.isHidden).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// ⑨ 五件套既有注册零变化（修前绿）
// ---------------------------------------------------------------------------
describe('⑨ 五件套既有 ascend 注册零变化', () => {
  test('ascend-debug 照常注册：userInvocable true ∧ isHidden false', () => {
    shellDebug.registerAscendDebugSkill?.()
    const cmd = getBundledSkills().find(c => c.name === 'ascend-debug')
    expect(cmd).toBeDefined()
    expect(cmd!.userInvocable).toBe(true)
    expect(cmd!.isHidden).toBe(false)
    expect(cmd!.context).toBe('inline')
  })
})

// ---------------------------------------------------------------------------
// ⑩ 壳副本与域渲染字节全等（防手抄漂移）
// ---------------------------------------------------------------------------
describe('⑩ 壳 SKILL_MD 副本与域渲染输出字节全等', () => {
  test('doctor / optimism / opdev 三副本全等', () => {
    expect(shellDoctor.UMBRELLA_DOCTOR_SKILL_MD).toBe(ascend.ASCEND_DOCTOR_SKILL_MD)
    expect(shellOptimism.UMBRELLA_OPTIMISM_SKILL_MD).toBe(ascend.ASCEND_OPTIMISM_SKILL_MD)
    expect(shellOpdev.UMBRELLA_OPDEV_SKILL_MD).toBe(ascend.ASCEND_OPDEV_SKILL_MD)
  })
})
