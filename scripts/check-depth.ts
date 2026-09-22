/**
 * STR-2 目录深度 CI 脚本（charter L885：eslint max-depth 管代码嵌套非目录树, A 波补此脚本）
 *
 * 规则：
 *   shared          → 零子目录（叶子, L597: STR-2 目录深度 ≤1 = 不分子目录）
 *   四域 + ascend    → ≤1 层子目录（STR-2: 每个域内部最多两级目录）
 *   engine, atlascode → 不限（非域: 应用层 + 壳, 允许更深嵌套）
 *
 * 运行：bun run scripts/check-depth.ts   退出码 0=合规 / 1=违规
 */
import { readdirSync, statSync, existsSync } from "fs"
import { join } from "path"

const ROOT = "src"

/** 域 = 四域 + ascend 域包; shared 是叶子(零子目录); engine/atlascode 非域(不限) */
const LIMITS: Record<string, number> = {
  shared: 0, // 叶子: 零子目录 (L597)
  sandbox: 1, // 域: ≤1 层子目录 (STR-2 ≤2 级)
  memory: 1,
  executor: 1,
  modelprovider: 1,
  ascend: 1,
  // engine, atlascode: 不限 (非域: 应用层 + 壳)
}

/** 递归计算目录最大子目录深度（不含模块根本身） */
function maxSubdirDepth(dir: string, current: number): number {
  let max = current
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      max = Math.max(max, maxSubdirDepth(full, current + 1))
    }
  }
  return max
}

let violations = 0

console.log("STR-2 目录深度检查\n")
for (const [mod, limit] of Object.entries(LIMITS)) {
  const dir = join(ROOT, mod)
  if (!existsSync(dir)) {
    console.log(`⚠️  ${mod}: 目录不存在（跳过）`)
    continue
  }
  const depth = maxSubdirDepth(dir, 0)
  const ok = depth <= limit
  console.log(`${ok ? "✅" : "❌"} ${mod.padEnd(14)} 子目录深度 ${depth}  (限 ≤${limit})`)
  if (!ok) violations++
}

// engine / atlascode 仅报告深度, 不判违规
for (const mod of ["engine", "atlascode"]) {
  const dir = join(ROOT, mod)
  if (!existsSync(dir)) continue
  const depth = maxSubdirDepth(dir, 0)
  console.log(`ℹ️  ${mod.padEnd(14)} 子目录深度 ${depth}  (非域, 不限)`)
}

if (violations > 0) {
  console.error(`\n❌ STR-2 违规: ${violations} 个域超出目录深度限制`)
  process.exit(1)
}
console.log("\n✅ STR-2 目录深度全合规")
