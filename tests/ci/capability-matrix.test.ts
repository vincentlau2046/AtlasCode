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
 * 能力矩阵（单一事实源）。B 波现状：
 * memory/modelprovider 行为完整（B 交付真码），executor/sandbox 仅骨架
 * （核心行为 6 空 stub，C-Deep 解锁）。
 */
const MATRIX: readonly MatrixRow[] = [
  { domain: 'memory', capability: '写+读 memory（store 语义）', status: 'done', proof: 'tests/unit/memory-store.test.ts' },
  { domain: 'memory', capability: '路径解析/校验（paths）', status: 'done', proof: 'tests/unit/memory-paths.test.ts' },
  { domain: 'memory', capability: '记忆新鲜度分档（memoryAge）', status: 'done', proof: 'tests/unit/memory-types-age.test.ts' },
  { domain: 'modelprovider', capability: '角色 fallback 解析', status: 'done', proof: 'tests/unit/model-roles.test.ts' },
  { domain: 'modelprovider', capability: '错误消息/错误码映射', status: 'done', proof: 'tests/unit/errorMessaging.test.ts' },
  { domain: 'modelprovider', capability: '（mock）出一段 completion', status: 'missing', by: 'C（B9 双跑 fixture + 独立 mock 测试）' },
  { domain: 'executor', capability: '执行一条 shell 命令', status: 'missing', by: 'C-Deep' },
  { domain: 'executor', capability: '工具链占位替换（NPU toolchain）', status: 'done', proof: 'tests/unit/executor-toolchain.test.ts' },
  { domain: 'sandbox', capability: '创建 sandbox manager', status: 'missing', by: 'C-Deep' },
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
