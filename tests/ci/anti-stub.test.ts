/**
 * 防腐门 anti-stub（B-fix · C 波前置，test-strategy-rederive §4 H4）。
 *
 * 拦截"域核心行为是空 stub 却全绿"的腐化：任何域目录下实质内容
 * < 5 行的 .ts 文件（如 `export {}` 空模块）必须登记在 STUB_REGISTRY
 * （注明解锁波次）；已填实现的文件必须从注册表移除（防注册表漂移）。
 *
 * 空壳判定（v0.12 收窄）：< 5 实质行 **且** 无实质导出符号
 * （export const/let/var/function/class/interface/type/enum 或 re-export from）。
 * 单行 `export const X = …` 是实质常量（非空壳），`export {}` 空模块才是空壳。
 * 收窄消除 constants.ts 等单行实质常量文件的误判。
 *
 * 豁免：实质内容全为跨模块 re-export（`export * from` / `export {…} from` /
 * `export type * from`）的文件 = STR-1 域门面，不判 stub——门面职责是委托
 * （外部消费者只 import 域根 index），导出面薄是域早期合法态；空洞只会
 * 活在 re-export 的目标模块里，而目标模块在同域同扫描范围（切片 3 T1 加）。
 *
 * 触发背景：B 波 6 个空 stub（executor/sandbox 核心行为）骗过
 * tsc/lint/test/build 四件套 —— 它们结构合法所以顺过所有门。
 * 本门让"空壳"从结构合法变为显式登记项，C 波 wave-c tag 时 C-Deep 域条目须清零。
 *
 * 范围：B 波认领完成的四域（executor/sandbox/memory/modelprovider）
 * + shared 纯叶子（v0.12 纳扫：shared 占位 `export {}` 须登记，防叶子空模块逃门）
 * + engine（S-E4 A14，2026-09-25，M-3 门盲区收口：engine 域恒入 CDEEP_DOMAINS
 * 扫描集 + 门③ 清零覆盖；12 个零消费者占位已删（§8.52 B18），ascend 域
 * 归各域后续波建门）。
 */
import { describe, test, expect } from 'bun:test'
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join } from 'path'
import { execFileSync } from 'child_process'

/** URL pathname 对目录 URL 保留尾斜杠 → 归一化去掉，保证 slice(offset) 口径一致 */
const REPO_ROOT = new URL('../../', import.meta.url).pathname.replace(/\/$/, '')

/** B 波认领的四域 + shared 纯叶子（v0.12 纳扫） */
const DOMAINS = ['executor', 'sandbox', 'memory', 'modelprovider', 'shared'] as const

/**
 * C-Deep 将新建的四域（execution-strategy §8.2：task/bootstrap/permissions/hooks）
 * + engine（S-E4 A14，2026-09-25，M-3 门盲区收口：engine 12 零消费者占位已删，
 * 恒入扫描集防新空壳回归；存在即扫同守卫模式）。
 * 目录存在即纳入扫描（C1 防腐前置：C-Deep 建骨架时门自动生效，
 * 新空壳须登记 STUB_REGISTRY，否则门①红——防"新域骨架逃过门"的腐化向量）。
 * 目录尚不存在时跳过（mkdir 前无文件可扫）。
 */
const CDEEP_DOMAINS = ['task', 'bootstrap', 'permissions', 'hooks', 'engine'] as const

/** 实质内容 < 5 行的文件视为空壳 stub（须叠加 hasSubstantiveExport 判定） */
const STUB_LINE_THRESHOLD = 5

/**
 * 已知空壳登记（单一事实源，B-fix 建，C-Deep 填一个销一个）。
 * 条目文件一旦填成实质实现，anti-stub 门 ② 强制移除该条目（防漂移）。
 *
 * v0.12 纳扫 shared：3 个 A 波骨架占位 `export {}` 空模块登记在此。
 * 门③ wave-c 清零只约束 C-Deep 域条目（shared A 波占位随 A/C 波实现移除，
 * 门②兜底；A 波未开 identity 仍占位是合法待实现态）。
 */
const STUB_REGISTRY: ReadonlyArray<{
  file: string
  reason: string
  unlock: string
}> = [
  // C-Deep 切片 1（executor 纵切）销 4 条；切片 2（sandbox 纵切）销最后 2 条
  // （createSandboxManager 工厂 + ripgrep 搜索后端，裁剪版填实）→ 注册表清零。
  // 裁剪残余清单见各文件头注释（非"空壳"，不登记）。
  // 切片 3 T1（task 种子）曾登记 src/task/diskOutput.ts（3 实质行 fail-fast
  // stub，门① 要求空壳与登记同提交）；T2 起扩为 fail-fast 面（getTaskOutputPath
  // + DiskTaskOutput 4 方法全抛错，实质行 ≥5 非空壳）→ 本条目 T2 移除。
  // 口径：fail-fast 抛错面 ≠ 空壳向量（loud ≠ hollow，同 port 注入窗口
  // fail-fast idiom）；T3 真实现跟踪 = 文件头注 + 任务清单 T3 + T7 H6 断言
  // ②③ + 门③ wave-c tag 清零兜底。

  // v0.12 shared 纳扫：3 个 A 波骨架占位 `export {}` 空模块（无实质导出符号）。
  // identity 待 A 波 A-2（--define 注入）；sanitizeToolName 待 C 波。
  // tokenEstimation 已由 §8.55 S-C1（C 桶 ① 子波 3）填实（rough token 估计族
  // 逐字旧 services 纯函数子集，门②「填实即移除」销此条目）。
  // wave-c tag 时门③只清 C-Deep 域条目，shared 占位保留至 A/C 波实现（门②兜底）。
  {
    file: 'src/shared/identity.ts',
    reason: 'A 波骨架占位 `export {}`（VERSION/PRODUCT_NAME 等 --define 注入面待 A-2）',
    unlock: 'A 波 (A-2)',
  },
  {
    file: 'src/shared/sanitizeToolName.ts',
    reason: 'A 波骨架占位 `export {}`（analytics/metadata.ts 下沉纯函数待 C 波）',
    unlock: 'C 波',
  },
]

/** 剥掉注释/空行后的实质内容行（substantiveLines 与门面豁免共用） */
function substantiveContent(file: string): string[] {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(
      (l) =>
        l.trim() !== '' &&
        !l.trimStart().startsWith('//') &&
        !l.trimStart().startsWith('/*') &&
        !l.trimStart().startsWith('*') &&
        l.trim() !== '*/',
    )
}

/** 剥掉注释/空行后的实质行数 */
function substantiveLines(file: string): number {
  return substantiveContent(file).length
}

/** STR-1 门面豁免判定：全部实质行均为跨模块 re-export 语句（0 re-export 行不豁免）。 */
function isPureReexportFacade(file: string): boolean {
  const lines = substantiveContent(file)
  if (lines.length === 0) return false
  return lines.every((l) =>
    /^\s*export\s+(type\s+)?(\*|\{[^}]*\})\s+from\s+['"]/.test(l),
  )
}

/**
 * 实质导出符号判定（v0.12 收窄）：文件含 export const/let/var/function/class/
 * interface/type/enum/async 或 re-export from 即有实质导出，非空壳。
 * `export {}` 空模块（无导出符号）返回 false → 仍判空壳。
 * 收窄消除单行 `export const X = …` 实质常量文件的误判（如 shared/constants.ts）。
 */
function hasSubstantiveExport(file: string): boolean {
  const content = readFileSync(file, 'utf8')
  return (
    /^\s*export\s+(const|let|var|function|class|interface|type|enum|async)\b/m.test(content) ||
    /^\s*export\s+\{[^}]*\}\s+from\s+['"]/m.test(content) ||
    /^\s*export\s+\*\s+from\s+['"]/m.test(content)
  )
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
  // B 波四域+shared 恒扫；C-Deep 四域目录存在才扫
  [...DOMAINS, ...CDEEP_DOMAINS.filter((d) => existsSync(join(REPO_ROOT, 'src', d)))]

const detectedStubs = () =>
  allDomains().flatMap((d) =>
    listDomainFiles(d)
      .filter(
        (f) =>
          substantiveLines(f) < STUB_LINE_THRESHOLD &&
          !isPureReexportFacade(f) &&
          !hasSubstantiveExport(f),
      )
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
    const stale = STUB_REGISTRY.filter((e) => {
      const f = join(REPO_ROOT, e.file)
      // 有实质导出符号 或 实质行 ≥5 = 已填实（非空壳）→ 须移除
      return hasSubstantiveExport(f) || substantiveLines(f) >= STUB_LINE_THRESHOLD
    })
    expect(stale.map((e) => e.file)).toEqual([])
  })

  test("③ wave-c tag 存在时 C-Deep 域 stub 必须清零（shared A 波占位保留）", () => {
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
      // 只清 C-Deep 域条目（9 域地基，含 engine S-E4 纳扫）；shared A 波占位
      // 随 A/C 波实现移除（门②兜底）
      const cdeepStubs = STUB_REGISTRY.filter((e) =>
        /^src\/(executor|sandbox|memory|modelprovider|task|bootstrap|permissions|hooks|engine)\//.test(e.file),
      )
      expect(cdeepStubs).toEqual([])
    }
  })
})
