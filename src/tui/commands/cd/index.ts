/**
 * /cd [path] — 0.1.60 TUI-2（CC 2.1.169）。
 *
 * TUI 会话内 cwd 移动，**不破 prompt 缓存**（判别面 = 缓存键前缀稳定）：走
 * session 状态面（setCwdState，经 Shell.setCwd 的 realpath 解析），**不做
 * process.chdir** —— process.cwd() 保持恒定，SkillTool 每回合
 * getCommands(process.cwd()) 的 memo 键不变、系统提示缓存键前缀稳定（不触发
 * prompt-cache break）。Shell 工具 spawn 走 pwd()（状态面），故移动后 Bash 落在
 * 新目录。无参 = 展示当前 session cwd。
 */
import type { Command } from '../../commands.js'

const cd = {
  type: 'local',
  name: 'cd',
  description:
    'Change the session working directory (without breaking the prompt cache)',
  supportsNonInteractive: false,
  argumentHint: '[path]',
  load: () => import('./cd.js'),
} satisfies Command

export default cd
