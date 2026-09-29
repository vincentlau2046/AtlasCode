/**
 * cli（CLI 公共域）R0 发布工具链（#177，roadmap R0 并行带）— update 子命令
 * handler（远端升级车道；tag/release 动作归 W5，本命令只做"拉取 + 重建"）。
 *
 * 语义：
 *   1. 自升级：自 process.argv[1] realpath（~/.atlas/bin/atlas 符号链接 →
 *      <installRoot>/dist/cli.js）向上解析安装根（含 .git + package.json 的
 *      最近祖先）；
 *   2. 三步升级：`git pull --ff-only` → `bun install` → `bun run build`
 *      （原地重建；~/.atlas/bin/atlas 符号链接指向 dist/cli.js，原地重建
 *      即刻生效，无需 relink）；
 *   3. 版本报告：打印升级前后 package.json version。
 *
 * 3-dep 纪律：node:child_process execFile arg-array（免 shell 注入，对齐
 * 核心域 execa→execFile 裁断）+ node:fs/path，零第三方。
 *
 * 裁登记（H6 防空洞，复审勿当遗漏重提）：
 *   - `git pull --ff-only` 拒 diverge（不 force/reset，避免覆盖本地 dev-loop
 *     编辑 = dev-loop 边界；开发态"边改边用"走 docs/dev-loop.md 本地流程）；
 *   - 安装根无 git remote（P-1 GitHub 仓未建前 = 现状）→ 明示"无远端可拉"
 *     + 手动指引，exit 1，不伪装升级能力；
 *   - bun 缺失 → 明示安装指引（不自动装 bun，避免隐式系统变更）；
 *   - `--check` 选项面（仅报告版本不拉取）= 未注册（R0 面最小化，需要时
 *     随 W5 补，H6 登记）。
 */
import { execFile, type ExecFileOptions } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * 本 @types/node 版本 ExecFileOptions 不含 stdio（CommonOptions 面）——
 * 本地扩展型承载 inherit/ignore 两态（运行时为超集，cast 安全）。
 * callback 版包装（arg-array 免 shell 注入；非 promisify，避重载 options 型差）。
 */
type UpdateExecOptions = ExecFileOptions & { stdio?: 'inherit' | 'ignore' }

function pExecFile(
  command: string,
  args: string[],
  options: UpdateExecOptions = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, options as ExecFileOptions, err =>
      err ? reject(err) : resolve(),
    )
  })
}

/** 自 process.argv[1] 向上找"含 .git + package.json 的最近祖先"= 安装根。 */
export function resolveInstallRoot(): string | null {
  let current: string
  try {
    current = dirname(realpathSync(process.argv[1] ?? ''))
  } catch {
    return null
  }
  for (let dir = current; ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.git')) && existsSync(join(dir, 'package.json'))) {
      return dir
    }
    if (dir === dirname(dir)) break // 到文件系统根
  }
  return null
}

function readVersion(installRoot: string): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(installRoot, 'package.json'), 'utf8'),
    ) as { version?: string }
    return pkg.version ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

async function runStep(
  installRoot: string,
  command: string,
  args: string[],
): Promise<void> {
  process.stderr.write(`$ ${command} ${args.join(' ')}\n`)
  await pExecFile(command, args, { cwd: installRoot, stdio: 'inherit' })
}

async function commandExists(command: string): Promise<boolean> {
  try {
    await pExecFile(command, ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export async function updateHandler(): Promise<void> {
  const installRoot = resolveInstallRoot()
  if (!installRoot) {
    process.stderr.write(
      'AtlasCode update: 无法定位 git 安装根（process.argv[1] 所在树无 .git + package.json 祖先）。\n' +
        '开发态请直接 clone 仓改码（见 docs/dev-loop.md），无需 update。',
    )
    process.exitCode = 1
    return
  }
  const versionBefore = readVersion(installRoot)
  process.stderr.write(
    `AtlasCode update：安装根 ${installRoot}（当前版本 ${versionBefore}）\n`,
  )

  if (!(await commandExists('git'))) {
    process.stderr.write('AtlasCode update: 未找到 git，无法拉取更新。\n')
    process.exitCode = 1
    return
  }
  if (!(await commandExists('bun'))) {
    process.stderr.write(
      'AtlasCode update: 未找到 bun（构建依赖）。安装：curl -fsSL https://bun.sh/install | bash\n',
    )
    process.exitCode = 1
    return
  }

  // 远端存在性核验（P-1 GitHub 仓未建前 = 无 remote 常态；不伪装升级能力）
  try {
    await pExecFile('git', ['remote', 'get-url', 'origin'], {
      cwd: installRoot,
      stdio: 'ignore',
    })
  } catch {
    process.stderr.write(
      'AtlasCode update: 安装根未配置 git 远端（origin）——GitHub 发布仓（P-1）尚未建立。\n' +
        '手动升级：git remote add origin <仓地址> && git pull --ff-only && bun install && bun run build\n',
    )
    process.exitCode = 1
    return
  }

  try {
    await runStep(installRoot, 'git', ['pull', '--ff-only'])
    await runStep(installRoot, 'bun', ['install'])
    await runStep(installRoot, 'bun', ['run', 'build'])
  } catch {
    process.stderr.write(
      'AtlasCode update: 升级失败（见上方步骤输出）。工作区若有本地改动请先处理（dev-loop 边界，不 force）。\n',
    )
    process.exitCode = 1
    return
  }

  const versionAfter = readVersion(installRoot)
  process.stderr.write(
    `AtlasCode update 完成：${versionBefore} → ${versionAfter}（~/.atlas/bin/atlas 指向重建后的 dist/cli.js，即刻生效）\n`,
  )
}
