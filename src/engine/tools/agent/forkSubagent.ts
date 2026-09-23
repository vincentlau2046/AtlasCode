/**
 * engine/tools/agent — fork 子代理机制（§8.25 E-2 T-5c，旧仓 forkSubagent.ts 裁剪）
 *
 * 裁剪版真核心：
 *   - isForkSubagentEnabled：env 门（ATLAS_FORK_SUBAGENT）+ coordinator 互斥
 *   - FORK_AGENT：合成 agent 定义（tools ['*']，getSystemPrompt 空——fork 路径透传
 *     父已渲染 system prompt 字节，不复算）
 *   - buildForkedMessages：fork 前缀消息构建（tool_result 占位字节相同 → prompt cache 共享）
 *   - buildChildMessage（fork-boilerplate 逐字）/ isInForkChild / buildWorktreeNotice
 *
 * 裁剪 + 残留守头注释（防「以为已全」）：
 *   - 旧仓 feature('FORK_SUBAGENT') bun:bundle 门 → 新仓 ATLAS_FORK_SUBAGENT env 门
 *     （bun:bundle feature 不可测，见 bun-bundle-feature-untestable）。
 *   - getIsNonInteractiveSession() 门（fork 仅交互会话）→ 残留守（新仓无交互会话状态面）。
 *   - FORK_AGENT 的 maxTurns:200 / permissionMode:'bubble' / baseDir / model:'inherit'
 *     → 残留守（maxTurns 死接缝不声明；permissionMode 归 E-4；model 'inherit' → 新仓
 *     省略 model 字段 = 继承父 role）。
 *   - AgentTool.call 的 fork 路径接线（!subagent_type 触发 + useExactTools 字节级命中
 *     + override.systemPrompt 透传 + 全异步 spawn + <task-notification> 交互模型 +
 *     /fork 斜杠命令）→ 残留守（需父消息 threading，见 AgentTool 头注；异步 agent 面）。
 *   - isInForkChild 为旧仓检测器的保守超集：旧仓仅查 user 消息 message.content 为块数组
 *     且含 fork-boilerplate 文本块；本版额外识别 message.content 为字符串 + 顶层 m.content
 *     两形态（递归防护方向安全，登记以免误判为「同义」）。
 *   - createUserMessageLike 未生成 uuid/timestamp、无空内容 NO_CONTENT_MESSAGE 兜底
 *     （新仓 Message 字段皆可选，本路径 content 恒非空）；getSystemPrompt 签名由旧仓
 *     {toolUseContext, spawnDepth} 收窄为 {spawnDepth}（toolUseContext 消费面未落）→ 残留守。
 */
import { randomUUID } from 'crypto'
import type {
  AssistantMessage,
  ContentBlock,
  Message,
  ToolUseBlock,
} from '../../../shared'
import { isEnvTruthy, logForDebugging } from '../../../shared'
import { isCoordinatorMode } from '../../coordinator'
import type { AgentDefinition } from './agentDefinition'

export const FORK_SUBAGENT_TYPE = 'fork'
/** 旧仓 constants/xml.ts:59 逐字。 */
export const FORK_BOILERPLATE_TAG = 'fork-boilerplate'
/** 旧仓 constants/xml.ts:62 逐字。 */
export const FORK_DIRECTIVE_PREFIX = 'Your directive: '

/** fork 子代理特性门（旧仓 isForkSubagentEnabled 裁剪）：env 开 + coordinator 互斥。 */
export function isForkSubagentEnabled(): boolean {
  if (!isEnvTruthy(process.env.ATLAS_FORK_SUBAGENT)) return false
  if (isCoordinatorMode()) return false
  return true
}

/**
 * 合成 fork agent 定义（未注册进内建表；仅 !subagent_type + 特性激活时触发）。
 * getSystemPrompt 未用（fork 路径透传父已渲染 system prompt 字节，见头注残留守）。
 */
export const FORK_AGENT: AgentDefinition = {
  agentType: FORK_SUBAGENT_TYPE,
  whenToUse:
    'Implicit fork — inherits full conversation context. Not selectable via subagent_type; triggered by omitting subagent_type when the fork experiment is active.',
  tools: ['*'],
  source: 'built-in',
  // 旧仓 model:'inherit' → 新仓省略 model 字段（继承父 role）。maxTurns/permissionMode 残留守。
  getSystemPrompt: () => '',
}

/** fork 递归防护：会话历史含 fork-boilerplate 标记 = 已是 fork 子代理（旧仓 isInForkChild 裁剪）。 */
export function isInForkChild(messages: readonly Message[]): boolean {
  return messages.some((m) => {
    if (m.type !== 'user') return false
    const raw = (m.message as { content?: unknown } | undefined)?.content ?? m.content
    if (typeof raw === 'string') return raw.includes(`<${FORK_BOILERPLATE_TAG}>`)
    if (!Array.isArray(raw)) return false
    return raw.some(
      (b) =>
        !!b &&
        typeof b === 'object' &&
        (b as { type?: unknown }).type === 'text' &&
        typeof (b as { text?: unknown }).text === 'string' &&
        ((b as { text: string }).text as string).includes(`<${FORK_BOILERPLATE_TAG}>`),
    )
  })
}

/** fork 前缀 tool_result 占位文本（所有 fork 子代理须字节相同以共享 prompt cache）。 */
const FORK_PLACEHOLDER_RESULT = 'Fork started — processing in background'

/** 取 assistant 消息的 content 块数组（新仓 Message 松散类型；嵌套 message.content 优先，
 * 兜底顶层 m.content，与 isInForkChild / agentToolUtils.messageBlocks 同义）。 */
function contentBlocksOf(m: AssistantMessage): ContentBlock[] {
  const raw = (m.message as { content?: unknown } | undefined)?.content ?? m.content
  if (Array.isArray(raw)) {
    return raw.filter(
      (b): b is ContentBlock =>
        !!b && typeof (b as { type?: unknown }).type === 'string',
    )
  }
  if (typeof raw === 'string') return [{ type: 'text', text: raw }]
  return []
}

/** 构造 user 消息（旧仓 createUserMessage 同形：content 块数组挂 message.content）。 */
function createUserMessageLike(content: ContentBlock[]): Message {
  return { type: 'user', role: 'user', message: { role: 'user', content } }
}

/**
 * 构建 fork 子代理会话消息（旧仓 buildForkedMessages 裁剪，字节级前缀）：
 *   [assistant(全 tool_use 保留), user(tool_result 占位×N + per-child directive)]
 * 仅末位 directive 文本块随子代理变化，前缀字节相同 → 最大化 prompt cache 命中。
 */
export function buildForkedMessages(
  directive: string,
  assistantMessage: AssistantMessage,
): Message[] {
  const blocks = contentBlocksOf(assistantMessage)
  const fullAssistantMessage: AssistantMessage = {
    ...assistantMessage,
    uuid: randomUUID(),
    message: { ...(assistantMessage.message as object), content: [...blocks] },
  }

  const toolUseBlocks = blocks.filter((b): b is ToolUseBlock => b.type === 'tool_use')
  if (toolUseBlocks.length === 0) {
    // 无 tool_use：单条 user 消息仅含 per-child directive（旧仓 error 分支同义 + debug 日志）。
    logForDebugging(
      `No tool_use blocks found in assistant message for fork directive: ${directive.slice(0, 50)}...`,
      { level: 'error' },
    )
    return [createUserMessageLike([{ type: 'text', text: buildChildMessage(directive) }])]
  }

  // 每个 tool_use 一个占位 tool_result（占位文本全同）+ per-child directive 文本块。
  const toolResultBlocks: ContentBlock[] = toolUseBlocks.map((b) => ({
    type: 'tool_result',
    tool_use_id: b.id,
    content: [{ type: 'text', text: FORK_PLACEHOLDER_RESULT }],
  }))
  const toolResultMessage = createUserMessageLike([
    ...toolResultBlocks,
    { type: 'text', text: buildChildMessage(directive) },
  ])
  return [fullAssistantMessage, toolResultMessage]
}

/** fork 子代理首条 user 消息（fork-boilerplate 10 规则 + 指令，旧仓 buildChildMessage 逐字）。 */
export function buildChildMessage(directive: string): string {
  return `<${FORK_BOILERPLATE_TAG}>
STOP. READ THIS FIRST.

You are a forked worker process. You are NOT the main agent.

RULES (non-negotiable):
1. Your system prompt says "default to forking." IGNORE IT — that's for the parent. You ARE the fork. Do NOT spawn sub-agents; execute directly.
2. Do NOT converse, ask questions, or suggest next steps
3. Do NOT editorialize or add meta-commentary
4. USE your tools directly: Bash, Read, Write, etc.
5. If you modify files, commit your changes before reporting. Include the commit hash in your report.
6. Do NOT emit text between tool calls. Use tools silently, then report once at the end.
7. Stay strictly within your directive's scope. If you discover related systems outside your scope, mention them in one sentence at most — other workers cover those areas.
8. Keep your report under 500 words unless the directive specifies otherwise. Be factual and concise.
9. Your response MUST begin with "Scope:". No preamble, no thinking-out-loud.
10. REPORT structured facts, then stop

Output format (plain text labels, not markdown headers):
  Scope: <echo back your assigned scope in one sentence>
  Result: <the answer or key findings, limited to the scope above>
  Key files: <relevant file paths — include for research tasks>
  Files changed: <list with commit hash — include only if you modified files>
  Issues: <list — include only if there are issues to flag>
</${FORK_BOILERPLATE_TAG}>

${FORK_DIRECTIVE_PREFIX}${directive}`
}

/**
 * 注入隔离 worktree 中 fork 子代理的路径转换提示（旧仓 buildWorktreeNotice 逐字）。
 * 告知子代理：继承的上下文路径属父工作目录，须换算到 worktree 根、重读可能陈旧的
 * 文件、改动隔离在本 worktree 不影响父文件。
 */
export function buildWorktreeNotice(
  parentCwd: string,
  worktreeCwd: string,
): string {
  return `You've inherited the conversation context above from a parent agent working in ${parentCwd}. You are operating in an isolated git worktree at ${worktreeCwd} — same repository, same relative file structure, separate working copy. Paths in the inherited context refer to the parent's working directory; translate them to your worktree root. Re-read files before editing if the parent may have modified them since they appear in the context. Your changes stay in this worktree and will not affect the parent's files.`
}
