/* eslint-disable custom-rules/no-sync-fs -- W4 全量 lint 复原（§8.74.21）：legacy-debt 豁免（sync→async 改写违行为零改动纪律，W-opt 波再议） */
/**
 * cli（CLI 公共域）R0 发布工具链（#177，roadmap R0 并行带）— update 子命令
 * handler（远端升级车道；tag/release 动作归 W5，本命令只做"拉取 + 重建"）。
 *
 * 双通道语义（§8.74.23 npm 通道 + 统一 node 运行器扩展）：
 *   - git 通道（安装根含 .git + origin）：`git pull --ff-only` → `bun install`
 *     → `bun run build`（原地重建；~/.atlas/bin/atlas 符号链接指向 dist/cli.js，
 *     原地重建即刻生效，无需 relink）。
 *   - npm 通道（安装根无 .git = npm 全局安装）：`npm install -g <pkg>@latest`
 *     （registry 拉取最新版，node 运行器，即刻生效）。
 *   - `--check`（H6 前向接缝核销，R0 面最小化 → W5 补）：仅报告版本（npm 通道
 *     `npm view <pkg> version` / git 通道本地版本 + 指引），不拉取不重建。
 *
 * 自识别（零硬编码包名）：自 process.argv[1] realpath 向上找最近 package.json
 * （含 name）= 包根；含 .git = git 通道，否则 = npm 通道。dev 态（repo 内跑）
 * 命中 repo 包根（含 .git）走 git 通道；npm 全局安装命中 node_modules 包根
 * （无 .git）走 npm 通道。
 *
 * 3-dep 纪律：node:child_process execFile arg-array（免 shell 注入，对齐核心域
 * execa→execFile 裁断）+ node:fs/os/path，零第三方。
 *
 * 裁登记（H6 防空洞，复审勿当遗漏重提）：
 *   - git 通道 `git pull --ff-only` 拒 diverge（不 force/reset，避免覆盖本地
 *     dev-loop 编辑 = dev-loop 边界；开发态"边改边用"走 docs/dev-loop.md）；
 *   - git 通道安装根无 origin（P-1 GitHub 仓未建前 = 现状）→ 明示"无远端可拉"
 *     + 手动指引，exit 1，不伪装升级能力；
 *   - npm 通道于 homedir 运行（避免读项目级 .npmrc 被恶意重定向，对齐
 *     tui/utils/autoUpdater 安全裁断）；
 *   - 包根无法定位（process.argv[1] 所在树无 package.json 祖先）→ 明示 dev-loop
 *     指引，exit 1，不伪装升级能力；
 *   - `--check` 下 git 通道不做 fetch 比较（最小面，仅报本地版本 + 指引）；
 *     npm 通道 registry 查询失败（P-1 未 publish 期）→ 明示"无远端可查"，exit 1。
 */
import { execFile, type ExecFileOptions } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
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

/** 捕获输出的 execFile（不 reject，返回 { code, stdout, stderr }），供版本查询。 */
function execFileResult(
  command: string,
  args: string[],
  options: UpdateExecOptions = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise(resolve => {
    execFile(
      command,
      args,
      { ...options, stdio: 'pipe' } as ExecFileOptions,
      (err, stdout, stderr) => {
        // 仅区分成功(0)/失败(非零)；具体退出码非必需（npm view 面只需判定可达）。
        resolve({
          code: err ? 1 : 0,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
        })
      },
    )
  })
}

/**
 * 自 process.argv[1] realpath 向上找"含 name 的最近 package.json"= 包根。
 * 返回包根 + 包名 + 版本（版本缺省 'unknown'）。零硬编码包名（self-identifying）。
 */
export function resolvePackageRoot(): {
  root: string
  name: string
  version: string
} | null {
  let current: string
  try {
    current = dirname(realpathSync(process.argv[1] ?? ''))
  } catch {
    return null
  }
  for (let dir = current; ; dir = dirname(dir)) {
    const pkgPath = join(dir, 'package.json')
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
          name?: string
          version?: string
        }
        if (typeof pkg.name === 'string' && pkg.name.length > 0) {
          return {
            root: dir,
            name: pkg.name,
            version: typeof pkg.version === 'string' ? pkg.version : 'unknown',
          }
        }
      } catch {
        // 不可解析 package.json —— 继续向上找
      }
    }
    if (dir === dirname(dir)) break // 到文件系统根
  }
  return null
}

function readVersion(root: string): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(root, 'package.json'), 'utf8'),
    ) as { version?: string }
    return pkg.version ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

async function runStep(
  cwd: string,
  command: string,
  args: string[],
): Promise<void> {
  process.stderr.write(`$ ${command} ${args.join(' ')}\n`)
  await pExecFile(command, args, { cwd, stdio: 'inherit' })
}

async function commandExists(command: string): Promise<boolean> {
  try {
    await pExecFile(command, ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** 最小 SemVer 比较（仅数值 major.minor.patch 段；prerelease 尾缀忽略）。 */
function semverGt(a: string, b: string): boolean {
  const pa = a.split('-')[0].split('.').map(Number)
  const pb = b.split('-')[0].split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x > y) return true
    if (x < y) return false
  }
  return false
}

/** npm 通道：registry 查询 latest 版本（homedir 运行避项目级 .npmrc 重定向）。 */
async function npmViewLatest(name: string): Promise<string | null> {
  const res = await execFileResult(
    'npm',
    ['view', name, 'version', '--prefer-online'],
    { cwd: homedir() },
  )
  if (res.code !== 0) return null
  const v = res.stdout.trim()
  return v.length > 0 ? v : null
}

/** git 通道：pull --ff-only → bun install → bun run build（保原 R0 语义）。 */
async function gitChannelUpdate(root: string): Promise<void> {
  const versionBefore = readVersion(root)

  if (!(await commandExists('git'))) {
    process.stderr.write('AtlasCode update: 未找到 git，无法拉取更新。\n')
    process.exitCode = 1
    return
  }
  if (!(await commandExists('bun'))) {
    process.stderr.write(
      'AtlasCode update: 未找到 bun（git 通道构建依赖）。安装：curl -fsSL https://bun.sh/install | bash\n',
    )
    process.exitCode = 1
    return
  }

  // 远端存在性核验（P-1 GitHub 仓未建前 = 无 remote 常态；不伪装升级能力）
  try {
    await pExecFile('git', ['remote', 'get-url', 'origin'], {
      cwd: root,
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
    await runStep(root, 'git', ['pull', '--ff-only'])
    await runStep(root, 'bun', ['install'])
    await runStep(root, 'bun', ['run', 'build'])
  } catch {
    process.stderr.write(
      'AtlasCode update: 升级失败（见上方步骤输出）。工作区若有本地改动请先处理（dev-loop 边界，不 force）。\n',
    )
    process.exitCode = 1
    return
  }

  const versionAfter = readVersion(root)
  process.stderr.write(
    `AtlasCode update 完成：${versionBefore} → ${versionAfter}（~/.atlas/bin/atlas 指向重建后的 dist/cli.js，即刻生效）\n`,
  )
}

/** npm 通道：npm install -g <pkg>@latest（homedir 运行避项目级 .npmrc 重定向）。 */
async function npmChannelUpdate(name: string): Promise<void> {
  if (!(await commandExists('npm'))) {
    process.stderr.write(
      'AtlasCode update: 未找到 npm（node 运行器基线）。安装 node：https://nodejs.org（需 >= 20）\n',
    )
    process.exitCode = 1
    return
  }
  try {
    await runStep(homedir(), 'npm', ['install', '-g', `${name}@latest`])
  } catch {
    process.stderr.write(
      `AtlasCode update: npm 全局安装失败（见上方输出）。权限问题可试：sudo npm install -g ${name}@latest 或配置 npm prefix。\n`,
    )
    process.exitCode = 1
    return
  }
  process.stderr.write(
    `AtlasCode update 完成：${name} 已全局更新（node 运行器，即刻生效）\n`,
  )
}

export type UpdateOptions = {
  /** 仅报告版本（npm view / git 本地版本），不拉取不重建（H6 前向接缝核销）。 */
  checkOnly?: boolean
}

export async function updateHandler(options: UpdateOptions = {}): Promise<void> {
  const { checkOnly = false } = options

  const pkg = resolvePackageRoot()
  if (!pkg) {
    process.stderr.write(
      'AtlasCode update: 无法定位包安装根（process.argv[1] 所在树无 package.json 祖先）。\n' +
        '开发态请直接 clone 仓改码（见 docs/dev-loop.md），无需 update。\n',
    )
    process.exitCode = 1
    return
  }

  const isGit = existsSync(join(pkg.root, '.git'))
  const channel = isGit ? 'git' : 'npm'
  process.stderr.write(
    `AtlasCode update：安装根 ${pkg.root}（${pkg.name}，当前版本 ${pkg.version}，通道 ${channel}）\n`,
  )

  if (checkOnly) {
    if (isGit) {
      // git 通道最小面：报本地版本 + 指引（不做 fetch 比较，裁登记见头注）
      process.stderr.write(
        `git 通道：本地版本 ${pkg.version}。拉取最新请运行 \`atlas update\`（git pull --ff-only + bun install + build）。\n`,
      )
    } else {
      const latest = await npmViewLatest(pkg.name)
      if (latest === null) {
        process.stderr.write(
          `npm 通道：registry 查询失败（\`npm view ${pkg.name} version\` 非零）——P-1 未 publish 期本地常态，无远端可查。\n`,
        )
        process.exitCode = 1
        return
      }
      if (semverGt(latest, pkg.version)) {
        process.stderr.write(
          `npm 通道：发现更新 ${pkg.version} → ${latest}。运行 \`atlas update\` 升级。\n`,
        )
      } else {
        process.stderr.write(`npm 通道：已是最新（${pkg.version}）。\n`)
      }
    }
    return
  }

  if (isGit) {
    await gitChannelUpdate(pkg.root)
  } else {
    await npmChannelUpdate(pkg.name)
  }
}
