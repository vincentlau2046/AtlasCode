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
 * 模板某位的占位符匹配（预算预点与替换遍共用的形状单一事实源，两口径
 * 不可能漂移）：
 *  - named:     $foo（边界 = 后继字符既非 '[' 非字字符；重名按声明序先到
 *              先得，与旧顺序遍语义一致）
 *  - indexed:   $ARGUMENTS[0]
 *  - bare:      $ARGUMENTS
 *  - shorthand: $0（边界 = 后继字符非字字符）
 */
interface PlaceholderMatch {
  length: number
  kind: 'named' | 'indexed' | 'bare' | 'shorthand'
  nameIndex?: number
  argIndex?: number
}

const INDEXED_PLACEHOLDER_RE = /\$ARGUMENTS\[(\d+)\]/y
const SHORTHAND_PLACEHOLDER_RE = /\$(\d+)/y

function isWordChar(c: string | undefined): boolean {
  return c !== undefined && /[A-Za-z0-9_]/.test(c)
}

function matchPlaceholderAt(
  content: string,
  i: number,
  argumentNames: string[],
): PlaceholderMatch | null {
  if (content[i] !== '$') return null
  // 1) 命名参（字面 startsWith——含正则元字符的名按字面匹配，不再经
  //    RegExp 构造（旧实现会抛/错配））
  for (let n = 0; n < argumentNames.length; n++) {
    const name = argumentNames[n]
    if (!name) continue
    if (content.startsWith(`$${name}`, i)) {
      const after = content[i + 1 + name.length]
      if (after !== '[' && !isWordChar(after)) {
        return { length: 1 + name.length, kind: 'named', nameIndex: n }
      }
    }
  }
  // 2) 索引参 $ARGUMENTS[n]
  INDEXED_PLACEHOLDER_RE.lastIndex = i
  const indexed = INDEXED_PLACEHOLDER_RE.exec(content)
  if (indexed) {
    return {
      length: indexed[0].length,
      kind: 'indexed',
      argIndex: parseInt(indexed[1], 10),
    }
  }
  // 3) 裸 $ARGUMENTS
  if (content.startsWith('$ARGUMENTS', i)) {
    return { length: '$ARGUMENTS'.length, kind: 'bare' }
  }
  // 4) 简写 $n
  SHORTHAND_PLACEHOLDER_RE.lastIndex = i
  const shorthand = SHORTHAND_PLACEHOLDER_RE.exec(content)
  if (shorthand && !isWordChar(content[i + shorthand[0].length])) {
    return {
      length: shorthand[0].length,
      kind: 'shorthand',
      argIndex: parseInt(shorthand[1], 10),
    }
  }
  return null
}

/**
 * 预点 content 中的占位符总数（与替换遍同一 matcher 单遍扫描）——
 * 预算用的上界估计。
 */
function countPlaceholderOccurrences(
  content: string,
  argumentNames: string[],
): number {
  let count = 0
  let i = 0
  while (i < content.length) {
    const m = matchPlaceholderAt(content, i, argumentNames)
    if (m) {
      count++
      i += m.length
    } else {
      i++
    }
  }
  return count
}

/**
 * 用实际参数值替换内容中的 $ARGUMENTS 占位符。
 *
 * K3-C2 round-5（security review）：替换改为**对原模板的单遍扫描**，
 * 参数值按字面输出。旧多遍正则实现有两条绕过预算的放大路径：
 * (a) string replacement 解释 `$&`/`` $' ``/`` $` ``/`$$`——`$'` 值拼接
 * 匹配点之后的全部文本，密集模板 × 2 字 args 可展开 ~content²/12；
 * (b) 各遍跑在已替换文本上，值内含的占位符被后续遍重展开。单遍字面
 * 输出后下方投影成为真上界，钳制精确。
 *
 * @param content - 含占位符的内容
 * @param args - 原始参数字符串（undefined/null = 无参，原样返回）
 * @param appendIfNoPlaceholder - true 且无占位符命中时追加 "ARGUMENTS: {args}"
 * @param argumentNames - 命名参（映射到索引位）
 */
function substituteArgumentsImpl(
  content: string,
  args: string | undefined,
  appendIfNoPlaceholder: boolean,
  argumentNames: string[],
  strict: boolean,
): string | null {
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
    // K3-C2 round-5 #2：strict 模式超预算显式拒绝（返 null）而非钳制——
    // 门控 hook 的决策输入绝不静默截断（调用方拒掉被门控动作）
    if (strict) return null
    const budgetPerReplacement = Math.max(
      0,
      Math.floor(
        (MAX_SUBSTITUTION_OUTPUT_CHARS - content.length) / placeholderCount,
      ),
    )
    effectiveArgs = args.slice(0, budgetPerReplacement)
  } else if (strict) {
    // K3-C2 round-6：strict 预检覆盖所有产输出分支。无占位符时输出 =
    // 纯模板透传或追加分支（模板 + "ARGUMENTS: " + args）——两者均线性、
    // 永不截断，但超预算的提示同样必须拒绝而非喂给决策模型。
    const appendLen =
      appendIfNoPlaceholder && args
        ? '\n\nARGUMENTS: '.length + args.length
        : 0
    if (content.length + appendLen > MAX_SUBSTITUTION_OUTPUT_CHARS) {
      return null
    }
  }

  const parsedArgs = parseArguments(effectiveArgs)

  // 单遍扫描：模板字符原样透传；替换值字面追加、永不回扫。appendValue
  // 对替换值做累计预算防御性钳制（上方预点在数学上已保证；模板字面
  // 永不截断——无占位符内容保持原透传语义）。
  let out = ''
  const appendValue = (value: string): void => {
    if (out.length + value.length > MAX_SUBSTITUTION_OUTPUT_CHARS) {
      value = value.slice(
        0,
        Math.max(0, MAX_SUBSTITUTION_OUTPUT_CHARS - out.length),
      )
    }
    out += value
  }
  let matched = false
  let i = 0
  while (i < content.length) {
    const m = matchPlaceholderAt(content, i, argumentNames)
    if (m) {
      matched = true
      if (m.kind === 'bare') appendValue(effectiveArgs)
      else if (m.kind === 'named') appendValue(parsedArgs[m.nameIndex!] ?? '')
      else appendValue(parsedArgs[m.argIndex!] ?? '')
      i += m.length
    } else {
      out += content[i]
      i++
    }
  }

  // 无占位符命中且 appendIfNoPlaceholder 且 args 非空 → 追加
  //（按命中标志而非文本等价——替换值恰复现占位符文本时也算命中；
  // 旧等价代理在该病态边沿会双重输出）
  if (!matched && appendIfNoPlaceholder && args) {
    out = out + `\n\nARGUMENTS: ${args}`
  }

  return out
}

export function substituteArguments(
  content: string,
  args: string | undefined,
  appendIfNoPlaceholder = true,
  argumentNames: string[] = [],
): string {
  return (
    substituteArgumentsImpl(
      content,
      args,
      appendIfNoPlaceholder,
      argumentNames,
      false,
    ) ?? content
  )
}

/**
 * strict 变体（喂门控决策的输入专用）：展开超预算时返 null 而非钳制，
 * 调用方据此拒掉被门控动作（fail-closed），绝不基于未标记前缀放行。
 */
export function substituteArgumentsStrict(
  content: string,
  args: string | undefined,
  appendIfNoPlaceholder = true,
  argumentNames: string[] = [],
): string | null {
  return substituteArgumentsImpl(
    content,
    args,
    appendIfNoPlaceholder,
    argumentNames,
    true,
  )
}
