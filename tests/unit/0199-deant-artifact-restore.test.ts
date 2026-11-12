/**
 * 0.1.99 S1a 步 2 附带发现判别格 2 支（f4 裁处 §9 @86ea0d12：并入本波登记修补）：
 *
 *   ① 前缀粘连 artifact 全清格：de-Anthropic 全局替换（`claude` → `getConfigDirName()`）
 *      误伤产生的粘连 token（bingetConfigDirName / butgetConfigDirName / ifgetConfigDirName /
 *      thegetConfigDirName / forgetConfigDirName / tmpgetConfigDirName …）src 树零残留。
 *      真伤实证：installer 原生安装符号链接路径 `~/.local/bin/atlas` 被写成
 *      `~/.local/bingetConfigDirName()`（符号链接创建路径已坏）。
 *   ② Doctor.tsx 项目 agents 目录字面量格：`join(getOriginalCwd(), "getConfigDirName()", …)`
 *      字符串字面量（join 出目录名字面 "getConfigDirName()"，检测恒落垃圾目录）改回
 *      真函数调用 getConfigDirNameForProject()（0.1.99 row F 项目根锚出口）。
 */
import { describe, test, expect } from 'bun:test'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const SRC_ROOT = join(import.meta.dir, '..', '..', 'src')

function walkTsFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) out.push(...walkTsFiles(p))
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

describe('de-Anthropic 字符串误伤复原（0.1.99 附带发现，f4 §9 裁处）', () => {
  test('① src 树零前缀粘连 artifact token（binget/butget/ifget/theget/forgetget/tmpget…）', () => {
    // 合法代码中 getConfigDirName 前一位不可能是字母（粘连=替换误伤指纹）；
    // ForProject 出口名不含该前缀粘连形。
    const re = /[A-Za-z]getConfigDirName\b/
    const offenders: string[] = []
    for (const file of walkTsFiles(SRC_ROOT)) {
      const src = readFileSync(file, 'utf8')
      if (re.test(src)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })

  test('② Doctor.tsx 项目 agents 目录 = 真函数调用（ForProject），零 "getConfigDirName()" 字面量', () => {
    const src = readFileSync(
      join(SRC_ROOT, 'tui', 'screens', 'Doctor.tsx'),
      'utf8',
    )
    expect(src).toContain('join(getOriginalCwd(), getConfigDirNameForProject(), "agents")')
    expect(src.includes('"getConfigDirName()"')).toBe(false)
  })
})
