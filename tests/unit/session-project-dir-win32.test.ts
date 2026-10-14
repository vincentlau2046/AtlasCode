/**
 * 0.1.67 C-3 — Windows 写侧 case 归一（getProjectDir）判别单测。
 *
 * C-定因③：写侧 getProjectDir(getOriginalCwd()) = sanitizePath(cwd) 大小写敏感、
 * 无归一 → Windows `C:\Users\vince` vs `c:\users\vince` 产生两个 projects 目录
 * → 会话分裂。修 = win32 上 cwd 先 lowercase 归一（与读侧 caseInsensitive 对齐），
 * 非 win32 零行为变更。
 *
 * 判别：win32 mock 下大小写异 case cwd → 同项目目录（修前红→修后绿）；
 * 非 win32 零行为变更（case 原样透传）。
 *
 * 无网络/无真实磁盘（ATLAS_CONFIG_DIR 指 tmp，仅拼路径不写盘）。
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { getProjectDir } from '../../src/tui/utils/sessionStoragePortable.js'

const realPlatform = process.platform
const CONFIG_DIR = '/tmp/atlas-0167-c3-test'

// mock process.platform（可覆写）
function setPlatform(p: string): void {
  Object.defineProperty(process, 'platform', { value: p, configurable: true })
}

beforeAll(() => {
  // memoize(getAtlasConfigHomeDir) 以 ATLAS_CONFIG_DIR 为键 → 设新值取新路径
  process.env.ATLAS_CONFIG_DIR = CONFIG_DIR
})

afterAll(() => {
  setPlatform(realPlatform)
  delete process.env.ATLAS_CONFIG_DIR
})

describe('C-3 win32 写侧 case 归一', () => {
  test('win32：大小写异 case cwd → 同项目目录', () => {
    setPlatform('win32')
    const upper = getProjectDir('C:\\Users\\vince\\proj')
    const lower = getProjectDir('c:\\users\\vince\\proj')
    expect(lower).toBe(upper)
  })

  test('win32：归一 = lowercase 后 sanitize（与读侧小写化对齐）', () => {
    setPlatform('win32')
    const mixed = getProjectDir('C:\\Users\\Vince')
    const lower = getProjectDir('c:\\users\\vince')
    expect(mixed).toBe(lower)
  })

  test('非 win32（linux）：case 原样透传，零行为变更', () => {
    setPlatform('linux')
    const asIs1 = getProjectDir('/home/vince/proj')
    const asIs2 = getProjectDir('/home/vince/proj')
    expect(asIs1).toBe(asIs2)
    // linux 大小写敏感：不同 case = 不同目录（与原 sanitizePath 行为一致）
    const differentCase = getProjectDir('/home/Vince/proj')
    expect(getProjectDir('/home/vince/proj')).not.toBe(differentCase)
  })

  test('非 win32（darwin）：同样原样透传', () => {
    setPlatform('darwin')
    // mac 大小写敏感（默认 APFS case-sensitive 情形）= 原样透传
    expect(getProjectDir('/Users/Vince')).not.toBe(getProjectDir('/users/vince'))
  })
})
