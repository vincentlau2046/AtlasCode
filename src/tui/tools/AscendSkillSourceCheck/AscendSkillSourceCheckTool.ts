/* eslint-disable custom-rules/no-sync-fs -- registry/manifest 读取为启动式小文件读（officialVerify 同例；sync→async 改写违行为面最小纪律） */
/**
 * AscendSkillSourceCheck — 三总纲（ascend-doctor/optimism/opdev）Step 0 的
 * pin 源新鲜度检查与更新工具（0.1.87 任务 F，工单
 * docs/2026-11-02-p0-wave-0187-ticket.md §1.F + 审计吸收 ②/③a/③b/③c）。
 *
 * 职责（唯一授权的运行时 fetch 例外，工单 Global Constraints 修订）：
 *   action "check"  — `git ls-remote` 官方源顶层 HEAD 对比本地锚（agent-skills =
 *                     市场安装 clone 的 HEAD（registry installLocation）；
 *                     ms-agent-skills = manifest pinned_sha（pin 快照，无本地
 *                     clone））；有界超时（默认 30s，timeoutMs 加性覆盖）。
 *   action "update" — 仅 agent-skills：本地 clone `git fetch` + fast-forward-only
 *                     + `git submodule update --init --recursive` + 更新后
 *                     integrity 验真（submodule gitlink vs live + marketplace
 *                     manifest 在场）；败 = 自动回退 pre-update 提交（本地树不
 *                     推进）。ms-agent-skills = 拒绝 fail-visible（无 clone 可
 *                     更新，re-pin 归既有 sync/verify 流程）。
 *
 * 信任边界（工单 §129 + 审计②）：
 *   - 逐字不改 manifest pinned_sha 信任锚；越 pin 执行 = 用户 2026-11-02
 *     「有更新则更新后执行」指令授予的上级信任，验真锚 = 官方远端 FF 获取的树
 *     + 新 sha 全文留存（结果字段 updatedTo + 漂移日志）+ 一键回退命令
 *     （rollback 字段 = `git -C <clone> reset --hard <preUpdateSha>`）。
 *   - 非 fast-forward（上游历史改写）= 拒绝；integrity 败 = 拒绝 + 回退；
 *     断网/超时 = unreachable —— 三者皆 fail-visible，不静默旧快照。
 *   - fresh verdict 做 session 级缓存（审计③b：同 source 同 localSha 不重复
 *     ls-remote）；drift/unreachable 不缓存。
 *   - kill-switch（审计③c）：复用
 *     ATLAS_DISABLE_ASCEND_MARKETPLACE_AUTOINSTALL（单一事实源，零第二 env）；
 *     killed 支零网络（不发任何 git 调用）。
 *   - 更新动作只触本工具钉住的官方源 clone；不碰用户 settings/skills/任意仓库；
 *     不写 known_marketplaces.json（新 resolvedSha 以结果字段 + 日志登记，
 *     World B 复核按越 pin 状态解读——见工单批注）。
 *
 * 注册面（工单审计③a 裁定，Main 2026-11-03）：仅 TUI face 注册
 * （src/tui/tools.ts 无条件裸行，shouldDefer:true = deferred 池 + ToolSearch
 * 发现 + discoveredToolNames 校验豁免授予路径）；不进 AscendBridge feature 门、
 * 不进 engine ascendTools 槽（engine 车道零 defer 消费，进槽必 always-on）。
 * 非 ascend 域包 16 工具（L16 计数与 fam 基线不受扰）；非 slash 命令（命令面
 * 零变化）。权限授予 = 三总纲 allowedTools（TPC alwaysAllowRules）。
 */

import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { logForDebugging } from '../../../kernel/utils/debug'
import { execFileNoThrowWithCwd } from '../../../kernel/utils/execFileNoThrow.js'
import { gitExe } from '../../../kernel/utils/git.js'
import { getHeadForDir } from '../../../kernel/utils/git/gitFilesystem.js'
import { getPluginsDirectory } from '../../utils/plugins/pluginDirectories.js'
import { lazySchema } from '../../../kernel/utils/lazySchema.js'
import { parseYaml } from '../../utils/yaml.js'
import { isAscendMarketplaceAutoInstallDisabled } from '../../plugins/ascend/marketplace/ascendMarketplaceStartupCheck.js'

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export type AscendSourceName = 'agent-skills' | 'ms-agent-skills'
export type AscendSourceCheckVerdict = 'fresh' | 'drift' | 'unreachable' | 'killed'

export interface AscendSourceCheckResult {
  verdict: AscendSourceCheckVerdict
  /** agent-skills = 本地 clone HEAD；ms-agent-skills = manifest pinned_sha；killed = ''。 */
  localSha: string
  upstreamSha?: string
  /** update 成功后的新 HEAD（= 官方源 FF 后的树锚，登记面）。 */
  updatedTo?: string
  /** 一键回退命令（审计②）：回 pre-update 提交。 */
  rollback?: string
  error?: string
}

export interface AscendSourceManifestSource {
  repo: string
  url?: string
  pinned_sha?: string | null
  local_clone?: string | null
}
export interface AscendSourceManifest {
  sources?: AscendSourceManifestSource[]
}

export interface AscendSourceCheckDeps {
  /** git 执行面（默认 execFileNoThrowWithCwd(gitExe(), …)，带超时）。 */
  runGit?: (
    args: readonly string[],
    opts?: { cwd?: string; timeoutMs?: number },
  ) => Promise<{ code: number; stdout: string; stderr: string }>
  /** manifest 装载（默认仓库内真身路径 walk-up）；显式返回 null = manifest 不可读。 */
  loadManifest?: () => AscendSourceManifest | null
  /** agent-skills 本地 clone 目录 override（默认 registry installLocation）。 */
  cloneDir?: string | null
  /** 存在性探针（默认 existsSync）— marketplace.json integrity 锚。 */
  fileExists?: (path: string) => boolean
  /** submodule live HEAD 读取（默认 getHeadForDir）。 */
  getSubmoduleHead?: (dir: string) => Promise<string | null>
  timeoutMs?: number
  /** 漂移登记Sink（默认 logForDebugging）。 */
  log?: (msg: string) => void
}

// ---------------------------------------------------------------------------
// 常量 + 默认依赖
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 30_000
const MAX_WALK_UP = 15
const MANIFEST_REL = 'src/tui/plugins/ascend/knowledge/ascend-official.manifest.yaml'
const MARKETPLACE_MANIFEST_REL = join('.claude-plugin', 'marketplace.json')

/** source 参数 → manifest repo 键。 */
const MANIFEST_REPO_KEY: Record<AscendSourceName, string> = {
  'agent-skills': 'agent-skills',
  'ms-agent-skills': 'ms-agent',
}

function findRepoRoot(startDir: string): string | null {
  let dir = startDir
  for (let i = 0; i < MAX_WALK_UP; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

const defaultRunGit: NonNullable<AscendSourceCheckDeps['runGit']> = (args, opts) =>
  execFileNoThrowWithCwd(gitExe(), [...args], {
    cwd: opts?.cwd,
    timeout: opts?.timeoutMs,
    stdin: 'ignore',
  })

const defaultLoadManifest = (): AscendSourceManifest | null => {
  const repoRoot = findRepoRoot(dirname(new URL(import.meta.url).pathname))
  if (!repoRoot) return null
  const manifestPath = join(repoRoot, MANIFEST_REL)
  if (!existsSync(manifestPath)) return null
  try {
    return parseYaml(readFileSync(manifestPath, 'utf8')) as AscendSourceManifest
  } catch {
    return null
  }
}

type KnownMarketplacesFile = Record<string, { installLocation?: string }>

const defaultCloneDir = (): string | null => {
  const knownPath = join(getPluginsDirectory(), 'known_marketplaces.json')
  if (!existsSync(knownPath)) return null
  try {
    const known = JSON.parse(readFileSync(knownPath, 'utf8')) as KnownMarketplacesFile
    return known['agent-skills']?.installLocation ?? null
  } catch {
    return null
  }
}

const defaultLog = (msg: string): void => {
  logForDebugging(msg)
}

// ---------------------------------------------------------------------------
// session 级 fresh 缓存（审计③b）：source → { localSha, upstreamSha }。
// 同 localSha 的后续 check 不重发 ls-remote；drift/unreachable 不缓存。
// ---------------------------------------------------------------------------
const freshCache = new Map<AscendSourceName, { localSha: string; upstreamSha: string }>()

/** @internal 测试隔离钩子（清 session 缓存）。 */
export function resetSourceCheckCacheForTests(): void {
  freshCache.clear()
}

// ---------------------------------------------------------------------------
// 核心逻辑（deps 注入面，unit 测试以假 runGit/loadManifest/fileExists 驱动）
// ---------------------------------------------------------------------------

function trimErr(stderr: string): string {
  return stderr.trim().split('\n').slice(-2).join(' ').slice(0, 200)
}

function manifestSource(deps: AscendSourceCheckDeps, source: AscendSourceName): AscendSourceManifestSource | null {
  const manifest = deps.loadManifest ? deps.loadManifest() : defaultLoadManifest()
  const repoKey = MANIFEST_REPO_KEY[source]
  return manifest?.sources?.find(s => s.repo === repoKey) ?? null
}

function resolveCloneDir(deps: AscendSourceCheckDeps): string | null {
  return deps.cloneDir !== undefined ? deps.cloneDir : defaultCloneDir()
}

/** 解析本地锚：agent-skills = clone HEAD；ms-agent = manifest pinned_sha。 */
async function resolveLocalSha(
  deps: AscendSourceCheckDeps,
  source: AscendSourceName,
  timeoutMs: number,
): Promise<{ localSha: string } | { error: string }> {
  const runGit = deps.runGit ?? defaultRunGit
  if (source === 'ms-agent-skills') {
    const entry = manifestSource(deps, source)
    const pinned = entry?.pinned_sha
    if (!pinned) {
      return { error: 'manifest has no ms-agent pinned_sha (pin snapshot anchor missing)' }
    }
    return { localSha: pinned }
  }
  const clone = resolveCloneDir(deps)
  if (!clone) {
    return {
      error:
        'agent-skills marketplace is not installed (no local clone) — install via the plugin marketplace first',
    }
  }
  const r = await runGit(['rev-parse', 'HEAD'], { cwd: clone, timeoutMs }).catch(
    (e: unknown) => ({ code: 1, stdout: '', stderr: e instanceof Error ? e.message : String(e) }),
  )
  const sha = r.stdout.trim()
  if (r.code !== 0 || !/^[0-9a-f]{40}$/.test(sha)) {
    return { error: `cannot read local clone HEAD (${trimErr(r.stderr)})` }
  }
  return { localSha: sha }
}

async function lsRemoteHead(
  deps: AscendSourceCheckDeps,
  source: AscendSourceName,
  timeoutMs: number,
): Promise<{ upstreamSha: string } | { error: string }> {
  const entry = manifestSource(deps, source)
  const url = entry?.url
  if (!url) {
    return { error: `manifest has no url for ${source}` }
  }
  const runGit = deps.runGit ?? defaultRunGit
  const r = await runGit(['ls-remote', url, 'HEAD'], { timeoutMs }).catch((e: unknown) => ({
    code: 1,
    stdout: '',
    stderr: e instanceof Error ? e.message : String(e),
  }))
  const m = /^\s*([0-9a-f]{40})\t/.exec(r.stdout)
  if (r.code !== 0 || !m) {
    return { error: `git ls-remote failed for ${url} (${r.code !== 0 ? trimErr(r.stderr) : 'no HEAD sha'})` }
  }
  return { upstreamSha: m[1]! }
}

/**
 * action "check"：本地锚 vs 官方远端 HEAD。killed 支在一切网络动作之前。
 */
export async function checkSourceFreshness(
  deps: AscendSourceCheckDeps,
  source: AscendSourceName,
  timeoutMs: number = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
): Promise<AscendSourceCheckResult> {
  // ③c kill-switch：killed 支零网络（不发任何 git 调用）。
  if (isAscendMarketplaceAutoInstallDisabled()) {
    return {
      verdict: 'killed',
      localSha: '',
      error: 'source freshness check/update disabled (ATLAS_DISABLE_ASCEND_MARKETPLACE_AUTOINSTALL)',
    }
  }
  const local = await resolveLocalSha(deps, source, timeoutMs)
  if ('error' in local) {
    return { verdict: 'unreachable', localSha: '', error: local.error }
  }
  // ③b fresh 缓存：同 localSha 直接 fresh（不重发 ls-remote）。
  const cached = freshCache.get(source)
  if (cached && cached.localSha === local.localSha) {
    return { verdict: 'fresh', localSha: local.localSha, upstreamSha: cached.upstreamSha }
  }
  const remote = await lsRemoteHead(deps, source, timeoutMs)
  if ('error' in remote) {
    return { verdict: 'unreachable', localSha: local.localSha, error: remote.error }
  }
  if (remote.upstreamSha === local.localSha) {
    freshCache.set(source, { localSha: local.localSha, upstreamSha: remote.upstreamSha })
    return { verdict: 'fresh', localSha: local.localSha, upstreamSha: remote.upstreamSha }
  }
  // drift 不缓存（每次重查）。
  return { verdict: 'drift', localSha: local.localSha, upstreamSha: remote.upstreamSha }
}

function rollbackCommand(clone: string, sha: string): string {
  return `git -C ${clone} reset --hard ${sha}`
}

async function rollbackTo(
  deps: AscendSourceCheckDeps,
  clone: string,
  sha: string,
  timeoutMs: number,
): Promise<void> {
  const runGit = deps.runGit ?? defaultRunGit
  await runGit(['reset', '--hard', sha], { cwd: clone, timeoutMs }).catch(() => undefined)
  // submodule 工作树随父仓回退复位（best-effort；fixture 无 submodule 时代码 1）。
  await runGit(['submodule', 'update', '--init', '--recursive'], { cwd: clone, timeoutMs }).catch(
    () => undefined,
  )
}

/** 更新后 integrity 验真（工单 §131：禁 ls-tree/hash 自比对冒充——锚 = 官方源 FF 树 + 内容/gitlink 完整性）。 */
async function verifyPostUpdateIntegrity(
  deps: AscendSourceCheckDeps,
  clone: string,
  newSha: string,
  timeoutMs: number,
): Promise<string | null> {
  const runGit = deps.runGit ?? defaultRunGit
  const fileExists = deps.fileExists ?? existsSync

  // 内容完整性锚：marketplace manifest 在场（负 fixture② 的检测面）。
  if (!fileExists(join(clone, MARKETPLACE_MANIFEST_REL))) {
    return `marketplace manifest missing after update (${MARKETPLACE_MANIFEST_REL})`
  }

  // submodule 完整性：gitlink（父仓记录）vs live submodule HEAD（officialVerify 同语义）。
  const cfg = await runGit(
    ['config', '--file', '.gitmodules', '--null', '--get-regexp', 'submodule\\..*\\.path'],
    { cwd: clone, timeoutMs },
  ).catch(() => ({ code: 1, stdout: '', stderr: '' }))
  if (cfg.code !== 0) return null // 无 .gitmodules = 无 submodule 面，跳过
  const paths = new Set<string>()
  for (const chunk of cfg.stdout.split('\0')) {
    const nl = chunk.indexOf('\n')
    if (nl < 0) continue
    const key = chunk.slice(0, nl)
    const value = chunk.slice(nl + 1)
    if (key.endsWith('.path') && value) paths.add(value)
  }
  const getSubHead = deps.getSubmoduleHead ?? (async (dir: string) => getHeadForDir(dir).catch(() => null))
  for (const p of paths) {
    const tree = await runGit(['ls-tree', newSha, '--', p], { cwd: clone, timeoutMs }).catch(() => ({
      code: 1,
      stdout: '',
      stderr: '',
    }))
    const gitlink = /160000\s+\S+\s+([0-9a-f]{40})\t/.exec(tree.stdout)?.[1] ?? null
    const live = gitlink ? await getSubHead(join(clone, p)).catch(() => null) : null
    if (!gitlink || !live || gitlink !== live) {
      return `submodule ${p} integrity mismatch (gitlink ${gitlink?.slice(0, 8) ?? 'n/a'} vs live ${live?.slice(0, 8) ?? 'n/a'})`
    }
  }
  return null
}

/**
 * action "update"：仅 agent-skills（FF-only + submodule 刷新 + integrity 验真 +
 * 失败自动回退）。ms-agent-skills = 拒绝 fail-visible。
 */
export async function updateSourceClone(
  deps: AscendSourceCheckDeps,
  source: AscendSourceName,
  timeoutMs: number = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
): Promise<AscendSourceCheckResult> {
  if (isAscendMarketplaceAutoInstallDisabled()) {
    return {
      verdict: 'killed',
      localSha: '',
      error: 'source freshness check/update disabled (ATLAS_DISABLE_ASCEND_MARKETPLACE_AUTOINSTALL)',
    }
  }
  if (source === 'ms-agent-skills') {
    const chk = await checkSourceFreshness(deps, source, timeoutMs)
    const refusal =
      'ms-agent-skills is a pinned snapshot with no local clone — update refused; re-pinning belongs to the existing manifest sync/verify flow (pinned_sha is never rewritten by this tool)'
    return {
      ...chk,
      error: chk.verdict === 'fresh' ? `nothing to update — ${refusal}` : refusal,
    }
  }

  const runGit = deps.runGit ?? defaultRunGit
  const clone = resolveCloneDir(deps)
  if (!clone) {
    return {
      verdict: 'unreachable',
      localSha: '',
      error: 'agent-skills marketplace is not installed (no local clone) — install via the plugin marketplace first',
    }
  }
  const local = await resolveLocalSha(deps, source, timeoutMs)
  if ('error' in local) {
    return { verdict: 'unreachable', localSha: '', error: local.error }
  }
  const preSha = local.localSha
  const remote = await lsRemoteHead(deps, source, timeoutMs)
  if ('error' in remote) {
    return { verdict: 'unreachable', localSha: preSha, error: remote.error }
  }
  const upstreamSha = remote.upstreamSha
  if (upstreamSha === preSha) {
    freshCache.set(source, { localSha: preSha, upstreamSha })
    return { verdict: 'fresh', localSha: preSha, upstreamSha }
  }

  const fetch = await runGit(['fetch', 'origin'], { cwd: clone, timeoutMs }).catch((e: unknown) => ({
    code: 1,
    stdout: '',
    stderr: e instanceof Error ? e.message : String(e),
  }))
  if (fetch.code !== 0) {
    return {
      verdict: 'unreachable',
      localSha: preSha,
      upstreamSha,
      error: `git fetch failed (${trimErr(fetch.stderr)}) — local clone untouched`,
    }
  }

  // 非 FF（上游历史改写）= 拒绝，本地树未推进（负 fixture① 检测面）。
  const ancestor = await runGit(['merge-base', '--is-ancestor', preSha, upstreamSha], {
    cwd: clone,
    timeoutMs,
  }).catch(() => ({ code: 1, stdout: '', stderr: '' }))
  if (ancestor.code !== 0) {
    return {
      verdict: 'drift',
      localSha: preSha,
      upstreamSha,
      error:
        'update refused: upstream history rewritten (non-fast-forward) — local clone untouched; re-pin/re-sync flow required',
    }
  }

  const merge = await runGit(['merge', '--ff-only', upstreamSha], { cwd: clone, timeoutMs }).catch(
    (e: unknown) => ({ code: 1, stdout: '', stderr: e instanceof Error ? e.message : String(e) }),
  )
  if (merge.code !== 0) {
    await rollbackTo(deps, clone, preSha, timeoutMs)
    return {
      verdict: 'drift',
      localSha: preSha,
      upstreamSha,
      rollback: rollbackCommand(clone, preSha),
      error: `ff-only merge failed (${trimErr(merge.stderr)}) — rolled back to pre-update state`,
    }
  }

  const sub = await runGit(['submodule', 'update', '--init', '--recursive'], {
    cwd: clone,
    timeoutMs,
  }).catch((e: unknown) => ({ code: 1, stdout: '', stderr: e instanceof Error ? e.message : String(e) }))
  if (sub.code !== 0) {
    await rollbackTo(deps, clone, preSha, timeoutMs)
    return {
      verdict: 'drift',
      localSha: preSha,
      upstreamSha,
      rollback: rollbackCommand(clone, preSha),
      error: `submodule update failed (${trimErr(sub.stderr)}) — rolled back to pre-update state`,
    }
  }

  // 更新后 HEAD 复核 + integrity 验真（败 = 拒绝 + 回退，不静默损坏树）。
  const post = await runGit(['rev-parse', 'HEAD'], { cwd: clone, timeoutMs }).catch(() => ({
    code: 1,
    stdout: '',
    stderr: '',
  }))
  const postSha = post.stdout.trim()
  const integrityDetail =
    !/^[0-9a-f]{40}$/.test(postSha) || postSha !== upstreamSha
      ? 'post-update HEAD does not match upstream sha'
      : await verifyPostUpdateIntegrity(deps, clone, postSha, timeoutMs)
  if (integrityDetail) {
    await rollbackTo(deps, clone, preSha, timeoutMs)
    return {
      verdict: 'drift',
      localSha: preSha,
      upstreamSha,
      rollback: rollbackCommand(clone, preSha),
      error: `update refused: post-update integrity verification failed (${integrityDetail}) — rolled back to pre-update state`,
    }
  }

  // 成功：登记新 resolvedSha（结果字段 + 漂移日志；manifest pinned_sha 逐字不动）
  // + 更新 fresh 缓存（后续 check 零网络）。
  freshCache.set(source, { localSha: postSha, upstreamSha })
  const registration = `[AscendSkillSourceCheck] drift resolved by update: agent-skills ${preSha.slice(0, 8)} -> ${postSha.slice(0, 8)} (beyond manifest pin — re-pin via sync/verify flow; rollback: ${rollbackCommand(clone, preSha)})`
  ;(deps.log ?? defaultLog)(registration)
  return {
    verdict: 'drift',
    localSha: preSha,
    upstreamSha,
    updatedTo: postSha,
    rollback: rollbackCommand(clone, preSha),
  }
}

// ---------------------------------------------------------------------------
// Tool 包装（TUI face；shouldDefer = 非 always-on 授予路径）
// ---------------------------------------------------------------------------

const TOOL_NAME = 'AscendSkillSourceCheck'
const TOOL_DESCRIPTION =
  'Check the freshness of pinned Ascend skill sources against their official remote, or fast-forward-update the local marketplace clone with integrity verification (umbrella Step 0). Never rewrites the manifest pinned_sha trust anchor.'

const TOOL_PROMPT = `Check or update the freshness of the pinned Ascend skill sources used by the Ascend umbrella skills' Step 0.

- action "check": compares the local source anchor (agent-skills = the installed marketplace clone HEAD; ms-agent-skills = the manifest pinned_sha snapshot) against the official remote HEAD (git ls-remote, bounded by timeoutMs, default 30s). Verdicts: fresh | drift | unreachable | killed. A fresh verdict is cached for the session — the same local state is not re-queried.
- action "update" (agent-skills only): fast-forward-only update of the local marketplace clone to the official remote HEAD, then a submodule refresh and post-update integrity verification (submodule gitlinks vs live HEADs + marketplace manifest presence). Refuses rewritten upstream history (non-fast-forward) and fails integrity with an automatic rollback to the pre-update commit (the rollback command is returned). Never rewrites the manifest pinned_sha trust anchor — re-pinning belongs to the maintainers' sync/verify flow. ms-agent-skills is a pinned snapshot with no local clone: update is refused (fail-visible).

Returns { verdict, localSha, upstreamSha?, updatedTo?, rollback?, error? }. On unreachable/killed/refused, report and defer — never silently answer from a stale snapshot.`

const inputSchema = lazySchema(() =>
  z.strictObject({
    source: z.enum(['agent-skills', 'ms-agent-skills']),
    action: z.enum(['check', 'update']),
    timeoutMs: z.number().int().positive().max(120_000).optional(),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    verdict: z.enum(['fresh', 'drift', 'unreachable', 'killed']),
    localSha: z.string(),
    upstreamSha: z.string().optional(),
    updatedTo: z.string().optional(),
    rollback: z.string().optional(),
    error: z.string().optional(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export function createAscendSkillSourceCheckTool(deps: AscendSourceCheckDeps = {}) {
  return buildTool({
    name: TOOL_NAME,
    searchHint: 'check or update Ascend skill source freshness',
    maxResultSizeChars: 20_000,
    shouldDefer: true,
    get inputSchema(): InputSchema {
      return inputSchema()
    },
    get outputSchema(): OutputSchema {
      return outputSchema()
    },
    isConcurrencySafe(input?: unknown) {
      return (input as { action?: string } | undefined)?.action === 'check'
    },
    isReadOnly(input?: unknown) {
      return (input as { action?: string } | undefined)?.action === 'check'
    },
    async description() {
      return TOOL_DESCRIPTION
    },
    async prompt() {
      return TOOL_PROMPT
    },
    // 内联渲染（本工具无 UI.tsx；ToolSearchTool 同例 —— deferred 工具的 transcript
    // 头行用纯文本，结果体走 mapToolResultToToolResultBlockParam 文本）。
    renderToolUseMessage(input) {
      const parts = [input.action, input.source].filter(Boolean)
      return parts.length > 0 ? parts.join(' ') : null
    },
    async call(input) {
      const timeoutMs = input.timeoutMs ?? deps.timeoutMs ?? DEFAULT_TIMEOUT_MS
      const result =
        input.action === 'update'
          ? await updateSourceClone(deps, input.source, timeoutMs)
          : await checkSourceFreshness(deps, input.source, timeoutMs)
      return { data: result }
    },
    mapToolResultToToolResultBlockParam(output, toolUseID) {
      const lines = [
        `verdict: ${output.verdict}`,
        `local: ${output.localSha ? output.localSha.slice(0, 12) : '(none)'}`,
      ]
      if (output.upstreamSha) lines.push(`upstream: ${output.upstreamSha.slice(0, 12)}`)
      if (output.updatedTo) lines.push(`updatedTo: ${output.updatedTo.slice(0, 12)}`)
      if (output.rollback) lines.push(`rollback: ${output.rollback}`)
      if (output.error) lines.push(`error: ${output.error}`)
      return {
        tool_use_id: toolUseID,
        type: 'tool_result' as const,
        content: lines.join('\n'),
      }
    },
  } satisfies ToolDef<InputSchema, z.infer<OutputSchema>>)
}

/** 默认实例（tools.ts 注册面）。 */
export const AscendSkillSourceCheckTool = createAscendSkillSourceCheckTool()
