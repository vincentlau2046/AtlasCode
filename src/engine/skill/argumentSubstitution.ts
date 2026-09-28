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

/**
 * 从 frontmatter 'arguments' 字段解析参数名。
 * 接受空格分隔字符串或字符串数组。
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

  if (Array.isArray(argumentNames)) {
    return argumentNames.filter(isValidName)
  }
  if (typeof argumentNames === 'string') {
    return argumentNames.split(/\s+/).filter(isValidName)
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

  const parsedArgs = parseArguments(args)
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

  // $ARGUMENTS → 全参串
  content = content.replaceAll('$ARGUMENTS', args)

  // 无占位符命中且 appendIfNoPlaceholder 且 args 非空 → 追加
  if (content === originalContent && appendIfNoPlaceholder && args) {
    content = content + `\n\nARGUMENTS: ${args}`
  }

  return content
}
