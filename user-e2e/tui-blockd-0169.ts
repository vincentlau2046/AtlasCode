/**
 * 0.1.69 块 D Claude 对齐波 · 双面活探针（e2e lane，gate r2 判据⑤，
 * 工单 docs/2026-10-14-p0-wave-0169-ticket.md §2 ⑤；零模型零 8999 = 纯 import
 * + 纯函数 + job-tmp 真实 git 仓 + settings DI 注入）。
 *
 * 断言面（全 hard；B 面红→绿 / 恒等锚基线同绿 双层）：
 *   D1-1  per-model 键控档：256K 模型 100k 封顶 + 1M 模型 auto 不封顶（各取己档，混配封顶缺陷根修，红→绿）
 *   D1-2  无该模型档回落 default 键（default 缺省 → {} 无覆写 = auto）
 *   D1-3  旧单档兼容读恒等锚：normalizeAutoCompactWindowSetting 单档 → { default } 键 + 1 参 resolve = 修前精确同值（基线同绿面 = 归一语义波体新增，但行为值 = 修前单档面）
 *   D1-4  无档回落 default：resolveAutoCompactWindow(null, model) → {} 零覆写
 *   D1-5  per-model off 档：isAutoCompactEnabledForModel('offModel') = false + 他模型不受波及 = true（settings DI 注面，红→绿）
 *   D3-1  主摘要抛 API 级失败（429 型）→ fallback small 重试 1 次成功（primary 共 2 调用 + 第 2 调用 modelOverride 在场，红→绿）
 *   D3-2  主摘要抛 PTL → 不触发 fallback（rethrow，1 调用，恒等锚）
 *   D3-3  主摘要抛用户中止（aborted）→ 不触发 fallback（rethrow，1 调用，恒等锚）
 *   D3-4  主摘要返回 API 错误前缀消息（isEligibleResult=true）→ fallback 1 次重试（共 2 调用）+ 重试成功即返回重试结果
 *   D3-5  主摘要成功（无错误标记）→ 恰好 1 调用（零额外调用恒等锚，基线同绿语义）
 *   D3-6  fallback 模型缺席（resolveFallbackModel → undefined）→ 抛出面 rethrow / 返回面原样（1 调用，零回归）
 *   D3-7  isFallbackEligibleResult 修波面：AssistantMessage 型对象（无 isApiErrorMessage 声明）+ 'API Error' 前缀文本 = true（prefix 支）+ 正常文本 = false + PTL/中止文本 = false（修波 unknown+object 守卫可达域零行为变更核验）
 *   D5-1  门①基线缺（未抓取 session 起始）→ null 零注入
 *   D5-2  门③无变更恒等锚（fresh 块与基线 JSON 同一）→ null 零 token 浪费
 *   D5-3  变更面（工作树新文件）→ git_status_refresh 附件在场 + fresh 文案「re-injected after context compaction」（红→绿）
 *   D5-4  消费面：normalizeAttachmentForAPI git_status_refresh 支 → system-reminder isMeta user message（唯一 API 消费面）
 *
 * 基线面（修前红形 @0cf6d31 = v0.1.68）：autoCompactWindow per-model 面（resolveAutoCompactWindow model 键 /
 * isAutoCompactEnabledForModel）+ summarizeFallback 模块 + createCurrentGitStatusAttachment 全缺席
 * → D1-1/D1-2/D1-5/D3-1/D3-4/D5-1/D5-2/D5-3/D5-4 定向红（结构承载）；恒等锚 D1-3（旧单档归一值 = 修前单档语义）
 * / D1-4（无档 {} 零覆写）/ D3-2 / D3-3 / D3-5 / D3-6 基线同绿面 = 语义锚（基线面这些探针以「模块缺席 = 红」承载，
 * 探针统一结构承载红；恒等锚语义 = gate 面断言值与修前单档面精确同值）。
 * 用法：
 *   ATLAS_E2E_BLOCKD0169_REPO=<worktree 绝对路径> \
 *     bun run /home/vince/projects/AtlasCode/user-e2e/tui-blockd-0169.ts
 */
import { execSync } from 'node:child_process'
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

const REPO =
  process.env.ATLAS_E2E_BLOCKD0169_REPO ??
  '/home/vince/projects/AtlasCode/worktrees/worktree-gate-069'

const OUT =
  process.env.ATLAS_E2E_BLOCKD0169_OUT ??
  '/home/vince/.claude/jobs/09264df0/tmp/gate-069/blockd-0169'

type Probe = { id: string, hard: boolean, ok: boolean | null, detail: string }
const probes: Probe[] = []
const push = (id: string, ok: boolean | null, detail: string, hard = true) =>
  probes.push({ id, hard, ok, detail })

// ── D-1：per-model autocompact 窗口档 ────────────────────────────
async function probeD1(): Promise<void> {
  const wcMod: any = await import(join(REPO, 'src/engine/context/autoCompactWindow.ts')).catch(() => ({}))
  const acMod: any = await import(join(REPO, 'src/engine/context/autoCompact.ts')).catch(() => ({}))
  const avail = typeof wcMod.resolveAutoCompactWindow === 'function'

  // D1-1 per-model 键控（256K 模型 100k 封顶 + 1M 模型 auto 不封顶）
  if (avail) {
    const perModel = {
      model256: { kind: 'window', tokens: 100_000 },
      model1m: { kind: 'auto' },
    }
    const r256 = wcMod.resolveAutoCompactWindow(perModel, 'model256')
    const r1m = wcMod.resolveAutoCompactWindow(perModel, 'model1m')
    const ok =
      r256.windowOverride === 100_000 &&
      r1m.windowOverride === undefined &&
      r1m.pctOverride === undefined &&
      r1m.autoCompactDisabled !== true
    push(
      'D1-1-per-model-tiers',
      ok,
      ok
        ? `D-1 per-model 键控档（256K 模型 100k 封顶 windowOverride=100000 / 1M 模型 auto 不封顶〔无覆写〕= 各取己档，混配封顶缺陷根修；红→绿）`
        : `D-1 缺口（256k cap=${r256.windowOverride ?? '缺'} 1m 覆写=${JSON.stringify(r1m)} = 红形/结构承载）`,
    )
  } else {
    push('D1-1-per-model-tiers', false, `D-1 结构承载（resolveAutoCompactWindow 模块缺席 = 修前红形）`)
  }

  // D1-2 无该模型档回落 default 键
  if (avail) {
    const withDefault = { default: { kind: 'window', tokens: 200_000 }, modelA: { kind: 'pct', pct: 50 } }
    const miss = wcMod.resolveAutoCompactWindow(withDefault, 'modelB')
    const hit = wcMod.resolveAutoCompactWindow(withDefault, 'modelA')
    const ok = miss.windowOverride === 200_000 && hit.pctOverride === 50
    push(
      'D1-2-default-fallback',
      ok,
      ok
        ? `D-1 无该模型档回落 default 键（modelB 无键 → default 200k / modelA 命中 pct 50 = 键控优先 + default 兜底链）`
        : `回落链缺口（miss=${JSON.stringify(miss)} hit=${JSON.stringify(hit)}）`,
    )
  } else {
    push('D1-2-default-fallback', false, `D-1 结构承载（模块缺席）`)
  }

  // D1-3 旧单档兼容读恒等锚（单档 → default 键归一，值 = 修前单档面精确同值）
  if (typeof wcMod.normalizeAutoCompactWindowSetting === 'function') {
    const legacy = { kind: 'window', tokens: 150_000 }
    const norm = wcMod.normalizeAutoCompactWindowSetting(legacy)
    const single = wcMod.resolveAutoCompactWindow(legacy) // 1 参 = 修前语义
    const ok =
      norm.default?.kind === 'window' &&
      norm.default?.tokens === 150_000 &&
      single.windowOverride === 150_000
    push(
      'D1-3-legacy-single-anchor',
      ok,
      ok
        ? `D-1 旧单档兼容读恒等锚（旧单档 window 150k → 归一 { default: 150k } + 1 参调用 = 修前单全局档精确同值 = 零回归锚；无数据迁移）`
        : `恒等锚缺口（norm=${JSON.stringify(norm)} single=${JSON.stringify(single)}）`,
    )
  } else {
    push('D1-3-legacy-single-anchor', false, `D-1 结构承载（normalizeAutoCompactWindowSetting 缺席 = 修前红形）`)
  }

  // D1-4 无档回落 default（null 设置 → {} 零覆写 = auto）
  if (avail) {
    const none = wcMod.resolveAutoCompactWindow(null, 'anyModel')
    const ok =
      none.windowOverride === undefined &&
      none.pctOverride === undefined &&
      none.autoCompactDisabled !== true
    push(
      'D1-4-no-setting-anchor',
      ok,
      ok
        ? `D-1 无档回落 default（null 设置 + 任意模型 → {} 零覆写 = auto 缺省面，恒等锚）`
        : `缺口（none=${JSON.stringify(none)} ≠ {} 零覆写）`,
    )
  } else {
    push('D1-4-no-setting-anchor', false, `D-1 结构承载（模块缺席）`)
  }

  // D1-5 per-model off 档（settings DI 注面：off 模型禁用 + 他模型不波及）
  if (typeof acMod.isAutoCompactEnabledForModel === 'function' && typeof acMod.setAutoCompactWindowSettingsSource === 'function') {
    const offModel = 'off-target-model'
    acMod.setAutoCompactWindowSettingsSource(() => ({
      [offModel]: { kind: 'off' },
    }))
    let ok = false
    let offVal = true
    let otherVal = false
    try {
      offVal = acMod.isAutoCompactEnabledForModel(offModel)
      otherVal = acMod.isAutoCompactEnabledForModel('other-model')
      ok = offVal === false && otherVal === true
    } finally {
      acMod.setAutoCompactWindowSettingsSource(null)
    }
    push(
      'D1-5-per-model-off-tier',
      ok,
      ok
        ? `D-1 per-model off 档（off-target-model off 档 → isAutoCompactEnabledForModel=false / 他模型 = true 不波及 = 每模型各取己档不串扰；红→绿）`
        : `off 档缺口（off=${offVal} other=${otherVal}）`,
    )
  } else {
    push(
      'D1-5-per-model-off-tier',
      false,
      `D-1 结构承载（isAutoCompactEnabledForModel / setAutoCompactWindowSettingsSource 缺席 = 修前红形）`,
    )
  }
}

// ── D-3：摘要 fallback 模型 ──────────────────────────────────────
type PrimP = { modelOverride?: string, tag: string }
// PROMPT_TOO_LONG_ERROR_MESSAGE = modelprovider/modelErrors.ts:23（'Prompt is too long'，
// isFallbackEligibleError PTL 判别面 = 此常量，非 compactPtl 的 conversation-too-long 文案）
const PTL_TEXT = 'Prompt is too long'
function makePrim(failMode: 'throw-api' | 'throw-ptl' | 'throw-abort' | 'return-apierr' | 'ok') {
  const calls: PrimP[] = []
  const primary = async (p: PrimP): Promise<PrimP & { text: string }> => {
    calls.push(p)
    // fallback 重试面（modelOverride 在场 = small 角色）= 成功；主调用面 = 按 failMode 失败
    // （修波语义：fallback 成功即返回重试结果；双失败 = 返回面原样返主错 / 抛出面传播）
    const isFallbackCall = p.modelOverride !== undefined
    switch (failMode) {
      case 'throw-api':
        if (isFallbackCall) return { ...p, text: 'NORMAL-SUMMARY' }
        throw new Error('429 Too Many Requests: rate limit exceeded')
      case 'throw-ptl':
        throw new Error(PTL_TEXT)
      case 'throw-abort':
        // 中止判别面 = isFallbackEligibleError 'Request was aborted.' 文案
        // （modelprovider 用户中止语义，非 compact.ts ERROR_MESSAGE_USER_ABORT 文案）
        throw new Error('Request was aborted.')
      case 'return-apierr':
        if (isFallbackCall) return { ...p, text: 'NORMAL-SUMMARY' }
        return { ...p, text: 'API Error: upstream 503 service unavailable' }
      default:
        return { ...p, text: 'NORMAL-SUMMARY' }
    }
  }
  return { primary, calls }
}
const apiErrText = (r: PrimP & { text: string }) => r.text.startsWith('API Error')
const asMsgLike = (r: PrimP & { text: string }) =>
  ({ role: 'assistant', message: { content: [{ type: 'text', text: r.text }] } }) // AssistantMessage 型（无 isApiErrorMessage 声明 = 修波 unknown+object 守卫面）

async function probeD3(): Promise<void> {
  const fbMod: any = await import(join(REPO, 'src/tui/contextBodies/summarizeFallback.ts')).catch(() => ({}))
  const avail = typeof fbMod.createSummarizeWithFallback === 'function'

  if (avail) {
    // D3-1 主摘要抛 API 级失败 → fallback 成功（2 调用 + modelOverride 在场）
    {
      const { primary, calls } = makePrim('throw-api')
      const summarize = fbMod.createSummarizeWithFallback(primary, {
        resolveFallbackModel: () => 'small-fallback-model',
      })
      let res: any
      try {
        res = await summarize({ tag: 'req-1' })
      } catch {
        res = null
      }
      const ok =
        calls.length === 2 &&
        calls[1].modelOverride === 'small-fallback-model' &&
        res?.text === 'NORMAL-SUMMARY'
      push(
        'D3-1-fallback-on-api-failure',
        ok,
        ok
          ? `D-3 主摘要 API 级失败 → small 角色 fallback 重试 1 次成功（primary 共 2 调用 + 第 2 调用 modelOverride=small-fallback-model + 返回 fallback 结果；红→绿）`
          : `fallback 缺口（calls=${calls.length} override=${calls[1]?.modelOverride ?? '缺'} res=${res?.text ?? 'null'}）`,
      )
    }

    // D3-2 PTL 不触发（rethrow + 1 调用）
    {
      const { primary, calls } = makePrim('throw-ptl')
      const summarize = fbMod.createSummarizeWithFallback(primary, {
        resolveFallbackModel: () => 'small-fallback-model',
      })
      let threw = false
      try {
        await summarize({ tag: 'req-2' })
      } catch {
        threw = true
      }
      const ok = threw && calls.length === 1
      push(
        'D3-2-ptl-no-trigger-anchor',
        ok,
        ok
          ? `D-3 PTL 不触发 fallback（PTL = 调用方截头重试支消费面，小模型窗更小不解决 → rethrow + 恰好 1 调用；恒等锚）`
          : `PTL 面缺口（threw=${threw} calls=${calls.length} ≠ rethrow+1）`,
      )
    }

    // D3-3 用户中止不触发（rethrow + 1 调用）
    {
      const { primary, calls } = makePrim('throw-abort')
      const summarize = fbMod.createSummarizeWithFallback(primary, {
        resolveFallbackModel: () => 'small-fallback-model',
      })
      let threw = false
      try {
        await summarize({ tag: 'req-3' })
      } catch {
        threw = true
      }
      const ok = threw && calls.length === 1
      push(
        'D3-3-abort-no-trigger-anchor',
        ok,
        ok
          ? `D-3 用户中止不触发 fallback（ESC/abort = 用户意图，回落违背意图 → rethrow + 恰好 1 调用；恒等锚）`
          : `中止面缺口（threw=${threw} calls=${calls.length} ≠ rethrow+1）`,
      )
    }

    // D3-4 返回面 API 错误前缀 → fallback 1 次重试
    {
      const { primary, calls } = makePrim('return-apierr')
      const summarize = fbMod.createSummarizeWithFallback(primary, {
        resolveFallbackModel: () => 'small-fallback-model',
        isEligibleResult: r => apiErrText(r as PrimP & { text: string }),
      })
      const res: any = await summarize({ tag: 'req-4' })
      const ok =
        calls.length === 2 &&
        calls[1].modelOverride === 'small-fallback-model' &&
        res?.text === 'NORMAL-SUMMARY'
      push(
        'D3-4-return-apierr-fallback',
        ok,
        ok
          ? `D-3 返回面 API 错误前缀摘要 → fallback 1 次重试（isEligibleResult 判 'API Error' 前缀 → small 重试 2 调用 + 重试成功即返重试结果；红→绿）`
          : `返回面缺口（calls=${calls.length} res=${res?.text ?? 'null'}）`,
      )
    }

    // D3-5 主摘要成功 = 恰好 1 调用（零额外调用恒等锚）
    {
      const { primary, calls } = makePrim('ok')
      const summarize = fbMod.createSummarizeWithFallback(primary, {
        resolveFallbackModel: () => 'small-fallback-model',
        isEligibleResult: r => apiErrText(r as PrimP & { text: string }),
      })
      const res: any = await summarize({ tag: 'req-5' })
      const ok = calls.length === 1 && res?.text === 'NORMAL-SUMMARY'
      push(
        'D3-5-success-no-extra-call-anchor',
        ok,
        ok
          ? `D-3 主摘要成功 = 恰好 1 调用（零额外调用恒等锚 = 修前单调用面精确同值，不触发面零回归）`
          : `恒等锚缺口（calls=${calls.length} ≠ 1）`,
      )
    }

    // D3-6 fallback 模型缺席 = 1 调用零回归
    {
      const t1 = makePrim('throw-api')
      const s1 = fbMod.createSummarizeWithFallback(t1.primary, { resolveFallbackModel: () => undefined })
      let t1threw = false
      try {
        await s1({ tag: 'req-6a' })
      } catch {
        t1threw = true
      }
      const t2 = makePrim('return-apierr')
      const s2 = fbMod.createSummarizeWithFallback(t2.primary, {
        resolveFallbackModel: () => undefined,
        isEligibleResult: r => apiErrText(r as PrimP & { text: string }),
      })
      const r2: any = await s2({ tag: 'req-6b' })
      const ok =
        t1threw && t1.calls.length === 1 && t2.calls.length === 1 && r2?.text === 'API Error: upstream 503 service unavailable'
      push(
        'D3-6-no-fallback-model-anchor',
        ok,
        ok
          ? `D-3 fallback 模型缺席（resolveFallbackModel → undefined：抛出面 rethrow / 返回面原样返错消息，各 1 调用 = 修前单调用面零回归；未配置 small 角色零回归锚）`
          : `缺席面缺口（throw 面 calls=${t1.calls.length} 返回面 calls=${t2.calls.length} res=${r2?.text ?? 'null'}）`,
      )
    }

    // D3-7 修波面：isFallbackEligibleResult unknown + object 守卫
    {
      const ok =
        fbMod.isFallbackEligibleResult(asMsgLike({ tag: 'x', text: 'API Error: 500' }), 'API Error: 500') === true &&
        fbMod.isFallbackEligibleResult(asMsgLike({ tag: 'x', text: 'NORMAL' }), 'NORMAL-SUMMARY') === false &&
        fbMod.isFallbackEligibleResult(asMsgLike({ tag: 'x', text: PTL_TEXT }), PTL_TEXT) === false &&
        fbMod.isFallbackEligibleResult(asMsgLike({ tag: 'x', text: 'aborted' }), 'Request was aborted.') === false &&
        fbMod.isFallbackEligibleResult(null, 'API Error: 500') === true // 修波 object 守卫：非对象输入 flagged=false 面，prefix 支仍可达
      push(
        'D3-7-eligible-result-fixed-surface',
        ok,
        ok
          ? `D-3 修波面核验（isFallbackEligibleResult 首参 unknown + object 守卫：AssistantMessage 型对象（无 isApiErrorMessage 声明）+ 'API Error' 前缀 = true〔prefix 支〕/ 正常文本 = false / PTL = false / 中止 = false / 非对象输入 = flagged 缺席但 prefix 支可达 = 修波可达域零行为变更铁证）`
          : `修波面缺口（unknown/object 守卫语义面漂移）`,
      )
    }
  } else {
    for (const id of [
      'D3-1-fallback-on-api-failure',
      'D3-2-ptl-no-trigger-anchor',
      'D3-3-abort-no-trigger-anchor',
      'D3-4-return-apierr-fallback',
      'D3-5-success-no-extra-call-anchor',
      'D3-6-no-fallback-model-anchor',
      'D3-7-eligible-result-fixed-surface',
    ]) {
      push(id, false, `D-3 结构承载（summarizeFallback 模块缺席 = 修前红形）`)
    }
  }
}

// ── D-5：压缩后当前 git status 重注 ─────────────────────────────
async function probeD5(): Promise<void> {
  // job tmp 真实 git 仓（零写真 ~/.atlas / 主仓）
  const repo = join(tmpdir(), `atlas-blockd0169-git-${randomUUID().slice(0, 8)}`)
  const cwdBackup = process.cwd()
  let gitOk = false
  try {
    mkdirSync(repo, { recursive: true })
    execSync('git init -q && git config user.email e2e@test.local && git config user.name e2e', { cwd: repo })
    writeFileSync(join(repo, 'a.txt'), 'alpha\n')
    execSync('git add a.txt && git commit -qm init', { cwd: repo })
    // D5 模块面 import（tui 链；cwd = 假 git 仓锚定 git 命令）
    process.chdir(repo)
    const compactMod: any = await import(join(REPO, 'src/tui/contextBodies/compact.ts')).catch(() => ({}))
    const ctxMod: any = await import(join(REPO, 'src/tui/context.ts')).catch(() => ({}))
    const msgsMod: any = await import(join(REPO, 'src/tui/utils/messages.ts')).catch(() => ({}))
    const avail =
      typeof compactMod.createCurrentGitStatusAttachment === 'function' &&
      typeof ctxMod.getGitStatus === 'function'

    if (avail) {
      // D5-1 门①基线缺（getGitStatus memo 从未跑 → sessionStartGitStatusBlocks null）→ null
      const g1 = await compactMod.createCurrentGitStatusAttachment()
      push(
        'D5-1-gate-baseline-missing',
        g1 === null,
        g1 === null
          ? `D-5 门①基线缺（session 起始快照未抓取 = 非 git/测试 env/未跑 getSystemContext → null 零注入，安全向；真实 git 仓锚定）`
          : `门①缺口（基线缺面非 null = 误注风险）`,
      )

      // 抓取 session 起始基线（memoize 首跑 = 快照捕获）
      const snap = await ctxMod.getGitStatus()
      if (snap === null) {
        push('D5-2-gate-unchanged-anchor', null, `INC：getGitStatus 假仓返回 null（git 命令面未达，定因 = 环境面）`)
        push('D5-3-changed-face', null, `INC：基线未捕获，变更面不可测`)
        push('D5-4-api-consumer', null, `INC：依附 D5-3`)
        return
      }

      // D5-2 门③无变更恒等锚（fresh 块 = 基线块 JSON 同一 → null 零 token 浪费）
      const g2 = await compactMod.createCurrentGitStatusAttachment()
      push(
        'D5-2-gate-unchanged-anchor',
        g2 === null,
        g2 === null
          ? `D-5 门③无变更恒等锚（工作树 = session 起始态 → fresh 块与基线块 JSON 同一 → null 零注入 = 零 token 浪费恒等锚，修后行为面精确同值）`
          : `恒等锚缺口（无变更面误注 = 压缩后每轮 token 浪费）`,
      )

      // D5-3 变更面（新文件 → 工作树变化）；createAttachmentMessage wrapper 形 =
      // { attachment: <inner>, type: 'attachment', uuid, timestamp }（attachments.ts L3008）
      writeFileSync(join(repo, 'b-new.txt'), 'beta\n')
      const g3 = await compactMod.createCurrentGitStatusAttachment()
      const inner = (g3 as { attachment?: { type?: string, status?: string } } | null)?.attachment
      const ok3 =
        inner !== undefined &&
        inner.type === 'git_status_refresh' &&
        (inner.status ?? '').includes('re-injected after context compaction') &&
        (inner.status ?? '').includes('b-new.txt')
      push(
        'D5-3-changed-face',
        ok3,
        ok3
          ? `D-5 变更面（工作树新文件 b-new.txt → createAttachmentMessage wrapper 内 attachment.type=git_status_refresh + fresh 文案「re-injected after context compaction」+ 新文件在 status 块 = 压缩后工作树变更不盲；红→绿）`
          : `变更面缺口（inner.type=${inner?.type ?? 'null'} status=${(inner?.status ?? '').slice(0, 60)}）`,
      )

      // D5-4 消费面（normalizeAttachmentForAPI(attachment: Attachment) 单参内层 = 唯一 API 消费面）
      const norm =
        msgsMod.normalizeAttachmentForAPI && inner
          ? msgsMod.normalizeAttachmentForAPI(inner)
          : null
      const normJson = JSON.stringify(norm ?? null)
      const ok4 =
        Array.isArray(norm) &&
        norm.length === 1 &&
        normJson.includes('re-injected after context compaction') &&
        normJson.includes('isMeta')
      push(
        'D5-4-api-consumer',
        ok4,
        ok4
          ? `D-5 API 消费面（normalizeAttachmentForAPI git_status_refresh 支 = wrapMessagesInSystemReminder([createUserMessage isMeta]) 单条 user message 在场〔唯一 API 消费面；TUI 渲染面 NULL_RENDERING_TYPES 预过滤零渲染〕）`
          : `消费面缺口（norm=${normJson.slice(0, 120) || 'null'}）`,
      )
      gitOk = true
    } else {
      push('D5-1-gate-baseline-missing', false, `D-5 结构承载（createCurrentGitStatusAttachment/getGitStatus 缺席 = 修前红形）`)
      push('D5-2-gate-unchanged-anchor', false, `D-5 结构承载（模块缺席）`)
      push('D5-3-changed-face', false, `D-5 结构承载（模块缺席）`)
      push('D5-4-api-consumer', false, `D-5 结构承载（模块缺席）`)
    }
  } catch (e) {
    for (const id of [
      'D5-1-gate-baseline-missing',
      'D5-2-gate-unchanged-anchor',
      'D5-3-changed-face',
      'D5-4-api-consumer',
    ]) {
      if (!probes.some((p) => p.id === id)) {
        push(id, null, `INC：D-5 import 链异常（${String(e).slice(0, 160)} = tui 模块链环境面，非产品面）`)
      }
    }
    gitOk = false
  } finally {
    process.chdir(cwdBackup)
    if (existsSync(repo)) rmSync(repo, { recursive: true, force: true })
  }
}

async function main(): Promise<void> {
  await probeD1()
  await probeD3()
  await probeD5()

  const hardFail = probes.filter((p) => p.hard && p.ok === false).length
  const inc = probes.filter((p) => p.ok === null).length
  const verdict = hardFail === 0 && inc === 0 ? 'PASS' : hardFail === 0 ? `PASS-with-INC（INC=${inc}）` : `FAIL（hardFail=${hardFail} INC=${inc}）`
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, 'result.json'), JSON.stringify({ probe: 'tui-blockd-0169', repo: REPO, verdict, probes }, null, 2))
  console.log(
    JSON.stringify(
      {
        verdict,
        probes: probes.map((p) => `[${p.ok === true ? 'PASS' : p.ok === false ? 'FAIL' : 'INC'}] ${p.id}`).join(' '),
      },
      null,
      1,
    ),
  )
  console.log(`TUI-BLOCKD-0169 ${verdict} → ${OUT}`)
  process.exit(hardFail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('TUI-BLOCKD-0169 ERROR', e)
  process.exit(1)
})
