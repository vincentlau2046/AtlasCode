/**
 * AD-11 + PT-29（0.1.51 C-5，CC 2.1.111）/less-permission-prompts skill——
 * 权限提示降噪：扫描本 session transcript 的高频 read-only 工具调用 →
 * 按频次排序 → allowlist 提案 → 写入 user settings `permissions.allow`
 * （0.1.36 硬化原语 addPermissionRulesToSettings，去重 + 保留既有规则；
 * 只写 permissions.allowlist 面，不碰 0.1.42 E-1P#9 已裁 privacy 面）。
 *
 * 只读类判定的单一事实源 = engine 只读前缀族
 * （src/engine/tools/bash/bashReadOnly.ts matchReadOnlyPrefix，与
 * bashToolHasPermission step 7 自动放行同源，零漂移）：
 *   - Bash：仅命中只读前缀的调用 → `Bash(<prefix>:*)` 前缀规则
 *     （legacy :* 语法，shellRuleMatching 兼容面）
 *   - 内建只读工具（Read/Glob/Grep/NotebookRead）：裸工具名规则
 *   - MCP 工具（mcp__*）：裸工具名规则（本 session 用户已放行的调用史
 *     即降噪信号；MCP 只读性本地不可判，不越权猜）
 * 非只读 Bash（rm/npm install/git push 等）即便高频一律排除。
 *
 * 零回归约束：skill 未调用 → 权限面零变更（写入只发生在显式调用支）。
 */
import type { ContentBlockParam } from '../../types/atlas.js'
import { registerBundledSkill } from '../bundledSkills.js'
// 只读前缀族单一事实源经 engine 根门面取件（STR-1 entry-point 收口；
// matchReadOnlyPrefix 与 bashToolHasPermission step 7 自动放行同源零漂移）
import { matchReadOnlyPrefix } from 'src/engine'
import {
  addPermissionRulesToSettings,
} from '../../utils/permissions/permissionsLoader.js'
import type { PermissionRuleValue } from '../../utils/permissions/PermissionRule.js'

/** 内建只读类工具（裸工具名规则；engine 只读路径已自动放行，规则仅免弹框）。 */
const READONLY_BUILTIN_TOOLS: ReadonlySet<string> = new Set([
  'Read',
  'Glob',
  'Grep',
  'NotebookRead',
])

const DEFAULT_LIMIT = 10

export type AllowlistCandidate = {
  toolName: string
  /** `Bash` 类为 legacy 前缀规则内容（`<prefix>:*`）；裸名规则无此字段。 */
  ruleContent?: string
  frequency: number
}

/** 一条 transcript 消息的松散结构面（assistant 块承载 tool_use）。 */
type TranscriptMessage = {
  type?: string
  content?: unknown
  message?: { content?: unknown }
}

/**
 * 扫描 transcript 收集工具调用频次（只含 read-only 类，工单 §2 契约）。
 * 键 = 规则身份：Bash 按命中前缀分桶（`Bash|git status`），其余按工具名。
 */
export function extractToolCallFrequencies(
  messages: TranscriptMessage[],
): Map<string, { toolName: string; ruleContent?: string; frequency: number }> {
  const counts = new Map<string, { toolName: string; ruleContent?: string; frequency: number }>()
  for (const msg of messages) {
    const content = msg?.message?.content ?? msg?.content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (!block || typeof block !== 'object') continue
      const b = block as { type?: string; name?: string; input?: unknown }
      if (b.type !== 'tool_use' || typeof b.name !== 'string') continue
      if (b.name === 'Bash') {
        const command = (b.input as { command?: unknown } | undefined)?.command
        if (typeof command !== 'string') continue
        const prefix = matchReadOnlyPrefix(command)
        if (prefix === null) continue // 非只读类（即便高频）一律排除
        const key = `Bash|${prefix}`
        const entry =
          counts.get(key) ??
          { toolName: 'Bash', ruleContent: `${prefix}:*`, frequency: 0 }
        entry.frequency++
        counts.set(key, entry)
      } else if (
        READONLY_BUILTIN_TOOLS.has(b.name) ||
        b.name.startsWith('mcp__')
      ) {
        const entry =
          counts.get(b.name) ?? { toolName: b.name, frequency: 0 }
        entry.frequency++
        counts.set(b.name, entry)
      }
    }
  }
  return counts
}

/**
 * allowlist 提案：频次降序（同频按工具名升序确定性），截断 limit 条。
 */
export function buildAllowlistProposal(
  messages: TranscriptMessage[],
  limit: number = DEFAULT_LIMIT,
): AllowlistCandidate[] {
  const sorted = [...extractToolCallFrequencies(messages).values()]
    .sort(
      (a, b) =>
        b.frequency - a.frequency ||
        (a.toolName + (a.ruleContent ?? '')).localeCompare(
          b.toolName + (b.ruleContent ?? ''),
        ),
    )
    .slice(0, Math.max(1, limit))
  return sorted
}

/**
 * settings 写入支（工单 §1.4「只写 permissions.allowlist 面」）：经 0.1.36
 * 硬化原语追加 allow 规则（去重 + 保留未知键 + managed-rules-only 尊重）。
 * 返回 false = 写入被拒（managed 策略），调用方须如实报告。
 */
export function writeAllowlistToSettings(
  candidates: AllowlistCandidate[],
): boolean {
  if (candidates.length === 0) return true
  const ruleValues: PermissionRuleValue[] = candidates.map(c =>
    c.ruleContent
      ? { toolName: c.toolName, ruleContent: c.ruleContent }
      : { toolName: c.toolName },
  )
  return addPermissionRulesToSettings(
    { ruleValues, ruleBehavior: 'allow' },
    'userSettings',
  )
}

const NO_CANDIDATES_MESSAGE =
  'No read-only tool-call patterns were found in this session transcript to allowlist. Read-only Bash calls (e.g. `git status`, `ls`) and read-only built-in/MCP tools would appear here; write-class commands are never allowlisted by this skill. Try it in a session where you were prompted for the same read-only commands repeatedly.'

function ruleString(c: AllowlistCandidate): string {
  return c.ruleContent ? `${c.toolName}(${c.ruleContent})` : c.toolName
}

/**
 * skill 调用体（getPromptForCommand 委托体）：扫描 → 写入 → 报告块。
 * 导出供判别单测直测（契约面：频次排序 / 只读类 / 写入 / 无候选零写入）。
 */
export async function runLessPermissionPrompts(
  args: string,
  context: { messages?: TranscriptMessage[] },
): Promise<ContentBlockParam[]> {
  const parsed = args.trim() === '' ? NaN : parseInt(args.trim(), 10)
  const limit = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LIMIT
  const candidates = buildAllowlistProposal(
    context?.messages ?? [],
    limit,
  )
  if (candidates.length === 0) {
    return [{ type: 'text', text: NO_CANDIDATES_MESSAGE }]
  }
  const written = writeAllowlistToSettings(candidates)
  const lines = candidates.map(
    c => `  - \`${ruleString(c)}\` — seen ${c.frequency}× this session`,
  )
  const head = written
    ? `Added ${candidates.length} allowlist rule(s) to user settings (permissions.allow):\n${lines.join('\n')}\n\nThese read-only calls will no longer prompt. To revoke, remove the entries from \`permissions.allow\` in user settings.json.`
    : `Found ${candidates.length} allowlist candidate(s) but the write was rejected (managed permission rules policy is active):\n${lines.join('\n')}\n\nAsk your admin to add these rules, or re-run without the managed-policy override.`
  return [
    {
      type: 'text',
      text: `${head}\n\nReport this summary to the user in one short message (no extra commentary).`,
    },
  ]
}

export function registerLessPermissionPromptsSkill(): void {
  registerBundledSkill({
    name: 'less-permission-prompts',
    description:
      'Scan this session for frequent read-only tool calls and add matching allowlist rules to user settings so they stop prompting.',
    whenToUse:
      'Use when the user is tired of repeated permission prompts for the same read-only commands/tools (git status, ls, MCP read tools, …) and wants to allowlist them in one step.',
    argumentHint: '[max-rules]',
    userInvocable: true,
    // 写 settings 的降噪工具：仅用户显式调用，模型不自动触发（同 /batch 口径）
    disableModelInvocation: true,
    getPromptForCommand: runLessPermissionPrompts,
  })
}
