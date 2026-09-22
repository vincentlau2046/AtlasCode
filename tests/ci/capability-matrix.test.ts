/**
 * 能力覆盖门 capability-matrix（B-fix · C 波前置，test-strategy-rederive §4/§5 H2/H5/H7）。
 *
 * 根因：测试与"实现"共存而非与"能力"共存 —— 空 stub 没有测试，
 * 而没有任何门问"该域声明的能力有没有证明测试"。本门把
 * 域×能力→证明测试文件→状态 锁成单一事实源：
 *   - done 行的证明文件必须存在且含真实测试
 *   - missing 行必须注明解锁波次（不许无声失踪）
 *   - 四域每域 ≥1 行（不许有域无能力规约）
 *
 * 纪律：绝不写假装通过的能力测试 —— 未实现的能力标 missing + 解锁波次。
 */
import { describe, test, expect } from 'bun:test'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const REPO_ROOT = new URL('../../', import.meta.url).pathname

type MatrixRow = {
  domain: 'executor' | 'sandbox' | 'memory' | 'modelprovider'
  capability: string
  status: 'done' | 'missing'
  /** done：证明测试文件（仓内相对路径） */
  proof?: string
  /** missing：解锁波次（C-Deep / C / D / E / F） */
  by?: string
}

/**
 * 能力矩阵（单一事实源）。C-Deep 切片 2 现状（2026-09-22）：
 * memory/modelprovider 行为完整（B 交付真码）；executor 纵切已填
 * （4 空 stub → 裁剪版 bash-only 真核心 + 真 spawn 功能 smoke）；
 * sandbox 纵切已填（2 空 stub → 裁剪版工厂 + runtime 注入窗口 +
 * system-rg 单模式后端，真建 manager + 真 ripgrep 功能 smoke，
 * STUB_REGISTRY 随之清零）。
 *
 * 跨会话独立审视修复（2026-09-22，ee96206，记录见 execution-strategy §8.12）：
 * FS 适配器原本只有 mock-fs 委托单测（"写+读" proof 指向 InMemoryStore，
 * 真 FS 零证据，H6 空洞同类）→ 新增 memory FS store 真磁盘 func 证据行。
 */
const MATRIX: readonly MatrixRow[] = [
  { domain: 'memory', capability: '写+读 memory（store 语义）', status: 'done', proof: 'tests/unit/memory-store.test.ts' },
  // 跨会话审视修复（F1/F2）：FS 适配器真磁盘证据（默认 node:fs 透传腿，
  // 真 tmpdir 读写 + readFileInRange 两态 + mtime 分档）——"写+读" 能力在
  // 真 FS 实现上的行为证明，非仅 InMemoryStore
  { domain: 'memory', capability: 'FS store 真磁盘读（FileSystemMemoryStore，默认 node:fs 透传）', status: 'done', proof: 'tests/func/memory-real-fs.test.ts' },
  { domain: 'memory', capability: '路径解析/校验（paths）', status: 'done', proof: 'tests/unit/memory-paths.test.ts' },
  // memoryAge 真盘分档（utimesSync 回退）随审视修复移 func 层；
  // unit 文件证纯函数分档边界，func 文件证真盘 mtime 档
  { domain: 'memory', capability: '记忆新鲜度分档（memoryAge）', status: 'done', proof: 'tests/unit/memory-types-age.test.ts' },
  { domain: 'modelprovider', capability: '角色 fallback 解析', status: 'done', proof: 'tests/unit/model-roles.test.ts' },
  { domain: 'modelprovider', capability: '错误消息/错误码映射', status: 'done', proof: 'tests/unit/errorMessaging.test.ts' },
  { domain: 'modelprovider', capability: '（mock）出一段 completion', status: 'missing', by: 'C（B9 双跑 fixture + 独立 mock 测试）' },
  // C-Deep 切片 1（executor 纵切）：真 spawn 功能 smoke（§8.7 port 之下全真）；
  // 同族契约测试：executor-shell-provider / executor-shell-command（unit 层）
  { domain: 'executor', capability: '执行一条 shell 命令（裁剪版 bash-only 纵切）', status: 'done', proof: 'tests/func/executor-shell-smoke.test.ts' },
  { domain: 'executor', capability: '工具链占位替换（NPU toolchain）', status: 'done', proof: 'tests/unit/executor-toolchain.test.ts' },
  // C2：3 port 契约（TaskOutput/bootstrapState/ExecutorSandbox 注入面，§8.8）
  // proof 取三契约测试之一（另两件同族：executor-port-bootstrap-state / executor-port-sandbox）
  { domain: 'executor', capability: '3 port 契约（task/bootstrap/sandbox 注入面）', status: 'done', proof: 'tests/unit/executor-port-task-output.test.ts' },
  // C-Deep 切片 2（sandbox 纵切）：真建 manager（工厂闭包 + backend +
  // runtime 注入窗口全链）+ 真 ripgrep 查询（§8.7 port 之下全真；
  // rg 缺失 skip 不红）。同族契约测试：sandbox-manager（unit 层）
  { domain: 'sandbox', capability: '创建 sandbox manager（裁剪版工厂 + runtime 注入窗口）', status: 'done', proof: 'tests/func/sandbox-smoke.test.ts' },
  { domain: 'sandbox', capability: 'ripgrep 搜索后端（system-rg 单模式真查询）', status: 'done', proof: 'tests/func/sandbox-smoke.test.ts' },
  { domain: 'sandbox', capability: '违规文本处理', status: 'done', proof: 'tests/unit/sandbox-violation-text.test.ts' },
]

const DOMAINS = new Set<MatrixRow['domain']>(['executor', 'sandbox', 'memory', 'modelprovider'])

describe('能力矩阵门', () => {
  test('① done 行的证明测试文件必须存在且含真实测试', () => {
    for (const row of MATRIX) {
      if (row.status !== 'done' || !row.proof) continue
      const abs = join(REPO_ROOT, row.proof)
      if (!existsSync(abs)) {
        throw new Error(`能力 "${row.capability}"（${row.domain}）标 done 但证明文件缺失: ${row.proof}`)
      }
      const body = readFileSync(abs, 'utf8')
      if (!/(describe|test)\s*\(/.test(body) || !/expect\s*\(/.test(body)) {
        throw new Error(`能力 "${row.capability}"（${row.domain}）证明文件 ${row.proof} 无真实测试`)
      }
    }
  })

  test('② missing 行必须注明解锁波次（by）', () => {
    const bad = MATRIX.filter((r) => r.status === 'missing' && !r.by?.trim())
    expect(bad).toEqual([])
  })

  test('③ 四域每域至少 1 行能力规约（不许有域无规约）', () => {
    const covered = new Set(MATRIX.map((r) => r.domain))
    const missing = [...DOMAINS].filter((d) => !covered.has(d))
    expect(missing).toEqual([])
  })
})
