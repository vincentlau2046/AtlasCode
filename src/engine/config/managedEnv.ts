/**
 * engine/config — settings 环境变量应用面（§8.27 E-3 S-3c，旧仓
 * managedEnv.ts + managedEnvConstants.ts 裁剪版真核心）
 *
 * 真核心（旧仓语义）：
 *   - applySafeConfigEnvironmentVariables（信任前）：trusted 源（user/flag/
 *     policy，policy 最后压顶）全量 env + 合并面仅 SAFE_ENV_VARS 白名单
 *     （project 攻击面收敛：危险 env 不能入信任前阶段）
 *   - applyConfigEnvironmentVariables（信任后）：合并面全量 env（含潜在
 *     危险变量 LD_PRELOAD/PATH 等——仅信任建立后调用）
 *
 * 语义裁定（对照旧仓，残留守登记防「以为已全」）：
 *   - filterSettingsEnv 三过滤器全裁（新仓三面引用 0，grep 验真）：
 *     · withoutSSHTunnelVars（ATLAS_UNIX_SOCKET，claude ssh 远程面）
 *     · withoutCcdSpawnEnvKeys（ATLAS_ENTRYPOINT=claude-desktop，桌面宿主面）
 *     · withoutHostManagedProviderVars（ATLAS_PROVIDER_MANAGED_BY_HOST +
 *       PROVIDER_MANAGED_ENV_VARS 11 项 provider 路由/模型默认变量面）
 *       ——旧仓 managedEnv.ts/managedEnvConstants.ts 为源。
 *   - getGlobalConfig（~/.atlas.json 全局配置面）裁剪——新仓无全局配置文件面。
 *   - applyConfig 的 caCerts/mtls/proxy 缓存清除 + configureGlobalAgents
 *     裁剪——新仓无对应模块。
 *   - 旧仓合并面含 project/local 的 SAFE 过滤支 → 被 S-3a「project/local 不
 *     在级联」裁定结构性覆盖（project env 永不入级联；新仓合并面 =
 *     user+policy+flag，攻击面收敛更严）。
 *   - DANGEROUS_SHELL_SETTINGS（旧仓 6 项，trust-dialog UI 消费）不随迁——UI 面残留守。
 *
 * 消费接缝登记（H6 防空洞）：
 *   - applySafeConfigEnvironmentVariables：S-3d 已消费（compose.ts ⑥ 组合根
 *     启动链信任前位，旧仓启动序 applySafe → 信任对话框 → applyConfig）
 *   - applyConfigEnvironmentVariables：信任对话框面残留守（新仓无信任对话框，
 *     compose.ts 头注重登记，§8.29）——信任后全量 env 随 UI/信任面纵切消费
 */
import { isSettingSourceEnabled } from './constants'
import { getSettingsForSource, getSettingsWithErrors } from './settings'

/**
 * Trusted setting sources whose env vars can be applied before the trust dialog.
 * 旧仓逐字：user/flag/policy——project-scoped 源被排除（项目目录可被恶意
 * actor 提交以重定向流量）。新仓 flagSettings = 死源（S-3a 裁定，加载恒
 * null，循环内自然短路，源层常量不动）。
 */
const TRUSTED_SETTING_SOURCES = [
  'userSettings',
  'flagSettings',
  'policySettings',
] as const

/**
 * SAFE env vars 白名单（旧仓 managedEnvConstants 逐字 port，63 项）：
 * 仅这些变量可经合并 settings 进入信任前阶段。危险变量（重定向攻击者服务
 * / 信任攻击者证书 / 切换攻击者项目）全部不在列表——列表外变量经
 * project-scoped settings 设置会触发安全对话框（旧仓语义；新仓信任对话框
 * UI 面残留守）。
 */
export const SAFE_ENV_VARS = new Set([
  'ATLAS_CUSTOM_HEADERS',
  'ATLAS_CUSTOM_MODEL_OPTION',
  'ATLAS_CUSTOM_MODEL_OPTION_DESCRIPTION',
  'ATLAS_CUSTOM_MODEL_OPTION_NAME',
  'ATLAS_PREMIUM_MODEL',
  'ATLAS_PREMIUM_MODEL_DESCRIPTION',
  'ATLAS_PREMIUM_MODEL_NAME',
  'ATLAS_PREMIUM_MODEL_SUPPORTED_CAPABILITIES',
  'ATLAS_SMALL_MODEL',
  'ATLAS_SMALL_MODEL_DESCRIPTION',
  'ATLAS_SMALL_MODEL_NAME',
  'ATLAS_SMALL_MODEL_SUPPORTED_CAPABILITIES',
  'ATLAS_FAST_MODEL',
  'ATLAS_FAST_MODEL_DESCRIPTION',
  'ATLAS_FAST_MODEL_NAME',
  'ATLAS_FAST_MODEL_SUPPORTED_CAPABILITIES',
  'ATLAS_MODEL',
  'AWS_DEFAULT_REGION',
  'AWS_PROFILE',
  'AWS_REGION',
  'BASH_DEFAULT_TIMEOUT_MS',
  'BASH_MAX_OUTPUT_LENGTH',
  'BASH_MAX_TIMEOUT_MS',
  'ATLAS_BASH_MAINTAIN_PROJECT_WORKING_DIR',
  'ATLAS_API_KEY_HELPER_TTL_MS',
  'ATLAS_DISABLE_EXPERIMENTAL_BETAS',
  'ATLAS_DISABLE_NONESSENTIAL_TRAFFIC',
  'ATLAS_DISABLE_TERMINAL_TITLE',
  'ATLAS_EXPERIMENTAL_AGENT_TEAMS',
  'ATLAS_IDE_SKIP_AUTO_INSTALL',
  'ATLAS_MAX_OUTPUT_TOKENS',
  'ATLAS_SUBAGENT_MODEL',
  'DISABLE_AUTOUPDATER',
  'DISABLE_BUG_COMMAND',
  'DISABLE_COST_WARNINGS',
  'DISABLE_ERROR_REPORTING',
  'DISABLE_FEEDBACK_COMMAND',
  'DISABLE_TELEMETRY',
  'ENABLE_TOOL_SEARCH',
  'MAX_MCP_OUTPUT_TOKENS',
  'MAX_THINKING_TOKENS',
  'MCP_TIMEOUT',
  'MCP_TOOL_TIMEOUT',
  'OTEL_EXPORTER_OTLP_HEADERS',
  'OTEL_EXPORTER_OTLP_LOGS_HEADERS',
  'OTEL_EXPORTER_OTLP_LOGS_PROTOCOL',
  'OTEL_EXPORTER_OTLP_METRICS_CLIENT_CERTIFICATE',
  'OTEL_EXPORTER_OTLP_METRICS_CLIENT_KEY',
  'OTEL_EXPORTER_OTLP_METRICS_HEADERS',
  'OTEL_EXPORTER_OTLP_METRICS_PROTOCOL',
  'OTEL_EXPORTER_OTLP_PROTOCOL',
  'OTEL_EXPORTER_OTLP_TRACES_HEADERS',
  'OTEL_LOG_TOOL_DETAILS',
  'OTEL_LOG_USER_PROMPTS',
  'OTEL_LOGS_EXPORT_INTERVAL',
  'OTEL_LOGS_EXPORTER',
  'OTEL_METRIC_EXPORT_INTERVAL',
  'OTEL_METRICS_EXPORTER',
  'OTEL_METRICS_INCLUDE_ACCOUNT_UUID',
  'OTEL_METRICS_INCLUDE_SESSION_ID',
  'OTEL_METRICS_INCLUDE_VERSION',
  'OTEL_RESOURCE_ATTRIBUTES',
  'USE_BUILTIN_RIPGREP',
])

/**
 * 应用 trusted 源 env 到 process.env（信任前阶段）。
 * trusted 源（user/policy；flag 死源短路）全量 env 生效；合并面仅
 * SAFE_ENV_VARS 白名单生效（旧仓逐字语义，见头注裁剪登记）。
 */
export function applySafeConfigEnvironmentVariables(): void {
  for (const source of TRUSTED_SETTING_SOURCES) {
    if (source === 'policySettings') continue
    if (!isSettingSourceEnabled(source)) continue
    const env = getSettingsForSource(source)?.env
    if (env) Object.assign(process.env, env)
  }

  // policy last（最高优先级，不可被覆盖）
  Object.assign(
    process.env,
    getSettingsForSource('policySettings')?.env ?? {},
  )

  // 合并面仅 SAFE 变量（project-scoped 危险变量不能入信任前）
  const mergedEnv = getSettingsWithErrors().settings.env
  if (mergedEnv) {
    for (const [key, value] of Object.entries(mergedEnv)) {
      if (SAFE_ENV_VARS.has(key.toUpperCase())) {
        process.env[key] = value
      }
    }
  }
}

/**
 * 应用合并面全量 env 到 process.env（信任后阶段）。
 * 应用潜在危险变量（LD_PRELOAD/PATH 等）——仅信任建立后调用（旧仓语义）。
 */
export function applyConfigEnvironmentVariables(): void {
  const mergedEnv = getSettingsWithErrors().settings.env
  if (mergedEnv) Object.assign(process.env, mergedEnv)
}
