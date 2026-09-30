/** user-e2e 基础工具：ANSI 剥净 / sleep / 计时 / 文件读取（方案 §3 lib 层） */
import { readFileSync } from 'node:fs'

/** ANSI 剥净（script 捕获含 escape 序列；渲染断言只看可见文本，func 探针先例） */
export function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\x1b[=>]/g, '')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
}

export const sleep = (ms: number): Promise<void> =>
  new Promise(r => setTimeout(r, ms))

export function readWhole(p: string): string {
  try {
    return readFileSync(p, 'utf8')
  } catch {
    return ''
  }
}

/** 子串出现次数 */
export function countOcc(s: string, sub: string): number {
  if (!sub) return 0
  let n = 0
  let i = 0
  for (;;) {
    i = s.indexOf(sub, i)
    if (i === -1) return n
    n++
    i += sub.length
  }
}

/** 取剥净后文本的尾部 N 行（证据面） */
export function tailLines(s: string, n = 40): string {
  const lines = s.split('\n').filter(l => l.length > 0)
  return lines.slice(-n).join('\n')
}

export function nowIso(): string {
  return new Date().toISOString()
}
