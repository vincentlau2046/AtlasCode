/**
 * sessionlist P1（0.1.39）渲染面 func 探针（Ink render + tmp 配置目录 + 真盘
 * fixture session）：
 *
 *   S1 : fork 状态机移底部操作行——行内无「[f 确认 fork]」状态机段（S1 回归守卫），
 *        底部操作行缺省 = SESSION_ROW_HINT 单行固定（旧 bottomMessage 条件行已废）。
 *   S3 : summary 二级行——推 'x' 键展开光标行，dim 二级行「└ <摘要回落
 *        firstPrompt>」现形（变高行模型渲染面探针）。
 *
 * 隔离：`ATLAS_CONFIG_DIR`→mkdtemp + `setOriginalCwd` 假项目根；sessionStorage
 * 链走**动态 import**（import 前注入 env——getAtlasConfigHomeDir memoize 键 =
 * env 值，静态导入会让模块顶层调用抢先缓存真实配置目录，0.1.38 探针同坑）。
 * Ink render 走 Writable 捕获流（同 file-permission-dialog-verdict 渲染面模式）；
 * 输入事件经伪 stdin（PassThrough）push 触发（ink useInput 订阅 data 事件，
 * push 后进入 flowing 模式立即分发）。
 */
import { PassThrough, Writable } from 'stream'
import {
  describe,
  it,
  beforeAll,
  afterAll,
  expect,
} from 'bun:test'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import React from 'react'
import { setOriginalCwd } from '../../src/bootstrap'

const FAKE_ROOT = '/proj/render'

type StorageModule = typeof import('../../src/tui/utils/sessionStorage.js')
type ScreenModule = typeof import('../../src/tui/screens/SessionTreeScreen.js')
type InkModule = typeof import('../../src/tui/ink.js')

let tmp: string
let storage: StorageModule
let Screen: ScreenModule['SessionTreeScreen']
let HINT: string
let inkRender: InkModule['render']

function makeSessionFile(dir: string, content: string): void {
  const lines = [
    JSON.stringify({
      type: 'user',
      uuid: randomUUID(),
      timestamp: '2026-10-05T09:00:00.000Z',
      message: { role: 'user', content },
    }),
    JSON.stringify({
      type: 'assistant',
      uuid: randomUUID(),
      timestamp: '2026-10-05T09:05:00.000Z',
      message: { role: 'assistant', content: 'ok' },
    }),
  ]
  const p = join(dir, `${randomUUID()}.jsonl`)
  writeFileSync(p, lines.join('\n') + '\n')
  utimesSync(p, new Date(Date.parse('2026-10-05T00:00:00Z')), new Date(Date.parse('2026-10-05T00:00:00Z')))
}

type RenderHandle = {
  /** 累计捕获输出（unmount 前 join 即全量渲染流） */
  text: () => string
  /** 记捕获流断点（Ink 重绘用 ANSI 擦除而非整屏覆写，断言新帧须从断点起读） */
  mark: () => number
  textSince: (mark: number) => string
  /** 推一个输入事件（ink useInput 订阅伪 stdin data 事件） */
  push: (s: string) => void
  settle: (ms: number) => Promise<void>
  unmount: () => void
}

function makeFakeStdin(): PassThrough {
  // useInput 走 ink raw-mode（App.handleSetRawMode）：raw-mode 支持判定 =
  // `stdin.isTTY`（App.tsx isRawModeSupported）→ 非 TTY 挂载即抛 ERROR 停在
  // Loading。注入伪 stdin 解耦活终端：isTTY=true + setRawMode/ref/unref no-op
  //（PassThrough 是 Readable 面，无 Socket/TTY 的 ref/unref，须补桩）。
  const stdin = new PassThrough()
  const fakeStdin = stdin as unknown as {
    setRawMode: (m: boolean) => void
    ref: () => void
    unref: () => void
    isTTY?: boolean
  }
  fakeStdin.setRawMode = () => {}
  fakeStdin.ref = () => {}
  fakeStdin.unref = () => {}
  fakeStdin.isTTY = true
  return stdin
}

/** 挂载屏面并返回交互句柄（loadLogs 异步落定后再操作）。 */
async function mountScreen(): Promise<RenderHandle> {
  const chunks: string[] = []
  const stdout = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(String(chunk))
      cb()
    },
  })
  const stdin = makeFakeStdin()
  const tree = React.createElement(Screen, {
    onBack: () => {},
    onResume: async () => {},
  })
  const instance = await inkRender(
    tree,
    {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
    },
  )
  // loadLogs 是异步（load-all 真盘读）：等真盘 I/O 落定
  await new Promise(r => setTimeout(r, 400))
  return {
    text: () => chunks.join(''),
    mark: () => chunks.length,
    textSince: m => chunks.slice(m).join(''),
    push: s => {
      stdin.write(s)
    },
    settle: ms => new Promise(r => setTimeout(r, ms)),
    unmount: () => instance.unmount(),
  }
}

async function renderScreenToText(): Promise<string> {
  const h = await mountScreen()
  const out = h.text()
  h.unmount()
  return out
}

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'atlas-sessionlist-p1-'))
  process.env.ATLAS_CONFIG_DIR = tmp
  setOriginalCwd(FAKE_ROOT)
  // ink render 树包 ThemeProvider（defaultInitialTheme 读 getGlobalConfig）：
  // NODE_ENV=test 时 config 守卫旁路，其他执行面须先开 config 读（幂等）。
  const { enableConfigs } = await import(
    '../../src/tui/utils/config.js'
  )
  enableConfigs()
  storage = await import('../../src/tui/utils/sessionStorage.js')
  const projDir = storage.getProjectDir(FAKE_ROOT)
  mkdirSync(projDir, { recursive: true })
  makeSessionFile(projDir, 'render probe session')
  ;({ render: inkRender } = await import('../../src/tui/ink.js'))
  const screen = await import('../../src/tui/screens/SessionTreeScreen.js')
  Screen = screen.SessionTreeScreen
  HINT = screen.SESSION_ROW_HINT
})

afterAll(() => {
  delete process.env.ATLAS_CONFIG_DIR
  rmSync(tmp, { recursive: true, force: true })
})

describe('S1 fork 状态机移底部操作行（渲染面）', () => {
  it('行内无状态机段，操作行缺省 = 提示行（S1 回归守卫）', async () => {
    const out = await renderScreenToText()
    // 数据行已渲（标题在）
    expect(out).toContain('render probe session')
    // S1 判别：行内「[f 确认 fork]」状态机段不再出现
    expect(out).not.toContain('[f 确认 fork]')
    // 底部操作行缺省 = SESSION_ROW_HINT 单行
    expect(out).toContain(HINT)
  })
})

describe('S3 summary 二级行（渲染面）', () => {
  it('推 x → 二级行「└ <firstPrompt 回落>」现形；再推 x → 新帧收起（变高行模型开/合判别）', async () => {
    const h = await mountScreen()
    // 初始帧：数据行在，二级行未展开
    const initial = h.text()
    expect(initial).toContain('render probe session')
    expect(initial).not.toContain('└ render probe session')

    // 展开：x 键
    const mark1 = h.mark()
    h.push('x')
    await h.settle(300)
    expect(h.textSince(mark1)).toContain('└ render probe session')

    // 收起：再推 x，新帧（自断点起）无二级行
    const mark2 = h.mark()
    h.push('x')
    await h.settle(300)
    expect(h.textSince(mark2)).not.toContain('└ render probe session')
    h.unmount()
  })
})
