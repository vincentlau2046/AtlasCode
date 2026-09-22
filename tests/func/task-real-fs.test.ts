/**
 * task 域 func 真盘测试（C-Deep 切片 3 T7 · H6 清单 ①–⑤ 真盘面）
 *
 * §8.16 / Review H6 六条中 task/bootstrap 侧五条（⑥ hooks 斩断 fail-fast 已在
 * tests/unit/hooks.test.ts 覆盖）：
 *  ① spill 真落盘 + stderr `[stderr] ` 前缀（小 maxMemory 触发，非真写 8MB——
 *     同 D2 5GB cap 覆写 seam idiom，验真盘 I/O 路径不写满盘容量）
 *  ② deleteOutputFile 真删 + 二次 ENOENT 吞错
 *  ③ 5GB cap 同构边界（DiskTaskOutput maxBytes 覆写小值触发截断标记，不真写 5GB；
 *     另断言 MAX_TASK_OUTPUT_BYTES 单一事实源 = 5GB）
 *  ④ TaskId 双口径（type→前缀映射 + 长度/字符集 [prefix][8 小写数字字母]）
 *  ⑤ bootstrap cwd 两状态分离 → 已迁 tests/unit/bootstrap.test.ts（纯状态无 fs，归 unit）
 *
 * 分层纪律：func 层真 fs（mkdtemp / 真 spill 落盘 / 真删 / 真读），diskOutput env
 * 注入真 tmpdir（§8.14 注入序 permissions→task，本层以真 getProjectTempDir 替身注入）。
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  TaskOutput,
  DiskTaskOutput,
  getTaskOutputPath,
  setDiskOutputEnv,
  resetDiskOutputEnv,
  _resetTaskOutputDirForTest,
  _clearOutputsForTest,
  generateTaskId,
} from '../../src/task'
import { MAX_TASK_OUTPUT_BYTES } from '../../src/shared'

// ── 真盘 fixture（task 输出目录 = 注入 getProjectTempDir 替身）────────────
const taskTmp = mkdtempSync(join(tmpdir(), 'atlas-task-func-'))
const SESSION = 'test-session'

beforeAll(() => {
  // §8.14 注入序：组合根以真 getProjectTempDir 替身注入（func 层用真 tmpdir）。
  setDiskOutputEnv({
    getProjectTempDir: () => taskTmp,
    getSessionId: () => SESSION,
  })
})
afterAll(async () => {
  await _clearOutputsForTest()
  resetDiskOutputEnv()
  _resetTaskOutputDirForTest()
  rmSync(taskTmp, { recursive: true, force: true })
})

describe('H6① spill 真落盘 + stderr 前缀', () => {
  test('超 maxMemory 溢写磁盘，stderr chunk 加 [stderr] 前缀（真盘 I/O）', async () => {
    const taskId = 'b1'
    // pipe 模式（stdoutToFile=false）+ 小 maxMemory=200 触发溢写（非真写 8MB）
    const to = new TaskOutput(taskId, null, false, 200)
    to.writeStdout('x'.repeat(500)) // 500 > 200 → 溢写磁盘
    to.writeStderr('e'.repeat(500)) // #disk 已建 → append('[stderr] ' + ...)
    expect(to.isOverflowed).toBe(true)
    await to.flush()

    const content = readFileSync(getTaskOutputPath(taskId), 'utf8')
    expect(content.startsWith('x')).toBe(true)
    expect(content).toContain('[stderr] ')
    expect(content).toContain('e'.repeat(500))
    // 溢写后 getStderr 返 ''（stderr 已并入磁盘文件，旧仓语义）
    expect(to.getStderr()).toBe('')
  })
})

describe('H6② deleteOutputFile 真删 + ENOENT 吞错', () => {
  test('真删输出文件；二次调用（ENOENT）不抛错', async () => {
    const taskId = 'b2'
    const to = new TaskOutput(taskId, null, false, 200)
    to.writeStdout('z'.repeat(500))
    await to.flush()
    const p = getTaskOutputPath(taskId)
    expect(existsSync(p)).toBe(true)

    await to.deleteOutputFile()
    expect(existsSync(p)).toBe(false)

    await expect(to.deleteOutputFile()).resolves.toBeUndefined() // ENOENT 吞错
  })
})

describe('H6③ 5GB cap 同构边界（不真写 5GB）', () => {
  test('MAX_TASK_OUTPUT_BYTES 单一事实源 = 5GB', () => {
    expect(MAX_TASK_OUTPUT_BYTES).toBe(5 * 1024 * 1024 * 1024)
  })

  test('maxBytes 覆写小值 → 超限只写截断标记 + 丢后续 chunk（不真写 5GB）', async () => {
    const taskId = 'b3'
    const dto = new DiskTaskOutput(taskId, 50) // 覆写 seam：50B cap 触发
    dto.append('x'.repeat(200)) // 200 > 50 → capped，写截断标记（非内容）
    dto.append('y'.repeat(200)) // 已 capped → 丢弃
    await dto.flush()

    const content = readFileSync(getTaskOutputPath(taskId), 'utf8')
    expect(content).toContain('output truncated')
    expect(content).toContain('disk cap')
    expect(content).not.toContain('yyyy') // 超限内容被丢弃
  })
})

describe('H6④ TaskId 双口径（前缀 + 长度/字符集）', () => {
  test('type → 前缀映射（local_bash→b / local_agent→a / 未知→x）', () => {
    expect(generateTaskId('local_bash').startsWith('b')).toBe(true)
    expect(generateTaskId('local_agent').startsWith('a')).toBe(true)
    expect(generateTaskId('remote_agent').startsWith('r')).toBe(true)
  })

  test('格式 = [prefix][8 小写数字字母]，总长 9', () => {
    const id = generateTaskId('local_bash')
    expect(id).toMatch(/^b[0-9a-z]{8}$/)
    expect(id.length).toBe(9)
  })
})
