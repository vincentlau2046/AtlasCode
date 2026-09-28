/**
 * cli（CLI 公共域）S-C4 commit 5（§8.71.1.4）— auto-mode 子命令 handler
 * （旧仓 cli/handlers/autoMode.ts 170L 裁剪随迁；惰性加载面保真：parse.ts
 * 按子命令动态 import 本模块，type-only 选项面）。permissions 域
 * autoMode 子域门面（§8.65 波）「autoMode CLI handler / settings.autoMode
 * 三函数 归 provider/settings/CLI 波」前向接缝本提交核销。
 *
 * 随迁面（支序旧仓逐字）：
 *   - defaults = getDefaultExternalAutoModeRules()（permissions 域
 *     autoMode/prompts 面，本波接管 CLI 消费点）+ JSON 输出
 *   - config = getAutoModeConfig()（engine/config/settings.ts 本提交落盘，
 *     裁登记核销）+ 缺省规则 + per-section REPLACE 语义（非空 user 段整段
 *     替换该段缺省；空/缺段回落缺省——旧注释块逐字）
 *   - critique = CRITIQUE_SYSTEM_PROMPT 逐字 + max_tokens 4096 +
 *     formatRulesForCritique 三段（allow/soft_deny/environment）拼接 +
 *     无自定义规则提示面（品牌文案 atlascode 化）+ process.exitCode = 1
 *     自然退出码面（commander action 不拦截，旧仓逐字）
 *
 * 裁登记 / remap 登记（H6 防空洞，复审勿当遗漏重提）：
 *   - sideQuery（旧 utils/sideQuery，Anthropic Messages beta 车道）→ 新仓
 *     modelprovider 域 modelProvider.chat 一次支（非流式；print.ts
 *     compactDeps.summarize 同型先例）：system → systemPrompt（
 *     asSystemPrompt 单段）/ 单 user 消息（print.ts makeUserMessage 型面
 *     逐字）/ max_tokens 4096 → options.maxOutputTokensOverride
 *     （params.ts L238 透传面）/ querySource = 'auto_mode_critique' 保留
 *     （options 透传，provider 诊断面）
 *   - skipSystemPromptPrefix（旧 sideQuery 标志：跳 Claude 系统提示词前缀
 *     车道）= 裁（新仓 provider 无前缀车道，delta 登记）
 *   - 模型解析：旧 parseUserSpecifiedModel / getMainLoopModel → 新仓
 *     modelprovider modelToRole（显式模型串 → role）+ 'premium' 缺省
 *     （print.ts L603 同裁定：主循环角色 = premium）
 *   - 旧 BetaMessage.content 型面 → 新仓 chat 返回 message.content any[]
 *     text 块抽取（print.ts summarize 过滤同型）
 *   - 旧 getMainLoopModel 会话主模型读面（旧仓 model/model.ts 主循环解析
 *     链）= 不随迁（headless 主模型解析归 print.ts 选项面，critique 缺省
 *     = premium 角色池头）
 *   - jsonStringify → JSON.stringify / errorMessage 经 shared 根门面消费
 *     （旧 utils/errors 同源）
 *   - 品牌文案：旧 `claude auto-mode defaults` → `atlascode auto-mode
 *     defaults`（S-C2 选项面 de-Claude 化同裁定）
 *
 * boundaries allow 面（eslint.config.mjs cli 规则既覆盖面，无新增）：
 * engine（getAutoModeConfig）+ modelprovider（S-C3 扩 allow 登记面）+
 * permissions（根门面，cli allow 既含）+ shared（errorMessage/
 * asSystemPrompt/Message 型面）+ 域内。
 */
import { randomUUID } from 'node:crypto'
import { getAutoModeConfig } from '../../engine'
import {
  getModelProvider,
  modelToRole,
  type ModelRole,
} from '../../modelprovider'
import {
  buildDefaultExternalSystemPrompt,
  getDefaultExternalAutoModeRules,
  type AutoModeRules,
} from '../../permissions'
import {
  asSystemPrompt,
  errorMessage,
  type Message,
} from '../../shared'

/** critique --model 选项面（parse.ts type-only import）。 */
export type AutoModeCritiqueOptions = {
  model?: string
}

function writeRules(rules: AutoModeRules): void {
  process.stdout.write(JSON.stringify(rules, null, 2) + '\n')
}

export function autoModeDefaultsHandler(): void {
  writeRules(getDefaultExternalAutoModeRules())
}

/**
 * Dump the effective auto mode config: user settings where provided,
 * external defaults otherwise. Per-section REPLACE semantics — matches how
 * buildYoloSystemPrompt resolves the external template (a non-empty user
 * section replaces that section's defaults entirely; an empty/absent
 * section falls through to defaults).（旧仓注释逐字）
 */
export function autoModeConfigHandler(): void {
  const config = getAutoModeConfig()
  const defaults = getDefaultExternalAutoModeRules()
  writeRules({
    allow: config?.allow?.length ? config.allow : defaults.allow,
    soft_deny: config?.soft_deny?.length
      ? config.soft_deny
      : defaults.soft_deny,
    environment: config?.environment?.length
      ? config.environment
      : defaults.environment,
  })
}

const CRITIQUE_SYSTEM_PROMPT =
  'You are an expert reviewer of auto mode classifier rules for Atlas.\n' +
  '\n' +
  'Atlas has an "auto mode" that uses an AI classifier to decide whether ' +
  'tool calls should be auto-approved or require user confirmation. Users can ' +
  'write custom rules in three categories:\n' +
  '\n' +
  '- **allow**: Actions the classifier should auto-approve\n' +
  '- **soft_deny**: Actions the classifier should block (require user confirmation)\n' +
  "- **environment**: Context about the user's setup that helps the classifier make decisions\n" +
  '\n' +
  "Your job is to critique the user's custom rules for clarity, completeness, " +
  'and potential issues. The classifier is an LLM that reads these rules as ' +
  "part of its system prompt.\n" +
  '\n' +
  'For each rule, evaluate:\n' +
  '1. **Clarity**: Is the rule unambiguous? Could the classifier misinterpret it?\n' +
  "2. **Completeness**: Are there gaps or edge cases the rule doesn't cover?\n" +
  '3. **Conflicts**: Do any of the rules conflict with each other?\n' +
  '4. **Actionability**: Is the rule specific enough for the classifier to act on?\n' +
  '\n' +
  'Be concise and constructive. Only comment on rules that could be improved. ' +
  'If all rules look good, say so.'

/** headless 用户消息构造（print.ts makeUserMessage 型面逐字）。 */
function makeUserMessage(text: string): Message {
  return {
    type: 'user',
    role: 'user',
    message: { role: 'user', content: text },
    uuid: randomUUID(),
    timestamp: String(Date.now()),
  }
}

export async function autoModeCritiqueHandler(
  options: AutoModeCritiqueOptions,
): Promise<void> {
  const config = getAutoModeConfig()
  const hasCustomRules =
    (config?.allow?.length ?? 0) > 0 ||
    (config?.soft_deny?.length ?? 0) > 0 ||
    (config?.environment?.length ?? 0) > 0

  if (!hasCustomRules) {
    process.stdout.write(
      'No custom auto mode rules found.\n\n' +
        'Add rules to your settings file under autoMode.{allow, soft_deny, environment}.\n' +
        'Run `atlascode auto-mode defaults` to see the default rules for reference.\n',
    )
    return
  }

  // 模型解析（旧 parseUserSpecifiedModel/getMainLoopModel → 新仓角色面，
  // remap 登记见头注）
  const role: ModelRole = options.model
    ? modelToRole(options.model)
    : 'premium'

  const defaults = getDefaultExternalAutoModeRules()
  const classifierPrompt = buildDefaultExternalSystemPrompt()

  const userRulesSummary =
    formatRulesForCritique('allow', config?.allow ?? [], defaults.allow) +
    formatRulesForCritique(
      'soft_deny',
      config?.soft_deny ?? [],
      defaults.soft_deny,
    ) +
    formatRulesForCritique(
      'environment',
      config?.environment ?? [],
      defaults.environment,
    )

  process.stdout.write('Analyzing your auto mode rules…\n\n')

  let response
  try {
    // 旧 sideQuery → modelprovider.chat 一次支（remap 登记见头注）
    response = await getModelProvider().chat({
      messages: [
        makeUserMessage(
          'Here is the full classifier system prompt that the auto mode classifier receives:\n\n' +
            '<classifier_system_prompt>\n' +
            classifierPrompt +
            '\n</classifier_system_prompt>\n\n' +
            "Here are the user's custom rules that REPLACE the corresponding default sections:\n\n" +
            userRulesSummary +
            '\nPlease critique these custom rules.',
        ),
      ],
      systemPrompt: asSystemPrompt([CRITIQUE_SYSTEM_PROMPT]),
      role,
      signal: new AbortController().signal,
      options: {
        maxOutputTokensOverride: 4096,
        querySource: 'auto_mode_critique',
      },
    })
  } catch (error) {
    process.stderr.write(
      'Failed to analyze rules: ' + errorMessage(error) + '\n',
    )
    process.exitCode = 1
    return
  }

  const textBlock = (response.message.content as Array<Record<string, unknown>>).find(
    block => block?.type === 'text',
  )
  if (textBlock && typeof textBlock.text === 'string') {
    process.stdout.write(textBlock.text + '\n')
  } else {
    process.stdout.write('No critique was generated. Please try again.\n')
  }
}

function formatRulesForCritique(
  section: string,
  userRules: string[],
  defaultRules: string[],
): string {
  if (userRules.length === 0) return ''
  const customLines = userRules.map(r => '- ' + r).join('\n')
  const defaultLines = defaultRules.map(r => '- ' + r).join('\n')
  return (
    '## ' +
    section +
    ' (custom rules replacing defaults)\n' +
    'Custom:\n' +
    customLines +
    '\n\n' +
    'Defaults being replaced:\n' +
    defaultLines +
    '\n\n'
  )
}
