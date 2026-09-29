/**
 * officialVerify — post-install verification for the auto-installed Ascend
 * official marketplace (registry key `agent-skills` → gitcode.com/Ascend/agent-skills).
 *
 * This is "World B": it verifies the installed PLUGIN, not our self-authored
 * reference stamps (that's World A — verify-ascend-knowledge). It runs four
 * checks against two anchors:
 *
 *   anchor: resolvedSha  (base-layer, recorded in known_marketplaces.json at
 *                         install/refresh time — "what is materialized")
 *   anchor: pinned_sha   (overlay, in ascend-official.manifest.yaml — "the
 *                         official version we trust")
 *
 *   1. integrity (red):  live local HEAD == resolvedSha? A mismatch means the
 *      local checkout drifted out-of-band (manual checkout/pull) or was tampered
 *      with — the strongest signal.
 *   2. pin        (red): resolvedSha == pinned_sha? The installed content is the
 *      trusted official version (not ahead/behind the pin).
 *   3. drift      (warn): pinned_sha vs upstream_head (from .freshness-cache.json)?
 *      The official source advanced past the pin — a non-blocking advisory to
 *      re-pin (freshness signal, same contract as `mocked: true` / World A drift).
 *   4. submodule  (red): for each `.gitmodules` submodule, is the live submodule
 *      HEAD at the commit the parent repo's gitlink records? A mismatch means the
 *      submodule was checked out at a different commit (tamper, or `git submodule
 *      update` not run after a pull) — the signal the top-level anchor can't see,
 *      and the one that matters most for the CANN-OSL CANNBot submodule.
 *
 * Graceful by design: a machine that never installed the marketplace reports
 * `installed:false, ok:true` (skip, not fail); a missing anchor degrades to a
 * skip/warn, never a throw. exitCode is 1 only on a hard `fail` (integrity or
 * pin mismatch); drift is a warning and keeps exitCode 0.
 */

import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { execFileNoThrowWithCwd } from '../../../utils/execFileNoThrow.js'
import { gitExe } from '../../../utils/git.js'
import { getHeadForDir } from '../../../utils/git/gitFilesystem.js'
import { getPluginsDirectory } from '../../../utils/plugins/pluginDirectories.js'
import { parseYaml } from '../../../utils/yaml.js'
import {
  AGENT_SKILLS_MARKETPLACE_NAME,
  ASCEND_OFFICIAL_DISPLAY_LABEL,
} from './ascendMarketplace.js'

/** The manifest repo key for the auto-installed marketplace (World B anchor). */
const OFFICIAL_REPO = 'agent-skills'
const MANIFEST_REL = 'src/plugins/ascend/knowledge/ascend-official.manifest.yaml'
const FRESHNESS_CACHE_REL = '.freshness-cache.json'
const MAX_WALK_UP = 15

export type OfficialCheckStatus = 'pass' | 'warn' | 'fail' | 'skip'

export interface OfficialVerifyCheck {
  name: 'integrity' | 'pin' | 'drift' | 'submodule'
  status: OfficialCheckStatus
  detail: string
}

/** Per-submodule detail for the `submodule` integrity check. */
export interface OfficialSubmoduleCheck {
  /** Submodule path as declared in `.gitmodules` (e.g. `official/CANNBot`). */
  path: string
  /** Commit the parent repo's gitlink records for this path, or null when unreadable. */
  expectedSha: string | null
  /** Live submodule HEAD (getHead of installLocation/path), or null when unreadable. */
  actualSha: string | null
  status: OfficialCheckStatus
}

export interface OfficialVerifyReport {
  /** Was the Ascend official marketplace installed (present in known_marketplaces.json)? */
  installed: boolean
  /** True when no check is a hard `fail` (drift warnings don't fail). */
  ok: boolean
  /** 1 on any hard failure (integrity or pin mismatch), else 0 (incl. drift-only). */
  exitCode: 0 | 1
  marketplaceName: string
  /** Local cache dir of the installed marketplace (when installed). */
  installLocation?: string
  /** Install/refresh-time HEAD recorded by the base layer (known_marketplaces.json). */
  resolvedSha?: string
  /** Current local HEAD (getHeadForDir of installLocation), or null when not a git dir. */
  liveHead?: string | null
  /** Trusted official version (manifest agent-skills.pinned_sha). */
  pinnedSha?: string
  /** Upstream HEAD (from .freshness-cache.json agent-skills.upstream_head). */
  upstreamHead?: string | null
  /** Per-submodule gitlink-vs-live detail (populated only when installed + has submodules). */
  submodules?: OfficialSubmoduleCheck[]
  checks: OfficialVerifyCheck[]
  /** One-line human summary (for `cli --check`). */
  summary: string
}

export interface OfficialVerifyOptions {
  /** Injectable HEAD reader (default: getHeadForDir) — lets unit tests fake the live HEAD. */
  getHead?: (dir: string) => Promise<string | null>
  /** Override known_marketplaces.json path (default: getPluginsDirectory()/known_marketplaces.json). */
  knownMarketplacesPath?: string
  /** Override manifest path (default: repo-root manifest, walked up from this module). */
  manifestPath?: string
  /** Override .freshness-cache.json path (default: repo-root cache, walked up). */
  freshnessCachePath?: string
  /** Enumerate submodule paths from a clone's `.gitmodules` (default: `git config --file .gitmodules`). */
  listSubmodulePaths?: (dir: string) => Promise<string[]>
  /** Read the parent repo's gitlink (expected commit) for a submodule path (default: `git ls-tree`). */
  getSubmoduleGitlink?: (
    dir: string,
    commitSha: string,
    subpath: string,
  ) => Promise<string | null>
}

/** Walk up to the nearest package.json (repo root) — same pattern as AscendFreshnessPort. */
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

/** Full or short-SHA prefix match (pinned may be short, live/upstream full). */
function shaMatch(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false
  return a === b || a.startsWith(b) || b.startsWith(a)
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return null
  }
}

/**
 * Enumerate submodule paths from a clone's `.gitmodules`, using git's own INI
 * parser (robust to quoting/whitespace). No `.gitmodules` or no submodules → [].
 * Overlay-local (reuses the base `gitExe`/`execFileNoThrowWithCwd` primitives, adds
 * no new base code).
 */
async function defaultListSubmodulePaths(dir: string): Promise<string[]> {
  if (!dir) return []
  const { stdout, code } = await execFileNoThrowWithCwd(
    gitExe(),
    ['config', '--file', '.gitmodules', '--null', '--get-regexp', 'submodule\\..*\\.path'],
    { cwd: dir, stdin: 'ignore' },
  )
  if (code !== 0) return []
  // --null separates each "key\nvalue" pair with NUL (newline is INSIDE the pair,
  // NUL is BETWEEN pairs). So split on NUL, then split each chunk on the first \n.
  const paths = new Set<string>()
  for (const chunk of stdout.split('\0')) {
    const nl = chunk.indexOf('\n')
    if (nl < 0) continue
    const key = chunk.slice(0, nl)
    const value = chunk.slice(nl + 1)
    if (key.endsWith('.path') && value) paths.add(value)
  }
  return [...paths]
}

/**
 * Read the gitlink the parent repo records for a submodule path at a given commit:
 * `git ls-tree <commit> -- <path>` yields `<mode> <sha>\t<path>` where a submodule
 * has mode 160000. Returns null when the path is not a gitlink / is absent / unreadable.
 */
async function defaultGetSubmoduleGitlink(
  dir: string,
  commitSha: string,
  subpath: string,
): Promise<string | null> {
  if (!dir || !commitSha) return null
  const { stdout, code } = await execFileNoThrowWithCwd(
    gitExe(),
    ['ls-tree', commitSha, '--', subpath],
    { cwd: dir, stdin: 'ignore' },
  )
  if (code !== 0) return null
  // ls-tree line format: "<mode> <type> <sha>\t<path>" (a gitlink is mode 160000,
  // type "commit"). Match the 40-hex sha as the third field.
  for (const line of stdout.split('\n')) {
    const m = /^\s*160000\s+\S+\s+([0-9a-f]{40})\t/.exec(line)
    if (m) return m[1]
  }
  return null
}

type KnownMarketplacesFile = Record<string, { installLocation?: string; resolvedSha?: string }>

export async function verifyOfficialSkills(
  opts: OfficialVerifyOptions = {},
): Promise<OfficialVerifyReport> {
  const getHead = opts.getHead ?? getHeadForDir
  const listSubmodulePaths = opts.listSubmodulePaths ?? defaultListSubmodulePaths
  const getSubmoduleGitlink = opts.getSubmoduleGitlink ?? defaultGetSubmoduleGitlink

  const repoRoot = findRepoRoot(dirname(new URL(import.meta.url).pathname))
  const manifestPath = opts.manifestPath ?? (repoRoot ? join(repoRoot, MANIFEST_REL) : '')
  const freshnessCachePath =
    opts.freshnessCachePath ?? (repoRoot ? join(repoRoot, FRESHNESS_CACHE_REL) : '')
  const knownMarketplacesPath =
    opts.knownMarketplacesPath ?? join(getPluginsDirectory(), 'known_marketplaces.json')

  // --- load the installed entry (World B anchor: resolvedSha) ---
  const known = readJson<KnownMarketplacesFile>(knownMarketplacesPath)
  const entry = known?.[AGENT_SKILLS_MARKETPLACE_NAME]
  if (!entry) {
    return {
      installed: false,
      ok: true,
      exitCode: 0,
      marketplaceName: AGENT_SKILLS_MARKETPLACE_NAME,
      checks: [
        { name: 'integrity', status: 'skip', detail: 'not installed' },
        { name: 'pin', status: 'skip', detail: 'not installed' },
        { name: 'drift', status: 'skip', detail: 'not installed' },
        { name: 'submodule', status: 'skip', detail: 'not installed' },
      ],
      summary: `${ASCEND_OFFICIAL_DISPLAY_LABEL} marketplace not installed (nothing to verify)`,
    }
  }

  const resolvedSha = entry.resolvedSha
  const installLocation = entry.installLocation
  const liveHead = installLocation
    ? await getHead(installLocation).catch(() => null)
    : null

  // --- load the overlay anchor (pinned_sha) + drift signal (upstream_head) ---
  let pinnedSha: string | undefined
  if (manifestPath && existsSync(manifestPath)) {
    try {
      const manifest = parseYaml(readFileSync(manifestPath, 'utf8')) as {
        sources?: { repo: string; pinned_sha?: string }[]
      }
      pinnedSha = manifest.sources?.find((s) => s.repo === OFFICIAL_REPO)?.pinned_sha
    } catch {
      pinnedSha = undefined // corrupt/unparseable manifest → pin check degrades to skip
    }
  }
  const cache = readJson<{ repos?: Record<string, { upstream_head?: string | null }> }>(
    freshnessCachePath,
  )
  const upstreamHead = cache?.repos?.[OFFICIAL_REPO]?.upstream_head ?? null

  // --- run the three checks ---
  const checks: OfficialVerifyCheck[] = []

  // 1. integrity — live local HEAD vs recorded install-time HEAD.
  if (!resolvedSha) {
    checks.push({
      name: 'integrity',
      status: 'warn',
      detail: 'no install-time resolvedSha recorded — re-add the marketplace to capture an anchor',
    })
  } else if (liveHead === null) {
    checks.push({
      name: 'integrity',
      status: 'warn',
      detail: `local cache has no readable HEAD (resolvedSha ${resolvedSha.slice(0, 8)})`,
    })
  } else if (shaMatch(liveHead, resolvedSha)) {
    checks.push({
      name: 'integrity',
      status: 'pass',
      detail: `local HEAD ${liveHead.slice(0, 8)} == install-time ${resolvedSha.slice(0, 8)}`,
    })
  } else {
    checks.push({
      name: 'integrity',
      status: 'fail',
      detail: `local HEAD ${liveHead.slice(0, 8)} != install-time ${resolvedSha.slice(0, 8)} — out-of-band drift or tamper`,
    })
  }

  // 2. pin — installed (recorded) HEAD vs the trusted official version.
  if (!resolvedSha || !pinnedSha) {
    checks.push({
      name: 'pin',
      status: 'skip',
      detail: !resolvedSha
        ? 'no install-time resolvedSha to compare'
        : 'manifest has no agent-skills pinned_sha',
    })
  } else if (shaMatch(resolvedSha, pinnedSha)) {
    checks.push({
      name: 'pin',
      status: 'pass',
      detail: `installed ${resolvedSha.slice(0, 8)} == pinned ${pinnedSha.slice(0, 8)}`,
    })
  } else {
    checks.push({
      name: 'pin',
      status: 'fail',
      detail: `installed ${resolvedSha.slice(0, 8)} != pinned ${pinnedSha.slice(0, 8)} — re-pin the manifest or revert the install`,
    })
  }

  // 3. drift — trusted pin vs upstream HEAD (non-blocking advisory).
  if (!pinnedSha || !upstreamHead) {
    checks.push({
      name: 'drift',
      status: 'skip',
      detail: !pinnedSha
        ? 'no pinned_sha to compare'
        : 'upstream_head not yet synced (run `bun run sync:ascend`)',
    })
  } else if (shaMatch(pinnedSha, upstreamHead)) {
    checks.push({
      name: 'drift',
      status: 'pass',
      detail: `pinned ${pinnedSha.slice(0, 8)} is current (upstream ${upstreamHead.slice(0, 8)})`,
    })
  } else {
    checks.push({
      name: 'drift',
      status: 'warn',
      detail: `DRIFTED: pinned ${pinnedSha.slice(0, 8)} vs upstream ${upstreamHead.slice(0, 8)} — re-pin + re-verify (non-blocking)`,
    })
  }

  // 4. submodule — for each `.gitmodules` submodule, is the live submodule HEAD at
  //    the commit the parent repo's gitlink records? A mismatch means the submodule
  //    drifted / was tampered with (or `git submodule update` wasn't run) — the
  //    blind spot of the top-level anchor, and the CANN-OSL CANNBot case.
  const submodules: OfficialSubmoduleCheck[] = []
  const submodulePaths = installLocation ? await listSubmodulePaths(installLocation) : []
  for (const p of submodulePaths) {
    // Expected: gitlink the parent records at the live HEAD. If the top-level HEAD is
    // unreadable we cannot derive it — degrade to warn, don't stack on the top-level
    // integrity fail (that one already reports the unreadable HEAD).
    const expected = liveHead
      ? await getSubmoduleGitlink(installLocation, liveHead, p)
      : null
    const actual = await getHead(join(installLocation, p)).catch(() => null)
    let status: OfficialCheckStatus
    if (expected === null || actual === null) {
      status = 'warn' // one side unreadable (e.g. not initialized in a non-recurse install)
    } else if (shaMatch(expected, actual)) {
      status = 'pass'
    } else {
      status = 'fail' // gitlink != live submodule HEAD → tamper / un-synced
    }
    submodules.push({ path: p, expectedSha: expected, actualSha: actual, status })
  }

  if (submodulePaths.length === 0) {
    checks.push({
      name: 'submodule',
      status: 'skip',
      detail: 'no submodules in marketplace',
    })
  } else {
    const failed = submodules.filter((s) => s.status === 'fail')
    const warned = submodules.filter((s) => s.status === 'warn')
    if (failed.length > 0) {
      checks.push({
        name: 'submodule',
        status: 'fail',
        detail: failed
          .map(
            (s) =>
              `${s.path}: gitlink ${s.expectedSha!.slice(0, 8)} != live ${s.actualSha!.slice(0, 8)} — tamper or un-synced`,
          )
          .join('; '),
      })
    } else if (warned.length > 0) {
      checks.push({
        name: 'submodule',
        status: 'warn',
        detail: warned
          .map((s) => `${s.path}: unreadable (${s.expectedSha ? 'live HEAD' : 'gitlink'})`)
          .join('; '),
      })
    } else {
      checks.push({
        name: 'submodule',
        status: 'pass',
        detail:
          submodules.length === 1
            ? `${submodules[0].path} at gitlink ${submodules[0].expectedSha!.slice(0, 8)}`
            : `${submodules.length} submodules at their gitlinks`,
      })
    }
  }

  const anyFail = checks.some((c) => c.status === 'fail')
  const anyWarn = checks.some((c) => c.status === 'warn')
  const report: OfficialVerifyReport = {
    installed: true,
    ok: !anyFail,
    exitCode: anyFail ? 1 : 0,
    marketplaceName: AGENT_SKILLS_MARKETPLACE_NAME,
    installLocation,
    resolvedSha,
    liveHead,
    pinnedSha,
    upstreamHead,
    submodules,
    checks,
    summary: anyFail
      ? `${ASCEND_OFFICIAL_DISPLAY_LABEL} FAILED verification (see failing checks)`
      : anyWarn
        ? `${ASCEND_OFFICIAL_DISPLAY_LABEL} installed — warnings present (non-blocking)`
        : `${ASCEND_OFFICIAL_DISPLAY_LABEL} verified (pin current, integrity ok)`,
  }
  return report
}
