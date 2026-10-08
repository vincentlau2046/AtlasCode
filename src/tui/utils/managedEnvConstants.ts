/**
 * Environment variables that control inference routing: which provider to use,
 * which endpoint to hit, and which model IDs to send.
 *
 * When ATLAS_PROVIDER_MANAGED_BY_HOST is truthy in the spawn env, these
 * are stripped from settings-sourced env so the host's routing config isn't
 * overridden by a user's ~/.atlas/settings.json — e.g. a Bedrock setup for
 * terminal CLI that would break a host that only supports first-party auth.
 *
 * @[MODEL LAUNCH]: New models usually don't need changes here —
 * VERTEX_REGION_CLAUDE_* is prefix-matched. New providers or new routing
 * config vars (endpoint, project, region, auth) do.
 */
const PROVIDER_MANAGED_ENV_VARS = new Set([
  // The flag itself — settings can't unset it once the host set it
  'ATLAS_PROVIDER_MANAGED_BY_HOST',
  // Endpoint config (base URLs, project/resource identifiers)
  'OPENAI_BASE_URL',
  // Region routing (per-model VERTEX_REGION_CLAUDE_* handled by prefix below)
  'CLOUD_ML_REGION',
  // Auth
  'OPENAI_API_KEY',
  'OPENAI_AUTH_TOKEN',
  'ATLAS_OAUTH_TOKEN',
  // Model defaults — often set to provider-specific ID formats
  'ATLAS_MODEL',
  // P1: model role env vars (redefined from the old opus/sonnet/haiku family names)
  'ATLAS_PREMIUM_MODEL',
  'ATLAS_SMALL_MODEL',
  'ATLAS_FAST_MODEL',
  'ATLAS_SUBAGENT_MODEL',
])

// (3P provider removed — VERTEX_REGION_* env vars no longer needed)
const PROVIDER_MANAGED_ENV_PREFIXES: string[] = []

export function isProviderManagedEnvVar(key: string): boolean {
  const upper = key.toUpperCase()
  return (
    PROVIDER_MANAGED_ENV_VARS.has(upper) ||
    PROVIDER_MANAGED_ENV_PREFIXES.some(p => upper.startsWith(p))
  )
}

/**
 * Dangerous shell settings that can execute arbitrary shell code
 */
export const DANGEROUS_SHELL_SETTINGS = [
  'apiKeyHelper',
  'awsAuthRefresh',
  'awsCredentialExport',
  'gcpAuthRefresh',
  'otelHeadersHelper',
  'statusLine',
] as const

/**
 * Safe environment variables that can be applied before trust dialog.
 * These are Atlas specific settings that don't pose security risks.
 *
 * IMPORTANT: This is the source of truth for which env vars are safe.
 * Any env var NOT in this list is considered dangerous and will trigger
 * a security dialog when set via remote managed settings.
 *
 * Dangerous env vars (NOT in this list):
 *
 * === REDIRECT TO ATTACKER-CONTROLLED SERVER ===
 * - OPENAI_BASE_URL, OPENAI_FOUNDRY_BASE_URL, OPENAI_VERTEX_BASE_URL
 * - HTTP_PROXY, HTTPS_PROXY, NO_PROXY, http_proxy, https_proxy, no_proxy
 * - OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_EXPORTER_OTLP_LOGS_ENDPOINT, OTEL_EXPORTER_OTLP_METRICS_ENDPOINT
 *
 * === TRUST ATTACKER-CONTROLLED SERVER ===
 * - NODE_TLS_REJECT_UNAUTHORIZED
 * - NODE_EXTRA_CA_CERTS
 *
 * === SWITCH TO ATTACKER-CONTROLLED PROJECT ===
 * - OPENAI_FOUNDRY_RESOURCE
 * - OPENAI_API_KEY, OPENAI_AUTH_TOKEN
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
  // 0.1.44 死键登记（E-残余①，见 src/sandbox/ripgrep.ts 头注）：TUI 三模式 ripgrep
  // resolver 已裁（A+S3 单一事实源），本 env 不再被消费；白名单项保留不删。
  'USE_BUILTIN_RIPGREP',
])
