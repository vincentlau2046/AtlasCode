/**
 * 2026-10-05 §4b A 波 A1：session-rules sidecar 磁盘 round-trip（integration 层）。
 *
 * 语义（spec §4b-A1）：
 *   ① session 域 always 规则授予时合并写入 sidecar（原子写 + 去重）；
 *   ② resume 读回种回内存上下文；新 session（新 ID）无文件 → 零残留；
 *   ③ 写失败不抛、返回 false —— persistPermissions 调用方显式上报
 *      （notification），不静默；
 *   ④ 非 session 域更新不落 sidecar。
 * 环境：ATLAS_CONFIG_DIR 指 tmpdir（getAtlasConfigHomeDir 直读 env 无缓存）。
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import {
  createPermissionContext,
} from '../../src/tui/hooks/toolPermission/PermissionContext'
import { getEmptyToolPermissionContext } from '../../src/tui/Tool.js'
import { getProjectDir } from '../../src/tui/utils/sessionStorage'
import {
  mergeSessionPermissionRules,
  readCurrentSessionPermissionRules,
  readSessionPermissionRules,
} from '../../src/tui/utils/permissions/sessionPermissionRules'
import type { PermissionUpdate } from '../../src/tui/utils/permissions/PermissionUpdateSchema'

const SESSION_RULE: PermissionUpdate = {
  type: 'addRules',
  rules: [{ toolName: 'Bash', ruleContent: 'npm:*' }],
  behavior: 'allow',
  destination: 'session',
}
const OTHER_RULE: PermissionUpdate = {
  type: 'addRules',
  rules: [{ toolName: 'Bash', ruleContent: 'git:*' }],
  behavior: 'allow',
  destination: 'session',
}

let cfgDir: string
let projectDir: string
const SID = 'int-test-session-1'

beforeAll(() => {
  cfgDir = mkdtempSync(join(tmpdir(), 'atlas-spr-disk-'))
  process.env.ATLAS_CONFIG_DIR = cfgDir
  projectDir = join(cfgDir, 'projects', 'int-test-project')
})

afterAll(() => {
  delete process.env.ATLAS_CONFIG_DIR
  rmSync(cfgDir, { recursive: true, force: true })
})

describe('sidecar 磁盘 round-trip（显式 sessionId/projectDir 形）', () => {
  test('新 session：无 sidecar → []（新 session 重置的结构保证）', async () => {
    expect(await readSessionPermissionRules('never-granted-session', projectDir)).toEqual([])
  })

  test('merge 建文件 + read round-trip', async () => {
    expect(await mergeSessionPermissionRules(SID, projectDir, [SESSION_RULE])).toBe(true)
    expect(existsSync(join(projectDir, `${SID}.session-rules.json`))).toBe(true)
    expect(await readSessionPermissionRules(SID, projectDir)).toEqual([SESSION_RULE])
  })

  test('去重：同规则二次 merge 不重复', async () => {
    expect(await mergeSessionPermissionRules(SID, projectDir, [SESSION_RULE])).toBe(true)
    expect(await readSessionPermissionRules(SID, projectDir)).toEqual([SESSION_RULE])
  })

  test('异规则追加 → 2 条', async () => {
    expect(await mergeSessionPermissionRules(SID, projectDir, [OTHER_RULE])).toBe(true)
    const rules = await readSessionPermissionRules(SID, projectDir)
    expect(rules).toHaveLength(2)
    expect(rules).toContainEqual(SESSION_RULE)
    expect(rules).toContainEqual(OTHER_RULE)
  })

  test('损坏文件 → []（不抛）', async () => {
    const corruptSid = 'int-test-corrupt'
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(join(projectDir, `${corruptSid}.session-rules.json`), 'not json {{{')
    expect(await readSessionPermissionRules(corruptSid, projectDir)).toEqual([])
  })

  test('写失败（项目路径被文件占位）→ false 不抛', async () => {
    const blockedDir = join(cfgDir, 'projects', 'blocked-by-file')
    mkdirSync(dirname(blockedDir), { recursive: true })
    writeFileSync(blockedDir, 'i am a file, not a dir')
    expect(await mergeSessionPermissionRules('s-blocked', blockedDir, [SESSION_RULE])).toBe(false)
  })

  test('非 session 域更新不落 sidecar', async () => {
    const localSid = 'int-test-local-dest'
    const localDest: PermissionUpdate = {
      ...SESSION_RULE,
      destination: 'localSettings',
    }
    expect(
      await mergeSessionPermissionRules(localSid, projectDir, [localDest]),
    ).toBe(true)
    // 过滤后无 session 规则可写 → 不建文件
    expect(await readSessionPermissionRules(localSid, projectDir)).toEqual([])
  })
})

describe('persistPermissions 接线：内存 + sidecar + 写失败显式上报', () => {
  function makeCtx() {
    const appState = {
      toolPermissionContext: getEmptyToolPermissionContext(),
      notifications: { queue: [] as unknown[], current: null },
    }
    const tool = { name: 'Bash', userFacingName: () => 'Bash' } as never
    const toolUseContext = {
      agentId: undefined,
      abortController: new AbortController(),
      getAppState: () => appState,
      setAppState: (f: (prev: typeof appState) => typeof appState) => {
        Object.assign(appState, f(appState))
      },
    } as never
    const assistantMessage = { message: { id: 'm-1' } } as never
    let currentContext = appState.toolPermissionContext
    const setToolPermissionContext = (c: unknown) => {
      currentContext = c
    }
    const ctx = createPermissionContext(
      tool,
      { command: 'npm i' },
      toolUseContext,
      assistantMessage,
      't-1',
      setToolPermissionContext as never,
    )
    return { ctx, appState, currentContext: () => currentContext }
  }

  test('session 域授予：内存上下文种入 + sidecar 落盘 + 无 notification', async () => {
    process.env.ATLAS_CONFIG_DIR = cfgDir
    const { ctx, appState, currentContext } = makeCtx()
    await ctx.persistPermissions([SESSION_RULE])
    // 内存：in-memory 上下文含规则（本 session 同前缀命中直接 allow 的数据基础）
    expect(JSON.stringify(currentContext().alwaysAllowRules)).toContain('npm:*')
    // sidecar：当前 session 文件含该规则
    expect(await readCurrentSessionPermissionRules()).toContainEqual(SESSION_RULE)
    // 成功路径无上报
    expect(
      (appState.notifications.queue as { key?: string }[]).some(
        n => n.key === 'session-rules-persist-failed',
      ),
    ).toBe(false)
  })

  test('写失败：显式 notification（不静默）', async () => {
    // 占位文件阻塞当前 session 的项目目录（getTranscriptPath 的 dirname）。
    // 前序成功测试已把该目录建成目录 → 先删再落占位文件（文件占位使
    // mkdirSync(recursive) 抛 EEXIST → merge 返回 false）。
    const projDir = getProjectDir(process.cwd())
    rmSync(projDir, { recursive: true, force: true })
    mkdirSync(dirname(projDir), { recursive: true })
    writeFileSync(projDir, 'blocker-file')
    const { ctx, appState, currentContext } = makeCtx()
    await ctx.persistPermissions([SESSION_RULE])
    // 内存仍生效（sidecar 是便利层，写失败不影响本 session 域规则）
    expect(JSON.stringify(currentContext().alwaysAllowRules)).toContain('npm:*')
    // 显式上报（不静默）
    expect(
      (appState.notifications.queue as { key?: string; text?: string }[]).some(
        n => n.key === 'session-rules-persist-failed',
      ),
    ).toBe(true)
  })

  test('重复失败不重复弹（同 key 去重）', async () => {
    const { ctx, appState } = makeCtx()
    await ctx.persistPermissions([SESSION_RULE])
    await ctx.persistPermissions([SESSION_RULE])
    const hits = (appState.notifications.queue as { key?: string }[]).filter(
      n => n.key === 'session-rules-persist-failed',
    )
    expect(hits).toHaveLength(1)
  })
})
