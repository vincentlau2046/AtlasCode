import { z } from 'zod'
export * from '../../types/all-local-types.js';
export const isMcpServerCommandEntry : any = (() => ({})) as any;
export const isMcpServerNameEntry : any = (() => ({})) as any;
export const isMcpServerUrlEntry : any = (() => ({})) as any;

// C4 修复：用真实 Zod schema 替换 no-op mock。
// 设计原则：
// 1. 覆盖全库实际读取的 settings 字段（grep `settings.<field>` 枚举 + tsc 错误定位所得）
// 2. 全部字段 optional；复杂嵌套结构用 z.any() 兜底，避免过度约束
// 3. .passthrough() 保留用户自定义/未知字段
// 4. SettingsJson 由 z.infer 推导，替换 `any`
export const SettingsSchema = () => z.object({
  // --- 模型与角色层（P1 模型角色 / P2 统一模型配置）
  model: z.string().optional(),
  modelRoles: z.record(z.string(), z.any()).optional(),
  defaultRole: z.string().optional(),
  availableModels: z.any().optional(),
  alwaysThinkingEnabled: z.boolean().optional(),
  effortLevel: z.string().optional(),
  // Per-model thinking-effort memory (B 方案): tier the user last picked per
  // model in the model picker. Display priority: effortByModel[model] >
  // effortLevel (global last-write) > Atlas default 'medium'.
  effortByModel: z.record(z.string(), z.string()).optional(),
  ttsModel: z.string().optional(),
  asrModel: z.string().optional(),
  advisorModel: z.string().optional(),
  // --- 认证 / 密钥辅助（P0 已修 H12 apiKeyHelper 执行方式）
  apiKeyHelper: z.string().optional(),
  awsAuthRefresh: z.string().optional(),
  awsCredentialExport: z.string().optional(),
  gcpAuthRefresh: z.string().optional(),
  otelHeadersHelper: z.string().optional(),
  // --- 环境变量（值必须为 string，与 managedEnv 消费类型一致）
  env: z.record(z.string(), z.string()).optional(),
  // --- MCP 服务器管理
  mcpServers: z.record(z.string(), z.any()).optional(),
  // 条目为对象：{serverName, serverCommand, serverUrl}，配合 isMcpServer*Entry 守卫
  allowedMcpServers: z.any().optional(),
  deniedMcpServers: z.any().optional(),
  enabledMcpjsonServers: z.array(z.string()).optional(),
  disabledMcpjsonServers: z.array(z.string()).optional(),
  // --- 插件 / marketplace
  enabledPlugins: z.record(z.string(), z.any()).optional(),
  pluginConfigs: z.any().optional(),
  extraKnownMarketplaces: z.any().optional(),
  // 数组字段（schema-stable order）：MarketplaceSource[]
  strictKnownMarketplaces: z.array(z.any()).optional(),
  blockedMarketplaces: z.array(z.any()).optional(),
  allowedChannelPlugins: z.array(z.any()).optional(),
  pluginTrustMessage: z.string().optional(),
  // --- 沙箱 / 权限
  sandbox: z.any().optional(),
  permissions: z.any().optional(),
  // --- 钩子
  hooks: z.any().optional(),
  disableAllHooks: z.boolean().optional(),
  // --- 记忆 / git
  autoMemoryEnabled: z.boolean().optional(),
  autoMemoryDirectory: z.string().optional(),
  claudeMdExcludes: z.array(z.string()).optional(),
  includeGitInstructions: z.boolean().optional(),
  respectGitignore: z.boolean().optional(),
  // --- UI / 行为开关
  outputStyle: z.string().optional(),
  language: z.string().optional(),
  theme: z.string().optional(),
  prefersReducedMotion: z.boolean().optional(),
  syntaxHighlightingDisabled: z.boolean().optional(),
  spinnerTipsEnabled: z.boolean().optional(),
  spinnerTipsOverride: z.any().optional(),
  spinnerVerbs: z.any().optional(),
  statusLine: z.any().optional(),
  fileSuggestion: z.any().optional(),
  // --- 登录 / 远程
  forceLoginMethod: z.string().optional(),
  forceLoginOrgUUID: z.string().optional(),
  remote: z.any().optional(),
  // --- 默认 shell（代码期望 'bash' | 'powershell'）
  defaultShell: z.union([z.literal('bash'), z.literal('powershell')]).optional(),
  // --- 自动更新 / 反馈 / 公告
  autoUpdatesChannel: z.union([z.literal('stable'), z.literal('latest')]).optional(),
  companyAnnouncements: z.array(z.any()).optional(),
  // --- 功能开关 / 其他
  // G-3（§8.74.28 ⑦）: grove_enabled / grove_notice_viewed_at 字段随 grove
  // 整裁删除（.passthrough() 透传，磁盘旧键不致解析失败）。
  voiceEnabled: z.boolean().optional(),
  autoMode: z.boolean().optional(),
  autoDreamEnabled: z.boolean().optional(),
  minimumVersion: z.string().optional(),
  cleanupPeriodDays: z.number().optional(),
  showClearContextOnPlanAccept: z.boolean().optional(),
  skipWebFetchPreflight: z.boolean().optional(),
  // --- Web 搜索（G-2 客户端化 2026-09-30：Tavily key 模板项；env TAVILY_API_KEY
  // 优先，组合根 atlascode/compose.ts 经 setWebSearchSettingsKeyProvider 注入
  // 本键读者，模板见根目录 settings.template.json）
  search: z
    .object({
      tavilyApiKey: z.string().optional(),
    })
    .optional(),
  terminalTitleFromRename: z.boolean().optional(),
  includeCoAuthoredBy: z.boolean().optional(),
  plansDirectory: z.string().optional(),
  httpHookAllowedEnvVars: z.array(z.string()).optional(),
  allowedHttpHookUrls: z.array(z.string()).optional(),
  attribution: z.any().optional(),
  xaaIdp: z.any().optional(),
  agent: z.any().optional(),
  local: z.any().optional(),
  worktree: z.any().optional(),
}).passthrough();
// 注：未知字段由 .passthrough() 透传，不影响解析。深层嵌套（如 permissions/hooks/sandbox）暂用 z.any()，后续逐步细化。

export type SettingsJson = z.infer<ReturnType<typeof SettingsSchema>>
export type HooksSettings = any;
// The HooksSchema VALUE lives in src/schemas/hooks.ts (the extracted leaf that
// breaks the settings/types <-> plugins/schemas cycle). Do NOT re-add a stub
// const here: a `{}` stub with `: any` passes tsc but crashes at runtime the
// moment a caller invokes it (2026-09-20 `plugin skills` crash).
export const CUSTOMIZATION_SURFACES: any = ["mcp", "command", "agent"] as any;
export type HookMatcher = any;
export type HookCommand = any;
export type PluginHookMatcher = any;
export type SkillHookMatcher = any;
export type AgentHook = any;
export type HttpHook = any;
export type PromptHook = any;
export const ExtraKnownMarketplaceSchema: any = {} as any;
