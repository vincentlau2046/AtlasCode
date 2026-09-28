/**
 * CLI dev 面（S-C2，§8.71.1.4）— 旧仓 cli.ts 143L dev 面随迁 + 通用化 delta。
 *
 * 随迁（5 dev flag 面）：--tools（注册工具列表）/ --skills（bundled 技能列表）/
 * --check（健康检查）/ --e2e（全栈 liveness 探针 spawn）/ --auth-help
 * （auth 车道说明文案）。
 *
 * delta 登记（旧面 = Ascend FDE 专属面 → 新面 = 通用 coding agent 面；
 * 复审勿当遗漏重提）：
 *   - 旧 --tools/--check 的 16 Ascend 工具名单 + [active/missing] 标记 +
 *     「CANN: OK」行 = 域外裁（ascend 域挂载波：新仓 src/ascend 现占位，
 *     域包落盘后经 toolRegistry deps.ascendTools 门控（isAscendToolsEnabled）
 *     自动入列，无需本面改动）
 *   - 旧 --check 的 officialVerify（agent-skills 市场 World B 验真）+
 *     ATLAS_ASCEND_PROMPT 注入支 = 域外裁（市场/ascend 域波）
 *   - 旧 --e2e spawn gelu.ts（ATLAS_ASCEND_MOCK=1 + 机器特定 bun 路径回落）→
 *     新仓 gelu 探针 = tests/func/atlascode-gelu-probe.test.ts（D 波 S-E2d
 *     全栈探针，零真模型 fixture replay 自包含，无需 mock env）；bun 解析 =
 *     ATLAS_BUN_BIN || 'bun'（机器特定路径裁）
 *   - 旧 --auth-help 第 3 来源「落盘 key（saveApiKey → keychain）」行裁
 *     （新仓 saveApiKey/keychain 面未落盘，modelprovider 车道 = env + settings）
 *   - 旧默认支（无 flag = TUI 启动）归壳波 #152（launcher 薄壳不经 bin，
 *     S-C1 裁定）；本面默认支 = 提示主面入口（bin 壳 hasDevFlag 嗅探后
 *     仅 dev flag 调用到此处，默认支为直调兜底）
 */
import { spawn } from 'child_process'
import { Command } from '@commander-js/extra-typings'
import { getAllBaseTools, getBundledSkills } from '../engine'

/** dev 面 flag 集（bin 壳嗅探面；旧仓 cli.ts 5 flag 同集）。 */
const DEV_FLAGS = ['--tools', '--skills', '--check', '--e2e', '--auth-help']

/** argv 含任一 dev flag（旧仓 commander boolean 语义：`--tools=x` 不命中）。 */
export function hasDevFlag(argv: string[]): boolean {
  return DEV_FLAGS.some(f => argv.includes(f))
}

function listBaseTools(): void {
  console.log('Base tools (registry):')
  const tools = getAllBaseTools()
  for (const t of tools) {
    console.log('  ' + t.name)
  }
}

function listSkills(): void {
  const skills = getBundledSkills()
  console.log('Bundled skills:')
  for (const s of skills) {
    console.log('  /' + s.name)
  }
}

function runHealthCheck(): void {
  console.log('AtlasCode Health Check')
  const tools = getAllBaseTools()
  for (const t of tools) {
    console.log('  PASS ' + t.name)
  }
  console.log('')
  console.log('Tools: ' + tools.length + ' registered')
  console.log('Skills: ' + getBundledSkills().length + ' bundled')
  // 域外裁登记：旧 CANN probe / official skills (agent-skills marketplace) /
  // ascend prompt 注入支（ascend 域挂载波 + 市场波随迁）
}

function runE2eProbe(): void {
  // 全栈 liveness 探针（旧仓 gelu L1 同型；零真模型 fixture replay 自包含）
  const bunBin = process.env.ATLAS_BUN_BIN || 'bun'
  spawn(bunBin, ['test', '--isolate', 'tests/func/atlascode-gelu-probe.test.ts'], {
    stdio: 'inherit',
  })
}

function printAuthHelp(): void {
  console.log('AtlasCode — API key & model config')
  console.log('')
  console.log('API key 配置来源（按优先级，从高到低）：')
  console.log('  1. env（最高优先级）')
  console.log('     OPENAI_API_KEY                 OpenAI 标准，全局 key')
  console.log('     ATLAS_<ROLE>_API_KEY    per-role（PREMIUM/FAST/SMALL），可区分模型')
  console.log('  2. 配置文件（settings.json → modelRoles.<role>.apiKey）')
  console.log('     per-role，可区分模型')
  console.log('')
  console.log('模型/端点同样两个主来源（env per-role + settings.modelRoles）。')
  // 裁登记：旧第 3 来源「落盘 key（saveApiKey → 全局 primaryApiKey / keychain）」
  // 行 = 新仓未落盘面（头注 delta 段）
}

/** dev 面入口（bin 壳 hasDevFlag 嗅探命中后调用；commander parse dev 程序）。 */
export async function runDevCli(): Promise<void> {
  const program = new Command()
    .name('atlascode')
    .description('AtlasCode CLI dev face (tools/skills/check/e2e/auth-help)')
    .option('--tools', 'List registered base tools')
    .option('--skills', 'List registered bundled skills')
    .option('--check', 'Verify base integration (tools + skills)')
    .option(
      '--e2e',
      'Run the full-stack gelu liveness probe (zero-real-model fixture replay; not end-to-end LLM validation)',
    )
    .option(
      '--auth-help',
      'Explain API key / model config sources (env → settings)',
    )
    .action(async (opts: {
      tools?: boolean
      skills?: boolean
      check?: boolean
      e2e?: boolean
      authHelp?: boolean
    }) => {
      if (opts.tools) {
        listBaseTools()
        return
      }
      if (opts.skills) {
        listSkills()
        return
      }
      if (opts.check) {
        runHealthCheck()
        return
      }
      if (opts.e2e) {
        runE2eProbe()
        return
      }
      if (opts.authHelp) {
        printAuthHelp()
        return
      }
      // 默认支（bin 壳嗅探不到 dev flag 时不会走到此处；直调兜底提示）
      console.log('AtlasCode — no dev flag; main face entry = `atlascode` (interactive/headless)')
    })
  await program.parseAsync(process.argv)
}
