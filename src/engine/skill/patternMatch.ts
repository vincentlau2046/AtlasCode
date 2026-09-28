// engine/skill — 条件技能路径匹配（§8.67 D 波 S-E2a 裁定落面）。
//
// 旧仓 activateConditionalSkillsForPaths 用 `ignore` 库（gitignore 风格）
// 匹配 skill `paths` frontmatter pattern 与模型触碰的文件相对路径。
// 新仓 3 依赖纪律（diff/openai/proper-lockfile/shell-quote/zod）不含
// `ignore` → 本地最小 matcher（本文件）。
//
// 支持语义（`ignore` 库常用子集，gitignore 风格）：
//   - 双星整段 = 任意深度；双星/前缀 = 零或多层目录；中段双星
//     （a 双星 b 形态）= 零或多层目录
//   - `*` = 段内任意（不含 /）；`?` = 段内单字符；`[abc]`/`[!abc]` 字符类
//   - 无 `/` 的 pattern = 任意深度匹配（gitignore「分隔符仅出现于首尾
//     时相对每级目录」规则）；含内部 `/` = 相对仓根锚定
//   - 前导 `/` = 锚定根；尾随 `/` = 目录 pattern（匹配其下文件）
//   - 目录前缀规则：pattern 命中任一目录前缀即命中其下文件（gitignore
//     「命中目录 = 命中其中一切」）
//   - `!` 负模式：按序评估，最后命中者生效
// 语义差登记（复审勿当遗漏重提，均为罕见边缘形态）：
//   ① 「父目录被排除时无法再包含其下文件」的 gitignore 规则未实现
//      （最后命中者生效已覆盖绝大多数 skill.paths 用法）
//   ② 段内双星子串（如 a**b）按 `[^/]*` 展开（fnmatch 等价，非整段语义）
//   ③ 字符类否定同时接受 `!`（fnmatch）与 `^`（regex 习惯）
// 输入：patterns = parseSkillPaths 产物（斜杠双星尾缀已剥、全双星已滤）；
// relativePath = 相对 cwd 的 posix 风格路径（win32 反斜杠由调用方归一）。

/** 段内字符 → 正则（`*`/`?`/`[...]` 转换，其余转义）。 */
function compileSegment(seg: string): string {
  let out = ''
  let i = 0
  while (i < seg.length) {
    const ch = seg[i]
    if (ch === '*') {
      out += '[^/]*'
      i++
    } else if (ch === '?') {
      out += '[^/]'
      i++
    } else if (ch === '[') {
      // 字符类：找闭括号；首字符 !/^ 表否定
      const close = seg.indexOf(']', i + 1)
      if (close > i + 1) {
        let body = seg.slice(i + 1, close)
        if (body.startsWith('!') || body.startsWith('^')) {
          body = '^' + body.slice(1)
        }
        out += `[${body}]`
        i = close + 1
      } else {
        out += '\\['
        i++
      }
    } else if ('.+(){}|^$\\/'.includes(ch)) {
      out += `\\${ch}`
      i++
    } else {
      out += ch
      i++
    }
  }
  return out
}

/** 单 pattern → 正则（锚定/任意深度 + `**` 段语义 + 目录前缀规则）。 */
function compilePattern(pattern: string): {
  re: RegExp
  dirOnly: boolean
} {
  let p = pattern.trim()
  let dirOnly = false
  if (p.endsWith('/')) {
    dirOnly = true
    p = p.slice(0, -1)
  }
  let anchored = false
  if (p.startsWith('/')) {
    p = p.slice(1)
    anchored = true
  }
  if (p === '**') {
    return { re: /^.*$/, dirOnly }
  }

  const segs = p.split('/')
  // gitignore：pattern 含内部 / = 相对仓根锚定；无 / = 任意深度
  const hasInteriorSlash = p.includes('/')
  if (hasInteriorSlash) {
    anchored = true
  }

  let regex = ''
  segs.forEach((seg, i) => {
    if (seg === '**') {
      if (i === 0) {
        // 前导 **/ = 零或多层目录（含根级：`**/foo` 匹配根 foo）
        regex += '(?:.+/)?'
      } else if (i === segs.length - 1) {
        // 尾随 /** = 其下一切（补 / 分隔）
        if (i > 0) regex += '/'
        regex += '.*'
      } else {
        // 中段 a/**/b（上游 parseSkillPaths 已剥 `/**` 尾缀，罕见路径）
        if (i > 0) regex += '/'
        regex += '**MID**'
      }
    } else {
      // 紧跟前导 ** 时不再补分隔（'(?:.+/)?' 已含 /）；中段 **MID** 后
      // 仍需分隔（'/**MID**/' 替换单元含尾 /）
      if (i > 0 && !(i === 1 && segs[0] === '**')) regex += '/'
      regex += compileSegment(seg)
    }
  })
  // 中段 `/**/` → 零或多层目录（`a/**/b` 匹配 a/b 与 a/x/b）：
  // 替换单元含两侧分隔，产物 = 空（零层）或 `/dir/.../`（≥1 层）
  regex = regex.replace('/**MID**/', '(?:/|/.+/)')

  if (!anchored) {
    // 任意深度：零或多层前缀目录
    regex = '(?:.+/)?' + regex
  }

  const base = `^${regex}$`
  if (dirOnly) {
    // 目录 pattern：命中目录前缀（或路径本身为同名目录，文件路径下不成立）
    return { re: new RegExp(`^${regex}(?:/.*)?$`), dirOnly: true }
  }
  return { re: new RegExp(base), dirOnly: false }
}

/**
 * 判定 relativePath 是否被 patterns（按序，`!` 负模式最后命中者生效）命中。
 * 目录前缀规则：非 dirOnly pattern 命中任一目录前缀同样命中其下文件。
 */
export function gitignoreMatch(
  patterns: string[],
  relativePath: string,
): boolean {
  if (patterns.length === 0) return false
  const posixPath = relativePath.replace(/\\/g, '/').replace(/^\.?\//, '')
  if (!posixPath) return false

  const segments = posixPath.split('/')
  let hit = false // 任一 pattern 命中（整路径或目录前缀）
  let lastNegative = false // 最后命中 pattern 是否为负模式

  for (const pattern of patterns) {
    const negative = pattern.startsWith('!')
    const body = negative ? pattern.slice(1) : pattern
    if (!body) continue

    const { re, dirOnly } = compilePattern(body)
    let matched = false
    if (re.test(posixPath)) {
      // dirOnly 且命中整路径 = 路径本身即目录名（文件路径下近似放行，
      // 语义差 ③ 登记）
      matched = true
    } else if (!dirOnly) {
      // 目录前缀规则：pattern 命中任一目录前缀 → 命中其下文件
      // （dirOnly pattern 的前缀已由 (?:/.*)?$ 覆盖）
      for (let k = 1; k < segments.length; k++) {
        if (re.test(segments.slice(0, k).join('/'))) {
          matched = true
          break
        }
      }
    }
    if (matched) {
      hit = true
      lastNegative = negative
    }
  }

  // 无命中 = 未忽略；有命中 = 最后命中者生效（负模式命中即未忽略）
  return hit && !lastNegative
}
