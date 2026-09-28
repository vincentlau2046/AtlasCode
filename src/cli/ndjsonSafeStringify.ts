/**
 * NDJSON 安全序列化（旧仓 cli/ndjsonSafeStringify.ts 32L 逐字随迁）。
 *
 * JSON.stringify 对 U+2028/U+2029 原样输出（ECMA-404 合法）。当输出是
 * 单行 NDJSON 时，任何按 JavaScript 行终止符语义（ECMA-262 §11.3 —
 * \n \r U+2028 U+2029）切分的接收端会把 JSON 从字符串中间切断。
 * 转义为 6 字符 反斜杠-u2028 形态（等价 JSON，解析回同一字符串）后
 * 任何接收端都不会把它误认为行终止符。
 *
 * delta 登记：旧仓 jsonStringify（utils/slowOperations）= JSON.stringify +
 * slowLogging 剖析包裹 → 新仓性能剖析面缺席，本地直用 JSON.stringify
 * （行为等价，剖析包裹裁）。行终止符经 String.fromCharCode(0x2028/0x2029)
 * 构造（源文件零不可见字符，运行时等价旧仓 /U+2028|U+2029/g 正则面）。
 */

// 单一正则 + 交替：回调每匹配一次分派，比两遍全串扫描便宜
const LINE_SEPARATOR = String.fromCharCode(0x2028)
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029)
const JS_LINE_TERMINATORS = new RegExp(
  LINE_SEPARATOR + '|' + PARAGRAPH_SEPARATOR,
  'g',
)

function escapeJsLineTerminators(json: string): string {
  const ESC = String.fromCharCode(92) // 反斜杠
  return json.replace(
    JS_LINE_TERMINATORS,
    c => (c === LINE_SEPARATOR ? ESC + 'u2028' : ESC + 'u2029'),
  )
}

/**
 * 单消息单行传输的 JSON.stringify。转义 U+2028 LINE SEPARATOR 与 U+2029
 * PARAGRAPH SEPARATOR，使序列化输出不会被按行切分的接收端截断。输出仍是
 * 合法 JSON，解析回同一值。
 */
export function ndjsonSafeStringify(value: unknown): string {
  return escapeJsLineTerminators(JSON.stringify(value))
}
