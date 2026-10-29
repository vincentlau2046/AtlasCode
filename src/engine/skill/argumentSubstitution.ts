/**
 * engine/skill — $ARGUMENTS 占位符替换（§8.67 D 波 S-E2a，
 * 旧仓 src/utils/argumentSubstitution.ts 逐字语义）。
 *
 * 支持：
 *   - $ARGUMENTS — 全参串
 *   - $ARGUMENTS[0] / $0 — 索引参
 *   - $foo / $bar — 命名参（frontmatter arguments 声明，按位置映射）
 * 参数解析走 shell-quote（新仓 5 依赖之一），经 engine/tools/bash 门面
 * tryParseShellCommand 消费（跨子域 import 先例 = coordinator→tools/agent）。
 */
import { tryParseShellCommand } from '../tools/bash'

/**
 * 解析参数字符串为数组（shell-quote 语义：引号串保留整体）。
 * - "foo bar baz" => ["foo", "bar", "baz"]
 * - 'foo "hello world" baz' => ["foo", "hello world", "baz"]
 */
export function parseArguments(args: string): string[] {
  if (!args || !args.trim()) {
    return []
  }

  // 返回 $KEY 保留变量字面（不展开变量）
  const result = tryParseShellCommand(args, key => `$${key}`)
  if (!result.success) {
    // 解析失败回落简单空白切分
    return args.split(/\s+/).filter(Boolean)
  }

  // 仅保留字符串 token（忽略 shell 操作符等）
  return result.tokens.filter(
    (token): token is string => typeof token === 'string',
  )
}

// 0.1.82 K3-C1（上游 301 收紧）：参数名双上限——frontmatter arguments 过多
// （>64 名）只填前 64，过长名（>64 字）截 64 字。恶意/损坏 frontmatter 的
// 64×64 上界同时约束 substituteArguments 命名替换与
// generateProgressiveArgumentHint 的正则构造/提示面。
export const MAX_ARGUMENT_NAMES = 64
export const MAX_ARGUMENT_NAME_CHARS = 64

/**
 * 从 frontmatter 'arguments' 字段解析参数名。
 * 接受空空格分隔字符串或字符串数组。
 * - "foo bar baz" => ["foo", "bar", "baz"]
 * - ["foo", "bar", "baz"] => ["foo", "bar", "baz"]
 */
export function parseArgumentNames(
  argumentNames: string | string[] | undefined,
): string[] {
  if (!argumentNames) {
    return []
  }

  // 过滤空串与纯数字名（与 $0/$1 简写冲突）
  const isValidName = (name: string): boolean =>
    typeof name === 'string' && name.trim() !== '' && !/^\d+$/.test(name)

  // K3-C1：截长（每名 ≤64 字）→ 上限（前 64 名）；≤64 名 ≤64 字零变更
  const cap = (names: string[]): string[] =>
    names.map(name => name.slice(0, MAX_ARGUMENT_NAME_CHARS)).slice(0, MAX_ARGUMENT_NAMES)

  if (Array.isArray(argumentNames)) {
    return cap(argumentNames.filter(isValidName))
  }
  if (typeof argumentNames === 'string') {
    return cap(argumentNames.split(/\s+/).filter(isValidName))
  }
  return []
}

/**
 * 生成剩余未填参数的渐进提示。
 * @returns 形如 "[arg2] [arg3]" 的提示串；全部已填返回 undefined
 */
export function generateProgressiveArgumentHint(
  argNames: string[],
  typedArgs: string[],
): string | undefined {
  const remaining = argNames.slice(typedArgs.length)
  if (remaining.length === 0) return undefined
  return remaining.map(name => `[${name}]`).join(' ')
}

// 0.1.82 K3-C2（上游 301 收紧）：占位符展开输出预算——占位符密度 × args
// 长度的展开量无界（2000 × $ARGUMENTS × 5000 字 args ≈ 10MB），恶意/损坏
// skill frontmatter 可经此内存暴涨。超预算时按位钳制替换值
// （budgetPerReplacement = floor((cap - content.length) / count)）。
export const MAX_SUBSTITUTION_OUTPUT_CHARS = 1_000_000

/**
 * 预点 content 中的占位符总数（命名 / $ARGUMENTS[n] / $n / 裸 $ARGUMENTS
 * 四形态，与 substituteArguments 替换遍同口径）——预算用的上界估计。
 */
function countPlaceholderOccurrences(
  content: string,
  argumentNames: string[],
): number {
  let count = 0
  for (const name of argumentNames) {
    if (!name) continue
    count += (content.match(new RegExp(`\\$${name}(?![\\[\\w])`, 'g')) ?? [])
      .length
  }
  count += (content.match(/\$ARGUMENTS\[\d+\]/g) ?? []).length
  count += (content.match(/\$\d+(?!\w)/g) ?? []).length
  // 裸 $ARGUMENTS：剥去 $ARGUMENTS[n] 形后计数（避免双计）
  count += (
    content.replace(/\$ARGUMENTS\[\d+\]/g, '').match(/\$ARGUMENTS/g) ?? []
  ).length
  return count
}

/**
 * 用实际参数值替换内容中的 $ARGUMENTS 占位符。
 *
 * @param content - 含占位符的内容
 * @param args - 原始参数字符串（undefined/null = 无参，原样返回）
 * @param appendIfNoPlaceholder - true 且无占位符命中时追加 "ARGUMENTS: {args}"
 * @param argumentNames - 命名参（映射到索引位）
 */
export function substituteArguments(
  content: string,
  args: string | undefined,
  appendIfNoPlaceholder = true,
  argumentNames: string[] = [],
): string {
  // undefined/null = 未提供参数 — 原样返回；空串是合法输入（占位符替空）
  if (args === undefined || args === null) {
    return content
  }

  // K3-C2：展开预算预点——投影超预算则按位钳制 args（替换值统一从
  // effectiveArgs 派生：parsedArgs 重新解析 + 裸 $ARGUMENTS 直接用）。
  // 每占位符成本按 args.length 上界估计（parsedArgs[i] ⊆ args）；无占位符
  // （count=0）恒零钳制（追加路径不经过本预算，保持原语义）。
  const placeholderCount = countPlaceholderOccurrences(content, argumentNames)
  let effectiveArgs = args
  if (
    placeholderCount > 0 &&
    content.length + placeholderCount * args.length >
      MAX_SUBSTITUTION_OUTPUT_CHARS
  ) {
    const budgetPerReplacement = Math.max(
      0,
      Math.floor(
        (MAX_SUBSTITUTION_OUTPUT_CHARS - content.length) / placeholderCount,
      ),
    )
    effectiveArgs = args.slice(0, budgetPerReplacement)
  }

  const parsedArgs = parseArguments(effectiveArgs)
  const originalContent = content

  // 命名参（$foo/$bar）→ 按位置映射。匹配 $name 但不含 $name[...] / $nameXxx
  for (let i = 0; i < argumentNames.length; i++) {
    const name = argumentNames[i]
    if (!name) continue

    content = content.replace(
      new RegExp(`\\$${name}(?![\\[\\w])`, 'g'),
      parsedArgs[i] ?? '',
    )
  }

  // 索引参（$ARGUMENTS[0] / $ARGUMENTS[1] …）
  content = content.replace(/\$ARGUMENTS\[(\d+)\]/g, (_, indexStr: string) => {
    const index = parseInt(indexStr, 10)
    return parsedArgs[index] ?? ''
  })

  // 简写索引参（$0 / $1 …）
  content = content.replace(/\$(\d+)(?!\w)/g, (_, indexStr: string) => {
    const index = parseInt(indexStr, 10)
    return parsedArgs[index] ?? ''
  })

  // $ARGUMENTS → 全参串（K3-C2：用钳制后的 effectiveArgs）
  content = content.replaceAll('$ARGUMENTS', effectiveArgs)

  // 无占位符命中且 appendIfNoPlaceholder 且 args 非空 → 追加
  if (content === originalContent && appendIfNoPlaceholder && args) {
    content = content + `\n\nARGUMENTS: ${args}`
  }

  return content
}
