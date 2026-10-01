/**
 * engine/tools — getBaseToolEntities()：基础工具本体全集（单一事实源）
 *
 * #187「注册池缺口 31 件本体待调用方注入」收口面（P1-C 0405 根因修点）：
 * 0405 fixture 任务族 6/6 FAIL 的定性收口证据（记录代理保真捕获）——
 * headless 车道工具池仅 Agent+Snip（无文件/Shell 本体），模型以纯文本回合
 * 「声称完成」而磁盘 ground truth 证伪；直连网关探测证明 Qwen38/deepseek
 * 在 tools 数组在场时均正确发出 tool_calls ⇒ 非 L4 模型能力面，是调用方
 * 未注入基础工具本体的产品面缺口。
 *
 * 装配语义（registry toolRegistry.ts getAllBaseTools）：AgentTool（内建）→
 * baseTools（本模块 = 调用方 toolRegistryDeps.baseTools 注入位）→
 * ascendTools（门控）→ mcpTools；按名去重先入为主。门控语义不变：
 * 门控本体（LSP 断连态 isEnabled=false / cron kill-switch / feature 门关
 * 的 Skill/ToolSearch 等）经 getTools 尾行 isEnabled 过滤自然缺席，与
 * TUI 车道（tui/tools.ts 全量池）同一门控口径。
 *
 * 本体经子门面直接 import（不经 index 回环）；AgentTool 为注册表内建，
 * 不在本数组（registry 头注「AgentTool（内建）」序位先于 baseTools）。
 */
import { AskUserQuestionTool } from './askUser'
import { BashTool } from './bash'
import { ConfigTool } from './config'
import { EnterPlanModeTool, ExitPlanModeV2Tool } from './plan'
import { LSPTool } from './lsp'
import {
  EditTool,
  GlobTool,
  GrepTool,
  ReadTool,
  WriteTool,
} from './files'
import { ListMcpResourcesTool, ReadMcpResourceTool } from './mcp/index'
import { NotebookEditTool } from './notebook'
import {
  SendMessageTool,
  SnipTool,
  TeamCreateTool,
  TeamDeleteTool,
} from './team'
import {
  CronCreateTool,
  CronDeleteTool,
  CronListTool,
} from './schedule'
import {
  TaskCreateTool,
  TaskGetTool,
  TaskListTool,
  TaskOutputTool,
  TaskStopTool,
  TaskUpdateTool,
  TodoWriteTool,
} from './tasks'
import { SkillTool } from './skill'
import { ToolSearchTool } from './toolsearch'
import { WebFetchTool, WebSearchTool } from './web'
import { EnterWorktreeTool, ExitWorktreeTool } from './worktree'
import type { Tools } from '../../shared'

/**
 * 基础工具本体全集（34 件，AgentTool 内建除外）——调用方
 * toolRegistryDeps.baseTools 注入位（headless 车道 print.ts createAgentLoopDeps
 * 调用点；组合根现不硬接 = 窄 spine 缺省面，见 engine/loopDeps.ts 头注）。
 * loopDeps 构建器对 baseTools 的 Snip/TeamCreate/TeamDelete 追加经注册表
 * 按名去重先入为主 = 幂等无冲突。
 *
 * 导出为**惰性 getter**（非模块顶层 const 数组）：本文件经 engine 门面
 * re-export（boundaries/entry-point 约束：CLI 等外域只认门面入口，禁 leaf 直引），
 * 而 bash 域闭包可达门面 → 若顶层 eager 求值 `[BashTool,…]`，load 序倒挂时
 * BashTool 仍在 TDZ（ReferenceError，func 层 11 测红）。函数体延迟到调用时
 * （runHeadless 内、全模块初始化后）求值，绕开模块初始化环。
 */
export function getBaseToolEntities(): Tools {
  return [
    BashTool,
    GlobTool,
    GrepTool,
    ReadTool,
    WriteTool,
    EditTool,
    NotebookEditTool,
    WebFetchTool,
    WebSearchTool,
    AskUserQuestionTool,
    ConfigTool,
    CronCreateTool,
    CronDeleteTool,
    CronListTool,
    TaskCreateTool,
    TaskGetTool,
    TaskListTool,
    TaskUpdateTool,
    TaskOutputTool,
    TaskStopTool,
    TodoWriteTool,
    EnterPlanModeTool,
    ExitPlanModeV2Tool,
    EnterWorktreeTool,
    ExitWorktreeTool,
    SkillTool,
    ToolSearchTool,
    ListMcpResourcesTool,
    ReadMcpResourceTool,
    LSPTool,
    SendMessageTool,
    TeamCreateTool,
    TeamDeleteTool,
    SnipTool,
  ]
}
