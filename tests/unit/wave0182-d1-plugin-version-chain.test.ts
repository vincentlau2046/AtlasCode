/**
 * 0.1.82 K3-D D1 判别关账单测（上游 302）：新装插件版本解析链。
 *
 * 判别结论（2026-10-30，双子面证据判别，工单 §0 D1 行留痕）：
 *  (a) 「每次刷新重 clone」——结构性不存在。cacheMarketplaceFromGit
 *      （marketplaceManager.ts:1158）pull-first：gitPull 成功即 return，
 *      仅 pull 失败才 rm+re-clone（AD-43 keep-cache env 再兜底）；全部
 *      调用点（1745/1774/1803/1833/1870/1898/2932/2946/2959/2975）经此
 *      单点；refreshMarketplace(:2819) 语义即 in-place。func 层
 *      plugin-ad43-keep-marketplace-env.test.ts ③（pull 成功 → 不 rm 不
 *      clone）已钉 pull-first 面 → 排除候补登记，本文件不重复铺。
 *  (b) 「新装 git 插件版本显示 unknown」——解析链完整在场：
 *      calculatePluginVersion（pluginVersioning.ts:36）5 级优先
 *      （manifest.version → entry.version → 预解析 gitCommitSha →
 *      installPath git SHA → 'unknown'），三消费面全接：fresh install
 *      cacheAndRegisterPlugin（pluginInstallationHelpers.ts:151）、
 *      v1→v2 迁移 installedPluginsManager（:1192-1240）、更新检测
 *      pluginLoader（:2249/:2286/:2343）。修前零单测 → 本文件钉桩关账
 *      （K3-B2/B5-1 先例：已在场 → 判别测试固化，无 RED 面）。
 *
 * mock 面：先 import 真实 gitFilesystem 全导出面（18 名）再 spread 覆写
 * getHeadForDir（其余原样透传，避同进程 mock 全导出面泄漏坑，repo 惯例，
 * 同 AD-43 func 先例）；受测模块在 mock 之后动态 import（绑定生效序）。
 */
import { describe, expect, mock, test } from 'bun:test'
import { createHash } from 'node:crypto'

import type {
  PluginManifest,
  PluginSource,
} from '../../src/tui/utils/plugins/schemas.js'

const GIT_FS_PATH = '../../src/tui/utils/git/gitFilesystem.js'

const realGitFs = await import(GIT_FS_PATH)

// 可变桩：installPath 兜底 face = 有 git → sha；非 git 目录 face = null
let headShaForDir: string | null = null

mock.module(GIT_FS_PATH, () => ({
  ...realGitFs,
  getHeadForDir: async (_cwd: string) => headShaForDir,
}))

const { calculatePluginVersion } = await import(
  '../../src/tui/utils/plugins/pluginVersioning.js'
)

const FULL_SHA = '0123456789abcdef0123456789abcdef01234567'
const SHA12 = FULL_SHA.substring(0, 12)
const NORM_PATH = 'tools/example-plugin'
const PATH_HASH = createHash('sha256')
  .update(NORM_PATH)
  .digest('hex')
  .substring(0, 8)

const GITHUB_SOURCE = {
  source: 'github',
  repo: 'acme/plugin',
} as PluginSource
const GIT_SUBDIR_SOURCE = {
  source: 'git-subdir',
  url: 'https://gitcode.com/acme/mono.git',
  path: NORM_PATH,
} as PluginSource
const LOCAL_SOURCE = './plugins/foo' as PluginSource

describe('K3-D D1：插件版本解析链优先级（calculatePluginVersion）', () => {
  test('① manifest.version 最高优先（entry.version + gitCommitSha 同时在场仍压住）', async () => {
    const v = await calculatePluginVersion(
      'p@m',
      GITHUB_SOURCE,
      { version: '1.2.3' } as unknown as PluginManifest,
      undefined,
      '9.9.9',
      FULL_SHA,
    )
    expect(v).toBe('1.2.3')
  })

  test('② entry.version（provided）次优先（versionless manifest 不遮蔽，压过 gitCommitSha）', async () => {
    const v = await calculatePluginVersion(
      'p@m',
      GITHUB_SOURCE,
      {} as unknown as PluginManifest,
      undefined,
      '2.0.0',
      FULL_SHA,
    )
    expect(v).toBe('2.0.0')
  })

  test('③ 预解析 gitCommitSha → 前 12 位（git 插件不落 unknown 的主修复面）', async () => {
    const v = await calculatePluginVersion(
      'p@m',
      GITHUB_SOURCE,
      undefined,
      undefined,
      undefined,
      FULL_SHA,
    )
    expect(v).toBe(SHA12)
  })

  test('④ git-subdir 变体：sha12-路径哈希 8 位', async () => {
    const v = await calculatePluginVersion(
      'p@m',
      GIT_SUBDIR_SOURCE,
      undefined,
      undefined,
      undefined,
      FULL_SHA,
    )
    expect(v).toBe(`${SHA12}-${PATH_HASH}`)
  })

  test('④b git-subdir 归一化：反斜杠/头 ./ /尾 / 全剥后与规范形同哈希（squashfs cron 字节对齐）', async () => {
    const v = await calculatePluginVersion(
      'p@m',
      {
        source: 'git-subdir',
        url: 'https://gitcode.com/acme/mono.git',
        path: '.\\tools\\example-plugin//',
      } as PluginSource,
      undefined,
      undefined,
      undefined,
      FULL_SHA,
    )
    expect(v).toBe(`${SHA12}-${PATH_HASH}`)
  })

  test('⑤ installPath 兜底：无预解析 SHA 时读目录 HEAD → 前 12 位', async () => {
    headShaForDir = FULL_SHA
    try {
      const v = await calculatePluginVersion(
        'p@m',
        LOCAL_SOURCE,
        undefined,
        '/fake/install/path',
        undefined,
        undefined,
      )
      expect(v).toBe(SHA12)
    } finally {
      headShaForDir = null
    }
  })

  test('⑥ 非 git 目录（HEAD=null）且无任何版本源 → unknown', async () => {
    headShaForDir = null
    const v = await calculatePluginVersion(
      'p@m',
      LOCAL_SOURCE,
      undefined,
      '/fake/install/path',
      undefined,
      undefined,
    )
    expect(v).toBe('unknown')
  })

  test('⑦ 零参极简：全缺 → unknown', async () => {
    const v = await calculatePluginVersion('p@m', LOCAL_SOURCE)
    expect(v).toBe('unknown')
  })
})
