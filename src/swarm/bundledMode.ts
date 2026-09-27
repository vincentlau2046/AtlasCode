/**
 * Bun 运行形态探测（C 桶 ③ shell·swarm 波 S-E2b，§8.66）。
 *
 * 源 = 旧仓 a8af45b src/utils/bundledMode.ts（16L 逐字，零依赖纯函数）。
 * 消费 = spawnUtils.getTeammateCommand（bundled 态走 process.execPath 单文件
 * 二进制分支）。`Bun` 全局 = 新仓基座（frontmatterParser 同型用法，
 * tsconfig types 含 bun 声明）。
 */

/** 探测当前运行时是否为 Bun（bun 命令跑 JS 文件 / Bun 编译单文件可执行）。 */
export function isRunningWithBun(): boolean {
  // https://bun.com/guides/util/detect-bun
  return process.versions.bun !== undefined
}

/** 探测是否以 Bun 编译单文件可执行运行（编译二进制内嵌 embeddedFiles）。 */
export function isInBundledMode(): boolean {
  return (
    typeof Bun !== 'undefined' &&
    Array.isArray(Bun.embeddedFiles) &&
    Bun.embeddedFiles.length > 0
  )
}
