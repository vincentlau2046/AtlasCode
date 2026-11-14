/**
 * 0.1.109 W-AB3 ②支链修 unit 判别格（f4 §8 批复 @8ab690ca + §8b 改形批复
 * @feced92a；lock-face §1 落码清单源面锁定）。零盘零网络（literal-inventory
 * 范型源断言）：
 *
 *  - 组合根注入面：print.ts run 级 bounded duck cache 单实例（cli 域
 *    headlessFileStateCache 工厂恰 1 处 + 声明先于 makeCtx + makeCtx 引用
 *    注入非自建——canUseTool :1177 与 loopDeps :1290 两调用点引用同一
 *    cache，单源拓扑 lock-face 点 4）。
 *  - 型面扩面：SdkToolUseContext 增 readFileState?: ReadFileState
 *    （additive 可选成员；type import 经 engine 根门面 re-export——§8b
 *    改形裁定 cli→tui 依赖被 boundaries 拦截 DEP-3）。
 *  - 门体零触碰（格 3/禁项）：engine EditTool 可选链降级面原样
 *    （readFileState?.get + errorCode 6 文案逐字保留）；stale-edit 门
 *    content-compare fallback 原样。
 *  - 三 lane 拓扑（lock-face 点 4）：TUI REPL useRef 自持 + MCP 自持
 *    原样在场（本波零触碰直证）。
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, test } from 'bun:test'

const REPO = join(import.meta.dir, '..', '..')
const printSrc = readFileSync(join(REPO, 'src/cli/print.ts'), 'utf8')
const sdkTypesSrc = readFileSync(join(REPO, 'src/cli/sdkTypes.ts'), 'utf8')
const editSrc = readFileSync(
  join(REPO, 'src/engine/tools/files/fileEditTool.ts'),
  'utf8',
)
const replSrc = readFileSync(join(REPO, 'src/tui/screens/REPL.tsx'), 'utf8')
const mcpSrc = readFileSync(join(REPO, 'src/tui/entrypoints/mcp.ts'), 'utf8')
const engineFacadeSrc = readFileSync(join(REPO, 'src/engine/index.ts'), 'utf8')

describe('W-AB3 ②支链修组合根注入（0.1.109 f4 §8 @8ab690ca + §8b @feced92a）', () => {
  test('print.ts run 级单实例：cli 域工厂恰 1 处 + 先于 makeCtx + 引用注入', () => {
    expect(printSrc.match(/createHeadlessFileStateCache\(/g)?.length).toBe(1)
    expect(printSrc).toContain(
      "import { createHeadlessFileStateCache } from './headlessFileStateCache.js'",
    )
    const cacheDecl = printSrc.indexOf('const readFileStateCache =')
    const makeCtxDecl = printSrc.indexOf('const makeCtx = (): SdkToolUseContext')
    expect(cacheDecl).toBeGreaterThan(-1)
    expect(makeCtxDecl).toBeGreaterThan(cacheDecl)
    // makeCtx 体内 = 引用注入（非二次构造）；run 内恰 1 注入点
    expect(printSrc.match(/readFileState: readFileStateCache/g)?.length).toBe(1)
    // §8b 改形：cli→tui 依赖清零（旧形 import 不在场）
    expect(printSrc).not.toContain('tui/utils/fileStateCache')
  })

  test('sdkTypes.ts：SdkToolUseContext 扩可选成员（engine ReadFileState duck）+ additive', () => {
    expect(sdkTypesSrc).toContain("import type { ReadFileState } from '../engine'")
    expect(sdkTypesSrc).toMatch(/readFileState\?: ReadFileState/)
    // additive：缺省行为面（可选链降级）未移除——可选成员非必填
    expect(sdkTypesSrc).not.toMatch(/readFileState: ReadFileState/)
    expect(sdkTypesSrc).not.toContain('tui/utils/fileStateCache')
  })

  test('engine 根门面 re-export：FileState/ReadFileState duck 型面在场（§8b 通道）', () => {
    expect(engineFacadeSrc).toContain(
      "export type { FileState, ReadFileState } from './tools/files/filesToolInput'",
    )
  })

  test('门体零触碰：EditTool 可选链 + errorCode 6 文案 + stale fallback 原样', () => {
    expect(editSrc).toContain('ctx.readFileState?.get(absoluteFilePath)')
    expect(editSrc).toContain('ctx.readFileState?.set(absoluteFilePath, {')
    expect(editSrc).toContain(
      "'File has not been read yet. Read it first before writing to it.'",
    )
    // :286-304 content-compare fallback（禁改面）原样
    expect(editSrc).toContain('isFullRead && fileContent === readTimestamp')
    expect(editSrc).toContain(
      "'File has been modified since read, either by the user or by a linter. Read it again before attempting to write it.'",
    )
  })

  test('三 lane 拓扑：TUI REPL 自持 + MCP 自持零触碰', () => {
    expect(replSrc).toContain('readFileState: readFileState.current')
    expect(mcpSrc).toContain('createFileStateCacheWithSizeLimit(')
  })
})
