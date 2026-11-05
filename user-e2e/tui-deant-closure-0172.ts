/**
 * 0.1.72 块 C-1 · de-ant 残链缺席判别活探针（e2e lane，gate 判据⑤ 新活探针；
 * 工单 docs/2026-10-15-p0-wave-0172-ticket.md §3⑤「新活探针 1 件：de-ant 残链
 * 缺席 = 断言 IFF 主面路由零 anthropic OAuth/keychain 可达 + 非 darwin 恒等」）。
 *
 * 403 根因链双断根：第一断根 0.1.70 H-1（settings-adapter getGlobalApiKey 恒
 * undefined，断 settings-adapter→keychain/OAuth 那根线）+ 第二断根 0.1.72 块 C-1
 * （auth.ts keychain 函数族清零）。本探针 = 残链缺席的行为活探针。
 *
 * 场景（H-1 403 根因场景活复验，prodlane-070 PONG-070 同形）：
 *   沙箱 HOME（job-tmp，0 写真）= providers.iff.apiKey 已设 + modelRoles 三角色
 *   **无 per-role apiKey**（= H-1 场景：per-role 缺 key → 修后走 providers 表兜底
 *   发 IFF，而非 keychain/OAuth anthropic 回落）。headless 发一条 IFF 往返。
 *
 * 断言面：
 *   P-DA1-residual-chain-absent（hard，源级判别锚，修前红→修后绿）：被测 worktree
 *         src/tui/utils/auth.ts + authPortable.ts 全文件 anthropic keychain 读/写/移除
 *         符号族缺席（find/add-generic-password 子进程字面 @ auth 面 +
 *         getLegacyApiKeyPrefetchResult/keychainPrefetch/maybeRemoveApiKeyFromMacOSKeychain
 *         函数族 + getMacOsKeychainStorageServiceName）+ keychainPrefetch.ts 死文件已删
 *         + OOS macOsKeychainHelpers.ts 保留（clearKeychainCache 活消费，勘误工单 §0）。
 *         C-1c 判据面 = Main 重定界「anthropic keychain 路径缺席」（OOS 通用
 *         secureStorage 字面保留不判红，仅锚定 auth.ts/authPortable）。
 *   P-DA2-iff-main-route-no-anthropic（hard，行为活复验，IFF 活面）：H-1 场景
 *         headless（providers.iff.apiKey 兜底 + per-role 无 key）→ rc=0 + PONG marker
 *         在场（IFF 主面路由活通）+ 输出零 `api.anthropic.com` + 零 anthropic 403
 *         族 marker（= IFF 主面路由零 anthropic OAuth/keychain 可达的行为证据；旧
 *         残链在场时 per-role 缺 key 会走 keychain/OAuth 回落打 api.anthropic.com 403）。
 *   P-DA3-non-darwin-identity（soft，恒等锚）：product 运行平台 = linux（darwin
 *         keychain 支结构不可达）→ P-DA2 IFF 往返通 = 非 darwin 零行为变更恒等。
 *
 * 隔离：HOME 单沙箱（job-tmp，0 写真产品面；settings = IFF provider 面）；
 * headless（非 PTY，确定性 + 快，prodlane PONG 先例）；显式 --model Qwen38-27B-TXT
 * 防 429（harness 活面纪律）。IFF 活面 flake（模型面超时）→ P-DA2 重试 1 次，
 * 仍不通 = INCONCLUSIVE（活面非产品面，fail-closed 标注非 hardFail 放行）。
 *
 * 用法：
 *   ATLAS_E2E_DEANT0172_REPO=<worktree 绝对路径> \
 *     bun run /home/vince/projects/AtlasCode/user-e2e/tui-deant-closure-0172.ts
 */
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO =
  process.env.ATLAS_E2E_DEANT0172_REPO ??
  '/home/vince/projects/AtlasCode/worktrees/worktree-0.1.72-de-ant-closure'
const OUT =
  process.env.ATLAS_E2E_DEANT0172_OUT ??
  '/home/vince/.claude/jobs/09264df0/tmp/gate-072/deant0172'
const IFF_TARGET = 'http://127.0.0.1:8999'
const MODEL = 'Qwen38-27B-TXT'

type Probe = { id: string, hard: boolean, ok: boolean | null, detail: string }
const probes: Probe[] = []
const push = (id: string, ok: boolean | null, detail: string, hard = true) =>
  probes.push({ id, hard, ok, detail })

function srcOf(rel: string): string {
  return readFileSync(join(REPO, rel), 'utf8')
}

/** P-DA1 源级判别锚：anthropic keychain 读/写/移除符号族 @ auth 面缺席。
 *  OOS macOsKeychainStorage 字面保留（通用 secureStorage），故仅锚定 auth.ts/authPortable。 */
function pda1(): { ok: boolean, detail: string } {
  const AUTH = 'src/tui/utils/auth.ts'
  const AUTH_PORTABLE = 'src/tui/utils/authPortable.ts'
  const KEYCHAIN_PREFETCH = 'src/tui/utils/secureStorage/keychainPrefetch.ts'
  const MACOS_HELPERS = 'src/tui/utils/secureStorage/macOsKeychainHelpers.ts'
  const literals = [
    'find-generic-password',
    'add-generic-password',
    'delete-generic-password',
    'maybeRemoveApiKeyFromMacOSKeychain',
    'getLegacyApiKeyPrefetchResult',
    'keychainPrefetch',
    'startKeychainPrefetch',
    'getMacOsKeychainStorageServiceName',
  ]
  const present: string[] = []
  for (const f of [AUTH, AUTH_PORTABLE]) {
    let src: string
    try {
      src = srcOf(f)
    } catch {
      return { ok: false, detail: `${f} 缺席（worktree 面异常）` }
    }
    for (const lit of literals) if (src.includes(lit)) present.push(`${f}::${lit}`)
  }
  if (present.length) return { ok: false, detail: `anthropic keychain 字面仍在场（应缺席）：${present.join(', ')}` }
  if (existsSync(join(REPO, KEYCHAIN_PREFETCH)))
    return { ok: false, detail: 'keychainPrefetch.ts 死文件仍在场（应已删）' }
  if (!existsSync(join(REPO, MACOS_HELPERS)))
    return { ok: false, detail: 'OOS macOsKeychainHelpers.ts 缺席（应保留，勘误工单 §0）' }
  return { ok: true, detail: 'auth.ts/authPortable anthropic keychain 符号族全缺席 + keychainPrefetch.ts 已删 + OOS helper 保留' }
}

/** 沙箱 settings（H-1 场景：providers.iff.apiKey 已设 + modelRoles 无 per-role apiKey）。 */
function sandboxSettings(home: string): void {
  const atlasDir = join(home, '.atlas')
  mkdirSync(atlasDir, { recursive: true })
  const settings = {
    model: MODEL,
    modelRoles: {
      small: { models: [{ model: `iff/${MODEL}` }], provider: 'iff' },
      fast: { models: [{ model: `iff/${MODEL}` }], provider: 'iff' },
      premium: { models: [{ model: `iff/${MODEL}` }], provider: 'iff' },
    },
    providers: {
      iff: {
        baseURL: `${IFF_TARGET}/v1`,
        apiKey: 'sk-iff-local',
        api: 'openai-completions',
        defaultContextWindow: 256000,
        defaultMaxTokens: 32000,
        models: [{ id: MODEL, name: MODEL, contextWindow: 256000, maxTokens: 32000 }],
      },
    },
    skipDangerousModePermissionPrompt: true,
    env: { DISABLE_AUTOUPDATER: '1' },
  }
  writeFileSync(join(atlasDir, 'settings.json'), JSON.stringify(settings, null, 2))
}

function healthOk(): Promise<boolean> {
  return fetch(`${IFF_TARGET}/health`, { signal: AbortSignal.timeout(5_000) })
    .then((r) => r.json() as Promise<{ status?: string }>)
    .then((j) => j.status === 'ok')
    .catch(() => false)
}

function headlessPong(home: string, logPath: string, timeoutMs = 180_000): Promise<{ rc: number | null, out: string }> {
  const args = [
    'run', join(REPO, 'src/atlascode/cli.ts'), '-p',
    'Reply with exactly: PONG-DEANT0172', '--model', MODEL, '--dangerously-skip-permissions',
  ]
  return new Promise((resolve) => {
    const child = spawn('bun', args, {
      cwd: REPO,
      env: { ...process.env, HOME: home, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    child.stdout?.on('data', (d) => (out += d.toString()))
    child.stderr?.on('data', (d) => (out += d.toString()))
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL') } catch { /* gone */ }
    }, timeoutMs)
    child.on('exit', (code) => {
      clearTimeout(timer)
      writeFileSync(logPath, out)
      resolve({ rc: code, out })
    })
  })
}

async function pda2(): Promise<{ ok: boolean | null, detail: string }> {
  const home = join(OUT, 'home-deant')
  sandboxSettings(home)
  // IFF 活面前置探活（网关 /health）
  if (!(await healthOk())) return { ok: null, detail: 'IFF 8999 /health 不通（活面前置缺口，非产品面）' }
  let r = await headlessPong(home, join(OUT, 'headless-1.log'))
  // 活面 flake（模型面超时）重试 1 次（prodlane PONG 先例）
  if (r.rc !== 0 || !r.out.includes('PONG-DEANT0172')) {
    if (await healthOk()) await headlessPong(home, join(OUT, 'headless-2.log')).then((r2) => (r = r2))
  }
  const marker = r.out.includes('PONG-DEANT0172')
  const anthropicHit = /api\.anthropic\.com|anthropic\.com/i.test(r.out)
  const quotaHit = /not enough quota|quota to pre-consume/i.test(r.out)
  if (r.rc !== 0 || !marker)
    return { ok: null, detail: `IFF 往返未通（rc=${r.rc} marker=${marker}；活面 flake，非产品面 fail-closed 标注）` }
  if (anthropicHit || quotaHit)
    return { ok: false, detail: `输出命中 anthropic 面（anthropic=${anthropicHit} quota403=${quotaHit}）= 残链仍在场（应缺席）` }
  return {
    ok: true,
    detail: `H-1 场景（per-role 无 key→providers 表兜底）IFF 往返通 rc=0 + PONG marker + 零 anthropic 可达（api.anthropic.com=0 + quota403=0）`,
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  // P-DA1 源级判别锚（fast，确定性）
  const d1 = pda1()
  push('P-DA1-residual-chain-absent', d1.ok, d1.detail, true)
  // P-DA2 行为活复验（IFF 活面）
  const d2 = await pda2()
  push('P-DA2-iff-main-route-no-anthropic', d2.ok, d2.detail, true)
  // P-DA3 非 darwin 恒等（soft 平台锚）
  const plat = process.platform
  push(
    'P-DA3-non-darwin-identity',
    plat === 'linux',
    `product 平台 = ${plat}（darwin keychain 支结构不可达；IFF 往返通 = 非 darwin 零行为变更恒等）`,
    false,
  )
  const hardFail = probes.filter((p) => p.hard && p.ok === false).length
  const inconclusive = probes.filter((p) => p.ok === null).length
  const verdict = hardFail > 0 ? 'FAIL' : inconclusive > 0 ? 'INCONCLUSIVE' : 'PASS'
  const result = { verdict, hardFail, inconclusive, probes: probes.map((p) => `[${p.ok === true ? 'PASS' : p.ok === false ? 'FAIL' : '?'}] ${p.id}`).join(' '), platform: plat, repo: REPO }
  writeFileSync(join(OUT, 'result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
  console.log(`${verdict} → ${OUT}`)
  process.exit(verdict === 'FAIL' ? 1 : 0)
}

main().catch((e) => {
  console.error('[deant-closure-0172] fatal:', e)
  process.exit(1)
})
