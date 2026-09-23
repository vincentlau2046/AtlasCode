/**
 * 能力覆盖门 capability-matrix（B-fix · C 波前置，test-strategy-rederive §4/§5 H2/H5/H7）。
 *
 * 根因：测试与"实现"共存而非与"能力"共存 —— 空 stub 没有测试，
 * 而没有任何门问"该域声明的能力有没有证明测试"。本门把
 * 域×能力→证明测试文件→状态 锁成单一事实源：
 *   - done 行的证明文件必须存在且含真实测试
 *   - missing 行必须注明解锁波次（不许无声失踪）
 *   - 八域每域 ≥1 行（不许有域无能力规约）
 *
 * 纪律：绝不写假装通过的能力测试 —— 未实现的能力标 missing + 解锁波次。
 */
import { describe, test, expect } from 'bun:test'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const REPO_ROOT = new URL('../../', import.meta.url).pathname

type MatrixRow = {
  domain:
    | 'executor'
    | 'sandbox'
    | 'memory'
    | 'modelprovider'
    | 'task'
    | 'bootstrap'
    | 'permissions'
    | 'hooks'
  capability: string
  status: 'done' | 'missing'
  /** done：证明测试文件（仓内相对路径） */
  proof?: string
  /** missing：解锁波次（C-Deep / C / D / E / F / engine） */
  by?: string
}

/**
 * 能力矩阵（单一事实源）。
 *
 * C-Deep 切片 2（2026-09-22）：memory/modelprovider 行为完整（B 交付真码）；
 * executor 纵切已填（4 空 stub → 裁剪版 bash-only 真核心 + 真 spawn 功能 smoke）；
 * sandbox 纵切已填（2 空 stub → 裁剪版工厂 + runtime 注入窗口 +
 * system-rg 单模式后端，真建 manager + 真 ripgrep 功能 smoke，
 * STUB_REGISTRY 随之清零）。
 *
 * 跨会话独立审视修复（2026-09-22，ee96206，记录见 execution-strategy §8.12）：
 * FS 适配器原本只有 mock-fs 委托单测（"写+读" proof 指向 InMemoryStore，
 * 真 FS 零证据，H6 空洞同类）→ 新增 memory FS store 真磁盘 func 证据行。
 *
 * C-Deep 切片 3（2026-09-23，§8.16）：四新域 task/bootstrap/permissions/hooks
 * 薄骨架纵切 —— task 输出磁盘层（spill/delete/5GB cap/TaskId）真盘 func 证据；
 * bootstrap cwd 两状态分离 + ALS 覆盖层归 unit（纯状态无 fs）；permissions
 * 薄骨架决策主面（unit 零磁盘 + func 真盘 realpath 链）；hooks 薄骨架 5 高频
 * 执行器聚合面 + 跨域斩断 fail-fast（unit 零磁盘走假 shell port）。
 * hooks 流式/attachment 渲染（AsyncGenerator）随 §8.16 裁剪归 engine 波（missing）。
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
  // B6-func（§8.13 L-2 收口）：mock completion 双腿（非流式 + 流式）经组合根真链，
  // fake 经 setModelProviderForTesting 注入（非 mock transport）——原 "missing by C/B9"
  // 由 B6-func 提前闭环
  { domain: 'modelprovider', capability: '（mock）出一段 completion（流式 + 非流式双腿）', status: 'done', proof: 'tests/func/b6-func-smoke.test.ts' },
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
  // C-Deep 切片 3（四新域薄骨架纵切，§8.16）：task 输出磁盘层真盘证据（H6①–④）
  { domain: 'task', capability: 'TaskOutput spill 溢写 + stderr 前缀（真盘 I/O）', status: 'done', proof: 'tests/func/task-real-fs.test.ts' },
  { domain: 'task', capability: 'deleteOutputFile 真删 + ENOENT 吞错', status: 'done', proof: 'tests/func/task-real-fs.test.ts' },
  { domain: 'task', capability: '5GB cap 同构边界（MAX_TASK_OUTPUT_BYTES 单一事实源）', status: 'done', proof: 'tests/func/task-real-fs.test.ts' },
  { domain: 'task', capability: 'TaskId 双口径（type→前缀 + 字符集/长度）', status: 'done', proof: 'tests/func/task-real-fs.test.ts' },
  // bootstrap cwd 两状态分离 + ALS 覆盖层（纯状态无 fs，归 unit 层）
  { domain: 'bootstrap', capability: 'cwd 两状态分离（originalCwd 不可变 vs cwdState 可变）', status: 'done', proof: 'tests/unit/bootstrap.test.ts' },
  { domain: 'bootstrap', capability: 'ALS 覆盖层（runWithCwdOverride 并发 agent cwd 隔离）', status: 'done', proof: 'tests/unit/bootstrap.test.ts' },
  // permissions 薄骨架决策主面（unit 零磁盘）+ realpath 链真盘（func）
  { domain: 'permissions', capability: 'checkRead/checkWrite 决策主面（零磁盘）', status: 'done', proof: 'tests/unit/permissions.test.ts' },
  { domain: 'permissions', capability: 'getAtlasTempDir/getProjectTempDir realpath 链（真盘）', status: 'done', proof: 'tests/func/permissions-real-fs.test.ts' },
  // E-4 S-4b（§8.33）：规则求值树匹配核心（deny/ask/allow 规则命中 + mcp 前缀 +
  // 空规则集=allow 默认兼容 + update 应用核心；matrix :95 行 proof 翻新随
  // tests/unit/permissions.test.ts 规则支决策面同提交）
  { domain: 'permissions', capability: '规则求值树匹配（deny/ask/allow 规则命中 + mcp 前缀 + 空规则集=allow）', status: 'done', proof: 'tests/unit/permission-rule-matching.test.ts' },
  { domain: 'permissions', capability: 'shell 工具规则三态匹配（exact/`:*` 前缀/wildcard + 通配转义 + suggestion）', status: 'done', proof: 'tests/unit/shell-rule-matching.test.ts' },
  // E-4 S-4c1（§8.34）：旧 permissionsLoader 296L 全迁（engine/permissions L3 连接器层）+
  // deletePermissionRule ⑩ 签名 + 接缝⑤ sync 核销（unit 零磁盘：
  // tests/unit/permission-rules-loader.test.ts 短路族/写回族）；func 行证真盘 round-trip
  { domain: 'permissions', capability: '规则磁盘加载/写回 round-trip（add → 重载出现 / delete 消失，真盘）', status: 'done', proof: 'tests/func/permission-rules-roundtrip.test.ts' },
  { domain: 'permissions', capability: 'CLI 工具规则解析 + 初始权限上下文装配（auto/GB/校验支裁剪版 9 函数保留面）', status: 'done', proof: 'tests/unit/permission-setup.test.ts' },
  // E-4 S-4c2（§8.35）：persist 族 6 型写回 × supportsPersistence 门（session/cliArg
  // no-op）+ createReadRuleSuggestion 3 支 + 规则语法校验 5 检（接缝③ 语法过滤支
  // 回填消费）+ permissionUpdateSchema 6 变体/direction enum 形状核验
  { domain: 'permissions', capability: '权限更新持久化（6 型写回 × 3 可编辑源门控）+ 规则语法校验（5 检 + settings 过滤接缝③回填）', status: 'done', proof: 'tests/unit/permission-persist-validation.test.ts' },
  // hooks 薄骨架 5 高频执行器聚合面 + 匹配 + 跨域斩断 fail-fast（unit 零磁盘走假 shell port）
  { domain: 'hooks', capability: '信任门 + 5 高频执行器聚合面（JSON 解释/最严权限/additionalContext）', status: 'done', proof: 'tests/unit/hooks.test.ts' },
  { domain: 'hooks', capability: 'getMatchingHooks 匹配（matchQuery + command 去重）', status: 'done', proof: 'tests/unit/hooks.test.ts' },
  { domain: 'hooks', capability: '跨域斩断 fail-fast（shell/task 边未注入抛错）', status: 'done', proof: 'tests/unit/hooks.test.ts' },
  // §8.16 裁剪：hooks 流式/attachment 渲染（AsyncGenerator）归 engine 波
  { domain: 'hooks', capability: 'hooks 流式执行 / attachment 渲染（AsyncGenerator）', status: 'missing', by: 'engine（流式执行/attachment 渲染归 engine 波）' },
  // ── B6-func 最小组合根（compose.ts 装配真链，§8.16/§8.17 4+7 前置清单 + 6 适配器）──
  // 与上列各域"孤立面"行区别：这些行证能力"经 getCoreDependencies 装配后"的真链
  // （port 之下全真，仅 modelprovider 注入 fake），B6-func 先于 engine 波落地
  { domain: 'executor', capability: '组合根装配链执行命令（getCoreDependencies 注入后真 spawn + 真盘读回）', status: 'done', proof: 'tests/func/b6-func-smoke.test.ts' },
  { domain: 'sandbox', capability: '组合根构造 sandbox manager（placeholder runtime 禁用态 + port 链）', status: 'done', proof: 'tests/func/b6-func-smoke.test.ts' },
  { domain: 'memory', capability: '组合根写后读 memory（真 fs 写 + 只读 store 读，§8.13 L-1）', status: 'done', proof: 'tests/func/b6-func-smoke.test.ts' },
]

const DOMAINS = new Set<MatrixRow['domain']>([
  'executor',
  'sandbox',
  'memory',
  'modelprovider',
  'task',
  'bootstrap',
  'permissions',
  'hooks',
])

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

  test('③ 八域每域至少 1 行能力规约（不许有域无规约）', () => {
    const covered = new Set(MATRIX.map((r) => r.domain))
    const missing = [...DOMAINS].filter((d) => !covered.has(d))
    expect(missing).toEqual([])
  })
})
