/**
 * 0.1.72 块 C-1（de-ant 收尾波，工单 docs/2026-10-15-p0-wave-0172-ticket.md §1）
 * 判别单测：auth.ts keychain 函数族清零（403 根因链**第二断根**）。
 *
 * 403 根因链（2026-10-15 根因报告三铁证）双断根：
 *  - 第一断根（0.1.70 H-1，de-ant-apikey-fallback-0170.test.ts 锁）：
 *    getRoleConfig 回落 getGlobalApiKey → settings-adapter getGlobalApiKey 恒
 *    undefined（断 settings-adapter → keychain/OAuth 那根线）。
 *  - 第二断根（本波 0.1.72 块 C-1）：getApiKeyFromConfigOrMacOSKeychain 函数族
 *    本体 + keychain 读写 + keychainPrefetch 死文件 = 未清零残留，本波收口。
 *
 * 被测能力（工单 §1 C-1a/b/c/d）：
 *  - C-1a getApiKeyFromConfigOrMacOSKeychain：删 darwin keychain 读支，保留
 *    config.primaryApiKey 路径（恒等锚：非 darwin 零变更；darwin 面 = 预期变更）。
 *  - C-1b saveApiKey 删 keychain 写支 + removeApiKey 删 keychain 移除支，
 *    config-file 持久化恒等（恒等锚）。
 *  - C-1c keychainPrefetch import 面 + 死文件 keychainPrefetch.ts 删除 +
 *    authPortable.ts 死函数 maybeRemoveApiKeyFromMacOSKeychainThrows 删除；
 *    macOsKeychainHelpers.ts / macOsKeychainStorage.ts = MCP/通用 secureStorage
 *    活消费（OOS）保留（勘误工单 §0：macOsKeychainHelpers 非死文件）。
 *  - C-1d source 枚举收敛：'/login managed key' 现仅由 config 路径产出（keychain
 *    源摘除）；apiKeyHelper / OPENAI_API_KEY 源零扰动（恒等锚）。
 *  - C-2 核验（零码，双断根在册）：settings-adapter getGlobalApiKey 恒 undefined
 *    （H-1 break-root 仍在，keychain 读支已清零后无 live anthropic OAuth 活读取）。
 *
 * C-1c 判据面**重定界**（Main 裁定，报 e2e gate 校准）：工单原文「build 无
 * `security find-generic-password` 字面（occ=0）」不可达——OOS macOsKeychainStorage
 *（MCP/通用 secureStorage，活消费）携带 find/add/delete-generic-password 字面且
 * 在活 build 图内。重定界为「**anthropic keychain 读写路径**（getApiKeyFromConfigOr
 * MacOSKeychain darwin 支 + saveApiKey 写支 + maybeRemove* + keychainPrefetch）缺席」；
 * 通用 secureStorage 字面 = OOS 不在本波 de-ant judge 面。
 *
 * 判别信号（修前红→绿）：修前（基线 6b46ed6=v0.1.71）anthropic keychain 读/写/
 * 移除支 + keychainPrefetch 死文件在场 → 本文件全部缺席断言 RED；修后全绿。
 * 重新引入任一 keychain 支 = 立即 RED（de-ant 回归守卫）。
 *
 * 分层纪律：unit 层——**源级字符串锁**（读源文本 = 只读仓库自身，确定性）；
 * auth/settings 重图不入 unit 进程（de-ant-apikey-fallback-0170 头注纪律），
 * 本文件零 import 重图、零网络 / 零盘 / 零 PTY / 零 spawn。
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'bun:test'

function srcOf(rel: string): string {
  return readFileSync(resolve(import.meta.dir, '../../', rel), 'utf8')
}
function fileExists(rel: string): boolean {
  return existsSync(resolve(import.meta.dir, '../../', rel))
}
function countOf(haystack: string, needle: string): number {
  let n = 0
  let i = haystack.indexOf(needle)
  while (i !== -1) {
    n++
    i = haystack.indexOf(needle, i + needle.length)
  }
  return n
}

const AUTH = 'src/tui/utils/auth.ts'
const AUTH_PORTABLE = 'src/tui/utils/authPortable.ts'
const KEYCHAIN_PREFETCH = 'src/tui/utils/secureStorage/keychainPrefetch.ts'
const MACOS_HELPERS = 'src/tui/utils/secureStorage/macOsKeychainHelpers.ts'
const SETTINGS_ADAPTER = 'src/tui/config/settings-adapter.ts'

// anthropic keychain 读写子进程字面 + 函数族符号（本波清零面）。OOS macOsKeychain
// Storage 保留其字面（通用 secureStorage），故缺席断言仅锚定 auth.ts / authPortable。
const KEYCHAIN_SUBPROCESS = [
  'find-generic-password',
  'add-generic-password',
  'delete-generic-password',
]
const KEYCHAIN_SYMBOLS = [
  'maybeRemoveApiKeyFromMacOSKeychain', // 含 ...Throws 子串（前缀匹配）
  'getLegacyApiKeyPrefetchResult',
  'keychainPrefetch', // import 面 + 消费（startKeychainPrefetch 为其前缀子串）
  'getMacOsKeychainStorageServiceName',
]

describe('0.1.72 C-1a：getApiKeyFromConfigOrMacOSKeychain darwin keychain 读支缺席 + config 恒等', () => {
  test('auth.ts 全文件：keychain 子进程字面 + 函数族符号缺席（修前红）', () => {
    const src = srcOf(AUTH)
    for (const lit of [...KEYCHAIN_SUBPROCESS, ...KEYCHAIN_SYMBOLS]) {
      expect(src).not.toContain(lit)
    }
  })
  test('config.primaryApiKey 路径在场（恒等锚：非 darwin 零变更）', () => {
    const src = srcOf(AUTH)
    expect(src).toContain('const config = getGlobalConfig()')
    expect(src).toContain('if (!config.primaryApiKey)')
    // 唯一 key 源 = config（darwin keychain 读支已清零）
    expect(src).toContain("return { key: config.primaryApiKey, source: '/login managed key' }")
  })
})

describe('0.1.72 C-1b：keychain 写/移除支缺席 + config-file 持久化恒等', () => {
  test('auth.ts：keychain 子进程字面 + 移除 helper 缺席（含 authPortable 死函数）', () => {
    const auth = srcOf(AUTH)
    for (const lit of [...KEYCHAIN_SUBPROCESS, ...KEYCHAIN_SYMBOLS]) {
      expect(auth).not.toContain(lit)
    }
    const portable = srcOf(AUTH_PORTABLE)
    for (const lit of [...KEYCHAIN_SUBPROCESS, ...KEYCHAIN_SYMBOLS]) {
      expect(portable).not.toContain(lit)
    }
  })
  test('saveApiKey：config-file 持久化 primaryApiKey（恒等锚）', () => {
    const src = srcOf(AUTH)
    expect(src).toContain('primaryApiKey: apiKey') // 完整 key 落 config（非 keychain）
    expect(src).toContain('getApiKeyFromConfigOrMacOSKeychain.cache.clear?.()') // memo 清缓存保留
  })
  test('removeApiKey：config-file primaryApiKey=undefined（唯一动作）', () => {
    const src = srcOf(AUTH)
    expect(src).toContain('primaryApiKey: undefined')
  })
})

describe('0.1.72 C-1c：keychainPrefetch import 面 + 死文件删除 + OOS helper 保留', () => {
  test('keychainPrefetch.ts 死文件已删（零活消费，main.tsx 用本地 no-op stub 非 import）', () => {
    expect(fileExists(KEYCHAIN_PREFETCH)).toBe(false)
  })
  test('auth.ts keychainPrefetch import 面缺席（import + 消费双清）', () => {
    const src = srcOf(AUTH)
    expect(src).not.toContain('keychainPrefetch')
    expect(src).not.toContain("from './utils/secureStorage/keychainPrefetch" )
    expect(src).not.toContain('startKeychainPrefetch')
  })
  test('OOS macOsKeychainHelpers.ts 保留（clearKeychainCache 活 MCP/secureStorage 消费，勘误工单 §0）', () => {
    expect(fileExists(MACOS_HELPERS)).toBe(true)
    const src = srcOf(MACOS_HELPERS)
    expect(src).toContain('export function clearKeychainCache')
    // auth.ts 仅保留 clearKeychainCache 一条 OOS 活消费（anthropic keychain 消费已清）
    const auth = srcOf(AUTH)
    expect(auth).toContain("import { clearKeychainCache } from './secureStorage/macOsKeychainHelpers.js'")
    expect(auth).not.toContain('getMacOsKeychainStorageServiceName')
  })
})

describe('0.1.72 C-1d：source 枚举收敛（config-only）+ apiKeyHelper/OPENAI_API_KEY 零扰动', () => {
  test("'//login managed key' 仅由 config 路径产出（keychain 源摘除）", () => {
    const src = srcOf(AUTH)
    // 恰好 1 处 = config.primaryApiKey 路径（darwin keychain 支已不产此 source）
    expect(countOf(src, "source: '/login managed key'")).toBe(1)
  })
  test('ApiKeySource 枚举四元完整 + apiKeyHelper/OPENAI_API_KEY 源零扰动（恒等锚）', () => {
    const src = srcOf(AUTH)
    // 类型面四元在场
    expect(src).toContain("| 'OPENAI_API_KEY'")
    expect(src).toContain("| 'apiKeyHelper'")
    expect(src).toContain("| '/login managed key'")
    expect(src).toContain("| 'none'")
    // 非 keychain 源产出面在场（零扰动：getAtlasApiKeyWithSource 仍产 apiKeyHelper / OPENAI_API_KEY）
    expect(src).toContain("source: 'apiKeyHelper'")
    expect(src).toContain("source: 'OPENAI_API_KEY'")
    expect(src).toContain("source: 'none'")
  })
})

describe('0.1.72 C-2 核验（零码）：settings-adapter getGlobalApiKey 恒 undefined（H-1 双断根在册）', () => {
  test('settings-adapter getGlobalApiKey 恒 undefined（keychain/OAuth 读已断）+ 不消费 keychain 函数', () => {
    const src = srcOf(SETTINGS_ADAPTER)
    // H-1 break-root：getGlobalApiKey 恒 undefined（0.1.70 已断，本波核验仍在）
    expect(src).toContain('getGlobalApiKey(): string | undefined')
    expect(src).toContain('return undefined')
    // 双断根：settings-adapter 面不**调用** anthropic keychain 函数族（调用面
    // 缺席锚定；符号名可现于溯源注释，故按调用形 `…(` 判）。
    expect(src).not.toContain('getApiKeyFromConfigOrMacOSKeychain(')
  })
})
