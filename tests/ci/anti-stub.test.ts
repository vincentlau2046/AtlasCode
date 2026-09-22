/**
 * 防腐门 anti-stub（B-fix · C 波前置，test-strategy-rederive §4 H4）。
 *
 * 拦截"域核心行为是空 stub 却全绿"的腐化：任何域目录下实质内容
 * < 5 行的 .ts 文件（如 `export {}` 空模块）必须登记在 STUB_REGISTRY
 * （注明解锁波次）；已填实现的文件必须从注册表移除（防注册表漂移）。
 *
 * 触发背景：B 波 6 个空 stub（executor/sandbox 核心行为）骗过
 * tsc/lint/test/build 四件套 —— 它们结构合法所以顺过所有门。
 * 本门让"空壳"从结构合法变为显式登记项，C 波 wave-c tag 时注册表须清零。
 *
 * 范围：B 波认领完成的四域（executor/sandbox/memory/modelprovider）。
 * engine/ascend 域骨架在 C/E 波各自建门（分层不变量，test-strategy §4）。
 */
import { describe, test, expect } from 'bun:test'
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join } from 'path'
import { execFileSync } from 'child_process'

/** URL pathname 对目录 URL 保留尾斜杠 → 归一化去掉，保证 slice(offset) 口径一致 */
const REPO_ROOT = new URL('../../', import.meta.url).pathname.replace(/\/$/, '')

/** B 波认领的四域 */
const DOMAINS = ['executor', 'sandbox', 'memory', 'modelprovider'] as const

/**
 * C-Deep 将新建的四域（execution-strategy §8.2：task/bootstrap/permissions/hooks）。
 * 目录存在即纳入扫描（C1 防腐前置：C-Deep 建骨架时门自动生效，
 * 新空壳须登记 STUB_REGISTRY，否则门①红——防"新域骨架逃过门"的腐化向量）。
 * 目录尚不存在时跳过（mkdir 前无文件可扫）。
 */
const CDEEP_DOMAINS = ['task', 'bootstrap', 'permissions', 'hooks'] as const

/** 实质内容 < 5 行的文件视为空壳 stub */
const STUB_LINE_THRESHOLD = 5

/**
 * 已知空壳登记（单一事实源，B-fix 建，C-Deep 填一个销一个）。
 * 条目文件一旦填成实质实现，anti-stub 门 ② 强制移除该条目（防漂移）。
 */
const STUB_REGISTRY: ReadonlyArray<{
  file: string
  reason: string
  unlock: string
}> = [
  // C-Deep 切片 1（executor 纵切）销 4 条；切片 2（sandbox 纵切）销最后 2 条
  // （createSandboxManager 工厂 + ripgrep 搜索后端，裁剪版填实）→ 注册表清零。
  // 裁剪残余清单见各文件头注释（非"空壳"，不登记）。
]

/** 剥掉注释/空行后的实质行数 */
function substantiveLines(file: string): number {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(
      (l) =>
        l.trim() !== '' &&
        !l.trimStart().startsWith('//') &&
        !l.trimStart().startsWith('/*') &&
        !l.trimStart().startsWith('*') &&
        l.trim() !== '*/',
    ).length
}

function listDomainFiles(domain: string): string[] {
  const dir = join(REPO_ROOT, 'src', domain)
  if (!existsSync(dir)) return [] // C-Deep 域目录未建 → 无文件可扫
  const out: string[] = []
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (name.endsWith('.ts')) out.push(p)
    }
  }
  walk(dir)
  return out
}

const allDomains = (): readonly string[] =>
  // B 波四域恒扫；C-Deep 四域目录存在才扫
  [...DOMAINS, ...CDEEP_DOMAINS.filter((d) => existsSync(join(REPO_ROOT, 'src', d)))]

const detectedStubs = () =>
  allDomains().flatMap((d) =>
    listDomainFiles(d)
      .filter((f) => substantiveLines(f) < STUB_LINE_THRESHOLD)
      .map((f) => f.slice(REPO_ROOT.length + 1)),
  )

describe("anti-stub 防腐门", () => {
  test("① 所有检出的空壳文件必须登记在 STUB_REGISTRY（未登记 = 红）", () => {
    const unregistered = detectedStubs().filter(
      (f) => !STUB_REGISTRY.some((e) => e.file === f),
    )
    expect(unregistered).toEqual([])
  })

  test("② 注册表无漂移：登记条目若已填成实质实现，必须移除", () => {
    const stale = STUB_REGISTRY.filter((e) => substantiveLines(join(REPO_ROOT, e.file)) >= STUB_LINE_THRESHOLD)
    expect(stale.map((e) => e.file)).toEqual([])
  })

  test("③ wave-c tag 存在时 STUB_REGISTRY 必须清零（C-Deep 全销）", () => {
    let hasWaveC = false
    try {
      const tags = execFileSync('git', ['tag', '-l'], { cwd: REPO_ROOT })
        .toString()
        .split('\n')
        .filter(Boolean)
      hasWaveC = tags.includes('wave-c')
    } catch {
      hasWaveC = false // 非 git 环境（如打包测试）不强制
    }
    if (hasWaveC) {
      expect(STUB_REGISTRY).toEqual([])
    }
  })
})
