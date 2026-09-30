# AtlasCode ENV 默认值三档决策表（env-defaults-decision）

> **地位**：各域 `config.ts` "默认"层的**单一事实源**，喂 AUT-2 优先级链（策略 MDM > env > settings.json > 默认）。
> **范围**：T1 自建 31 + T3 布尔 60 + T3 值旋钮 12 = **103 行**（T2 22 个全进 F 池不作决策；D carry 4 个随 D 波；T3 缺省/非旋钮 ~73 个"未设置=无行为"，等价 ③ 不列）。
> **档分布**：① 保持开 6 ｜ ② 预设值 28 ｜ ③ 保持关 69。
> **来源**：`env-defaults-triage.md`（202 变量初筛，同类猜测级）+ 2026-09-21 用户拍板（T2 全进 F 池 / 本决策表按推荐出）。
> **② 档的 IFF 依赖**：API_BASE_URL 与模型角色池头的具体值是 [ATLAS-HOLD]（IFF 网关定案换值），本表先定档、值占位。

## ① 保持开（产品 OOTB 承诺，有效默认=开）

| 组 | 变量 | 档 | 裁定/依据 |
|---|---|---|---|
| Ascend 域 | `ATLAS_ASCEND_PROMPT` | ① | 保持开：Prompt 面技能注入是 Ascend 域 OOTB 承诺 |
| mock 非交互 | `ATLAS_MOCK_ON_NONINTERACTIVE` | ① | 保持开：headless 自动 mock 防挂起，产品承诺（默认开） |
| coordinator | `ATLAS_COORDINATOR_MODE` | ① | 保持开：ON_BY_DEFAULT 集（73631df），env 仅 kill-switch（设 0 关） |
| T3 布尔 | `ATLAS_ATTRIBUTION_HEADER` | ① | 保持开：commit 尾注头是 OOTB 行为 |
|  | `ATLAS_ENABLE_PROMPT_SUGGESTION` | ① | 保持开：prompt 建议 OOTB 承诺 |
|  | `ATLAS_SYNTAX_HIGHLIGHT` | ① | 保持开：默认开（BAT 主题） |

## ② 预设值（好默认值，落各域 config.ts fallback）

| 组 | 变量 | 档 | 裁定/依据 |
|---|---|---|---|
| Ascend 域 | `ATLAS_ASCEND_MOCK_SCENARIO` | ② | preset 'happy'（fixture 场景键） |
| 模型角色池 | `ATLAS_SMALL_MODEL` | ② | preset 国产模型池头（具体值随 IFF 网关/角色池配置定案） |
|  | `ATLAS_FAST_MODEL` | ② | preset 国产模型池头（具体值随 IFF 网关/角色池配置定案） |
|  | `ATLAS_PREMIUM_MODEL` | ② | preset 国产模型池头（具体值随 IFF 网关/角色池配置定案） |
|  | `ATLAS_SUBAGENT_MODEL` | ② | preset 国产模型池头（具体值随 IFF 网关/角色池配置定案） |
|  | `ATLAS_ASR_MODEL` | ② | preset 国产模型池头（具体值随 IFF 网关/角色池配置定案） |
|  | `ATLAS_TTS_MODEL` | ② | preset 国产模型池头（具体值随 IFF 网关/角色池配置定案） |
|  | `ATLAS_CUSTOM_MODEL_OPTION` | ② | preset 国产模型池头（具体值随 IFF 网关/角色池配置定案） |
|  | `ATLAS_CUSTOM_MODEL_OPTION_NAME` | ② | preset 国产模型池头（具体值随 IFF 网关/角色池配置定案） |
|  | `ATLAS_CUSTOM_MODEL_OPTION_DESCRIPTION` | ② | preset 国产模型池头（具体值随 IFF 网关/角色池配置定案） |
|  | `ATLAS_LLM_TIMEOUT` | ② | preset 超时默认（沿用代码 fallback） |
|  | `ATLAS_MAX_OUTPUT_TOKENS` | ② | preset 沿用代码 fallback |
|  | `ATLAS_EXTRA_BODY` | ② | preset 空（仅国内容器网关需要时覆盖） |
|  | `ATLAS_EXTRA_METADATA` | ② | preset 空 |
|  | `ATLAS_CUSTOM_HEADERS` | ② | preset 空（静态键走 OPENAI_AUTH_TOKEN/API_KEY，无需 header 覆盖） |
| effort | `ATLAS_EFFORT_LEVEL` | ② | preset med（effortByModel 优先级链默认档） |
| T3 值旋钮 | `ATLAS_CONFIG_DIR` | ② | preset ~/.atlas（clean-cut 2026-09-19 后唯一路径） |
|  | `ATLAS_DEBUG_LOGS_DIR` | ② | preset 系统临时目录 |
|  | `ATLAS_DEFAULT_GIT_HOST` | ② | preset gitcode.com（国内主 git 源，非 github） |
|  | `ATLAS_GLOB_TIMEOUT_SECONDS` | ② | preset 0（不限时，沿用） |
|  | `ATLAS_IDLE_THRESHOLD_MINUTES` | ② | preset 75 分钟（沿用） |
|  | `ATLAS_IDLE_TOKEN_THRESHOLD` | ② | preset 100_000（沿用） |
|  | `ATLAS_MAX_RETRIES` | ② | preset 沿用代码 fallback |
|  | `ATLAS_MAX_TOOL_USE_CONCURRENCY` | ② | preset 10（沿用） |
|  | `ATLAS_PERFETTO_WRITE_INTERVAL_S` | ② | preset 空（perfetto 未启用时不写） |
|  | `ATLAS_PLAN_V2_AGENT_COUNT` | ② | preset 沿用代码 fallback |
|  | `ATLAS_SYNC_PLUGIN_INSTALL_TIMEOUT_MS` | ② | preset 沿用代码 fallback |

## ③ 保持关（高级/调试 opt-in，维持现状）

以下 69 条全部维持"未设置=关/缺省"，无逐条差异裁定：

| 组 | 变量 |
|---|---|
| Ascend 域 | `ATLAS_ASCEND_MOCK`（生产默认关；非交互自动 mock 由 MOCK_ON_NONINTERACTIVE 单独承担） |
|  | `ATLAS_ASCEND_FRESHNESS_CACHE`（高级调优，缺省=不启用缓存覆盖） |
| effort | `ATLAS_ALWAYS_ENABLE_EFFORT`（保持关） |
| 市场 kill-switch | `ATLAS_DISABLE_ASCEND_MARKETPLACE_AUTOINSTALL`（保持关（关=自动预装开，OOTB 承诺）） |
|  | `ATLAS_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL`（保持关（同上）；atlas-plugins 无独立 kill-switch，随总开关） |
| dev/运行时（猜） | `ATLAS_BUN_BIN`（dev-only，不预设） |
|  | `ATLAS_HOST_PLATFORM`（dev-only，不预设） |
|  | `ATLAS_REPL`（dev-only，不预设） |
|  | `ATLAS_SESSION_KIND`（dev-only，不预设） |
|  | `ATLAS_WORKER_EPOCH`（dev-only，不预设） |
|  | `ATLAS_OVERRIDE_DATE`（dev-only，不预设） |
| T3 布尔 | `ATLAS_ACCESSIBILITY` |
|  | `ATLAS_ACTION` |
|  | `ATLAS_ADDITIONAL_DIRECTORIES_MD` |
|  | `ATLAS_AFTER_LAST_COMPACT` |
|  | `ATLAS_AGENT_LIST_IN_MESSAGES` |
|  | `ATLAS_AGENT_SDK_DISABLE_BUILTIN_AGENTS` |
|  | `ATLAS_AGENT_SDK_MCP_NO_PREFIX` |
|  | `ATLAS_AUTO_CONNECT_IDE` |
|  | `ATLAS_BASH_MAINTAIN_PROJECT_WORKING_DIR` |
|  | `ATLAS_BUBBLEWRAP` |
|  | `ATLAS_DEBUG` |
|  | `ATLAS_DEBUG_REPAINTS` |
|  | `ATLAS_DEV` |
|  | `ATLAS_DISABLE_ATTACHMENTS` |
|  | `ATLAS_DISABLE_BACKGROUND_TASKS` |
|  | `ATLAS_DISABLE_EXPERIMENTAL_BETAS` |
|  | `ATLAS_DISABLE_MDS` |
|  | `ATLAS_DISABLE_MESSAGE_ACTIONS` |
|  | `ATLAS_DISABLE_MOUSE`（保持关（2026-09-15 根修：默认不捕获鼠标，ENABLE_MOUSE 或全屏才开）） |
|  | `ATLAS_DISABLE_MOUSE_CLICKS` |
|  | `ATLAS_DISABLE_POLICY_SKILLS` |
|  | `ATLAS_DISABLE_REACTIVE_COMPACT`（保持关 = reactive compact 默认开（语义反向，勿误读）） |
|  | `ATLAS_DISABLE_SNIP` |
|  | `ATLAS_DISABLE_TERMINAL_TITLE` |
|  | `ATLAS_DISABLE_VIRTUAL_SCROLL` |
|  | `ATLAS_EAGER_FLUSH` |
|  | `ATLAS_EMIT_SESSION_STATE_EVENTS` |
|  | `ATLAS_ENABLE_FINE_GRAINED_TOOL_STREAMING` |
|  | `ATLAS_ENABLE_MOUSE`（保持关（同上，显式开才捕获）） |
|  | `ATLAS_ENABLE_SDK_FILE_CHECKPOINTING` |
|  | `ATLAS_ENABLE_TASKS` |
|  | `ATLAS_ENABLE_XAA` |
|  | `ATLAS_EXIT_AFTER_FIRST_RENDER` |
|  | `ATLAS_GLOB_HIDDEN` |
|  | `ATLAS_GLOB_NO_IGNORE` |
|  | `ATLAS_IDE_SKIP_VALID_CHECK` |
|  | `ATLAS_INCLUDE_PARTIAL_MESSAGES` |
|  | `ATLAS_MCP_INSTR_DELTA` |
|  | `ATLAS_NEW_INIT` |
|  | `ATLAS_NO_FLICKER` |
|  | `ATLAS_PLAN_MODE_REQUIRED` |
|  | `ATLAS_PLUGIN_USE_ZIP_CACHE` |
|  | `ATLAS_PROFILE_QUERY` |
|  | `ATLAS_PROFILE_STARTUP` |
|  | `ATLAS_PROXY_RESOLVES_HOSTS` |
|  | `ATLAS_REACTIVE_ONLY` |
|  | `ATLAS_SAVE_HOOK_ADDITIONAL_CONTEXT` |
|  | `ATLAS_SIMPLE` |
|  | `ATLAS_SKIP_PROMPT_HISTORY` |
|  | `ATLAS_SSE_PORT` |
|  | `ATLAS_STREAMLINED_OUTPUT` |
|  | `ATLAS_SYNC_PLUGIN_INSTALL` |
|  | `ATLAS_TRUST_WORKSPACE` |
|  | `ATLAS_UNATTENDED_RETRY` |
|  | `ATLAS_USE_NATIVE_FILE_SEARCH` |
|  | `ATLAS_USE_POWERSHELL_TOOL` |
|  | `ATLAS_VERIFY_PLAN` |
| T3 值旋钮 | `ATLAS_STALL_TIMEOUT_MS_FOR_TESTING`（测试专用，生产不预设） |

## 落地接口（A 波起）
1. 本表 = 各域 `config.ts` 默认层单一事实源；A 波 feature.ts + shared 骨架时不消费，**B 波**（四域落地，charter L5 B 波行）各域 `config.ts` 按域取对应行。
2. ① 档 6 条中属 feature() 门控的（COORDINATOR_MODE）走 ON_BY_DEFAULT 集 + kill-switch，其余走 config.ts 默认 true。
3. ② 档 IFF 占位值在网关定案后一次 pass 填实（同 [ATLAS-HOLD] 域外 URL 族换值 pass）。
4. 新仓任何新 env 变量须先入本表再写码（STR-4 同源纪律：先定归属再进 shared/域）。
5. 本表 = 优先级链**默认层（链底）**单一事实源，AUT-2 链 = 企业策略(MDM) > env > settings.json > 代码默认（charter C-5）：**不做「启动注入默认值进 process.env」的 seed 脚本**（代码默认冒充 env 层即破坏链）；要有效配置可见性 → 只读 `--env-dump` 命令（charter C-5 裁定）。