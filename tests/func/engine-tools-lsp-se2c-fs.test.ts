/**
 * engine/tools/lsp S-E2c（§8.67 D 波 LSP 域 + LSPTool 本体子波）func 层：
 * fake LSP server 全链（R6 零模型先例：真 spawn 子进程 + 真盘 + 真
 * stdio JSON-RPC 帧，零 LLM 调用）。
 *
 * 全链覆盖（LSPTool.call 4 接缝链的活面）：
 *   call → manager（isFileOpen 判支）→ instance（ensureServerStarted
 *   懒启动）→ client（spawn + initialize 握手 + Content-Length 分帧）
 *   → fake server（node 子进程，最小 stdio JSON-RPC 服务端）→ formatter
 *   → LSPToolOutput 判别输出。
 *
 *   1. initialize success + isLspConnected（0 server 断连 vs 1 server
 *      活面，unit 层已覆盖 4 态判定，此处验真进程供给）
 *   2. goToDefinition 全链（首调 = 真文件 open + didOpen + 懒启动
 *      server + 请求 + git-ignore 过滤 no-op〔非 git 仓 cwd〕+ 格式化）
 *   3. hover（didOpen skip 支：同文件二调不重开）
 *   4. findReferences 跨文件分组（Location[] 过滤支 + 非 git cwd
 *      check-ignore exit 128 → no-op 全保留）
 *   5. 无 server 扩展名（.xyz 未映射 → sendRequest undefined →
 *      证据输出支，零请求发出）
 *
 * 残留守（H6 防空洞，本切片不登记断言，复审勿当遗漏重提）：
 *   - 10MB 守卫支（需 >10MB 真文件，func 层成本不登）
 *   - incomingCalls/outgoingCalls 2 步 call-hierarchy 支（fake 需
 *     prepareCallHierarchy + callHierarchy/* 双请求面，后续波按需扩）
 *   - crash 重启 / -32801 瞬态重试 / restartOnCrash 面（instance 状态机
 *     深支，lsp 域 client 域单测归属）
 *   - workspaceSymbol 空 query 支（fake 面同上按需扩）
 *
 * 隔离纪律（func 层 = 真 I/O 允许，b6-func-smoke 先例）：
 *   - mkdtemp 真盘 + afterAll rmSync 全清；
 *   - fake server 脚本落 tmpDir（进程面 = 子进程，非 in-process）；
 *   - 真 spawn = process.execPath（bun/node 兼容纯 JS 脚本，零额外
 *     运行时假设）；
 *   - bootstrap cwd 两态戳 tmpDir（expandPath 基准）+ afterAll 复原；
 *   - manager 单例 afterAll shutdownLspServerManager（真 shutdown 请求
 *     + exit 通知 + kill 全清，零进程泄漏）。
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { LSPTool } from '../../src/engine/tools'
import {
  clearLspServerSource,
  getInitializationStatus,
  initializeLspServerManager,
  isLspConnected,
  setLspServerSource,
  shutdownLspServerManager,
  waitForInitialization,
} from '../../src/lsp'
import {
  getCwdState,
  getOriginalCwd,
  setCwdState,
  setOriginalCwd,
} from '../../src/bootstrap'

/**
 * 最小 LSP stdio JSON-RPC 服务端（Content-Length 分帧；请求面 =
 * initialize / textDocument/{definition,references,hover} / shutdown /
 * exit；通知面 initialized/didOpen/didChange 全忽略）。
 * 落盘 = tmpDir/lsp-fake-server.js，spawn 面 = process.execPath 子进程。
 */
const FAKE_LSP_SERVER_JS = `
let buf = Buffer.alloc(0)

function send(msg) {
  const body = Buffer.from(JSON.stringify(msg), 'utf8')
  process.stdout.write(
    'Content-Length: ' + body.length + '\\r\\n\\r\\n' + body.toString('utf8'),
  )
}

process.stdin.on('data', (chunk) => {
  buf = Buffer.concat([buf, chunk])
  for (;;) {
    const headerEnd = buf.indexOf('\\r\\n\\r\\n')
    if (headerEnd === -1) break
    const header = buf.slice(0, headerEnd).toString('latin1')
    const m = header.match(/Content-Length: (\\d+)/i)
    if (!m) {
      buf = buf.slice(headerEnd + 4)
      continue
    }
    const len = parseInt(m[1], 10)
    const start = headerEnd + 4
    if (buf.length < start + len) break
    const raw = buf.slice(start, start + len).toString('utf8')
    buf = buf.slice(start + len)
    let msg
    try {
      msg = JSON.parse(raw)
    } catch {
      continue
    }
    if (msg.method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          capabilities: {
            definitionProvider: true,
            referencesProvider: true,
            hoverProvider: true,
          },
          serverInfo: { name: 'atlas-fake-lsp', version: '1.0.0' },
        },
      })
    } else if (msg.method === 'textDocument/definition' && msg.id !== undefined) {
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          uri: 'file:///repo/fake-def.txt',
          range: {
            start: { line: 1, character: 2 },
            end: { line: 1, character: 5 },
          },
        },
      })
    } else if (msg.method === 'textDocument/references' && msg.id !== undefined) {
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: [
          {
            uri: 'file:///repo/a.txt',
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 1 },
            },
          },
          {
            uri: 'file:///repo/b.txt',
            range: {
              start: { line: 4, character: 1 },
              end: { line: 4, character: 2 },
            },
          },
        ],
      })
    } else if (msg.method === 'textDocument/hover' && msg.id !== undefined) {
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: { contents: { kind: 'plaintext', value: 'fake hover doc' } },
      })
    } else if (msg.method === 'shutdown') {
      send({ jsonrpc: '2.0', id: msg.id, result: null })
    } else if (msg.method === 'exit') {
      process.exit(0)
    }
  }
})
`

let tmpDir: string
let savedOriginalCwd: string
let savedCwdState: string

beforeAll(async () => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'atlas-lsp-func-'))
  writeFileSync(path.join(tmpDir, 'a.txt'), 'hello\nworld\n')
  writeFileSync(path.join(tmpDir, 'lsp-fake-server.js'), FAKE_LSP_SERVER_JS)

  savedOriginalCwd = getOriginalCwd()
  savedCwdState = getCwdState()
  // LSPTool.call expandPath / gitCheckIgnore cwd 基准 = 真 tmpDir（非 git 仓）
  setOriginalCwd(tmpDir)
  setCwdState(tmpDir)

  setLspServerSource(() =>
    Promise.resolve({
      fake: {
        command: process.execPath,
        args: [path.join(tmpDir, 'lsp-fake-server.js')],
        extensionToLanguage: { '.txt': 'plaintext' },
      },
    }),
  )
  initializeLspServerManager()
  await waitForInitialization()
})

afterAll(async () => {
  // 真 shutdown 请求 + exit 通知 + kill（零进程泄漏）+ 单例全清
  await shutdownLspServerManager()
  clearLspServerSource()
  setOriginalCwd(savedOriginalCwd)
  setCwdState(savedCwdState)
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('S-E2c func 全链（fake LSP server，R6 零模型）', () => {
  test('initialize success + isLspConnected（真供给面）', () => {
    expect(getInitializationStatus()).toEqual({ status: 'success' })
    // 1 server（懒启动 = stopped 态，非 error）→ connected
    expect(isLspConnected()).toBe(true)
  })

  test('goToDefinition 全链（open + didOpen + 懒启动 + JSON-RPC + 过滤 + 格式化）', async () => {
    const res = await LSPTool.call({
      operation: 'goToDefinition',
      filePath: 'a.txt',
      line: 1,
      character: 1,
    })
    expect(res.data.operation).toBe('goToDefinition')
    expect(res.data.filePath).toBe('a.txt')
    // cwd = tmpDir（/tmp/… 5 层）→ relative 起 ../../ 前缀拒用 → 绝对路径面
    expect(res.data.result).toBe('Defined in /repo/fake-def.txt:2:3')
    expect(res.data.resultCount).toBe(1)
    expect(res.data.fileCount).toBe(1)
  })

  test('hover（didOpen skip 支：同文件二调不重开）', async () => {
    const res = await LSPTool.call({
      operation: 'hover',
      filePath: 'a.txt',
      line: 2,
      character: 3,
    })
    expect(res.data.operation).toBe('hover')
    expect(res.data.result).toBe('fake hover doc')
    expect(res.data.resultCount).toBe(1)
    expect(res.data.fileCount).toBe(1)
  })

  test('findReferences 跨文件分组（Location[] 过滤支 + 非 git cwd no-op）', async () => {
    const res = await LSPTool.call({
      operation: 'findReferences',
      filePath: 'a.txt',
      line: 1,
      character: 1,
    })
    expect(res.data.operation).toBe('findReferences')
    expect(res.data.result).toBe(
      'Found 2 references across 2 files:\n\n/repo/a.txt:\n  Line 1:1\n\n/repo/b.txt:\n  Line 5:2',
    )
    expect(res.data.resultCount).toBe(2)
    expect(res.data.fileCount).toBe(2)
  })

  test('无 server 扩展名（.xyz 未映射 → 证据输出支，零请求发出）', async () => {
    writeFileSync(path.join(tmpDir, 'nope.xyz'), 'x')
    const res = await LSPTool.call({
      operation: 'goToDefinition',
      filePath: 'nope.xyz',
      line: 1,
      character: 1,
    })
    expect(res.data.operation).toBe('goToDefinition')
    expect(res.data.result).toBe('No LSP server available for file type: .xyz')
    // 无结果计数面（undefined 支早退，不进 formatResult）
    expect(res.data.resultCount).toBeUndefined()
    expect(res.data.fileCount).toBeUndefined()
  })
})
