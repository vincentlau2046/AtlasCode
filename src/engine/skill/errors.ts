/**
 * engine/skill — 命令/技能执行错误面（§8.67 D 波 S-E2a）。
 *
 * 旧仓 utils/errors.ts MalformedCommandError 本地落面（skill 域消费子集）：
 *   - 未知 /name 命令（processPromptSlashCommand）
 *   - shell 块（!`cmd` / ```! cmd ```）权限门拒绝 / 执行失败 / 中断
 *     （executeShellCommandsInPrompt）
 * 旧仓 ShellError 不迁：旧仓 shell 块中断经 throw ShellError（interrupted
 * 标记）由 catch 分支产 `[Command interrupted]` 行；新仓 BashTool.call
 * 不抛 ShellError，中断经 Out.interrupted 返回（engine/tools/bash/
 * bashTool.ts Out 面）→ executeShellCommandsInPrompt 经 mapResult 面
 * （BashTool.mapToolResultToToolResultBlockParam 的 interrupted 行
 * `[command was interrupted or timed out]`，S-E3 修波回填，审视 A 路
 * major-3）承载中断标记，非显式 data.interrupted 分支（初版头注错记
 * 「按 data.interrupted 分支」误导登记，S-E3 修波订正）。
 */
export class MalformedCommandError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MalformedCommandError'
  }
}
