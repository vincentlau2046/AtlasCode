/**
 * 0.1.61 AD-07 插件 tag 工具判别单测（波池首车，CC 2.1.118）。
 *
 * 判别面（mutation-red）：
 *   - createPluginReleaseTag：正常 manifest + 目标版本一致 → git tag 创建
 *     成功（tag 在场断言）；版本不符 → version-mismatch 报错拒绝（错误面
 *     断言 + 未创建 tag）；无 manifest / 非 git repo / tag 已存在 /
 *     插件未装 → 各自错误码面；
 *   - readPluginManifestVersion：.atlas-plugin 主 / .claude-plugin 旧
 *     fallback / 无 manifest / 坏 JSON 四态；
 *   - resolveTargetTag 纯函数矩阵（缺省 v<version> / 显式匹配 / 不符拒绝）；
 *   - parseArgs：11 既有子命令解析恒等守卫（零变更）+ 新 tag 解析
 *     （--tag/-t flag 剥离）。
 * 分层纪律：真 fs + 真 git 但全程沙箱化 —— ATLAS_PLUGIN_CACHE_DIR 指
 * os.tmpdir() 临时目录（getPluginsDirectory 非 memoize，env 每次调用
 * 生效），零网络、不触碰真实 ~/.atlas；env 操纵 try/finally 还原。
 * 修前红 = pluginTag.js 模块 ∅（顶层动态导入失败全族红）。
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parsePluginArgs } from '../../src/tui/commands/plugin/parseArgs.js'
import { clearInstalledPluginsCache } from '../../src/tui/utils/plugins/installedPluginsManager.js'

const pluginTag = await import('../../src/tui/utils/plugins/pluginTag.js')

const ENV_KEY = 'ATLAS_PLUGIN_CACHE_DIR'
let sandbox: string
let prevEnv: string | undefined

function git(args: string[], cwd: string, extraEnv?: NodeJS.ProcessEnv): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
  })
}

const IDENTITY = {
  GIT_AUTHOR_NAME: 'atlas-test',
  GIT_AUTHOR_EMAIL: 'atlas@test.local',
  GIT_COMMITTER_NAME: 'atlas-test',
  GIT_COMMITTER_EMAIL: 'atlas@test.local',
}

/** Plain dir (no git) or real git repo with a committed manifest. */
function makePluginDir(
  dir: string,
  version: string | null,
  asGitRepo: boolean,
): void {
  mkdirSync(dir, { recursive: true })
  if (asGitRepo) {
    git(['init', '-q'], dir)
  }
  if (version !== null) {
    mkdirSync(join(dir, '.atlas-plugin'), { recursive: true })
    writeFileSync(
      join(dir, '.atlas-plugin', 'plugin.json'),
      JSON.stringify({ name: 'tagfix', version }),
    )
  }
  if (asGitRepo) {
    git(['add', '-A'], dir)
    // --allow-empty: the no-manifest fixture has nothing to commit, but the
    // repo still needs an initial commit (git tag requires a HEAD object).
    git(['commit', '-q', '--allow-empty', '-m', 'init'], dir, IDENTITY)
  }
}

async function writeRegistry(
  entries: Record<string, { scope: string; installPath: string }[]>,
): Promise<void> {
  writeFileSync(
    join(sandbox, 'installed_plugins.json'),
    JSON.stringify({ version: 2, plugins: entries }),
  )
  // The loader caches at module level — force a re-read of the new file.
  clearInstalledPluginsCache()
}

function listTags(dir: string): string[] {
  return git(['tag', '--list'], dir)
    .split('\n')
    .filter(Boolean)
}

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'atlas-plugin-tag-'))
  prevEnv = process.env[ENV_KEY]
  process.env[ENV_KEY] = sandbox
  clearInstalledPluginsCache()
})

afterEach(async () => {
  if (prevEnv === undefined) delete process.env[ENV_KEY]
  else process.env[ENV_KEY] = prevEnv
  await rm(sandbox, { recursive: true, force: true })
})

describe('parseArgs：11 既有子命令解析恒等守卫（零变更）', () => {
  test('既有 11 子命令解析行为恒等', () => {
    expect(parsePluginArgs(undefined)).toEqual({ type: 'menu' })
    expect(parsePluginArgs('bogus')).toEqual({ type: 'menu' })
    expect(parsePluginArgs('help')).toEqual({ type: 'help' })
    expect(parsePluginArgs('--help')).toEqual({ type: 'help' })
    expect(parsePluginArgs('install myplugin')).toEqual({
      type: 'install',
      plugin: 'myplugin',
    })
    expect(parsePluginArgs('install myplugin@mymarket')).toEqual({
      type: 'install',
      plugin: 'myplugin',
      marketplace: 'mymarket',
    })
    expect(parsePluginArgs('manage')).toEqual({ type: 'manage' })
    expect(parsePluginArgs('skills')).toEqual({ type: 'skills' })
    expect(parsePluginArgs('uninstall p1')).toEqual({
      type: 'uninstall',
      plugin: 'p1',
    })
    expect(parsePluginArgs('enable p1')).toEqual({
      type: 'enable',
      plugin: 'p1',
    })
    expect(parsePluginArgs('disable p1')).toEqual({
      type: 'disable',
      plugin: 'p1',
    })
    expect(parsePluginArgs('validate /tmp/x')).toEqual({
      type: 'validate',
      path: '/tmp/x',
    })
    expect(parsePluginArgs('marketplace list')).toEqual({
      type: 'marketplace',
      action: 'list',
    })
    expect(parsePluginArgs('marketplace add https://x.git')).toEqual({
      type: 'marketplace',
      action: 'add',
      target: 'https://x.git',
    })
    expect(parsePluginArgs('marketplace adopt /tmp/m --name foo')).toEqual({
      type: 'marketplace',
      action: 'adopt',
      target: '/tmp/m',
      name: 'foo',
    })
  })
})

describe('parseArgs：tag 子命令解析（--tag/-t flag 剥离）', () => {
  test('tag <plugin> 无 flag', () => {
    expect(parsePluginArgs('tag myplugin')).toEqual({
      type: 'tag',
      plugin: 'myplugin',
    })
  })

  test('tag <plugin> --tag <tag>（--tag 与值剥离，plugin 保留）', () => {
    expect(parsePluginArgs('tag myplugin --tag v1.0.0')).toEqual({
      type: 'tag',
      plugin: 'myplugin',
      tag: 'v1.0.0',
    })
  })

  test('tag <plugin>@<market> -t <tag>（短 flag）', () => {
    expect(parsePluginArgs('tag myplugin@mymarket -t v2.0.0')).toEqual({
      type: 'tag',
      plugin: 'myplugin@mymarket',
      tag: 'v2.0.0',
    })
  })

  test('tag 无参 → plugin undefined（由视图面给 usage）', () => {
    expect(parsePluginArgs('tag')).toEqual({ type: 'tag', plugin: undefined })
  })
})

describe('createPluginReleaseTag：tag 创建成功面（tag 在场断言）', () => {
  test('缺省 tag = v<manifest version>，git tag 创建成功', async () => {
    const repo = join(sandbox, 'repo')
    makePluginDir(repo, '1.2.3', true)
    await writeRegistry({
      'tagfix@fixture': [{ scope: 'user', installPath: repo }],
    })
    const r = await pluginTag.createPluginReleaseTag('tagfix@fixture')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.pluginId).toBe('tagfix@fixture')
      expect(r.tag).toBe('v1.2.3')
      expect(r.version).toBe('1.2.3')
    }
    expect(listTags(repo)).toContain('v1.2.3')
  })

  test('显式 --tag 与 manifest 一致 → 按显式名创建', async () => {
    const repo = join(sandbox, 'repo')
    makePluginDir(repo, '2.0.0', true)
    await writeRegistry({
      'tagfix@fixture': [{ scope: 'user', installPath: repo }],
    })
    const r = await pluginTag.createPluginReleaseTag('tagfix@fixture', 'v2.0.0')
    expect(r.ok).toBe(true)
    expect(listTags(repo)).toContain('v2.0.0')
  })

  test('bare name 解析（tagfix → tagfix@fixture）', async () => {
    const repo = join(sandbox, 'repo')
    makePluginDir(repo, '1.0.0', true)
    await writeRegistry({
      'tagfix@fixture': [{ scope: 'user', installPath: repo }],
    })
    const r = await pluginTag.createPluginReleaseTag('tagfix')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.pluginId).toBe('tagfix@fixture')
    }
  })
})

describe('createPluginReleaseTag：错误面', () => {
  test('版本不符 → version-mismatch 拒绝 + 未创建 tag', async () => {
    const repo = join(sandbox, 'repo')
    makePluginDir(repo, '1.0.0', true)
    await writeRegistry({
      'tagfix@fixture': [{ scope: 'user', installPath: repo }],
    })
    const r = await pluginTag.createPluginReleaseTag('tagfix@fixture', 'v9.9.9')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('version-mismatch')
      expect(r.message).toContain('1.0.0')
    }
    expect(listTags(repo)).toEqual([])
  })

  test('无 manifest → no-manifest', async () => {
    const repo = join(sandbox, 'repo')
    makePluginDir(repo, null, true)
    await writeRegistry({
      'tagfix@fixture': [{ scope: 'user', installPath: repo }],
    })
    const r = await pluginTag.createPluginReleaseTag('tagfix@fixture')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('no-manifest')
    }
  })

  test('非 git repo → not-a-git-repo', async () => {
    const dir = join(sandbox, 'plain')
    makePluginDir(dir, '1.0.0', false)
    await writeRegistry({
      'tagfix@fixture': [{ scope: 'user', installPath: dir }],
    })
    const r = await pluginTag.createPluginReleaseTag('tagfix@fixture')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('not-a-git-repo')
    }
  })

  test('tag 已存在 → tag-exists（不覆盖）', async () => {
    const repo = join(sandbox, 'repo')
    makePluginDir(repo, '1.0.0', true)
    git(['tag', 'v1.0.0'], repo)
    await writeRegistry({
      'tagfix@fixture': [{ scope: 'user', installPath: repo }],
    })
    const r = await pluginTag.createPluginReleaseTag('tagfix@fixture')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('tag-exists')
    }
  })

  test('插件未安装 → no-plugin', async () => {
    await writeRegistry({})
    const r = await pluginTag.createPluginReleaseTag('ghost@nowhere')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('no-plugin')
    }
  })
})

describe('readPluginManifestVersion：四态', () => {
  test('.atlas-plugin 主目录', async () => {
    const dir = join(sandbox, 'a')
    makePluginDir(dir, '3.1.4', false)
    expect(await pluginTag.readPluginManifestVersion(dir)).toBe('3.1.4')
  })

  test('.claude-plugin legacy fallback', async () => {
    const dir = join(sandbox, 'b')
    mkdirSync(dir, { recursive: true })
    mkdirSync(join(dir, '.claude-plugin'), { recursive: true })
    writeFileSync(
      join(dir, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name: 'tagfix', version: '0.9.0' }),
    )
    expect(await pluginTag.readPluginManifestVersion(dir)).toBe('0.9.0')
  })

  test('无 manifest → undefined', async () => {
    const dir = join(sandbox, 'c')
    mkdirSync(dir, { recursive: true })
    expect(await pluginTag.readPluginManifestVersion(dir)).toBeUndefined()
  })

  test('坏 JSON → undefined', async () => {
    const dir = join(sandbox, 'd')
    mkdirSync(join(dir, '.atlas-plugin'), { recursive: true })
    writeFileSync(join(dir, '.atlas-plugin', 'plugin.json'), '{broken')
    expect(await pluginTag.readPluginManifestVersion(dir)).toBeUndefined()
  })
})

describe('resolveTargetTag：纯函数矩阵', () => {
  test('缺省 = v<manifest version>', () => {
    expect(pluginTag.resolveTargetTag('1.0.0')).toEqual({ tag: 'v1.0.0' })
  })

  test('显式 tag = 裸版本或 v 前缀 → 接受', () => {
    expect(pluginTag.resolveTargetTag('1.0.0', '1.0.0')).toEqual({
      tag: '1.0.0',
    })
    expect(pluginTag.resolveTargetTag('1.0.0', 'v1.0.0')).toEqual({
      tag: 'v1.0.0',
    })
  })

  test('显式 tag 版本不符 → mismatch（带期望版本）', () => {
    expect(pluginTag.resolveTargetTag('1.0.0', 'v2.0.0')).toEqual({
      mismatch: true,
      expected: '1.0.0',
      got: 'v2.0.0',
    })
  })
})

describe('模块导出面（修前红：pluginTag.js ∅）', () => {
  test('三个导出在场', () => {
    expect(typeof pluginTag.createPluginReleaseTag).toBe('function')
    expect(typeof pluginTag.readPluginManifestVersion).toBe('function')
    expect(typeof pluginTag.resolveTargetTag).toBe('function')
  })
})
