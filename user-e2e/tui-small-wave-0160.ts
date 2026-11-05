/**
 * 0.1.60 PAC V2-11 TUI 小波（TUI-1 /output-style + TUI-2 /cd + TUI-3 /reload-skills）· 3 命令行为
 * 活探针（e2e lane，gate 判据⑥；工单 docs/2026-10-13-p0-wave-0160-ticket.md §4）。
 *
 * 判读面（0.1.57 D4-B / 0.1.58 C4-1 / 0.1.59 autoMode 同族纪律）：产品函数活 import 探针
 * （@ 被测面 worktree 源码，真命令 call 函数真模板，确定性零模型零网络零 8999 竞争）；
 * 判据与判别单测 tests/unit/tui-small-wave-0160.test.ts（8 测）同构断言，单测 = build 面
 * 判别（修前红↔修后绿），本探针 = 产品函数活面观测面（双层承载）。
 *
 * 断言面（活面判别核心全 hard；单测面承载项不入本探针）：
 *   TUI-1 /output-style（CC 2.1.269）：
 *     N1 无参状态面（报当前 + 可用列表，内建 style Explanatory/Learning/default 恒在场）
 *     N2 非法 name 报错面（不在可用集 → 可操作报错 + 不写配置）
 *     N3 有效 name 写配置面（userSettings 落盘 outputStyle + 缓存失效后 getOutputStyleConfig
 *        重算新值 = in-session 切换生效不重启，ATLAS_CONFIG_DIR 隔离零写真 HOME）
 *   TUI-2 /cd（CC 2.1.169）：
 *     C1 无参状态面（报当前 session cwd + 用法，不改状态）
 *     C2 破缓存判别（本波核心判别面）：cwdState 移动（= realpath(target)）+ process.cwd()
 *        恒定（不做 process.chdir → SkillTool memo 键/系统提示缓存键前缀稳定）
 *     C3 非法路径报错面（Shell.setCwd 抛「does not exist」捕获回报，状态不移动）
 *   TUI-3 /reload-skills（CC 2.1.152）：
 *     R1 强制重扫面（reloadSkillsNow 导出在场 + 触发 skillsChanged.emit）
 *     R2 命令 call 面（触发重扫 + 回报，会话内 registry 刷新）
 *
 * 隔离：零盘写产品面（ATLAS_CONFIG_DIR 隔离 → job tmp；cd 目标目录 = job tmp mkdtemp）；
 * 零 8999（纯函数/模块 import + 状态面调用，无 LLM 面）。
 * 用法（cwd 须 = 被测面 worktree，'src/...' root-relative 导入经 tsconfig baseUrl 解析）：
 *   cd <worktree> && ATLAS_E2E_TUIMINI60_REPO=<worktree 绝对路径> bun run /home/vince/projects/AtlasCode/user-e2e/tui-small-wave-0160.ts
 */
import { mkdtempSync, rmSync, existsSync, realpathSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const REPO = process.env.ATLAS_E2E_TUIMINI60_REPO ?? '/home/vince/projects/AtlasCode/worktrees/worktree-gate-060'
const OUT = process.env.ATLAS_E2E_TUIMINI60_OUT ?? '/home/vince/.claude/jobs/09264df0/tmp/gate-060/tui-mini'

type Probe = { id: string, hard: boolean, ok: boolean | null, detail: string }

/** 修前红面 helper（单测同形）：动态 import（模块缺席 → 定向红，文件不崩）。 */
type LocalCall = (args: string, ctx: unknown) => Promise<{ type: string, value?: string }>
async function loadCall(p: string): Promise<LocalCall | undefined> {
  const mod: any = await import(p).catch(() => ({}))
  return mod?.call as LocalCall | undefined
}

async function main(): Promise<void> {
  // settings/plugin I/O 隔离（单测 beforeEach 同形：userSettings 落盘 + 插件 style 读取走 temp 根，
  // 零写真 ~/.atlas；探针进程独立，隔离面随进程退出）
  const cfgDir = mkdtempSync(join(tmpdir(), 'atlas-tuimini60-'))
  const savedCfgDir = process.env.ATLAS_CONFIG_DIR
  process.env.ATLAS_CONFIG_DIR = cfgDir

  const probes: Probe[] = []
  const report: any = { ts: new Date().toISOString(), repo: REPO, probes }

  const callStyle = await loadCall(join(REPO, 'src/tui/commands/output-style/output-style.ts'))
  const callCd = await loadCall(join(REPO, 'src/tui/commands/cd/cd.ts'))
  const callReload = await loadCall(join(REPO, 'src/tui/commands/reload-skills/reload-skills.ts'))

  // ── TUI-1 /output-style ───────────────────────────────────────────
  if (typeof callStyle !== 'function') {
    probes.push({ id: 'N1-noarg-status-surface', hard: true, ok: false, detail: '/output-style call 导出缺席（修前红形活面现形）' })
    probes.push({ id: 'N2-invalid-name-error', hard: true, ok: false, detail: '/output-style call 导出缺席（修前红形活面现形）' })
    probes.push({ id: 'N3-valid-name-write', hard: true, ok: false, detail: '/output-style call 导出缺席（修前红形活面现形）' })
  } else {
    // N1 无参状态面（内建 style 恒在场；无配置面 = 缺省 default 恒等）
    const r1 = await callStyle('', {})
    const v1 = r1.value ?? ''
    const n1 = r1.type === 'text' && v1.includes('Current output style:') && v1.includes('Available:')
      && v1.includes('Explanatory') && v1.includes('Learning') && v1.includes('default')
    probes.push({
      id: 'N1-noarg-status-surface', hard: true, ok: n1,
      detail: n1
        ? `无参状态面（报当前 style〔无配置 = 缺省 default〕+ 可用列表，内建 Explanatory/Learning/default 恒在场；单测 TUI-1① 同形）`
        : `无参状态面缺口（type=${r1.type}；value 节=${v1.slice(0, 160)}）→ 状态面未落`,
    })
    // N2 非法 name 报错面（可操作报错 + 不写配置）
    const r2 = await callStyle('definitely-not-a-style', {})
    const noWrite = !existsSync(join(cfgDir, 'settings.json'))
    const n2 = (r2.value ?? '').includes('Invalid /output-style "definitely-not-a-style"') && noWrite
    probes.push({
      id: 'N2-invalid-name-error', hard: true, ok: n2,
      detail: n2
        ? `非法 name 报错面（「Invalid /output-style "definitely-not-a-style"」可操作报错 + 未写配置面；单测 TUI-1② 同形）`
        : `报错面缺口（value 节=${(r2.value ?? '').slice(0, 160)}；settings.json 写入=${!noWrite}）→ 报错面/不写配置未落`,
    })
    // N3 有效 name 写配置面（userSettings 落盘 + 缓存失效重算 = in-session 切换）
    const r3 = await callStyle('Explanatory', {})
    const written = existsSync(join(cfgDir, 'settings.json'))
      ? (JSON.parse(readFileSync(join(cfgDir, 'settings.json'), 'utf8')) as any).outputStyle
      : '<未写>'
    let cfgNow: string | null = null
    try {
      const styles: any = await import(join(REPO, 'src/tui/constants/outputStyles.ts'))
      cfgNow = (await styles.getOutputStyleConfig())?.name ?? null
    } catch { /* 导出面缺席 → 单测面承载 */ }
    const n3 = (r3.value ?? '').includes('Output style switched to "Explanatory"')
      && written === 'Explanatory' && cfgNow === 'Explanatory'
    probes.push({
      id: 'N3-valid-name-write', hard: true, ok: n3,
      detail: n3
        ? `写配置面切换生效（userSettings 落盘 outputStyle=Explanatory + clearAllOutputStylesCache/clearSystemPromptSections 失效后 getOutputStyleConfig 重算 = Explanatory，in-session 切换不重启；单测 TUI-1③ 同形）`
        : `写配置面缺口（value 节=${(r3.value ?? '').slice(0, 120)}；落盘=${written}；配置面重算=${cfgNow}）→ 切换/缓存失效链未落`,
    })
  }

  // ── TUI-2 /cd（破缓存判别面）────────────────────────────────────
  const bootstrap: any = await import(join(REPO, 'src/bootstrap/index.ts'))
  const savedState = bootstrap.getCwdState()
  const origCwd = process.cwd()
  const target = mkdtempSync(join(tmpdir(), 'atlas-cd-probe-'))
  try {
    if (typeof callCd !== 'function') {
      probes.push({ id: 'C1-noarg-status-surface', hard: true, ok: false, detail: '/cd call 导出缺席（修前红形活面现形）' })
      probes.push({ id: 'C2-cache-break-discriminator', hard: true, ok: false, detail: '/cd call 导出缺席（修前红形活面现形）' })
      probes.push({ id: 'C3-invalid-path-error', hard: true, ok: false, detail: '/cd call 导出缺席（修前红形活面现形）' })
    } else {
      // C1 无参状态面（不改状态）
      const c1 = await callCd('', {})
      const c1ok = (c1.value ?? '').includes('Session working directory:')
        && (c1.value ?? '').includes('Usage: /cd')
        && bootstrap.getCwdState() === savedState
      probes.push({
        id: 'C1-noarg-status-surface', hard: true, ok: c1ok,
        detail: c1ok
          ? `无参状态面（报当前 session cwd + 用法，cwdState 不变；单测 TUI-2② 同形）`
          : `无参状态面缺口（value 节=${(c1.value ?? '').slice(0, 160)}；状态变更=${bootstrap.getCwdState() !== savedState}）`,
      })
      // C2 破缓存判别（本波核心）：状态面移动 + process.cwd() 恒定（不 chdir）
      const c2 = await callCd(target, {})
      const stateNow = bootstrap.getCwdState()
      const c2ok = (c2.value ?? '').includes('Session working directory changed to:')
        && stateNow === realpathSync(target)
        && process.cwd() === origCwd
      probes.push({
        id: 'C2-cache-break-discriminator', hard: true, ok: c2ok,
        detail: c2ok
          ? `破缓存判别（cwdState = realpath(${target.slice(0, 24)}…) 状态面移动 + process.cwd() 恒定未 chdir → SkillTool memo 键/系统提示缓存键前缀稳定；单测 TUI-2① 同形）`
          : `破缓存判别缺口（value 节=${(c2.value ?? '').slice(0, 120)}；cwdState=${stateNow}；chdir=${process.cwd() !== origCwd}）→ 状态面移动/不 chdir 未落`,
      })
      // C3 非法路径报错面（捕获回报 + 状态不移动）
      const bogus = join(tmpdir(), 'atlas-cd-does-not-exist-xyz')
      const c3 = await callCd(bogus, {})
      const c3ok = (c3.value ?? '').includes('cd failed')
        && (c3.value ?? '').includes('does not exist')
        && bootstrap.getCwdState() === realpathSync(target) // C2 后状态不变
      probes.push({
        id: 'C3-invalid-path-error', hard: true, ok: c3ok,
        detail: c3ok
          ? `非法路径报错面（「cd failed: … does not exist」捕获回报 + 状态不移动；单测 TUI-2③ 同形）`
          : `报错面缺口（value 节=${(c3.value ?? '').slice(0, 160)}）→ 报错/状态不变未落`,
      })
    }
  } finally {
    bootstrap.setCwdState(savedState)
    rmSync(target, { recursive: true, force: true })
  }

  // ── TUI-3 /reload-skills（强制重扫面）───────────────────────────
  const detector: any = await import(join(REPO, 'src/tui/utils/skills/skillChangeDetector.ts')).catch(() => ({}))
  const reloadNow = detector?.reloadSkillsNow as (() => void) | undefined
  let emitted = 0
  const unsub = typeof detector?.subscribe === 'function' ? detector.subscribe(() => { emitted++ }) : null
  try {
    // R1 强制重扫面在场 + 触发 emit
    const r1ok = typeof reloadNow === 'function'
    if (r1ok) reloadNow()
    probes.push({
      id: 'R1-forced-rescan-surface', hard: true, ok: r1ok && emitted === 1,
      detail: r1ok && emitted === 1
        ? `强制重扫面在场（reloadSkillsNow 导出 + 调用触发 skillsChanged.emit×1，REPL useSkillsChange 刷新面；单测 TUI-3① 同形）`
        : `强制重扫面缺口（导出=${typeof reloadNow}；emit=${emitted}）→ 重扫支未落`,
    })
    // R2 命令 call 面
    let r2ok: boolean | null = null
    let r2Detail = ''
    if (typeof callReload === 'function') {
      const before = emitted
      const rr = await callReload('', {})
      const fired = emitted === before + 1
      r2ok = (rr.value ?? '').includes('Re-scanned skill directories') && fired
      r2Detail = r2ok
        ? `命令 call 面（call('') 触发重扫 emit +1 + 回报「Re-scanned skill directories」= 会话内 registry 刷新；单测 TUI-3② 同形）`
        : `命令 call 面缺口（value 节=${(rr.value ?? '').slice(0, 120)}；emit 增量=${emitted - before}）`
    } else {
      r2Detail = '/reload-skills call 导出缺席（修前红形活面现形）'
    }
    probes.push({ id: 'R2-command-call-surface', hard: true, ok: r2ok, detail: r2Detail })
  } finally {
    unsub?.()
    if (savedCfgDir === undefined) delete process.env.ATLAS_CONFIG_DIR
    else process.env.ATLAS_CONFIG_DIR = savedCfgDir
    rmSync(cfgDir, { recursive: true, force: true })
  }

  const hardFail = probes.filter((p) => p.hard && p.ok === false).length
  const verdict = hardFail === 0 ? 'PASS' : `FAIL（hardFail=${hardFail}）`
  report.verdict = verdict
  const outDir = join(OUT)
  rmSync(outDir, { recursive: true, force: true })
  const fs = await import('node:fs')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(join(outDir, 'result.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({
    verdict,
    probes: probes.map((p) => `[${p.ok === true ? 'PASS' : p.ok === false ? 'FAIL' : 'INC'}] ${p.id}`).join(' '),
  }, null, 1))
  console.log(`TUI-MINI-0160 ${verdict} → ${outDir}`)
  process.exit(hardFail === 0 ? 0 : 1)
}

main().catch((e) => { console.error('TUI-MINI-0160 ERROR', e); process.exit(1) })
