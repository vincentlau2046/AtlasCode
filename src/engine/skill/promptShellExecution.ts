/**
 * engine/skill — 技能提示词内嵌 shell 命令执行（§8.67 D 波 S-E2a，
 * 旧仓 src/utils/promptShellExecution.ts 落面）。
 *
 * 两种语法：
 *   - 代码块：```! command ```
 *   - 内联：  !`command`
 * shell 来源 = frontmatter（作者选择，bash 默认）；永不经
 * settings.defaultShell（逐字旧仓语义）。
 *
 * 适配裁定（复审勿当遗漏重提）：
 *   ① PowerShell 支（旧 isPowerShellToolEnabled 门控 + PowerShellTool
 *      懒 require）→ 裁（新仓无 PowerShellTool 面；`shell: powershell`
 *      收窄为 bash 路由，frontmatter 解析面保留字面量供未来波回填）。
 *   ② 权限检查面：旧 hasPermissionsToUseTool（富 context 全局权限态）→
 *      新仓 context.checkPermission 透传面（PermissionGate duck，
 *      pipeline 契约）：注入 → 门判定（拒绝 = MalformedCommandError）；
 *      未注入 = 窄 spine 放行（与父 loop 未注门语义对齐）。
 *   ③ processToolResultBlock 持久化面未落 → 输出经 Out 面直取
 *      （stdout/stderr 组合，旧 formatBashOutput 逐字值）。
 *   ④ Tool.call 契约 parentMessage 必填但新 BashTool 不消费（窄 spine）
 *      → null cast（cast 收窄登记，同 engine/tools/bash 宽骨架先例）。
 */
import { logForDebugging, type AssistantMessage } from '../../shared'
import { BashTool, type Out } from '../tools/bash'
import { MalformedCommandError } from './errors'
import type { FrontmatterShell } from './frontmatterFields'
import type { SkillCommandContext } from './types'

// 代码块语法：```! command ```
const BLOCK_PATTERN = /```!\s*\n?([\s\S]*?)\n?```/g

// 内联语法：!`command`。正后行断言要求 ! 前是空白或行首 — 防 markdown
// 行内代码 `!!` / 相邻 span `foo`!`bar` / shell 变量 $! 误匹配。
// 慢路径（lookbehind 扫描）由下方 text.includes('!`') 子串门控
// （93% 技能无 !`，跳过昂贵扫描；BLOCK_PATTERN 无此需求恒扫）。
const INLINE_PATTERN = /(?<=^|\s)!`([^`]+)`/gm

/** PermissionGate duck（pipeline 契约 {allowed, reason?}）。 */
type GateFn = (
  tool: unknown,
  input: unknown,
) => Promise<{ allowed: boolean; reason?: string }>

/**
 * 解析提示词文本并执行内嵌 shell 命令（逐字旧仓匹配/替换语义）。
 *
 * @param text - 提示词文本
 * @param context - 最小工具 context（signal / checkPermission 透传面）
 * @param slashCommandName - 调用方名（日志用，形如 /skill-name）
 * @param shell - 路由 shell（frontmatter 作者选择；powershell 支裁 ①）
 */
export async function executeShellCommandsInPrompt(
  text: string,
  context: SkillCommandContext,
  slashCommandName: string,
  shell?: FrontmatterShell,
): Promise<string> {
  let result = text

  // 工具一次解析。`shell === undefined` 与 `shell === 'bash'` 同路
  // BashTool；powershell 支裁（头注 ①）→ 恒 BashTool。
  void shell

  const blockMatches = text.matchAll(BLOCK_PATTERN)
  const inlineMatches = text.includes('!`')
    ? text.matchAll(INLINE_PATTERN)
    : []

  await Promise.all(
    [...blockMatches, ...inlineMatches].map(async match => {
      const command = match[1]?.trim()
      if (command) {
        try {
          // 执行前权限检查（头注 ②）
          const gate =
            typeof context.checkPermission === 'function'
              ? (context.checkPermission as unknown as GateFn)
              : null
          if (gate) {
            const verdict = await gate(BashTool, { command })
            if (!verdict.allowed) {
              logForDebugging(
                `Shell command permission check failed for command in ${slashCommandName}: ${command}. Error: ${verdict.reason}`,
              )
              throw new MalformedCommandError(
                `Shell command permission check failed for pattern "${match[0]}": ${verdict.reason || 'Permission denied'}`,
              )
            }
          }

          const { data } = await BashTool.call(
            { command },
            context,
            null,
            // 头注 ④：新 BashTool 不消费 parentMessage（窄 spine）
            null as unknown as AssistantMessage,
          )
          if (!data) {
            throw new MalformedCommandError(
              `Shell command produced no result for pattern "${match[0]}"`,
            )
          }
          const out = data as Out
          const output = formatBashOutput(out.stdout, out.stderr)
          // 函数替换器 — String.replace 对替换串解释 $$/$&/`$/$'，
          // shell 输出（尤其 $$、$env 类）是任意用户数据，裸串会损坏
          result = result.replace(match[0], () => output)
        } catch (e) {
          if (e instanceof MalformedCommandError) {
            throw e
          }
          formatBashError(e, match[0])
        }
      }
    }),
  )

  return result
}

function formatBashOutput(stdout: string, stderr: string, inline = false): string {
  const parts: string[] = []

  if (stdout.trim()) {
    parts.push(stdout.trim())
  }

  if (stderr.trim()) {
    if (inline) {
      parts.push(`[stderr: ${stderr.trim()}]`)
    } else {
      parts.push(`[stderr]\n${stderr.trim()}`)
    }
  }

  return parts.join(inline ? ' ' : '\n')
}

/** 执行错误 → MalformedCommandError（中断 / 失败 / 通用三类，逐字旧仓）。 */
function formatBashError(e: unknown, pattern: string, inline = false): never {
  // 新仓 BashTool 中断经 Out.interrupted 返回（不抛 ShellError，
  // errors.ts 头注）— 此处仅处理通用异常路径。
  const message = e instanceof Error ? e.message : String(e)
  const formatted = inline ? `[Error: ${message}]` : `[Error]\n${message}`
  throw new MalformedCommandError(
    `Shell command failed for pattern "${pattern}": ${formatted}`,
  )
}
