/**
 * 0.1.87 任务 C — ms-agent pin 快照 manifest 条目判别单测（工单
 * docs/2026-11-02-p0-wave-0187-ticket.md §1.C）。
 *
 * Inspect 结论（2026-11-03 实核，工单 §1.C "Inspect 先行" 批注依据）：
 *  - PluginMarketplaceEntry schema 已支持 license 字段（schemas.ts SPDX identifier）
 *    → 无 schema 扩展提交，单内容提交。
 *  - 真源实核：github.com/modelscope/ms-agent，Apache-2.0（GitHub API
 *    license.spdx_id + PyPI ms-agent 1.6.0 元数据双源核验）。
 *  - release tag 全不含 ms-agent-skills/（v1.6.0 = 1c4081e5 早于该目录新增）
 *    → pin 锚 = main commit 6d90d84e55d508fcb52ea19f3912de6f6a477e38
 *    （2026-10-29 实核 clone；快照 = 单 skill 包 ms-agent，Capability Gateway：
 *    SKILL.md 30 MCP 工具索引 + 9 references SOP + 3 scripts）。
 *  - World B officialVerify 只消费 repo === OFFICIAL_REPO（agent-skills）单一源；
 *    ms-agent 条目验真面 = 任务 F AscendSkillSourceCheck（工单 §125 Interfaces）。
 *  - 任务 A doctor 路由描述（"diagnostic family"）与快照实文不符 → 本任务随
 *    manifest 对齐（域 def + 壳镜像成对改，⑩ 字节全等锁强制镜像）。
 *
 * 契约面（工单 §1.C 判别 + Global Constraints）：
 *  ① manifest 条目在场（url = github.com/modelscope/ms-agent.git）
 *  ② pinned_sha 逐字 = 实核 commit（40-hex）
 *  ③ Apache-2.0 归属字段在场（SPDX）
 *  ④ subpath/host/status + note 登记快照内容定性（Capability Gateway）
 *  ⑤ 零运行时 fetch：'modelscope/ms-agent' 串不出现在任何 src 运行时代码
 *    （manifest-only 引用；工单 "产品路径零运行时 fetch" grep 断言）
 *  ⑥ 零 ms-agent 框架依赖：package.json 无 ms-agent（工单 "不引入框架依赖"）
 *  ⑦ doctor 路由注记现实对齐（note='pinned capability snapshot'，
 *     trigger 描述 Capability Gateway 实文、不再声称 diagnostic family）
 *
 * 分层纪律：纯逻辑（无网络 / 无 PTY / 无 LLM / 无真实 HOME）→ unit。
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

import { parseYaml } from '../../src/tui/utils/yaml.js'

const MANIFEST_PATH = join(
  import.meta.dir,
  '../../src/tui/plugins/ascend/knowledge/ascend-official.manifest.yaml',
)
const PINNED_SHA = '6d90d84e55d508fcb52ea19f3912de6f6a477e38'
const MS_AGENT_URL = 'https://github.com/modelscope/ms-agent.git'

interface ManifestSource {
  repo?: string
  host?: string
  url?: string
  pinned_sha?: string | null
  upstream_head?: string | null
  subpath?: string
  license?: string
  status?: string
  local_clone?: string | null
  note?: string
}

function loadSources(): ManifestSource[] {
  const parsed = parseYaml(readFileSync(MANIFEST_PATH, 'utf8')) as {
    sources?: ManifestSource[]
  }
  expect(Array.isArray(parsed.sources)).toBe(true)
  return parsed.sources ?? []
}

function msAgentEntry(): ManifestSource | undefined {
  return loadSources().find((s) => s.url === MS_AGENT_URL)
}

/** 递归收集 src 下 .ts/.tsx 文件（零运行时 fetch grep 断言面）。 */
function collectSrcFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) collectSrcFiles(p, out)
    else if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(p)
  }
  return out
}

// ---------------------------------------------------------------------------
// doctor 总纲 def（动态 import，absent-export 惯例沿用任务 A/B）
// ---------------------------------------------------------------------------
const doctorMod = (await import(
  '../../src/ascend/skills/ascendDoctor.js'
).catch(() => ({}))) as {
  ASCEND_DOCTOR?: {
    routes?: readonly {
      skill: string
      note?: string
      trigger: string
      source: string
    }[]
  }
}

function msAgentRoute():
  | { skill: string; note?: string; trigger: string; source: string }
  | undefined {
  return doctorMod.ASCEND_DOCTOR?.routes?.find((r) => r.source === 'ms-agent-skills')
}

describe('0.1.87 任务 C：ms-agent pin 快照 manifest 条目', () => {
  test('① manifest 条目在场（url = modelscope/ms-agent）', () => {
    const entry = msAgentEntry()
    expect(entry).toBeDefined()
    expect(entry!.repo).toBe('ms-agent')
    expect(entry!.host).toBe('github')
  })

  test('② pinned_sha 逐字 = 实核 main commit（40-hex 锚）', () => {
    const entry = msAgentEntry()
    expect(entry).toBeDefined()
    expect(entry!.pinned_sha).toBe(PINNED_SHA)
    expect(entry!.pinned_sha).toMatch(/^[0-9a-f]{40}$/)
    expect(entry!.upstream_head).toBeNull() // 任务 F check/update 填
  })

  test('③ Apache-2.0 归属字段在场（SPDX）', () => {
    const entry = msAgentEntry()
    expect(entry).toBeDefined()
    expect(entry!.license).toBe('Apache-2.0')
  })

  test('④ subpath + note 登记快照内容定性（Capability Gateway 单 skill 包）', () => {
    const entry = msAgentEntry()
    expect(entry).toBeDefined()
    expect(entry!.subpath).toBe('ms-agent-skills/')
    expect(entry!.status).toBe('active')
    expect(entry!.note).toContain('Capability Gateway')
  })

  test('⑤ 零运行时 fetch：modelscope/ms-agent 串不进任何 src 运行时代码', () => {
    const srcDir = join(import.meta.dir, '../../src')
    const offenders: string[] = []
    for (const f of collectSrcFiles(srcDir)) {
      if (readFileSync(f, 'utf8').includes('modelscope/ms-agent')) offenders.push(f)
    }
    expect(offenders).toEqual([]) // manifest-only 引用（yaml 非运行时代码）
  })

  test('⑥ 零 ms-agent 框架依赖（package.json 不变）', () => {
    const pkg = JSON.parse(
      readFileSync(join(import.meta.dir, '../../package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
    const all = { ...pkg.dependencies, ...pkg.devDependencies }
    expect(Object.keys(all).filter((k) => k.includes('ms-agent'))).toEqual([])
  })

  test('⑦ doctor 路由注记现实对齐（Capability Gateway 实文，非 diagnostic family）', () => {
    const route = msAgentRoute()
    expect(route).toBeDefined()
    expect(route!.note).toBe('pinned capability snapshot')
    expect(route!.trigger).toContain('Capability Gateway')
    expect(route!.trigger).not.toContain('diagnostic family')
    expect(route!.status).toBe('suggest-install')
  })
})
