import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { resetSessionEnv, getSessionEnv } from '../../src/engine/session/env'
import { getVersion } from '../../src/engine/session/paths'
import {
  getSessionMessages,
  clearSessionMessagesCache,
  primeSessionMessages,
  hasSessionMessagesCache,
} from '../../src/engine/session/sessionMessagesCache'
import { buildConversationChain, loadTranscriptFull } from '../../src/engine/session/readonly'
import { createDefaultReadonlySessionRuntime } from '../../src/atlascode/web/runtimeDefault'

const ROOT = resolve(import.meta.dir, '../..')
const src = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
/** 剥注释后的码面（断言面向 export 语句，头注提及不计）。 */
const codeOf = (rel: string) =>
  src(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/**
 * S0-R2 受支持 engine 载体出口波（lock-face @25cb7454 §3/§5，f4 批复
 * 工单 §7 @351c74c4）：形 A 同出口扩具名导出 + 修形四件。
 * 单测层 = 源形状 + 行为锚；dist bundle 级断言（载体图缓存模块缺席 /
 * d.ts 泄漏面 / fs 探针导入纯度）在 e2e gate 判据件。
 */
describe('S0-R2 engine carrier（形 A）', () => {
  test('runtimeDefault 改名 createDefaultReadonlySessionRuntime（旧名清零）', () => {
    expect(typeof createDefaultReadonlySessionRuntime).toBe('function')
    expect(codeOf('src/atlascode/web/runtimeDefault.ts')).not.toContain(
      'createAtlasWebSessionRuntime',
    )
  })

  test('runtimeDefault import 窄化：全门面零现，只读子门面在位', () => {
    const source = src('src/atlascode/web/runtimeDefault.ts')
    expect(source).not.toMatch(/from 'src\/engine'/)
    expect(source).toContain('src/engine/session/readonly')
  })

  test('entry.ts 扩具名导出（factory + options 型），内部面不入出口', () => {
    const code = codeOf('src/atlascode/web/entry.ts')
    expect(code).toContain('createDefaultReadonlySessionRuntime')
    expect(code).toContain('AtlasWebSessionRuntimeOptions')
    expect(code).not.toContain('buildConversationChain')
    expect(code).not.toContain('atlasWebSessionEngine')
    expect(code).not.toContain('TranscriptMessage')
  })

  test('shared barrel 值导入窄化（闭包内三处直连子模块）', () => {
    expect(src('src/engine/session/load.ts')).not.toContain("from '../../shared'")
    expect(src('src/engine/session/env.ts')).toContain("../../shared/configDir")
    expect(src('src/engine/session/paths.ts')).toContain("../../shared/path")
  })

  test('paths.ts VERSION 惰性化：顶层 IIFE 销项 + getVersion 首调求值 memo', () => {
    const source = src('src/engine/session/paths.ts')
    expect(source).not.toMatch(/const VERSION: string = \(\(\) =>/)
    const first = getVersion()
    const second = getVersion()
    expect(second).toBe(first)
    expect(typeof first).toBe('string')
    expect(first.length).toBeGreaterThan(0)
  })

  test('env.ts 顶层进程面惰性化：首访问捕获语义（稳定 + 进程启动 cwd）', () => {
    const source = src('src/engine/session/env.ts')
    expect(source).not.toMatch(/const _sessionId: string = randomUUID\(\)/)
    expect(source).not.toMatch(/const _originalCwd: string = process\.cwd\(\)/)
    resetSessionEnv()
    const env = getSessionEnv()
    const idA = env.getSessionId()
    const idB = env.getSessionId()
    expect(idB).toBe(idA)
    expect(idA).toMatch(/^[0-9a-f-]{36}$/u)
    expect(env.getOriginalCwd()).toBe(process.cwd())
    expect(env.getOriginalCwd()).toBe(env.getOriginalCwd())
  })

  test('必改钉①：缓存整迁 sessionMessagesCache 模块（load.ts 零残 + 四函数搬家）', () => {
    expect(src('src/engine/session/load.ts')).not.toContain('_sessionMessagesCache')
    expect(typeof getSessionMessages).toBe('function')
    expect(typeof clearSessionMessagesCache).toBe('function')
    expect(typeof primeSessionMessages).toBe('function')
    expect(typeof hasSessionMessagesCache).toBe('function')
  })

  test('缓存 re-export 面（session/index.ts barrel + engine 门面）零变', async () => {
    const barrel = await import('../../src/engine/session/index')
    expect(typeof barrel.getSessionMessages).toBe('function')
    expect(typeof barrel.clearSessionMessagesCache).toBe('function')
    expect(typeof barrel.primeSessionMessages).toBe('function')
    expect(typeof barrel.hasSessionMessagesCache).toBe('function')
    const facade = await import('../../src/engine/index')
    expect(typeof facade.hasSessionMessagesCache).toBe('function')
  })

  test('只读子门面扩形：buildConversationChain re-export 在位', () => {
    expect(typeof buildConversationChain).toBe('function')
    expect(typeof loadTranscriptFull).toBe('function')
  })

  test('factory 行为锚：注入缝保留 + engine 已填 + 生命周期面在位', async () => {
    const runtime = createDefaultReadonlySessionRuntime({
      productId: 'atlascode',
      scopes: [{ scopeId: 's0r2-test', storageDir: ROOT }],
    })
    expect(typeof runtime.epoch).toBe('string')
    expect(runtime.epoch.length).toBeGreaterThan(0)
    expect(typeof runtime.start).toBe('function')
    expect(typeof runtime.listSessions).toBe('function')
    expect(typeof runtime.replaySession).toBe('function')
    expect(typeof runtime.followSession).toBe('function')
    expect(typeof runtime.close).toBe('function')
    // 注入缝保留（预答不变量）：engine 已由默认装配填死——listSessions 走
    // 真 adapter（storageDir 指仓库根，扫描面零命中即空表）。
    await runtime.start()
    const result = await runtime.listSessions({ scopeId: 's0r2-test' })
    expect(Array.isArray(result.sessions)).toBe(true)
    await runtime.close()
  })
})
