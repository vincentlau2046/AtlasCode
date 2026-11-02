/**
 * 0.1.86 K6 · 任务 F · 输入行/sandbox/paste/权限提示（工单 §F：K6-11/12/15/7）。
 *
 * 件与定因（Main 锁面实证 2026-11-03）：
 *
 * K6-11 mod Input rows（Enter 提交 / Shift+Enter 换行 / 反斜杠+Enter 换行）
 * —— 锁面裁定：**fork 无缺陷**。useTextInput.handleEnter 三支完整
 * （反斜杠+Enter 剥反斜杠插 \n / key.meta||key.shift 插 \n / 其余
 * onSubmit(originalValue)），mapKey default 分支另有 SSH-coalesced chunk
 * 尾 \r 剥离 + coalesced submit。上游件锚 = Input rows **显示** prop（可见
 * 行数），fork 等价物 = maxVisibleLines（BaseTextInput 无 rows prop，grep
 * 零命中）→ 无修复对象。本组 = 三路径行为锚测试（修前即真），防回归。
 *
 * K6-12 无 2004（bracketed-paste）终端长粘贴丢字 —— 定因：SSH/tmux 把
 * backspace 以裸 DEL（\x7f）混在文本 chunk 里送达（"de\x7ff"），useTextInput
 * 的 DEL 分支只数 DEL 个数、从光标处删除 N 个字符，**chunk 内全部非 DEL
 * 文本被静默丢弃**（"abc" + "de\x7ff" → "ab"，de 与 f 全丢）。修 = 顺序
 * 回放：先对整 chunk 应用与 mapKey default 分支完全相同的归一化
 * （stripAnsi + 尾 \r 剥离 + \r→\n），再逐 code point 遍历——文本 run 累积
 * insert，DEL 触发 deleteTokenBefore() ?? backspace()；保持早退（不进
 * coalesced-Enter submit 检查，与现状一致）。
 *
 * K6-15 权限提示 keycap emoji 过早截断 —— 定因（上游 CC 2.1.299 同域件）：
 * 完整 keycap 序列（base∈[0-9#*] + VS16 + U+20E3）在 Bun.stringWidth /
 * npm string-width / fork JS fallback 三处全测宽 2，而终端实际渲染 1 cell
 * → 判宽过宽 → verdict/reason 行过早截断换行。fork 内部矛盾证据：
 * isZeroWidth(0x20E3)=true（combining 范围）但 getEmojiWidth 对完整 keycap
 * 走 generic return 2；不完整 keycap（digit+VS16）已有显式 return 1 先例。
 * 修 = fork 自己的宽度层 src/tui/ink/stringWidth.ts 双路径定 keycap=1：
 * ①JS fallback getEmojiWidth 顶部判断；②Bun wrapper 守卫 + 正则计数减 1。
 * **登记三项**：(a) ZWJ 连字 emoji（family）三处全测 2 且终端渲染 2 = 正确，
 * upstream 的 joined 半件锚定 upstream 自身 per-code-point 测量缺陷，fork
 * 从未如此（无缺陷不修）；(b) wrap 路径 residual——wrap='wrap' 走 wrapAnsi
 * 适配器（生产 node=npm wrap-ansi、dev=Bun.wrapAnsi），内部测量 keycap=2
 * 不可修（需替换实现），仅边界行受影响，登记 divergence；truncate 面
 * （truncateToWidth/truncateStartToWidth/sliceAnsi 族）随 stringWidth 修复
 * 全修复；(c) 终端歧义 soft 登记（渲染件 hard=宽度函数值断言，visual=soft，
 * Review Focus 5 口径）。
 *
 * K6-7 /sandbox exclude 保存失败仍报成功 —— 定因：sandboxCompat.addToExcludedCommands
 * 丢弃 updateSettingsForSource 返回的 {error}；sandbox-toggle.tsx exclude 支
 * 无条件 color('success') 报成功。修 = addToExcludedCommands 捕获 error 非
 * null 时 throw（登记偏离「旧仓 compat.ts 逐字」头注）+ sandbox-toggle.tsx
 * try/catch → color('error') 显式报错。文案「Sandbox commands」全仓零命中
 * → [B:1P] 登记（fork "excluded commands" 与 excludedCommands 语义一致）。
 * 测试 = setOriginalCwd 临时目录 + 损坏 settings.local.json（读盘不动盘的
 * 真实错误路径，零 mock 零真实 ~/.atlas 写入）。
 *
 * gate ① 口径（任务 D/E 先例）：K6-12/15/7 行为红（修前断言红）；K6-11
 * 锚组修前即真（无缺陷件登记处置口径）。stringWidthJavaScript 导出为零
 * 行为测试使能（node 生产路径 bunStringWidth=null 走此实现，需可测）。
 */
import { describe, expect, test, beforeAll, afterAll, beforeEach } from 'bun:test'
import { PassThrough } from 'node:stream'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import React from 'react'

import {
  stringWidth,
  stringWidthJavaScript,
} from '../../src/tui/ink/stringWidth.js'
import { truncateToWidth } from '../../src/tui/utils/truncate.js'
import { useTextInput } from '../../src/tui/hooks/useTextInput.js'
import type { Key } from '../../src/tui/ink.js'
import {
  AppStateProvider,
  getDefaultAppState,
} from '../../src/tui/state/AppState.js'
import { render } from '../../src/tui/ink.js'
import { addToExcludedCommands } from '../../src/tui/sandboxCompat.js'
import { getSettingsFilePathForSource } from '../../src/tui/utils/settings/settings.js'
import { resetSettingsCache } from '../../src/tui/utils/settings/settingsCache.js'
import {
  getOriginalCwd,
  setOriginalCwd,
} from '../../src/bootstrap/state.js'

// ---------------------------------------------------------------- K6-15

describe('K6-15 · keycap emoji 宽度（权限提示过早截断）', () => {
  test('RED→GREEN：完整 keycap 序列宽 1（Bun wrapper 路径）', () => {
    expect(stringWidth('1️⃣')).toBe(1)
    expect(stringWidth('#️⃣')).toBe(1)
    expect(stringWidth('*️⃣')).toBe(1)
    expect(stringWidth('0️⃣')).toBe(1)
  })

  test('RED→GREEN：多 keycap 计数正确', () => {
    expect(stringWidth('1️⃣2️⃣3️⃣')).toBe(3)
    expect(stringWidth('1️⃣#️⃣')).toBe(2)
  })

  test('JS fallback 路径同值（node 生产路径）', () => {
    expect(stringWidthJavaScript('1️⃣')).toBe(1)
    expect(stringWidthJavaScript('#️⃣')).toBe(1)
    expect(stringWidthJavaScript('1️⃣2️⃣3️⃣')).toBe(3)
  })

  test('锚（修前即真）：不完整 keycap（digit+VS16）宽 1', () => {
    expect(stringWidth('1️')).toBe(1)
    expect(stringWidthJavaScript('1️')).toBe(1)
  })

  test('锚：ZWJ 连字 emoji 宽 2 不受扰（登记 a：fork 无缺陷）', () => {
    const family = '\u{1F468}‍\u{1F469}‍\u{1F467}'
    expect(stringWidth(family)).toBe(2)
    expect(stringWidthJavaScript(family)).toBe(2)
  })

  test('锚：普通 VS16 emoji（❤️）宽 2 不受扰', () => {
    expect(stringWidth('❤️')).toBe(2)
    expect(stringWidthJavaScript('❤️')).toBe(2)
  })

  test('锚：keycap 混入纯文本（宽度逐格累加）', () => {
    expect(stringWidth('a1️⃣b')).toBe(3)
    expect(stringWidthJavaScript('a1️⃣b')).toBe(3)
  })

  test('RED→GREEN：truncateToWidth 判别（权限提示截断面随宽度层修复）', () => {
    // 修前：keycap 测宽 6 > 4 → 截成 '1️⃣…'（过早截断 = 用户可见 bug）
    // 修后：3 keycap = 3 cells ≤ 4 → 整行保留（无截断无省略号）
    expect(truncateToWidth('1️⃣2️⃣3️⃣', 4)).toBe('1️⃣2️⃣3️⃣')
  })

  test('锚：truncate 不切半 keycap（grapheme 完整性保持）', () => {
    expect(truncateToWidth('1️⃣2️⃣3️⃣', 2)).toBe('1️⃣…')
  })

  test('锚：ASCII 宽度行为不受扰', () => {
    expect(stringWidth('ab')).toBe(2)
    expect(truncateToWidth('abcdef', 4)).toBe('abc…')
  })
})

// ------------------------------------------------- K6-11 / K6-12 harness

type CapturedState = ReturnType<typeof useTextInput>
const captured: { state: CapturedState | null; getValue: () => string } = {
  state: null,
  getValue: () => '',
}
const events = { submits: [] as string[] }

function TextInputHarness(props: { multiline?: boolean }) {
  const [value, setValue] = React.useState('')
  const [offset, setOffset] = React.useState(0)
  const state = useTextInput({
    value,
    onChange: (v: string) => setValue(v),
    onSubmit: (v: string) => {
      events.submits.push(v)
    },
    onExit: () => {},
    externalOffset: offset,
    onOffsetChange: (o: number) => setOffset(o),
    multiline: props.multiline ?? true,
    columns: 80,
    focus: true,
  })
  captured.state = state
  captured.getValue = () => value
  return null
}

async function renderHarness(multiline?: boolean) {
  events.submits = []
  const fake = new PassThrough() as any
  fake.columns = 80
  fake.rows = 24
  fake.write = () => {}
  const inst = await render(
    React.createElement(
      AppStateProvider,
      { initialState: getDefaultAppState() },
      React.createElement(TextInputHarness, { multiline }),
    ),
    fake as any,
  )
  await new Promise(r => setTimeout(r, 80))
  return inst
}

const tick = () => new Promise(r => setTimeout(r, 50))
const press = (input: string, key: Partial<Key>) =>
  captured.state!.onInput(input, key as Key)

describe('K6-11 · mod Input rows 三路径（Enter/Shift+Enter/反斜杠+Enter）', () => {
  test('锚（修前即真）：Enter 提交', async () => {
    const inst = await renderHarness()
    try {
      press('hi', {})
      await tick()
      expect(captured.getValue()).toBe('hi')
      press('\r', { return: true })
      await tick()
      expect(events.submits).toEqual(['hi'])
    } finally {
      inst.unmount?.()
    }
  })

  test('锚：Shift+Enter 换行不提交', async () => {
    const inst = await renderHarness()
    try {
      press('hi', {})
      await tick()
      press('\r', { return: true, shift: true })
      await tick()
      expect(captured.getValue()).toBe('hi\n')
      expect(events.submits).toEqual([])
    } finally {
      inst.unmount?.()
    }
  })

  test('锚：反斜杠+Enter 剥反斜杠换行', async () => {
    const inst = await renderHarness()
    try {
      press('a\\', {})
      await tick()
      press('\r', { return: true })
      await tick()
      expect(captured.getValue()).toBe('a\n')
      expect(events.submits).toEqual([])
    } finally {
      inst.unmount?.()
    }
  })

  test('锚：单行模式（multiline=false）反斜杠+Enter 走提交', async () => {
    const inst = await renderHarness(false)
    try {
      press('a\\', {})
      await tick()
      press('\r', { return: true })
      await tick()
      expect(events.submits).toEqual(['a\\'])
    } finally {
      inst.unmount?.()
    }
  })

  test('锚：SSH-coalesced chunk（"o\\r" 无 return 键）= 提交', async () => {
    const inst = await renderHarness()
    try {
      press('o\r', {})
      await tick()
      expect(events.submits).toEqual(['o'])
      expect(captured.getValue()).toBe('o')
    } finally {
      inst.unmount?.()
    }
  })
})

describe('K6-12 · 无 2004 终端长粘贴 DEL 丢字（顺序回放）', () => {
  test('RED→GREEN：文本-DEL-文本交错不丢字', async () => {
    const inst = await renderHarness()
    try {
      press('abc', {})
      await tick()
      expect(captured.getValue()).toBe('abc')
      // SSH/tmux 裸 DEL backspace：chunk 内 'de'、DEL、'f' 交错
      press('de\x7ff', {})
      await tick()
      expect(captured.getValue()).toBe('abcdf') // 现状 'ab'（de/f 全丢）
    } finally {
      inst.unmount?.()
    }
  })

  test('多 DEL：每 DEL 各删一符（deleteTokenBefore??backspace 语义保持）', async () => {
    const inst = await renderHarness()
    try {
      press('abcdef', {})
      await tick()
      press('xy\x7f\x7fz', {})
      await tick()
      expect(captured.getValue()).toBe('abcdefz')
    } finally {
      inst.unmount?.()
    }
  })

  test('锚：真实 backspace 键事件（key.backspace）不进 DEL 分支', async () => {
    const inst = await renderHarness()
    try {
      press('abc', {})
      await tick()
      press('\x7f', { backspace: true })
      await tick()
      expect(captured.getValue()).toBe('ab')
    } finally {
      inst.unmount?.()
    }
  })

  test('锚：无 DEL 的普通 chunk 照常插入', async () => {
    const inst = await renderHarness()
    try {
      press('hello', {})
      await tick()
      expect(captured.getValue()).toBe('hello')
    } finally {
      inst.unmount?.()
    }
  })

  test('锚：chunk 尾随 \\r（DEL + coalesced Enter）不作为内容插入', async () => {
    const inst = await renderHarness()
    try {
      press('abc', {})
      await tick()
      press('de\x7ff\r', {})
      await tick()
      expect(captured.getValue()).toBe('abcdf')
      // \x7f 分支早退不进 coalesced-Enter submit 检查（与现状一致）
      expect(events.submits).toEqual([])
    } finally {
      inst.unmount?.()
    }
  })
})

// ---------------------------------------------------------------- K6-7

describe('K6-7 · /sandbox exclude 保存失败显式报错', () => {
  let tmp: string
  let savedCwd: string

  beforeAll(() => {
    savedCwd = getOriginalCwd()
    tmp = mkdtempSync(path.join(tmpdir(), 'wave0186-k6-7-'))
    setOriginalCwd(tmp)
  })

  afterAll(() => {
    setOriginalCwd(savedCwd)
    resetSettingsCache()
    rmSync(tmp, { recursive: true, force: true })
  })

  beforeEach(() => {
    resetSettingsCache()
  })

  const settingsPath = () => getSettingsFilePathForSource('localSettings')!

  test('RED→GREEN：settings.local.json 损坏时 addToExcludedCommands throw', () => {
    mkdirSync(path.dirname(settingsPath()), { recursive: true })
    writeFileSync(settingsPath(), '{"sandbox": { broken')
    // 现状：{error} 被丢弃、静默返回 pattern（保存失败仍报成功）
    expect(() => addToExcludedCommands('npm run')).toThrow()
  })

  test('锚（修前即真）：正常路径写入成功且返回 pattern（无 updates 时 raw 透传）', () => {
    mkdirSync(path.dirname(settingsPath()), { recursive: true })
    writeFileSync(settingsPath(), '{}')
    // 无 permissionUpdates → commandPattern = command 原样（sandbox-toggle
    // 调用形态；':*' 提取仅来自 Bash addRules 规则面）
    const pattern = addToExcludedCommands('npm run')
    expect(pattern).toBe('npm run')
    const written = readFileSync(settingsPath(), 'utf8')
    expect(written).toContain('excludedCommands')
    expect(written).toContain('npm run')
  })

  test('锚：permissionUpdates Bash 规则提取 prefix', () => {
    mkdirSync(path.dirname(settingsPath()), { recursive: true })
    writeFileSync(settingsPath(), '{}')
    const pattern = addToExcludedCommands('git', [
      {
        type: 'addRules',
        rules: [{ toolName: 'Bash', ruleContent: 'git status:*' }],
      },
    ])
    expect(pattern).toBe('git status:*')
  })

  test('锚：重复 exclude 幂等（不重复写条目）', () => {
    mkdirSync(path.dirname(settingsPath()), { recursive: true })
    writeFileSync(settingsPath(), '{}')
    const p1 = addToExcludedCommands('npm test')
    const p2 = addToExcludedCommands('npm test')
    expect(p1).toBe('npm test')
    expect(p2).toBe('npm test')
    const occurrences = readFileSync(settingsPath(), 'utf8').match(
      /npm test/g,
    )
    expect(occurrences).toHaveLength(1)
  })
})
