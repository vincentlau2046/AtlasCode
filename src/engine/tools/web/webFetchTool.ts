/**
 * engine/tools/web — WebFetchTool 本体（S-E2 §8.59 web 族子波）。
 *
 * 旧仓来源（a8af45b）：src/tools/WebFetchTool/WebFetchTool.ts 318L 逐字随迁
 * （tool 对象旧源 16 成员 → 新契约 19 成员（新契约加 inputSchema/
 * inputJSONSchema/strict 3 成员，S-E3 A-N7 计数订正）/ checkPermissions 真规则面（preapproved 短路 +
 * deny/ask/allow 三查 + buildSuggestions）/ validateInput ec1 / call
 * （redirect 4 支 statusText + FetchedContent 解构 + preapproved 直通 +
 * applyPromptToMarkdown + 二进制落盘注记）/ mapToolResult / UI 纯逻辑
 * 面）。消费方 = `web/` 子门面 + `tools/` 门面 re-export + 注册表 49 口径
 * 无条件注册位（§8.59.4）。
 *
 * delta 登记（H6 逐条，复审勿当遗漏重提）：
 *  ① 旧 buildTool(zod inputSchema + zod outputSchema z.infer) → 新 shared
 *    Tool 契约：inputSchema = 纯 JSON schema 对象（WEB_FETCH_TOOL_INPUT_SCHEMA，
 *    旧 z.strictObject 面 → strict: true + required 双字段，readTool delta ①
 *    先例）；output → TS 型 WebFetchOutput 承载（webToolInput.ts delta ②）。
 *  ② 旧 rule-content 函数 WebFetchTool.inputSchema.safeParse（zod 全 schema
 *    校验后取 url.hostname）→ 域内本地 zod strictObject 解析（新仓
 *    zod 4.6.5 主入口 = v4，permissions/PermissionRule.ts 先例；旧
 *    `z.string().url()` 精炼随迁 = v4 `z.url()`，S-E3 A-M2 补登：
 *    S-E2 实施曾漏 .url() 且 JSON schema 面丢 wire `format:'uri'` 提示，
 *    已双补 = 旧 wire 面经 zodToJsonSchema 发 format:'uri' 提示面复原）；
 *    input 解析失败面逐字 `input:${input.toString()}`（旧行为：degenerate
 *    串，无规则可匹配，保留）。
 *  ③ 新契约 description 面 = 旧 prompt() 体（getWebFetchToolPrompt，auth
 *    warning 恒含，S-C5 delta ③ 先例）；旧短 description(input) 体 →
 *    webFetchShortDescription 导出不接线（webFetchPrompt.ts delta ①）。
 *  ④ 旧 buildTool TOOL_DEFAULTS 成员对象化（readTool delta ④ 先例）：
 *    isConcurrencySafe true / isReadOnly true / isDestructive false（缺省
 *    值）/ shouldDefer true / maxResultSizeChars 100_000（旧注释 100K 持久
 *    化阈值逐字）/ searchHint 逐字 / userFacingName 'Fetch'（旧 UI 面唯一
 *    生效值）。旧 getActivityDescription 成员新契约无位 → 裁（TUI 波前向
 *    接缝，登记）。
 *  ⑤ 旧 UI.tsx JSX 面（renderToolUseProgressMessage / renderToolResultMessage
 *    React 组件）→ 裁（TUI 波）；纯逻辑面逐字随迁：renderToolUseMessage
 *    字符串逻辑（url ? verbose 支 `url: "…"` 模板 : null）+
 *    getToolUseSummary（旧 truncate 宽感知 → 域内本地 50 字符
 *    truncateSummary，webToolInput.ts delta ⑤ 先例）。
 *  ⑥ 旧 validateInput 失败返回 {result, message, meta: {reason:
 *    'invalid_url'}, errorCode} → 新 shared ValidationResult 无 meta 字段
 *    （shared/types.ts:169 两变体）→ meta 裁（引擎 dispatch 面只消费
 *    message/errorCode，登记）。
 *  ⑦ 旧 call 2 参声明（({url,prompt},{abortController,options}) 逐字；
 *    5 参 _canUseTool/_parentMessage/onProgress 仅 WebSearch 旧面，见
 *    webSearchTool delta ⑥——S-E3 A-N2 订正）→ 新 2 参声明
 *    （readTool delta ⑧ 先例）；context duck 局部化
 *    （WebFetchToolContext，webToolInput.ts delta ④）。
 *  ⑧ 旧 UI.tsx getToolUseSummary 旧 truncate import（utils/format 宽感知）
 *    → 随 ⑤ 并入 truncateSummary 本地面（宽感知面裁登记）。
 */
import { z } from 'zod'
import {
  formatFileSize,
  type PermissionResult,
  type PermissionUpdate,
  type Tool,
  type ToolInputJSONSchema,
  type ToolResult,
  type ToolResultBlockParam,
  type ValidationResult,
} from '../../../shared'
import { getRuleByContentsForTool } from '../../../permissions'
import { isPreapprovedHost } from './preapproved'
import { getWebFetchToolPrompt, WEB_FETCH_TOOL_NAME } from './webFetchPrompt'
import {
  applyPromptToMarkdown,
  getURLMarkdownContent,
  isPreapprovedUrl,
  MAX_MARKDOWN_LENGTH,
  type FetchedContent,
  type RedirectInfo,
} from './webFetchUtils'
import {
  truncateSummary,
  type WebFetchOutput,
  type WebFetchToolContext,
  type WebFetchToolInput,
} from './webToolInput'

/** 输入 JSON schema（旧仓 zod inputSchema 逐字段转写，delta ①；format:'uri' = 旧 .url() 精炼 wire 提示面复原，delta ② / S-E3 A-M2）。 */
export const WEB_FETCH_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    url: {
      type: 'string',
      format: 'uri',
      description: 'The URL to fetch content from',
    },
    prompt: { type: 'string', description: 'The prompt to run on the fetched content' },
  },
  required: ['url', 'prompt'],
}

/** delta ②：旧 rule-content 解析面（旧 WebFetchTool.inputSchema 同形 strictObject；.url() 精炼 = v4 z.url()，S-E3 A-M2）。 */
const webFetchInputRuleSchema = z.strictObject({
  url: z.url().describe('The URL to fetch content from'),
  prompt: z.string().describe('The prompt to run on the fetched content'),
})

export function webFetchToolInputToPermissionRuleContent(input: {
  [k: string]: unknown
}): string {
  try {
    const parsedInput = webFetchInputRuleSchema.safeParse(input)
    if (!parsedInput.success) {
      return `input:${input.toString()}`
    }
    const { url } = parsedInput.data
    const hostname = new URL(url).hostname
    return `domain:${hostname}`
  } catch {
    return `input:${input.toString()}`
  }
}

/**
 * 旧 UI.tsx getToolUseSummary 逐字（delta ⑤/⑧：truncate → 本地面）。
 * 导出 = TUI 波前向接缝（模块级导出、不进 tools 门面，同
 * webFetchShortDescription 不接线族；lint no-unused-vars 面）。
 */
export function getToolUseSummary(
  input: Partial<WebFetchToolInput> | undefined,
): string | null {
  if (!input?.url) {
    return null
  }
  return truncateSummary(input.url)
}

// Tool 契约非参数化（Input 泛参位 = JSON schema 对象型，非 duck 输入型，
// readTool face 先例）；face 扩型 = checkPermissions 返回型收窄
// Promise<PermissionResult<WebFetchToolInput>>（契约位 Promise<unknown>
// 不满足 PermissionTool 目标型，扩型收窄 = getRuleByContentsForTool
// 直接传值免 cast）。
type WebFetchToolFace = Tool & {
  checkPermissions(
    input: unknown,
    context: unknown,
  ): Promise<PermissionResult<WebFetchToolInput>>
}

export const WebFetchTool: WebFetchToolFace = {
  name: WEB_FETCH_TOOL_NAME,
  inputSchema: WEB_FETCH_TOOL_INPUT_SCHEMA,
  inputJSONSchema: WEB_FETCH_TOOL_INPUT_SCHEMA,
  searchHint: 'fetch and extract content from a URL',
  // 100K chars - tool result persistence threshold
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  // delta ④：旧 z.strictObject 面
  strict: true,
  isEnabled: () => true,
  // 旧 buildTool TOOL_DEFAULTS 成员对象化（delta ④，逐值）
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  isDestructive: () => false,
  userFacingName: () => 'Fetch',
  toAutoClassifierInput(input: unknown) {
    const { url, prompt } = input as WebFetchToolInput
    return prompt ? `${url}: ${prompt}` : url
  },
  async description() {
    // delta ③：新契约唯一 prompt 面 = 旧 prompt() 体
    return getWebFetchToolPrompt()
  },
  async checkPermissions(
    input: unknown,
    context: unknown,
  ): Promise<PermissionResult<WebFetchToolInput>> {
    const appState = (context as WebFetchToolContext).getAppState()
    const permissionContext = appState.toolPermissionContext

    // Check if the hostname is in the preapproved list
    try {
      const { url } = input as { url: string }
      const parsedUrl = new URL(url)
      if (isPreapprovedHost(parsedUrl.hostname, parsedUrl.pathname)) {
        return {
          behavior: 'allow',
          updatedInput: input as WebFetchToolInput,
          decisionReason: { type: 'other', reason: 'Preapproved host' },
        }
      }
    } catch {
      // If URL parsing fails, continue with normal permission checks
    }

    // Check for a rule specific to the tool input (matching hostname)
    const ruleContent = webFetchToolInputToPermissionRuleContent(
      input as { [k: string]: unknown },
    )

    const denyRule = getRuleByContentsForTool(
      permissionContext,
      WebFetchTool,
      'deny',
    ).get(ruleContent)
    if (denyRule) {
      return {
        behavior: 'deny',
        message: `${WebFetchTool.name} denied access to ${ruleContent}.`,
        decisionReason: {
          type: 'rule',
          rule: denyRule,
        },
      }
    }

    const askRule = getRuleByContentsForTool(
      permissionContext,
      WebFetchTool,
      'ask',
    ).get(ruleContent)
    if (askRule) {
      return {
        behavior: 'ask',
        message: `Claude requested permissions to use ${WebFetchTool.name}, but you haven't granted it yet.`,
        decisionReason: {
          type: 'rule',
          rule: askRule,
        },
        suggestions: buildSuggestions(ruleContent),
      }
    }

    const allowRule = getRuleByContentsForTool(
      permissionContext,
      WebFetchTool,
      'allow',
    ).get(ruleContent)
    if (allowRule) {
      return {
        behavior: 'allow',
        updatedInput: input as WebFetchToolInput,
        decisionReason: {
          type: 'rule',
          rule: allowRule,
        },
      }
    }

    return {
      behavior: 'ask',
      message: `Claude requested permissions to use ${WebFetchTool.name}, but you haven't granted it yet.`,
      suggestions: buildSuggestions(ruleContent),
    }
  },
  async validateInput(input: unknown): Promise<ValidationResult> {
    const { url } = input as WebFetchToolInput
    try {
      new URL(url)
    } catch {
      return {
        result: false,
        message: `Error: Invalid URL "${url}". The URL provided could not be parsed.`,
        errorCode: 1,
      }
    }
    return { result: true }
  },
  // delta ⑤：旧 UI.tsx 纯逻辑面逐字（React 组件面 TUI 波裁）
  renderToolUseMessage(
    input: unknown,
    options: { theme: unknown; verbose: boolean; commands?: unknown[] },
  ) {
    const { url, prompt } = input as Partial<WebFetchToolInput>
    if (!url) {
      return null
    }
    if (options.verbose) {
      return `url: "${url}"${options.verbose && prompt ? `, prompt: "${prompt}"` : ''}`
    }
    return url
  },
  async call(args: unknown, context: unknown): Promise<ToolResult<WebFetchOutput>> {
    const { url, prompt } = args as WebFetchToolInput
    const {
      abortController,
      options: { isNonInteractiveSession },
    } = context as WebFetchToolContext

    const start = Date.now()

    const response = await getURLMarkdownContent(url, abortController)

    // Check if we got a redirect to a different host
    if (isRedirectInfo(response)) {
      const statusText =
        response.statusCode === 301
          ? 'Moved Permanently'
          : response.statusCode === 308
            ? 'Permanent Redirect'
            : response.statusCode === 307
              ? 'Temporary Redirect'
              : 'Found'

      const message = `REDIRECT DETECTED: The URL redirects to a different host.

Original URL: ${response.originalUrl}
Redirect URL: ${response.redirectUrl}
Status: ${response.statusCode} ${statusText}

To complete your request, I need to fetch content from the redirected URL. Please use WebFetch again with these parameters:
- url: "${response.redirectUrl}"
- prompt: "${prompt}"`

      const output: WebFetchOutput = {
        bytes: Buffer.byteLength(message),
        code: response.statusCode,
        codeText: statusText,
        result: message,
        durationMs: Date.now() - start,
        url,
      }

      return {
        data: output,
      }
    }

    const {
      content,
      bytes,
      code,
      codeText,
      contentType,
      persistedPath,
      persistedSize,
    } = response as FetchedContent

    const isPreapproved = isPreapprovedUrl(url)

    let result: string
    if (
      isPreapproved &&
      contentType.includes('text/markdown') &&
      content.length < MAX_MARKDOWN_LENGTH
    ) {
      result = content
    } else {
      result = await applyPromptToMarkdown(
        prompt,
        content,
        abortController.signal,
        isNonInteractiveSession,
        isPreapproved,
      )
    }

    // Binary content (PDFs, etc.) was additionally saved to disk with a
    // mime-derived extension. Note it so Claude can inspect the raw file
    // if the Haiku summary above isn't enough.
    if (persistedPath) {
      result += `\n\n[Binary content (${contentType}, ${formatFileSize(persistedSize ?? bytes)}) also saved to ${persistedPath}]`
    }

    const output: WebFetchOutput = {
      bytes,
      code,
      codeText,
      result,
      durationMs: Date.now() - start,
      url,
    }

    return {
      data: output,
    }
  },
  mapToolResultToToolResultBlockParam(
    { result }: WebFetchOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: result,
    }
  },
}

function buildSuggestions(ruleContent: string): PermissionUpdate[] {
  return [
    {
      type: 'addRules',
      destination: 'localSettings',
      rules: [{ toolName: WEB_FETCH_TOOL_NAME, ruleContent }],
      behavior: 'allow',
    },
  ]
}

function isRedirectInfo(
  response: FetchedContent | RedirectInfo,
): response is RedirectInfo {
  return 'type' in response && response.type === 'redirect'
}
