# Settings 参考（settings.json / settings.local.json）

> 代码事实源：engine 车道 schema = `src/engine/config/types.ts`（`SettingsSchema()`，
> zod v4 全字段 optional + `.passthrough()`）；TUI 车道超集 = `src/kernel/settings/types.ts`
>（由 `src/tui/utils/settings/settings.ts` 消费）；加载/合并 = `src/engine/config/settings.ts`
> + `settingsCache.ts` + `merge.ts`；配置目录解析 = `src/shared/configDir.ts` +
> `src/engine/config/configRoot.ts`；managed settings = `src/engine/config/managedPath.ts`。
> 刷新：0.1.122（A3，工单 docs/2026-11-17-0122-docs-normalization-ticket.md）；
> 本文件并入并替代 `docs/atlas-config-reference-and-template.md`（该件已改为指向本文）。
> 本文件引用符号名而非行号；字段面以 `SettingsSchema` 运行时实形为准。

## 总览

- 全字段 **optional**：任何键缺席都合法（schema 不要求必填）。
- schema 尾部 **`.passthrough()`**：未知字段不报错、合并不丢弃（前向兼容面）。
- engine 车道是**裁剪形**：认证 helper 族、插件/市场族、UI 族、登录/远程族、自动更新族等
  由 TUI 车道显式声明、engine 侧靠 passthrough 透传存活（见 §透传族）。
- `settings.json` 与 `settings.local.json` **同 schema**；差异在消费方式（§settings.local.json）。

## 模型与角色

| 字段路径 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `model` | string | — | 当前模型（`provider/model` ref 或角色别名，同 `--model`） |
| `modelRoles` | record | — | 角色→配置池。角色枚举 = `'premium' \| 'fast' \| 'small'`（`src/modelprovider/roles.ts` `MODEL_ROLES`）。条目形：`{ models: [string \| {model}], provider?, model?, baseURL?, apiKey? }`。角色内水平 fallback 序：sessionModel → env `ATLAS_<ROLE>_MODEL` → rolePool → `--fallback-model` 追加末位 |
| `defaultRole` | string | `'small'` | 主循环缺省角色（回落点 = `src/tui/bootstrapState.ts` `getInitialMainLoopModel`） |
| `availableModels` | any | — | `/model` 选择器可选项 |
| `providers` | record | — | provider 表。条目形：`{ baseURL, apiKey, api, defaultContextWindow, defaultMaxTokens, models: [{id, name, contextWindow, maxTokens}] }`。硬缺省 `HARD_DEFAULT_CONTEXT_WINDOW=262144` / `HARD_DEFAULT_MAX_TOKENS=32768`。**`baseURL` 按原样使用**——OpenAI 兼容网关通常要求含 `/v1` 后缀（内置 OpenAI 默认即 `https://api.openai.com/v1`）；不带后缀的裸 host 会 404（issue #3-2，见 §env 优先级链） |
| `effortLevel` | string | `'medium'` | 全局 effort；显示优先序 `effortByModel[model]` > `effortLevel` > `'medium'` |
| `effortByModel` | record | — | per-model effort 记忆 |
| `alwaysThinkingEnabled` | boolean | — | thinking 常开 |
| `ttsModel` / `asrModel` / `advisorModel` | string | — | 语音/ASR/顾问模型 |

> 池内模型 id 形态（issue #3-1，0.1.123 起已归一）：**0.1.123 起**裸 id
> （如 `"fabric-small"`）命中 `providers` 表条目时自动归一为全 ref
> `"maas/fabric-small"`；**未命中 providers 表的裸 id 仍原样透传、解析失败
> （`unknown_reference`）**。全 ref 形（`"provider/model"`）始终合法，仍建议优先写全 ref。

## 环境变量

| 字段 | 类型 | 说明 |
|---|---|---|
| `env` | record<string,string> | 值必须为 string。两阶段应用（`src/engine/config/managedEnv.ts`）：信任前 `applySafeConfigEnvironmentVariables` 仅放行 `SAFE_ENV_VARS` 63 项白名单（含 `ATLAS_PREMIUM_MODEL`/`ATLAS_SMALL_MODEL`/`ATLAS_FAST_MODEL`/`ATLAS_MODEL` 等）；信任后 `applyConfigEnvironmentVariables` 全量。**policy 源的 env 最后压顶，不可被覆盖** |

## MCP

| 字段 | 类型 | 说明 |
|---|---|---|
| `mcpServers` | record | 条目 `{serverCommand\|serverUrl, ...}` |
| `allowedMcpServers` / `deniedMcpServers` | any | MCP 允许/拒绝面 |
| `enabledMcpjsonServers` / `disabledMcpjsonServers` | string \| string[] | 单串宽容归一 `[string]`（0.1.81 V3-2） |

## 沙箱 / 权限 / Hooks

| 字段 | 类型 | 说明 |
|---|---|---|
| `sandbox` | any（passthrough） | 嵌套键（TUI 日志展开面）：`enabled`/`failIfUnavailable`/`allowUnsandboxedCommands`/`network`/`filesystem`/`ignoreViolations`/`excludedCommands`/`autoAllowBashIfSandboxed`/`enableWeakerNestedSandbox`/`enableWeakerNetworkIsolation`/`ripgrep`。详见 [sandboxing.md](sandboxing.md) |
| `permissions` | any | `permissions.allow/deny/ask` 数组在 schema 校验前经 `src/engine/config/validation.ts` `filterInvalidPermissionRules` 预过滤（坏规则剔除+warning，不毒化整文件）。嵌套键：`defaultMode`/`disableBypassPermissionsMode`/`additionalDirectories` |
| `hooks` | z.lazy(HooksSchema) | 契约 = `src/engine/config/hooksSchema.ts`；事件 key 集 = `src/hooks/hookEvents.ts` `HOOK_EVENTS`（27 基础 + PreModelSwitch/PostModelSwitch/DirectoryAdded/MessageDisplay）。结构：`hooks[event] → {matcher?, hooks: [{...}], source?}`；四类判别联合（command/prompt/agent/http），各变体 `.passthrough()`。运行时仅执行 command 变体。详见 [hooks.md](hooks.md) |
| `disableAllHooks` | boolean | 门控链四态（`src/engine/config/hooksConfig.ts` `getHooksFromAllowedSources`）；非 managed 源不能禁 managed hooks |
| `allowManagedHooksOnly` | boolean | 仅 managed/policy hooks 生效 |

## 压缩 / 会话 / 团队 / 计费 / 技能

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `autoCompactWindow` | 单档 union \| record(model→单档) | — | 单档 = `{kind:'auto'}` \| `{kind:'off'}` \| `{kind:'window', tokens:int≥1000}` \| `{kind:'pct', pct:1..100}`；per-model 键控含 `'default'` 兜底键。读侧归一单点 = engine `normalizeAutoCompactWindowSetting`。env 档位覆盖（`src/engine/config/autoCompactOverrides.ts`）：`ATLAS_AUTOCOMPACT_PCT_OVERRIDE`、`ATLAS_AUTO_COMPACT_WINDOW`、`DISABLE_COMPACT`、`DISABLE_AUTO_COMPACT`、`ATLAS_BLOCKING_LIMIT_OVERRIDE` |
| `idleCompaction` | boolean | `true` | 空闲压缩开关（闲置 ≥54min + ≥200K tokens 先压缩）；**false = 唯一关闭口**；env `ATLAS_IDLE_COMPACT_MIN_TOKENS` 只覆写 token 下限 |
| `teams.persistence` | `'memory' \| 'durable'` | `'memory'` | team durable 档；缺席回落 `ProductDefinition.teamPersistenceDefault` |
| `cost.pricingOverrides` | record(modelPattern→PricingEntry) | — | **0.1.120 新面**。条目 `{inputPerMTok, outputPerMTok}`（USD/MTok）；优先序 内置 `BUILTIN_PRICING` < override；**半字段 override fail-closed → total_cost_usd 缺席**；unknown 模型 → undefined（禁伪造 0）；cache token 零计入 |
| `skillOverrides` | `'off' \| 'user-invocable-only' \| 'name-only'` | `'off'` | skill 同名冲突解析三档（C9-5）；**登记未接线**（消费缝在 `src/tui/commands/skills/` 后续波） |
| `autoMemoryEnabled` / `autoMemoryDirectory` | boolean / string | — | memory 域 |
| `claudeMdExcludes` | string[] | — | ATLAS.md 排除 |
| `includeGitInstructions` / `respectGitignore` | boolean | — | git 指令面 |
| `defaultShell` | `'bash' \| 'powershell'` | — | shell 面 |
| `skipWebFetchPreflight` | boolean | — | WebFetch 预检跳过 |
| `search.tavilyApiKey` | string | — | Tavily key；env `TAVILY_API_KEY` 优先 |
| `tui.fullscreen` | boolean | — | `/tui` 全屏渲染（AD-14） |

## 配置目录解析链

逐环节符号（`src/shared/configDir.ts` + `src/engine/config/configRoot.ts`）：

1. **env `ATLAS_CONFIG_DIR`**（全路径）——`getConfigDirName()` L1 命中直返。
2. **env `ATLAS_CONFIG_DIR_NAME`**（目录名）——`getConfigDirNameForProject()`。
3. 产品默认 `product.configDirName`（经 `setConfigDirNameProvider` 槽；`ATLASCODE_PRODUCT`
   现未设 → 本层缺席）。
4. 缺省 `NEW_CONFIG_DIR = '.atlas'`。

用户配置根 = `getAtlasConfigHomeDir()` = `ATLAS_CONFIG_DIR ?? join(homedir(), 目录名)`。

> 订正披露：旧参考文档链形写作「ATLAS_CONFIG_NAME」——实际符号是
> **`ATLAS_CONFIG_DIR_NAME`**（`ATLAS_CONFIG_NAME` 全仓零命中）。

## 五源优先级链

源常量 = `SETTING_SOURCES`（`src/engine/config/constants.ts`）：
`userSettings → projectSettings → localSettings → flagSettings → policySettings`。

**实际合并级联**（`loadSettingsFromDisk`，经 `getEnabledSettingSources()`）：

```
pluginSettingsBase（新仓恒 undefined） → userSettings → policySettings → flagSettings
```

- **project/local 两源不在合并级联**（S-3a 裁定）：仅被按源直读
  （`getSettingsForSource('localSettings')` 的 permissionsLoader/hooks/sandbox 等）
  与写回面消费。
- **policySettings（企业策略）压在 userSettings 之上**。engine 车道加载 =
  `loadManagedFileSettings()`：`/etc/atlas/managed-settings.json` + drop-in 目录
  `/etc/atlas/managed-settings.d/`（按文件名字母序叠上，后文件赢，systemd 惯例）。
  TUI 车道另保留四链 first-source-wins：remote > MDM(HKLM/plist) > managed-settings.json
  > HKCU（`src/tui/utils/settings/settings.ts` + `src/kernel/utils/settings/mdm/`）。
  Windows 注册表键名 `Policies\AtlasHarness`（冻结层）。
- **flagSettings 现为死源**：无 `--settings` CLI 消费面 → 恒 undefined 短路。
- restricted 模式（`--restricted` flag 或 env `ATLAS_RESTRICTED`）剥 userSettings。
- 深合并 = `settingsMergeCustomizer`（数组拼接+保序去重）；缓存三层
  （session/perSource/parseFile），失效单点 `resetSettingsCache()`。

## settings.local.json

- 路径：`<cwd>/.atlas/settings.local.json`（`getRelativeSettingsFilePathForSource`）。
- **不在合并级联**：按源直读（trusted 4 源判定族）+ 写回。
- 可写源 = user/project/local（policy/flag 只读）；写回经 `updateSettingsForSource`
  （删键 = 显式 undefined；坏 JSON 守卫；写后 `resetSettingsCache()`）。
- 仅 TUI 车道在写回 local 时自动加 `.gitignore` 规则（`addFileGlobRuleToGitignore`）。

## env 变量 vs settings 优先级（issue #3-3）

以 provider 解析为例（issue #3 实测对 0.1.121 bundle）：

```
baseURL = providers 命中 ? provider.baseURL : readEnv("OPENAI_BASE_URL")
```

**settings.json 一旦命中任何 provider 条目，env 变量即被忽略**——即使该角色池的条目
并未覆盖当前角色。即：settings 先经（先经链），env 仅在字段缺省时 SDK 级生效。
这是有意设计，但 headless 排障时须知道：env 配置不生效先查 settings.json 是否有
providers/modelRoles 命中。同形适用于 `OPENAI_API_KEY`/`OPENAI_AUTH_TOKEN` 与
`ATLAS_<ROLE>_*` 系列。

## 模板（可填充 settings.json）

```jsonc
{
  // 模型：provider/model 全 ref（池内裸 id 0.1.123 起命中 providers 表自动归一）
  "model": "maas/fabric-small",
  "defaultRole": "small",
  "modelRoles": {
    "small":  { "models": ["maas/fabric-small"] },
    "fast":   { "models": ["maas/fabric-fast"] },
    "premium": { "models": ["maas/fabric-premium"] }
  },
  "providers": {
    "maas": {
      // baseURL 按原样使用——OpenAI 兼容网关必须含 /v1 后缀
      "baseURL": "http://your-gateway:8999/v1",
      "apiKeyEnvVar": "MAAS_API_KEY",
      "api": "openai-completions",
      "defaultContextWindow": 131072,
      "defaultMaxTokens": 16384,
      "models": [
        { "id": "maas/fabric-small",   "name": "Fabric Small",   "contextWindow": 131072, "maxTokens": 16384 }
      ]
    }
  },
  "autoCompactWindow": { "kind": "auto" },
  "idleCompaction": true,
  "search": { "tavilyApiKey": "" },
  "env": { "ATLAS_EXTRA_NOTE": "value-must-be-string" }
}
```

模板实形参考仓库根 `settings.template.json`（providers/modelRoles/defaultRole/
availableModels/search 五键）。

## 透传族（passthrough，engine schema 外存活）

不在 engine `SettingsSchema` 显式声明、靠 `.passthrough()` 存活（TUI 车道
`src/kernel/settings/types.ts` 显式声明）：

`apiKeyHelper`、`awsAuthRefresh`、`awsCredentialExport`、`gcpAuthRefresh`、
`otelHeadersHelper`、`enabledPlugins`、`pluginConfigs`、`extraKnownMarketplaces`、
`strictKnownMarketplaces`、`blockedMarketplaces`、`outputStyle`、`language`、`theme`、
`llmTimeoutMs`（env `ATLAS_LLM_TIMEOUT` 恒胜、缺省 600s、30min cap）、
`prefersReducedMotion`、`spinnerTipsEnabled`、`statusLine`、`forceLoginMethod`、
`remote`、`autoUpdatesChannel`、`cleanupPeriodDays`、`includeCoAuthoredBy`、
`plansDirectory`、`attribution`、`agent`、`worktree`、`sttUrl` 等。

另有三件独立局部读取：`skipDangerousModePermissionPrompt`（project 源刻意排除防 RCE）、
`autoMode`（`feature('TRANSCRIPT_CLASSIFIER')` 门控，默认开）、
`strictPluginOnlyCustomization`（plugin-only 锁面）。

## 英文速查（Quick reference）

- **Files**: `~/.atlas/settings.json` (user), `<project>/.atlas/settings.json` (project),
  `<project>/.atlas/settings.local.json` (local, gitignored), `/etc/atlas/managed-settings.json`
  (+ `.d/` drop-ins, lexicographic) (policy).
- **Merge cascade**: pluginBase → user → **policy (wins over user)** → flag(dead).
  project/local are NOT merged — read per-source only.
- **Config dir env**: `ATLAS_CONFIG_DIR` (full path) > `ATLAS_CONFIG_DIR_NAME` (dir name)
  > product default > `.atlas`.
- **Precedence**: settings.json beats env vars whenever any provider entry matches;
  env (`OPENAI_BASE_URL`/`OPENAI_API_KEY`) applies only when fields are absent.
- **modelRoles**: use full `provider/model` refs (bare ids are not normalized);
  provider `baseURL` is used verbatim (include `/v1`).
- **cost.pricingOverrides**: half-field override is fail-closed (no total_cost_usd);
  unknown model → cost omitted, never faked to 0.
