/**
 * cli（CLI 公共域）S-C4（§8.71.1.4）— 内建命令注册表 wiring + skill 命令
 * 索引（旧仓 src/commands.ts 705L 的 CLI 侧随迁面）。
 *
 * 旧仓参照面落位切分：
 *   - 命令模型面 6 函数（builtInCommandNames/getCommands/getSkillToolCommands/
 *    getSlashCommandToolSkills/findCommand 族）+ 注册表装配 = engine/skill 域
 *    （S-E2a 已落；BUILT_IN_COMMANDS 占位空集，TUI 波 #152 回填）；
 *   - 本文件 = CLI 域 wiring 面（本切片随迁）：
 *     ① builtInCommandNames 注入口回填：registerBuiltinCommandNames() 把
 *        engine/skill 域 builtInCommandNames 读面注入 session 域 firstPrompt
 *        注入窗（消费面 = getFirstMeaningfulUserMessageTextContent 内建
 *        跳过支）；
 *     ② skill 命令索引透传消费（engine/skill ⑥ 登记「skill 索引调用方 =
 *        TUI/CLI 波穿线消费」核销）：getSkillCommandIndex() 聚合三族面。
 *
 * 裁登记（不随迁，归属波；复审勿当遗漏重提）：
 *   - ~70 个 TUI 内建命令本体（COMMANDS 清单，多数 .tsx）= TUI 波 #152
 *     （BUILT_IN_COMMANDS 占位回填后 ① 注入面自动生效，本文件无需再动）；
 *   - plugin 池面 / remote-safe 面 / workflow 裁 = engine/skill/commands.ts
 *    头注 ①-⑧ 归属波（plugin 波 / remote 波）；
 *   - 旧 setup.ts getCommands 预取消费点 = 本波 cli/setup.ts（S-C4 同片）。
 *
 * 调用时序：registerBuiltinCommandNames() 由 CLI 启动链（组合根 / 壳
 * launcher）调用一次；缺省未注入态 = session 域空 Set 行为（firstPrompt
 * 头注适配登记）。
 */
import {
  builtInCommandNames,
  getCommands,
  getMcpSkillCommands,
  getSkillToolCommands,
  getSlashCommandToolSkills,
  setBuiltinCommandNamesSource,
  type Command,
} from '../engine'

/**
 * builtInCommandNames 注入口回填（S-C4，§8.71.1.4）：注入 session 域
 * firstPrompt 注入窗。读源 = engine/skill builtInCommandNames（memoize
 * 零参读；TUI 波 BUILT_IN_COMMANDS 回填后集合自动生效）。幂等（重复注入
 * 等价）。
 */
export function registerBuiltinCommandNames(): void {
  setBuiltinCommandNamesSource(() => builtInCommandNames())
}

/**
 * skill 命令索引透传消费面（⑥ 登记核销）：聚合模型可调用技能命令三族
 * （SkillTool 视图 + SlashCommandTool 视图 + MCP skill 读窗），按 name
 * 去重（先入为主）。TUI 壳 / skill 索引调用方消费（TUI 波 #152 /resume·
 * /skills 列表面落盘后复用本面）。
 */
export async function getSkillCommandIndex(cwd: string): Promise<Command[]> {
  const [toolCommands, slashSkills, mcpCommands] = await Promise.all([
    getSkillToolCommands(cwd),
    getSlashCommandToolSkills(cwd),
    Promise.resolve(getMcpSkillCommands()),
  ])
  const seen = new Set<string>()
  const out: Command[] = []
  for (const cmd of [...toolCommands, ...slashSkills, ...mcpCommands]) {
    if (seen.has(cmd.name)) continue
    seen.add(cmd.name)
    out.push(cmd)
  }
  return out
}

/** getCommands 预取面再导出（cli/setup.ts 启动预取消费；STR-1 经本域门面）。 */
export { getCommands }
