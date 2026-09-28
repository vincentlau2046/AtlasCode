/**
 * engine/tools/remotetriggers S-E2c（§8.68 R3）unit 层：RemoteTriggerTool
 * 本体面（零模型；STR-1 经 tools/ 根门面导入）。
 *
 * 覆盖：
 *   T-P1 自门控双向：默认 OFF（旧编译期 gate-OFF 保真）/ env ON /
 *       env-live flip / kill 还原
 *   T-P2 schema 面：action 5 值 enum / trigger_id pattern + 非必填 /
 *       body object + 非必填 / strictObject 面 additionalProperties false /
 *       required = [action]
 *   T-P3 面函数：isReadOnly（list/get 真，余 3 假）/ toAutoClassifierInput
 *       4 模板 / mapToolResult `HTTP ${status}\n${json}` 逐字 /
 *       userFacingName / checkPermissions allow 面 / description 逐字
 *   T-P4 call 面：5 校验文案逐字（缺参 throw 早于端口）+ 5 动作端口
 *       往返（fake 供给方）+ 未注册供给方 = 登记 throw 面
 *       （REMOTE_TRIGGERS_HOLD_MESSAGE 逐字）
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import {
  REMOTE_TRIGGER_TOOL_INPUT_SCHEMA,
  REMOTE_TRIGGER_DESCRIPTION,
  REMOTE_TRIGGERS_HOLD_MESSAGE,
  RemoteTriggerTool,
  clearRemoteTriggersPort,
  isRemoteTriggersEnabled,
  setRemoteTriggersPort,
  type RemoteTriggersPort,
} from '../../src/engine/tools'

function envSave(name: string): string | undefined {
  return process.env[name]
}

function envRestore(name: string, orig: string | undefined): void {
  if (orig === undefined) delete process.env[name]
  else process.env[name] = orig
}

/** 记录调用面的 fake 供给方（零网络）。 */
function fakePort(calls: string[]): RemoteTriggersPort {
  const mk = (tag: string) => async () => {
    calls.push(tag)
    return { status: 200, json: `{"echo":"${tag}"}` }
  }
  return {
    listTriggers: mk('list'),
    getTrigger: mk('get'),
    createTrigger: mk('create'),
    updateTrigger: mk('update'),
    runTrigger: mk('run'),
  }
}

describe('T-P1 自门控双向（env opt-in 默认 OFF 保真）', () => {
  let orig: string | undefined

  beforeAll(() => {
    orig = envSave('ATLAS_EXPERIMENTAL_REMOTE_TRIGGERS')
  })
  afterAll(() => {
    envRestore('ATLAS_EXPERIMENTAL_REMOTE_TRIGGERS', orig)
  })

  test('默认 OFF（旧编译期 gate-OFF + growthbook 缺省 false 保真）', () => {
    delete process.env.ATLAS_EXPERIMENTAL_REMOTE_TRIGGERS
    expect(isRemoteTriggersEnabled()).toBe(false)
    expect(RemoteTriggerTool.isEnabled()).toBe(false)
  })

  test('env ON → 门开（工具面活）', () => {
    process.env.ATLAS_EXPERIMENTAL_REMOTE_TRIGGERS = '1'
    expect(isRemoteTriggersEnabled()).toBe(true)
    expect(RemoteTriggerTool.isEnabled()).toBe(true)
    delete process.env.ATLAS_EXPERIMENTAL_REMOTE_TRIGGERS
    // env-live：同进程 flip 即时生效（重读面）
    expect(isRemoteTriggersEnabled()).toBe(false)
  })
})

describe('T-P2 schema 面（旧 zod strictObject 3 字段逐字转写）', () => {
  const s = REMOTE_TRIGGER_TOOL_INPUT_SCHEMA as {
    type: string
    additionalProperties?: boolean
    required?: string[]
    properties: Record<
      string,
      { type?: string; enum?: string[]; pattern?: string; description?: string }
    >
  }

  test('顶层面：object + strictObject 面 + required = [action]', () => {
    expect(s.type).toBe('object')
    expect(s.additionalProperties).toBe(false)
    expect(s.required).toEqual(['action'])
  })

  test('action 5 值 enum 逐字', () => {
    expect(s.properties.action.enum).toEqual([
      'list',
      'get',
      'create',
      'update',
      'run',
    ])
  })

  test('trigger_id pattern + 描述面逐字（非必填）', () => {
    expect(s.properties.trigger_id.pattern).toBe('^[\\w-]+$')
    expect(s.properties.trigger_id.description).toBe(
      'Required for get, update, and run',
    )
    expect(s.required).not.toContain('trigger_id')
  })

  test('body object + 描述面逐字（非必填）', () => {
    expect(s.properties.body.type).toBe('object')
    expect(s.properties.body.description).toBe('JSON body for create and update')
    expect(s.required).not.toContain('body')
  })
})

describe('T-P3 面函数', () => {
  beforeEach(() => {
    clearRemoteTriggersPort()
  })

  test('isReadOnly：list/get 真，create/update/run 假', () => {
    expect(RemoteTriggerTool.isReadOnly({ action: 'list' })).toBe(true)
    expect(RemoteTriggerTool.isReadOnly({ action: 'get' })).toBe(true)
    expect(RemoteTriggerTool.isReadOnly({ action: 'create' })).toBe(false)
    expect(RemoteTriggerTool.isReadOnly({ action: 'update' })).toBe(false)
    expect(RemoteTriggerTool.isReadOnly({ action: 'run' })).toBe(false)
  })

  test('toAutoClassifierInput 4 模板（有/无 trigger_id × 动作）', () => {
    expect(RemoteTriggerTool.toAutoClassifierInput({ action: 'list' })).toBe(
      'RemoteTrigger list',
    )
    expect(
      RemoteTriggerTool.toAutoClassifierInput({
        action: 'get',
        trigger_id: 't-1',
      }),
    ).toBe('RemoteTrigger get t-1')
    expect(
      RemoteTriggerTool.toAutoClassifierInput({ action: 'run' }),
    ).toBe('RemoteTrigger run')
  })

  test('mapToolResult 面逐字（HTTP ${status}\\n${json}）', () => {
    const block = RemoteTriggerTool.mapToolResultToToolResultBlockParam(
      { status: 201, json: '{"ok":true}' },
      'tu_1',
    ) as { tool_use_id: string; type: string; content: string }
    expect(block.tool_use_id).toBe('tu_1')
    expect(block.type).toBe('tool_result')
    expect(block.content).toBe('HTTP 201\n{"ok":true}')
  })

  test('userFacingName + checkPermissions allow 面', async () => {
    expect(RemoteTriggerTool.userFacingName({})).toBe('RemoteTrigger')
    const d = await RemoteTriggerTool.checkPermissions({ action: 'list' })
    expect(d).toEqual({ behavior: 'allow', updatedInput: { action: 'list' } })
  })

  test('description 逐字（旧 DESCRIPTION）', async () => {
    expect(await RemoteTriggerTool.description({}, {} as never)).toBe(
      REMOTE_TRIGGER_DESCRIPTION,
    )
  })

  test('renderToolUseMessage 字符串面逐字（旧 UI.tsx L7）', () => {
    expect(
      RemoteTriggerTool.renderToolUseMessage(
        { action: 'get', trigger_id: 't9' },
        {} as never,
      ),
    ).toBe('get t9')
    expect(
      RemoteTriggerTool.renderToolUseMessage({ action: 'list' }, {} as never),
    ).toBe('list')
    expect(RemoteTriggerTool.renderToolUseMessage({}, {} as never)).toBe('')
  })
})

describe('T-P4 call 面', () => {
  let calls: string[]
  let orig: string | undefined

  beforeAll(() => {
    orig = envSave('ATLAS_EXPERIMENTAL_REMOTE_TRIGGERS')
  })
  afterAll(() => {
    envRestore('ATLAS_EXPERIMENTAL_REMOTE_TRIGGERS', orig)
  })
  beforeEach(() => {
    clearRemoteTriggersPort()
    calls = []
  })
  afterAll(() => {
    clearRemoteTriggersPort()
  })

  test('5 校验文案逐字（缺参 throw 早于端口消费）', async () => {
    setRemoteTriggersPort(fakePort(calls))
    await expect(
      RemoteTriggerTool.call({ action: 'get' } as never),
    ).rejects.toThrow('get requires trigger_id')
    await expect(
      RemoteTriggerTool.call({ action: 'create' } as never),
    ).rejects.toThrow('create requires body')
    await expect(
      RemoteTriggerTool.call({ action: 'update' } as never),
    ).rejects.toThrow('update requires trigger_id')
    await expect(
      RemoteTriggerTool.call({
        action: 'update',
        trigger_id: 't1',
      } as never),
    ).rejects.toThrow('update requires body')
    await expect(
      RemoteTriggerTool.call({ action: 'run' } as never),
    ).rejects.toThrow('run requires trigger_id')
    // 校验全早退 = 端口 0 调用
    expect(calls).toEqual([])
  })

  test('5 动作端口往返（fake 供给方 data 映射面）', async () => {
    setRemoteTriggersPort(fakePort(calls))
    const r1 = await RemoteTriggerTool.call({ action: 'list' } as never)
    expect(r1.data).toEqual({ status: 200, json: '{"echo":"list"}' })
    const r2 = await RemoteTriggerTool.call({
      action: 'get',
      trigger_id: 't1',
    } as never)
    expect(r2.data).toEqual({ status: 200, json: '{"echo":"get"}' })
    const r3 = await RemoteTriggerTool.call({
      action: 'create',
      body: { name: 'x' },
    } as never)
    expect(r3.data).toEqual({ status: 200, json: '{"echo":"create"}' })
    const r4 = await RemoteTriggerTool.call({
      action: 'update',
      trigger_id: 't1',
      body: { name: 'y' },
    } as never)
    expect(r4.data).toEqual({ status: 200, json: '{"echo":"update"}' })
    const r5 = await RemoteTriggerTool.call({
      action: 'run',
      trigger_id: 't1',
    } as never)
    expect(r5.data).toEqual({ status: 200, json: '{"echo":"run"}' })
    expect(calls).toEqual(['list', 'get', 'create', 'update', 'run'])
  })

  test('未注册供给方 = 登记 throw 面（HOLD 文案逐字，模型可见错误面真）', async () => {
    clearRemoteTriggersPort()
    await expect(
      RemoteTriggerTool.call({ action: 'list' } as never),
    ).rejects.toThrow(REMOTE_TRIGGERS_HOLD_MESSAGE)
    // 登记面含 [ATLAS-HOLD] 标记 + IFF 网关词面
    expect(REMOTE_TRIGGERS_HOLD_MESSAGE).toContain('[ATLAS-HOLD]')
    expect(REMOTE_TRIGGERS_HOLD_MESSAGE).toContain('IFF 网关')
  })
})
