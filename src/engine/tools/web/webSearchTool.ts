/**
 * engine/tools/web — WebSearchTool 本体（S-E2 §8.59 web 族子波）。
 *
 * 旧仓来源（a8af45b）：src/tools/WebSearchTool/WebSearchTool.ts 354L 逐字随迁
 * （makeToolSchema wire 面 / makeOutputFromSearchResponse 三块型流解析 /
 * call（chatStream 双路收集 + B8 error 支逐字）/ mapToolResult（Links +
 * REMINDER 段）/ checkPermissions passthrough / extractSearchText 幻影守卫
 * / UI 纯逻辑面）。消费方 = `web/` 子门面 + `tools/` 门面 re-export +
 * 注册表 49 口径无条件注册位（§8.59.4）。
 *
 * delta 登记（H6 逐条，复审勿当遗漏重提）：
 *  ① 旧 buildTool(zod inputSchema + outputSchema z.infer + searchResultSchema)
 *    → 新 shared Tool 契约：inputSchema = 纯 JSON schema 对象
 *    （WEB_SEARCH_TOOL_INPUT_SCHEMA，旧 z.strictObject 面 → strict: true +
 *    required query；readTool delta ① 先例）；SearchResult/WebSearchOutput
 *    型面 → webToolInput.ts 承载（delta ②）。
 *  ② 旧 BetaWebSearchTool20250305 / BetaContentBlock（types/atlas.ts 旧 SDK
 *    型）→ 域内结构型 WebSearchServerToolSchema / SearchContentBlock
 *    （webToolInput.ts，wire 面 = extraToolSchemas 注入 + 流收集两消费者）。
 *  ③ 旧 GrowthBook 门 getFeatureValue_CACHED_MAY_BE_STALE('atlas_plum_vx3',
 *    false) → 整砍（新仓无 GrowthBook 基础设施，readTool delta ⑨ env 门
 *    先例同族）：useHaiku 恒 false → 旧 haiku 支（getDefaultFastModel /
 *    toolChoice web_search / thinkingConfig disabled）全裁，恒走
 *    mainLoopModel 路径（登记 = haiku 快模型搜索支 TUI/增强波复活候选）。
 *  ④ 旧 context.options.mainLoopModel（= small 角色池头）→ 新仓
 *    getMainLoopModelName()（files 域，files/modelRef.ts:24，S-E1 裁定）；
 *    措辞订正（S-E3 A-N3）：旧 getDefaultFastModel 源 = fast 角色池
 *    （settings.modelRoles.fast > ATLAS_FAST_MODEL > getRoleModel('fast')），
 *    与 mainLoopModel（small 池头）不同源——仅 ③ 所裁 GB 门 haiku 支
 *    消费，该支整裁后新 ≡ 旧 mainLoopModel 支恒真。
 *  ⑤ 旧 buildOpenAIParams options 11 字段 → 新 builder 消费面
 *    （model/toolChoice/extraToolSchemas/maxOutputTokensOverride/
 *    temperatureOverride/effortValue）7 字段零命中裁：getToolPermissionContext
 *    / isNonInteractiveSession / hasAppendSystemPrompt / querySource / agents /
 *    mcpTools / agentId（登记）；toolChoice 随 ③ haiku 支裁（恒 undefined）；
 *    thinkingConfig 位保留 = ctx.options.thinkingConfig（旧 useHaiku-false
 *    支逐字）；InDomainUserMessage → Message[] 双 cast（权威登记位 =
 *    webFetchUtils delta ⑨，本文件自足登记，S-E3 B-N7）。
 *  ⑥ 旧 call 5 参声明（_canUseTool/_parentMessage/onProgress 体零消费，
 *    L233 声明实证）→ 新 2 参声明（readTool delta ⑧ 先例）；context duck
 *    局部化（WebSearchToolContext，webToolInput.ts delta ④）。
 *  ⑦ 旧 utils/slowOperations jsonStringify（slowLogging 包裹）→ 新仓
 *    session 域内版 `jsonStringify`（session/json.ts，计时面 d1 已裁；跨域
 *    import 先例 = messaging/mailbox.ts 溯源注释）——S-E1「稳定排序变体」
 *    判误核销：旧 slowOperations 无 sort 面，即 1 参 JSON.stringify 语义；
 *    签名面注（S-E3 A-N9）：新 session/json.ts 为 (data, space?) 2 参
 *    （旧 slowOperations 3 参 value/replacer/space），web 消费面仅 1 参
 *    调用 = 等价；该文件属 session 域（本波外），宽口径登记。
 *  ⑧ 旧 UI.tsx JSX 面（renderToolUseProgressMessage 双型 switch /
 *    renderToolResultMessage getSearchSummary 统计组件）→ 裁（TUI 波）；
 *    纯逻辑面逐字随迁：renderToolUseMessage 字符串逻辑（query 引号 +
 *    verbose 域名单）+ getToolUseSummary（本地 50 字符 truncateSummary，
 *    webToolInput.ts delta ⑤）。旧 WebSearchProgress 重导出面 → 域内结构
 *    duck（webToolInput.ts delta ③）；本工具 call 2 参化后不发射 progress
 *    （旧 onProgress 体零消费实证），型面 = 进度波前向接缝。
 *  ⑨ 旧 getActivityDescription 成员新契约无位 → 裁（TUI 波前向接缝，
 *    webFetchTool.ts delta ④ 同面）。
 */
import {
  asSystemPrompt,
  logError,
  type Message,
  type PermissionResult,
  type Tool,
  type ToolInputJSONSchema,
  type ToolResult,
  type ToolResultBlockParam,
  type ValidationResult,
} from '../../../shared'
import { buildOpenAIParams, modelProvider, modelToRole } from '../../../modelprovider'
import { jsonStringify } from '../../session'
import { createUserMessage, getMainLoopModelName } from '../files'
import { getWebSearchPrompt, WEB_SEARCH_TOOL_NAME } from './webSearchPrompt'
import {
  truncateSummary,
  type SearchContentBlock,
  type WebSearchOutput,
  type WebSearchResult,
  type WebSearchServerToolSchema,
  type WebSearchToolContext,
  type WebSearchToolInput,
} from './webToolInput'

/** 输入 JSON schema（旧仓 zod inputSchema 逐字段转写，delta ①）。 */
export const WEB_SEARCH_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    query: { type: 'string', minLength: 2, description: 'The search query to use' },
    allowed_domains: {
      type: 'array',
      items: { type: 'string' },
      description: 'Only include search results from these domains',
    },
    blocked_domains: {
      type: 'array',
      items: { type: 'string' },
      description: 'Never include search results from these domains',
    },
  },
  required: ['query'],
}

/** 旧 makeToolSchema 逐字（wire 面 = extraToolSchemas 注入，delta ②）。 */
export function makeToolSchema(input: WebSearchToolInput): WebSearchServerToolSchema {
  return {
    type: 'web_search_20250305',
    name: 'web_search',
    allowed_domains: input.allowed_domains,
    blocked_domains: input.blocked_domains,
    max_uses: 8, // Hardcoded to 8 searches maximum
  }
}

/** 旧 makeOutputFromSearchResponse 逐字（三块型流解析，delta ② 型面）。 */
export function makeOutputFromSearchResponse(
  result: SearchContentBlock[],
  query: string,
  durationSeconds: number,
): WebSearchOutput {
  // The result is a sequence of these blocks:
  // - text to start -- always?
  // [
  //    - server_tool_use
  //    - web_search_tool_result
  //    - text and citation blocks intermingled
  //  ]+  (this block repeated for each search)

  const results: (WebSearchResult | string)[] = []
  let textAcc = ''
  let inText = true

  for (const block of result) {
    if (block.type === 'server_tool_use') {
      if (inText) {
        inText = false
        if (textAcc.trim().length > 0) {
          results.push(textAcc.trim())
        }
        textAcc = ''
      }
      continue
    }

    if (block.type === 'web_search_tool_result') {
      // Handle error case - content is a WebSearchToolResultError
      if (!Array.isArray(block.content)) {
        const errorMessage = `Web search error: ${block.content.error_code}`
        logError(new Error(errorMessage))
        results.push(errorMessage)
        continue
      }
      // Success case - add results to our collection
      const hits = block.content.map(r => ({ title: r.title, url: r.url }))
      results.push({
        tool_use_id: block.tool_use_id,
        content: hits,
      })
    }

    if (block.type === 'text') {
      if (inText) {
        textAcc += block.text
      } else {
        inText = true
        textAcc = block.text
      }
    }
  }

  if (textAcc.length) {
    results.push(textAcc.trim())
  }

  return {
    query,
    results,
    durationSeconds,
  }
}

/**
 * 旧 UI.tsx getToolUseSummary 逐字（delta ⑧：truncate → 本地面）。
 * 导出 = TUI 波前向接缝（模块级导出、不进 tools 门面，同
 * webSearchShortDescription 不接线族；lint no-unused-vars 面）。
 */
export function getToolUseSummary(
  input: Partial<WebSearchToolInput> | undefined,
): string | null {
  if (!input?.query) {
    return null
  }
  return truncateSummary(input.query)
}

type WebSearchToolFace = Tool & {
  checkPermissions(
    input: unknown,
    context: unknown,
  ): Promise<PermissionResult<WebSearchToolInput>>
}

export const WebSearchTool: WebSearchToolFace = {
  name: WEB_SEARCH_TOOL_NAME,
  inputSchema: WEB_SEARCH_TOOL_INPUT_SCHEMA,
  inputJSONSchema: WEB_SEARCH_TOOL_INPUT_SCHEMA,
  searchHint: 'search the web for current information',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  // delta ①：旧 z.strictObject 面
  strict: true,
  isEnabled: () => {
    // provider 恒为 'firstParty'（3P Vertex/Foundry 分支随 legacy-model-stack
    // 清理删除）→ 恒启用。
    return true
  },
  // 旧 buildTool TOOL_DEFAULTS 成员对象化（webFetchTool.ts delta ④ 同面，逐值）
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  isDestructive: () => false,
  userFacingName: () => 'Web Search',
  toAutoClassifierInput(input: unknown) {
    return (input as WebSearchToolInput).query
  },
  async description() {
    // delta ③ 同源面：新契约唯一 prompt 面 = 旧 prompt() 体
    return getWebSearchPrompt()
  },
  async checkPermissions(
    _input: unknown,
    _context: unknown,
  ): Promise<PermissionResult<WebSearchToolInput>> {
    return {
      behavior: 'passthrough',
      message: 'WebSearchTool requires permission.',
      suggestions: [
        {
          type: 'addRules',
          rules: [{ toolName: WEB_SEARCH_TOOL_NAME }],
          behavior: 'allow',
          destination: 'localSettings',
        },
      ],
    }
  },
  extractSearchText() {
    // renderToolResultMessage shows only "Did N searches in Xs" chrome —
    // the results[] content never appears on screen. Heuristic would index
    // string entries in results[] (phantom match). Nothing to search.
    return ''
  },
  async validateInput(input: unknown): Promise<ValidationResult> {
    const { query, allowed_domains, blocked_domains } = input as WebSearchToolInput
    if (!query.length) {
      return {
        result: false,
        message: 'Error: Missing query',
        errorCode: 1,
      }
    }
    if (allowed_domains?.length && blocked_domains?.length) {
      return {
        result: false,
        message:
          'Error: Cannot specify both allowed_domains and blocked_domains in the same request',
        errorCode: 2,
      }
    }
    return { result: true }
  },
  // delta ⑧：旧 UI.tsx 纯逻辑面逐字（React 组件面 TUI 波裁）
  renderToolUseMessage(
    input: unknown,
    options: { theme: unknown; verbose: boolean; commands?: unknown[] },
  ) {
    const { query, allowed_domains, blocked_domains } =
      input as Partial<WebSearchToolInput>
    if (!query) {
      return null
    }
    let message = ''
    if (query) {
      message += `"${query}"`
    }
    if (options.verbose) {
      if (allowed_domains && allowed_domains.length > 0) {
        message += `, only allowing domains: ${allowed_domains.join(', ')}`
      }
      if (blocked_domains && blocked_domains.length > 0) {
        message += `, blocking domains: ${blocked_domains.join(', ')}`
      }
    }
    return message
  },
  async call(args: unknown, context: unknown): Promise<ToolResult<WebSearchOutput>> {
    const input = args as WebSearchToolInput
    const ctx = context as WebSearchToolContext

    const startTime = performance.now()
    const { query } = input
    const userMessage = createUserMessage({
      content: 'Perform a web search for the query: ' + query,
    })
    const toolSchema = makeToolSchema(input)

    const appState = ctx.getAppState()
    // delta ③/④：GB 门裁（useHaiku 恒 false，haiku 支全裁）+ mainLoopModel
    // → small 角色池头（getMainLoopModelName）
    const searchModel = getMainLoopModelName()
    const searchRole = modelToRole(searchModel)
    const params = await buildOpenAIParams(
      {
        // InDomainUserMessage → Message[] 双 cast（webFetchUtils 同面登记）
        messages: [userMessage] as unknown as Message[],
        systemPrompt: asSystemPrompt([
          'You are an assistant for performing a web search tool use',
        ]),
        thinkingConfig: ctx.options.thinkingConfig,
        tools: [],
        // delta ⑤：7 选项字段裁（头部登记）；toolChoice 随 haiku 支裁
        options: {
          model: searchModel,
          extraToolSchemas: [toolSchema],
          effortValue: appState.effortValue,
        },
      },
      searchRole,
    )
    const queryStream = modelProvider.chatStream({
      role: searchRole,
      messages: params.messages,
      tools: params.tools,
      maxTokens: params.max_tokens,
      temperature: params.temperature,
      signal: ctx.abortController.signal,
    })

    const allContentBlocks: SearchContentBlock[] = []
    let streamError: string | null = null
    try {
      for await (const event of queryStream) {
        if (event.type === 'assistant') {
          allContentBlocks.push(
            ...(event as { message: { content: SearchContentBlock[] } })
              .message.content,
          )
        } else if (event.type === 'error') {
          // B8: chatStream yields {type:'error'} when the provider exhausted
          // retries + horizontal fallback. Surface it as a string result so
          // the model can react (mirrors web_search_tool_result error handling
          // in makeOutputFromSearchResponse).
          const err = event as {
            message?: string
            code?: string
            retryable?: boolean
          }
          streamError =
            err.message ||
            `Web search provider error (code: ${err.code ?? 'UNKNOWN'}, retryable: ${String(err.retryable ?? false)})`
          logError(new Error(streamError))
          break
        }
      }
    } catch (error) {
      logError(error)
      streamError = error instanceof Error ? error.message : String(error)
    }

    // Process the final result
    const endTime = performance.now()
    const durationSeconds = (endTime - startTime) / 1000

    const data = makeOutputFromSearchResponse(
      allContentBlocks,
      query,
      durationSeconds,
    )
    if (streamError !== null) {
      data.results.push(streamError)
    }
    return { data }
  },
  mapToolResultToToolResultBlockParam(
    output: WebSearchOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    const { query, results } = output

    let formattedOutput = `Web search results for query: "${query}"\n\n`

    // Process the results array - it can contain both string summaries and search result objects.
    // Guard against null/undefined entries that can appear after JSON round-tripping
    // (e.g., from compaction or transcript deserialization).
    ;(results ?? []).forEach(result => {
      if (result == null) {
        return
      }
      if (typeof result === 'string') {
        // Text summary
        formattedOutput += result + '\n\n'
      } else {
        // Search result with links
        if (result.content?.length > 0) {
          formattedOutput += `Links: ${jsonStringify(result.content)}\n\n`
        } else {
          formattedOutput += 'No links found.\n\n'
        }
      }
    })

    formattedOutput +=
      '\nREMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.'

    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: formattedOutput.trim(),
    }
  },
}
