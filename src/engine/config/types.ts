/**
 * engine/config — Settings 类型面（§8.27 E-3 S-3a，旧仓 utils/settings/types.ts 裁剪版真核心）
 *
 * 真核心：
 *   - SettingsSchema（zod v4，全 optional + .passthrough()）：engine 消费字段族
 *     （model 角色族 / providers / env / mcp 族 / sandbox / permissions / hooks /
 *     记忆族 / defaultShell / skipWebFetchPreflight）+ SettingsJson = z.infer。
 *   - providers 补声明：旧仓该字段未被 schema 声明（靠 passthrough 透传），但新仓
 *     settings-adapter（S-3d）经 EndpointConfigSource.getProviders() 显式消费
 *     settings.providers → 本版补 z.record 声明（数据契约先行，S-3d 消费不靠 any）。
 *
 * 裁剪 + 残留守头注释（防「以为已全」）：
 *   - 砍字段族（新仓无消费点，passthrough 兜底未知字段不丢数据）：
 *     · 认证 helper 族（apiKeyHelper/awsAuthRefresh/awsCredentialExport/gcpAuthRefresh/
 *       otelHeadersHelper）——新仓 auth 车道 = OpenAI 静态键，无 helper 执行面
 *     · 插件/市场族（enabledPlugins/pluginConfigs/extraKnownMarketplaces/
 *       strictKnownMarketplaces/blockedMarketplaces/allowedChannelPlugins/
 *       pluginTrustMessage）——插件市场域未落
 *     · UI/行为族（outputStyle/language/theme/prefersReducedMotion/syntaxHighlighting*
 *       /spinner* /statusLine/fileSuggestion）——TUI 面残留守
 *     · 登录/远程族（forceLoginMethod/forceLoginOrgUUID/remote）——订阅链已硬切
 *     · 自动更新/公告族（autoUpdatesChannel/companyAnnouncements）
 *     · 低消费功能 flag（grove 系列/voiceEnabled/autoDreamEnabled/minimumVersion/
 *       cleanupPeriodDays/showClearContextOnPlanAccept/terminalTitleFromRename/
 *       includeCoAuthoredBy/plansDirectory/httpHook 系列/attribution/xaaIdp/agent/local/
 *       worktree）——对应功能面未落
 *   - 深层嵌套（permissions/hooks/sandbox）：hooks 族 → S-5c（§8.41）收紧
 *     z.lazy(HooksSchema)（事件名集校验 record key ∈ HOOK_EVENTS 27 + 4 变体
 *     全字段面，hooksSchema.ts）；permissions/sandbox 族维持 z.any() 兜底
 *     （permissions 族 → E-4 规则树消费解析结果；sandbox 族 → sandbox 域）。
 *   - 旧仓类型别名（HookMatcher/HookCommand 等 any 桩 + CUSTOMIZATION_SURFACES +
 *     ExtraKnownMarketplaceSchema）不随迁：新仓 hooks 域（src/hooks/types.ts）是
 *     hook 类型单一事实源，settings 侧不重复声明（同 §8.27 HOOK_EVENTS 裁定）。
 */
import { z } from 'zod'
// S-5c（§8.41 R2）：hooks 字段收紧引用（engine/config 域内单向 import，无循环）
import { HooksSchema } from './hooksSchema'

/**
 * Settings 数据契约（settings.json 全层共用：user/project/local/flag/policy）。
 * 全字段 optional + .passthrough()：未知字段透传不报错（用户文件向前兼容）。
 */
export const SettingsSchema = () => z.object({
  // --- 模型与角色层（P1 模型角色 / P2 统一模型配置；modelprovider 域消费）
  model: z.string().optional(),
  modelRoles: z.record(z.string(), z.any()).optional(),
  defaultRole: z.string().optional(),
  availableModels: z.any().optional(),
  alwaysThinkingEnabled: z.boolean().optional(),
  effortLevel: z.string().optional(),
  // Per-model thinking-effort memory（B 方案）：effortByModel[model] > effortLevel > 默认 'medium'
  effortByModel: z.record(z.string(), z.string()).optional(),
  ttsModel: z.string().optional(),
  asrModel: z.string().optional(),
  advisorModel: z.string().optional(),
  // providers 补声明（见头注）：settings.providers → EndpointConfigSource.getProviders()
  providers: z.record(z.string(), z.any()).optional(),
  // --- 环境变量（值必须为 string，与 managedEnv 消费类型一致）
  env: z.record(z.string(), z.string()).optional(),
  // --- MCP 服务器管理（E-2 MCP 连接层消费；条目 {serverCommand|serverUrl,...}）
  mcpServers: z.record(z.string(), z.any()).optional(),
  allowedMcpServers: z.any().optional(),
  deniedMcpServers: z.any().optional(),
  enabledMcpjsonServers: z.array(z.string()).optional(),
  disabledMcpjsonServers: z.array(z.string()).optional(),
  // --- 沙箱 / 权限（sandbox 域 + E-4 规则树消费）
  sandbox: z.any().optional(),
  permissions: z.any().optional(),
  // --- 钩子（E-5 hooks-runner 消费；数据契约 = engine/config/hooksSchema）
  // S-5c（§8.41 R2）收紧：z.any() → z.lazy(HooksSchema)（事件名集校验 + 4 变体
  // 全字段面；旧仓 settings 字段 z.any() 为 S-3a 逐字裁定，严格编辑面落 E-5）
  hooks: z.lazy(() => HooksSchema).optional(),
  disableAllHooks: z.boolean().optional(),
  allowManagedHooksOnly: z.boolean().optional(),
  // --- 记忆 / git（memory 域消费）
  autoMemoryEnabled: z.boolean().optional(),
  autoMemoryDirectory: z.string().optional(),
  claudeMdExcludes: z.array(z.string()).optional(),
  includeGitInstructions: z.boolean().optional(),
  respectGitignore: z.boolean().optional(),
  // --- 默认 shell（E-6 全 shell 面消费）
  defaultShell: z.union([z.literal('bash'), z.literal('powershell')]).optional(),
  // --- WebFetch 工具面（skipWebFetchPreflight 裁剪：工具本体纵切消费）
  skipWebFetchPreflight: z.boolean().optional(),
}).passthrough()

export type SettingsJson = z.infer<ReturnType<typeof SettingsSchema>>

// ── 校验结果类型面（旧仓 validation.ts 类型前置；实现 = S-3b）─────────────

/** Field path in dot notation (e.g., "permissions.defaultMode", "env.DEBUG") */
export type FieldPath = string

/**
 * 单条校验错误（旧仓 ValidationError 裁剪）：保留核心呈现字段，
 * mcpErrorMetadata（MCP 配置错误聚合面，旧仓 allErrors.ts）不随迁（残留守）。
 */
export type ValidationError = {
  /** Relative file path */
  file?: string
  /** Field path in dot notation */
  path: FieldPath
  /** Human-readable error message */
  message: string
  /** Expected value or type */
  expected?: string
  /** The actual invalid value that was provided */
  invalidValue?: unknown
  /** Suggestion for fixing the error */
  suggestion?: string
  /** Link to relevant documentation */
  docLink?: string
}

/** 合并后的 settings + 全源校验错误（getSettingsWithErrors 返回面）。 */
export type SettingsWithErrors = {
  settings: SettingsJson
  errors: ValidationError[]
}
