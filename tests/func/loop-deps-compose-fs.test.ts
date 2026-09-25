/**
 * Port 5（SessionMemoryPort）壳实现 I/O 语义 真盘测试（S-E2 A6，§8.52）。
 *
 * unit 层（loop-deps-compose T-6）只断函数形；本文件 func 真盘层断言
 * 壳实现契约（旧仓 getSessionMemoryContent/setupSessionMemoryFile 语义）：
 *   - save → 真盘落盘（目录 0o700 / 文件 0o600 逐字旧仓 mode）
 *   - save → load 往返（内容逐字）
 *   - load 文件不存在 → null（isFsInaccessible ENOENT 支，旧仓逐字）
 *   - 路径 = `<projects>/sanitize(cwd)/<sessionId>/session-memory/summary.md`
 *     （getCwd → 冻结 getOriginalCwd A-1 值 delta；cwd/sessionId 注入值
 *     可区分——成员误用（id 换 cwd）路径判别）
 *
 * 分层纪律：func 层真 I/O（mkdtemp 真盘 + ATLAS_CONFIG_DIR 重定向 +
 * setSessionEnv 注真 env 成员）；--isolate 每文件独立进程。
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { mkdtempSync, rmSync, statSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { getProjectDir, setSessionEnv } from '../../src/engine'
import { createSessionMemoryPort } from '../../src/atlascode/adapters/sessionMemoryPortAdapter'

const FAKE_CWD = '/func/proj-cwd'
const SESSION_ID = 'func-sess-1'

let tmpRoot: string
let savedConfigDir: string | undefined

function memoryFile(): string {
  return join(getProjectDir(FAKE_CWD), SESSION_ID, 'session-memory', 'summary.md')
}

beforeAll(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'atlas-se2-port5-'))
  savedConfigDir = process.env.ATLAS_CONFIG_DIR
  process.env.ATLAS_CONFIG_DIR = tmpRoot
  // session env 注真成员（A5 同款注入口；getProjectsDir 域缺省读
  // ATLAS_CONFIG_DIR env → 本 tmp 根，record 写面 FROZEN projects 车道）
  setSessionEnv({
    getOriginalCwd: () => FAKE_CWD,
    getSessionId: () => SESSION_ID,
  })
})

afterAll(() => {
  if (savedConfigDir === undefined) delete process.env.ATLAS_CONFIG_DIR
  else process.env.ATLAS_CONFIG_DIR = savedConfigDir
  rmSync(tmpRoot, { recursive: true, force: true })
})

describe('Port 5 壳实现真盘语义（S-E2 A6）', () => {
  test('save → 真盘落盘（目录 0o700 / 文件 0o600 旧仓逐字 mode）', async () => {
    const port = createSessionMemoryPort()
    await port.save('roundtrip-content-1')
    const file = memoryFile()
    expect(existsSync(file)).toBe(true)
    // mode 逐字旧仓（mkdir 0o700 + writeFile 0o600；umask 只剥不增，断言稳定）
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(statSync(join(getProjectDir(FAKE_CWD), SESSION_ID, 'session-memory')).mode & 0o777).toBe(
      0o700,
    )
  })

  test('save → load 往返 + ENOENT → null（isFsInaccessible 支）', async () => {
    const port = createSessionMemoryPort()
    await port.save('roundtrip-content-2')
    expect(await port.load()).toBe('roundtrip-content-2')
    // 文件不存在 → null（旧 getSessionMemoryContent 逐字：isFsInaccessible
    // ENOENT/EACCES/EPERM/ENOTDIR/ELOOP → null，其余 I/O 错误抛出）
    rmSync(memoryFile())
    expect(await port.load()).toBeNull()
  })
})
