/**
 * D-279-r1（渲染层）：文件 ask 弹框接 P0a verdict 行的判别单测。
 *
 * 根因：FilePermissionDialog 此前漏 P0a verdict 行（为何在问你），A4 分类器危险句
 * （auto-mode）在文件面（Write/Edit/Notebook/SedEdit 均收敛到 FilePermissionDialog）
 * 永不现形 → A4 #3（a4cls）hard-red。修：接 verdictLine，镜像
 * BashPermissionRequest / PowerShellPermissionRequest（读
 * permissionResult.decisionReason + tpc.mode，非 null 渲 dimColor 一行；
 * 零新数据、判定层零改动）。
 *
 * 本文件两层判别：
 *   1. 纯面（verdictLine）：钉文件面应渲染的确切句体（A4 #3 危险句 + #4 自动放行句
 *      的 unit 级契约）；PTY 活链归 e2e S-024N。
 *   2. 渲染面（Ink render）：真挂 FilePermissionDialog（AppStateProvider seed
 *      toolPermissionContext），断言危险句被渲进捕获流（修前 RED：无 verdict 行；
 *      修后 GREEN：在）；并断言 decisionReason 缺省不加行（null 路径守卫，无 spurious 行）。
 */
import { Writable } from 'stream'
import { describe, expect, it } from 'bun:test'
import React from 'react'
import {
  VERDICT_PREFIX,
  verdictLine,
} from '../../src/tui/components/permissions/permissionVerdict.js'
import {
  FilePermissionDialog,
} from '../../src/tui/components/permissions/FilePermissionDialog/FilePermissionDialog.js'
import type { ToolUseConfirm } from '../../src/tui/components/permissions/PermissionRequest.js'
import { render } from '../../src/tui/ink.js'
import type { ToolUseContext } from '../../src/tui/Tool.js'
import {
  AppStateProvider,
  getDefaultAppState,
  type AppState,
} from '../../src/tui/state/AppState.js'

const DANGEROUS = 'Auto mode: classifier flagged this as dangerous.'
const AUTO_APPROVED = 'Auto-approved by classifier: writes to config.'

// ---- 1. 纯面：文件面（Write 工具）应渲染的确切句体 ----
describe('D-279-r1 verdictLine 纯面（文件面参形）', () => {
  it('classifier 危险句（#3 a4cls）：Write + auto + 非自动放行', () => {
    expect(
      verdictLine(
        { type: 'classifier', classifier: 'auto-mode', reason: 'writes to config' },
        'auto',
        'Write',
        false,
      ),
    ).toBe(`${VERDICT_PREFIX}: ${DANGEROUS}`)
  })

  it('classifier 自动放行句（#4 a4clsa）：Write + auto + 自动放行', () => {
    expect(
      verdictLine(
        { type: 'classifier', classifier: 'auto-mode', reason: 'writes to config' },
        'auto',
        'Write',
        true,
      ),
    ).toBe(`${VERDICT_PREFIX}: ${AUTO_APPROVED}`)
  })

  it('reason 缺省 → null（弹框保持原样，不加 spurious 行）', () => {
    expect(verdictLine(undefined, 'auto', 'Write')).toBe(null)
  })
})

// ---- 2. 渲染面：真挂 FilePermissionDialog，捕获 verdict 行 ----
function makeToolUseConfirm(
  over: Partial<ToolUseConfirm> = {},
): ToolUseConfirm {
  const base: ToolUseConfirm = {
    assistantMessage: { message: { id: 'msg-test-1' } } as never,
    tool: { name: 'Write', userFacingName: () => 'Write' } as never,
    description: 'Write file',
    input: { file_path: '/tmp/probe.txt', content: 'x' },
    toolUseContext: { options: { mcpClients: [] } } as never,
    toolUseID: 'test-1',
    permissionResult: {
      behavior: 'ask',
      decisionReason: {
        type: 'classifier',
        classifier: 'auto-mode',
        reason: 'writes to config',
      },
    } as never,
    permissionPromptStartTimeMs: 0,
    onUserInteraction: () => {},
    onAbort: () => {},
    onAllow: () => {},
    onReject: () => {},
    recheckPermission: async () => {},
    ...over,
  }
  return base
}

function initialStateWithMode(mode: 'auto' | 'default'): AppState {
  const base = getDefaultAppState()
  return {
    ...base,
    toolPermissionContext: { ...base.toolPermissionContext, mode },
  } as unknown as AppState
}

async function renderDialogToText(
  toolUseConfirm: ToolUseConfirm,
  mode: 'auto' | 'default',
): Promise<string> {
  const chunks: string[] = []
  const stdout = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(String(chunk))
      cb()
    },
  })
  const toolUseContext = { options: { mcpClients: [] } } as unknown as ToolUseContext
  const tree = React.createElement(
    AppStateProvider,
    { initialState: initialStateWithMode(mode) },
    React.createElement(FilePermissionDialog, {
      toolUseConfirm,
      toolUseContext,
      onDone: () => {},
      onReject: () => {},
      title: 'Write file',
      path: null,
      parseInput: (i: unknown) => i,
      operationType: 'write',
      workerBadge: undefined,
    }),
  )
  const instance = await render(
    tree,
    { stdout: stdout as unknown as NodeJS.WriteStream },
  )
  // Ink 为异步渲染：等一帧 flush 后再取捕获流（unmount 前帧已写入 stdout）。
  await new Promise(r => setTimeout(r, 150))
  instance.unmount()
  return chunks.join('')
}

describe('D-279-r1 FilePermissionDialog 渲染面（接线判别）', () => {
  it('classifier 危险 reason + 非自动放行 → 渲 A4 危险句（修前 RED / 修后 GREEN）', async () => {
    const out = await renderDialogToText(makeToolUseConfirm(), 'auto')
    expect(out).toContain(DANGEROUS)
  })

  it('decisionReason 缺省 → 不渲 verdict 行（null 路径守卫，无 spurious 行）', async () => {
    const tuc = makeToolUseConfirm({
      permissionResult: { behavior: 'ask' } as never,
    })
    const out = await renderDialogToText(tuc, 'auto')
    expect(out).not.toContain(DANGEROUS)
    expect(out).not.toContain(VERDICT_PREFIX)
  })
})
