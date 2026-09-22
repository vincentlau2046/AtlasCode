/**
 * shellProvider — Shell 提供者抽象（bash-only 裁剪版）
 *
 * 旧仓来源（a8af45b）: src/utils/shell/shellProvider.ts + bashProvider.ts
 * 实现波次: C-Deep 切片 1（executor 纵切，execution-strategy §8.9）
 *
 * 裁剪裁定（2026-09-22 调研定稿）：
 * - 只实现 bash provider；buildExecCommand 因不 source ShellSnapshot（无别名展开需求）
 *   去掉 eval 包装，命令直接进入 bash -c 命令串
 * - getEnvironmentOverrides 返回空对象（tmux 隔离 / session env / sandbox TMPDIR 归残余）
 * 残余清单（后续波次补齐，复审勿当遗漏重提）：
 *   ① ShellSnapshot sourcing + snapshot 缺失时 -l 登录 shell 回退（getSpawnArgs 现固定 ['-c']）
 *   ② session env（getSessionEnvVars / getSessionEnvironmentScript）
 *   ③ tmux socket 隔离（getClaudeTmuxEnv）
 *   ④ pipe 命令 rearrange + stdin 重定向探测（旧 quoteShellCommand/rearrangePipeCommand，
 *      裁剪版直接依赖 bash -c 一次解析语义，无 eval 故无 "重定向落在 eval 上" 问题）
 *   ⑤ Windows 路径转换（windowsPathToPosixPath）+ Git Bash 双路径
 *   ⑥ PowerShell provider（createPowerShellShellProvider）
 *   ⑦ sandbox 模式 TMPDIR/TMPPREFIX 隔离
 */
import { tmpdir } from 'os'
import { join } from 'path'

/** 支持的 shell 类型（powershell 成员保留类型位，provider 未实现——残余⑥） */
export const SHELL_TYPES = ['bash', 'powershell'] as const
export type ShellType = (typeof SHELL_TYPES)[number]

/** hooks 执行使用的默认 shell（旧仓 DEFAULT_HOOK_SHELL 同义） */
export const DEFAULT_HOOK_SHELL = 'bash'

/** buildExecCommand 选项。useSandbox=true 时调用方必须提供 sandboxTmpDir。 */
export interface BuildExecCommandOptions {
  /** 命令实例 id（用于 cwd 跟踪文件名去重） */
  id: number | string
  /** 沙箱临时目录（useSandbox 时必填） */
  sandboxTmpDir?: string
  /** 是否走沙箱包装 */
  useSandbox: boolean
}

/** buildExecCommand 结果：bash -c 命令串 + cwd 跟踪文件（Node 侧原生路径）。 */
export interface ExecCommandBuild {
  commandString: string
  cwdFilePath: string
}

export interface ShellProvider {
  type: ShellType
  shellPath: string
  /** 是否 detached 组（进程组 kill 的前提） */
  readonly detached: boolean
  /** 组装 bash -c 命令串（含 pwd -P cwd 跟踪尾句） */
  buildExecCommand(
    command: string,
    options: BuildExecCommandOptions,
  ): Promise<ExecCommandBuild>
  /** spawn 参数（bash: ['-c', commandString]） */
  getSpawnArgs(commandString: string): string[]
  /** 子进程 env 覆盖（裁剪版恒空，残余②③⑦） */
  getEnvironmentOverrides(command: string): Promise<Record<string, string>>
}

/**
 * POSIX shell 双引号转义（裁剪版本地最小集）：转义 ' " $ ` \。
 * 旧仓 shellQuoting 全量语义（heredoc/pipe 特判）归残余④。
 */
function quoteShellString(value: string): string {
  return `"${value.replace(/(['"$`\\])/g, '\\$1')}"`
}

/**
 * bash provider（裁剪版）。
 *
 * 命令串形态：`${command} && pwd -P >| ${quote(cwdFile)}`
 * - 用 && 连接（旧仓同语义）：命令失败则 cwd 文件不写，Shell.ts 走 cwd 回退
 * - pwd -P 取物理路径（与 process.cwd() 口径一致，旧仓同注释）
 * - cwd 文件：sandbox 模式落 sandboxTmpDir/cwd-<id>（沙箱内可见），
 *   非沙箱落 os.tmpdir()/atlas-<id>-cwd
 */
export function createBashShellProvider(shellPath: string): ShellProvider {
  return {
    type: 'bash',
    shellPath,
    detached: true,

    async buildExecCommand(command, { id, sandboxTmpDir, useSandbox }) {
      const cwdFilePath = useSandbox
        ? join(sandboxTmpDir!, `cwd-${id}`)
        : join(tmpdir(), `atlas-${id}-cwd`)
      const commandString = [
        command,
        `pwd -P >| ${quoteShellString(cwdFilePath)}`,
      ].join(' && ')
      return { commandString, cwdFilePath }
    },

    getSpawnArgs(commandString) {
      // 无 -l：裁剪版不 source 用户 profile（旧仓 snapshot 缺失回退才用 -l，
      // snapshot 机制整体归残余①）
      return ['-c', commandString]
    },

    async getEnvironmentOverrides(_command) {
      // 残余②③⑦：tmux 隔离 / session env / sandbox TMPDIR 后续波次补齐
      return {}
    },
  }
}
