/**
 * engine/skill — 命令/技能执行错误面（§8.67 D 波 S-E2a）。
 *
 * 旧仓 utils/errors.ts MalformedCommandError 本地落面（skill 域消费子集）：
 *   - 未知 /name 命令（processPromptSlashCommand）
 *   - shell 块（!`cmd` / ```! cmd ```）权限门拒绝 / 执行失败 / 中断
 *     （executeShellCommandsInPrompt）
 * 旧仓 ShellError 不迁：新仓 BashTool.call 不抛 ShellError，中断经
 * Out.interrupted 返回（engine/tools/bash/bashTool.ts Out 面）→
 * executeShellCommandsInPrompt 按 data.interrupted 分支。
 */
export class MalformedCommandError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MalformedCommandError'
  }
}
