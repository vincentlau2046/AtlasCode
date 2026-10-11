/**
 * FX-26（0.1.51 C-2，CC 2.1.105）CLI 重启后按键丢失——输入管线回归探针
 * （工单 §1.6 verify 项：丢键证实则补输入管线〔中体量→知会用户〕；本探针
 * 为管线既有面钉桩，PTY 行为探针〔重启/切换后立即输入无丢键〕归 e2e lane
 * §3 TUI 渲染族既有 PTY 探针）。
 *
 * verify 定面（代码层）：启动期按键面已备——earlyInput.ts 捕获缓冲
 * （processChunk：可打印字符/CRLF/退格 grapheme 删除/ESC 序列跳过/
 * Ctrl+C·D 控制位）+ main.tsx seedEarlyInput 预填 + REPL.tsx 挂载
 * consumeEarlyInput 消费 + ink App.tsx stopCapturingEarlyInput 交 Ink
 * 接管（stdin raw mode 单点切换不双听）= 管线结构闭环。本探针钉
 * 缓冲生命周期 + TTY 门控面（非 TTY/单测进程捕获恒不启动——-p/管道
 * 安全面）。
 */
import { describe, test, expect } from 'bun:test'
import {
  consumeEarlyInput,
  hasEarlyInput,
  isCapturingEarlyInput,
  seedEarlyInput,
  startCapturingEarlyInput,
  stopCapturingEarlyInput,
} from '../../src/tui/utils/earlyInput.js'

describe('FX-26 启动期输入管线回归探针（无 PTY 面）', () => {
  test('① TTY 门控面：非 TTY 进程（单测管道 stdin）捕获恒不启动', () => {
    startCapturingEarlyInput()
    // stdin 非 TTY（-p/管道/单测）→ 不置 raw mode（保 ISIG，Ctrl+C 可中断）
    expect(isCapturingEarlyInput()).toBe(false)
  })

  test('② seed → has → consume 生命周期：预填文本 trim 后消费 + 缓冲清空', () => {
    seedEarlyInput('  hello 重启探针 \n')
    expect(hasEarlyInput()).toBe(true)
    expect(consumeEarlyInput()).toBe('hello 重启探针')
    // 消费即停捕获 + 清缓冲
    expect(hasEarlyInput()).toBe(false)
    expect(isCapturingEarlyInput()).toBe(false)
  })

  test('③ 空缓冲 consume → 空串（无预填不炸，REPL 挂载缺省面）', () => {
    expect(consumeEarlyInput()).toBe('')
    expect(hasEarlyInput()).toBe(false)
  })

  test('④ stop 幂等面：未捕获时 stop 无副作用', () => {
    stopCapturingEarlyInput()
    stopCapturingEarlyInput()
    expect(isCapturingEarlyInput()).toBe(false)
    expect(hasEarlyInput()).toBe(false)
  })
})
