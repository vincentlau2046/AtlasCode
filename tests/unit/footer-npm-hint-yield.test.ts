/**
 * O-11（0.1.34，e2e O-11）：npm 安装提示在场期间右栏槽位让位判别单测（渲染面）。
 *
 * 缺陷定因（e2e 用户视角报告 O-11）：footer 单行三通道（状态段 / tips / 15s npm
 * 提示）80 列窄屏互相挤 + 双色竞争。修（src 侧，80 列 harness 断言归 e2e C3 不占
 * src）：① 通道优先级 = 状态段 > tips > 提示 按序截断（PromptInputFooter 左栏
 * flexShrink=0 状态段永不截断，右栏 tips 槽保位、npm 提示先截）② 提示在场期间
 * 右栏（effort / 闲时 tip）让位，提示独占 footer 行 15s，超时后 tips 自复轮播。
 *
 * 本文件判别：AppState 种 `notifications.current.key='npm-deprecation-warning'`
 * 真挂 PersistentFooterIndicator——提示在场 → 右栏不渲 tips（修前 RED：tips 照渲
 * 双显互挤；修后 GREEN：让位）；提示缺席 → 闲时 tip 正常轮播（回归护栏）。
 */
import { Writable } from 'stream'
import { describe, expect, it } from 'bun:test'
import React from 'react'
import { render } from '../../src/tui/ink.js'
import { PersistentFooterIndicator } from '../../src/tui/components/PromptInput/PersistentFooterIndicator.js'
import { TIP_PREFIX } from '../../src/tui/components/StatusLine/useDynamicTips.js'
import {
  AppStateProvider,
  getDefaultAppState,
  type AppState,
} from '../../src/tui/state/AppState.js'

const HINT_KEY = 'npm-deprecation-warning'
const IDLE_TIP = '/model 切换模型' // IDLE_TIPS[0]，轮播初值确定

function seedState(hintActive: boolean): AppState {
  const base = getDefaultAppState()
  return {
    ...base,
    notifications: {
      ...base.notifications,
      current: hintActive
        ? { key: HINT_KEY, priority: 'high', text: 'npm hint', color: 'inactive' }
        : base.notifications.current,
    },
  } as unknown as AppState
}

async function renderIndicatorToText(hintActive: boolean): Promise<string> {
  const chunks: string[] = []
  const stdout = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(String(chunk))
      cb()
    },
  })
  const tree = React.createElement(
    AppStateProvider,
    { initialState: seedState(hintActive) },
    React.createElement(PersistentFooterIndicator, {
      messagesRef: { current: null } as never,
    }),
  )
  const instance = await render(tree, {
    stdout: stdout as unknown as NodeJS.WriteStream,
  })
  // Ink 异步渲染：等一帧 flush 后取捕获流（同 file-permission-dialog-verdict harness）
  await new Promise(r => setTimeout(r, 150))
  instance.unmount()
  return chunks.join('')
}

describe('O-11 npm 提示在场右栏让位（0.1.34 渲染面判别）', () => {
  it('提示在场（key=npm-deprecation-warning）→ 右栏让位，闲时 tip 不渲（修前 RED / 修后 GREEN）', async () => {
    const out = await renderIndicatorToText(true)
    expect(out).not.toContain(IDLE_TIP)
    expect(out).not.toContain(TIP_PREFIX)
  })

  it('提示缺席 → 闲时 tip 正常轮播（回归护栏）', async () => {
    const out = await renderIndicatorToText(false)
    expect(out).toContain(IDLE_TIP)
    expect(out).toContain(TIP_PREFIX)
  })
})
