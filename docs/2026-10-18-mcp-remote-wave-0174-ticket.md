# 0.1.74 MCP 远端车道通用化收口波（C-3e 销项）工单

**波**：独立 0.1.74 波「MCP 远端车道通用化收口波」，基线 v0.1.73（release 5d8a809 + tag + npm live）。
**用户裁定（原话）**：MCP 远端车道这个车道应该是根据配置远端可配的 http url，而不是硬编码，
不要和本地 gateway 绑定，这是一个通用产品，不是为我本地定制。
**裁定批复**：D-1~D-4 方案「OK 可以」。

## §0 头注

- 前向缝 ⑭ #200「MCP proxy 条目」本波**注销**（C-3e 登记面销项）：1P
  hosted-connector（claudeai-proxy）连接/显示/守卫车道随 token 车道清零（0.1.72）
  + 基址中性化（0.1.73）双死而整裁；CIMD 常量（MCP_CLIENT_METADATA_URL）整删，
  per-server `oauth.clientMetadataUrl` 配置面本波并入（通用配置驱动取代内置默认）。
- 0.1.73 C-3e 登记项（de-ant-closure-0173.test.ts 头注「登记不入境」条）本波核销。
- 波性质 = **删 2 条 1P 死车道 + 并入 1 个通用配置字段**；通用远端 MCP 面
  （sse/http/ws + url + headers + headersHelper + per-server oauth）零扰动恒等。
  远端 MCP 与 LLM gateway 完全解耦（用户级 HTTPS_PROXY 代理支持保留 = 通用能力）。

## §1 设计（4 件）

### D-1 · 1P hosted-connector（claudeai-proxy）全车道删除

- **型面**：`McpClaudeAIProxyServerConfigSchema` + 型导出 + union 成员删除
  （types.ts union = 7 型 stdio/sse/sse-ide/ws-ide/http/ws/sdk）；
  coreSchemas.ts 状态 schema 同步裁；`all-local-types.ts` 死 `ClaudeAIServerInfo`
  any stub 删（权威定义留在 components/mcp/types.ts）。
- **连接车道**（client.ts）：connect 分发型面 `claudeai-proxy` 支删；
  `createClaudeAiProxyFetch` 整删（doubly dead：token 车道 0.1.72 清零 +
  代理基址 0.1.73 中性化）；`handleRemoteAuthFailure` union/label = sse/http；
  401 session-expired 支 = http only；cached-needs-auth 跳连支 = http/sse；
  连接关闭判别 = http。
- **TUI 面**：MCPSettings 型分支删（sse/http/stdio 级联恒等重锚）+ defaultTab
  常量化 "Atlas"（1P 支恒假）；MCPRemoteServerMenu 早退守卫/auth 菜单门删
  （菜单 = 纯通用远端面）；MCPListPanel claude.ai 分流常量折叠（_temp2 恒
  false / _temp 恒 true）；useMcpConnectivityStatus 4 过滤器常量折叠；
  ManagePlugins 详情/工具视图 1P 支删 + catch-all 重锚通用 http 形（双 cast
  `as unknown as McpHTTPServerConfig` = 防御面）；McpAuthTool unsupported 守卫
  注释订正；mcpPluginIntegration switch 裁型 case；cli mcpConfigWrite
  expandServerConfig raw 残留登记订正。
- **CLI 面**：list 输出支（G-3 已裁，本波型删后登记销项）；OAuth 行显示支
  并入 per-server clientMetadataUrl 显示。

### D-2 · CIMD 常量删除

- `MCP_CLIENT_METADATA_URL` 常量（oauth.ts）整删；`OauthConfig` 现仅
  BASE_API_URL / CLAUDE_AI_ORIGIN（0.1.73 中性化 undefined，3 活消费点 =
  apiPreconnect / preflightChecks / sessionIngress，C-2b 登记面非本波）。
- auth.ts getter 重写：env `MCP_OAUTH_CLIENT_METADATA_URL`（部署/operator
  控制）优先 → per-server `oauth.clientMetadataUrl` → undefined（SDK DCR
  兜底）。**安全裁定（post-review 修波）**：CIMD URL 承载 OAuth 客户端身份，
  per-server 值可能来自 repo 提交面（project/plugin scope），不得压过
  部署级 env 控制（信任边界：deployment env > repo-committed config；
  原 1P 语义 = 常量 → env override，本波保持 env 胜出方向不变）。
- **2nd-review 硬化（同波闭环）**：① getter 对 env 值 https-验真
  （`new URL(...).protocol === 'https:'`，非 URL / 非 https 值忽略 +
  debug 日志，回落 per-server）——CWE-20 关闭；② `MCP_OAUTH_CLIENT_METADATA_URL`
  从一切 settings 源 env 剥离（`utils/managedEnv.ts` 新
  `withoutMcpOauthCimdVars` 挂入 `filterSettingsEnv` 过滤链，
  `withoutSSHTunnelVars` 先例同型）——repo 提交的 project-scope
  settings.env 不可种值，此 env = 真环境（shell/CI）部署专用；
  操作者控制面保留（真 env 不受 settings 合并影响）。engine 车道双免疫
  （S-3a 级联结构性排除 project/local scope + engine 面无 CIMD 消费点），
  零改动。
- **3rd-review 硬化（CWE-178，同波闭环）**：剥离键匹配改 case-insensitive
  （`key.toUpperCase()`，对齐 codebase `SAFE_ENV_VARS.has(key.toUpperCase())`
  / `isProviderManagedEnvVar` 匹配惯例）——Windows 上 Node 把 env 键归一
  为大写（process.env 大小写不敏感参考），repo 种异大小写变体
  （`mcp_oauth_...`）须不可存活剥离后经 canonical 键被 getter 读回；
  Linux 上异大小写键 = 另一变量（getter canonical 读天然不命中），
  语义一致无扰动。
- **4th-review 硬化（同波闭环）**：① getter 三处 CIMD URL 日志行改记
  不可逆描述子（`protocol//host+path` 模板，URL 解析器剥除
  userinfo/query；不可解析值 = 长度描述）——URL 可嵌
  `user:pass@`（秘密泄露向量）+ 构造值可携换行（日志注入向量）关闭；
  ② per-server scope-gating 发现 = §4 既有登记项再确认（per-server
  oauth 块整体信任面，非 clientMetadataUrl 单字段——单字段门控会劈裂
  同一配置块内信任模型；块级 scope-gating = 后续 f4 评估项，本波
  operator pin（env 覆写优先）已覆盖 repo 提交值压制面）。

### D-3 · per-server `oauth.clientMetadataUrl` 字段并入

- `McpOAuthConfigSchema` 加 `clientMetadataUrl`（`z.string().url().startsWith('https://')`
  optional，https-only 与 authServerMetadataUrl 同纪律）。
- 消费链 = D-2 getter 优先级链（env 部署控制 → per-server → undefined，
  安全裁定顺序）；CLI `/mcp`
  OAuth 行展示（sse+http 双支 `client_metadata_url` 行）。

### D-4 · 独立 0.1.74 波 + 标准五段链

- worktree 落码 → 四件套 → 合 master → e2e gate（`--release-gate 0.1.74`）→
  发布 + 生产 lane；C-3e 登记面销项 + 前向缝 ⑭ #200 MCP proxy 条目注销。

## §2 落码文件（21 改 + 1 新）

- 型面：`services/mcp/types.ts` / `entrypoints/sdk/coreSchemas.ts` /
  `types/all-local-types.ts`
- 连接车道：`services/mcp/client.ts` / `services/mcp/config.ts` /
  `services/mcp/utils.ts`
- OAuth：`services/mcp/auth.ts` / `constants/oauth.ts` /
  `tools/McpAuthTool/McpAuthTool.ts` / `services/analytics/metadata.ts`
- TUI 面：`components/mcp/MCPSettings.tsx` / `MCPRemoteServerMenu.tsx` /
  `MCPListPanel.tsx` / `hooks/notifs/useMcpConnectivityStatus.tsx` /
  `commands/plugin/ManagePlugins.tsx`
- 插件/CLI 面：`utils/plugins/mcpPluginIntegration.ts` /
  `cli/handlers/mcp.tsx`（tui）/ `cli/handlers/mcp.ts` / `cli/mcpConfigWrite.ts`
- 判别单测：新 `tests/unit/mcp-remote-closure-0174.test.ts`（源级锁：
  z.literal 型面 0 / MCP_PROXY_URL·PATH 0 / MCP_CLIENT_METADATA_URL 0 /
  型 schema·车道函数 0 / clientMetadataUrl 在场 + https-only + getter 优先级链 /
  sse/http/ws 通用面恒等锚）+ `tests/unit/de-ant-closure-0173.test.ts`
  C-2a 重锚（三常量 not.toContain 断言 + 0174 销项登记）。

## §3 验收（fail-closed）

- 判别单测 0174 全绿（13 断言族）+ 0173 重锚绿（24 测 2 文件）。
- 四件套（worktree）：tsc 0 / eslint src 0e0w / bun build / CI 全量测试绿。
- e2e gate `--release-gate 0.1.74`：四件套 + P0a + A4F + `/mcp` 面抽验
  （oauth client_metadata_url 行 + 无 claudeai-proxy 面）+ SRI 4 值独立复算。
- 生产 lane（npm 安装面）：SRI 三方同值 + 前波 token 零回归。

## §4 登记

- 历史审计注释（src/mcp/* + se2b 测试头注的 claudeai-proxy 裁除记录）保留
  不判红（0174 判据面 = 活码：z.literal 型面 + 常量名 + 车道函数名）。
- sessionIngress（C-2b）1P 远端 session 车道仍登记不入境（前向缝 ⑭ #200
  域换 gateway 项，本波仅注销 MCP proxy 子项）。
- **安全 review 残留（登记，不入境本波）**：per-server `oauth` 块整体
  （clientId / authServerMetadataUrl / clientMetadataUrl）可来自 project/
  plugin scope = 既有 per-server oauth 信任面（用户批准项目级 MCP server
  时一并批准）；scope 级门禁（untrusted scope 的 oauth 块须显式
  allowlist）= 后续波 f4 评估项（本波已落 env 部署控制优先 = 操作者
  可钉住可信 CIMD URL 覆盖 repo 提交值）。**4th-review 于 2026-10-18
  再确认本项（MEDIUM，非新发现）**：其建议的 clientMetadataUrl 单字段
  门控被本波裁定拒绝（劈裂同一配置块内 oauth 信任单元：clientId /
  authServerMetadataUrl 仍无门控 = 半门控假安全面）；正确形态 =
  oauth 块整体 scope-gating，维持 f4 评估项定性不变。
- **2nd-review 两发现同波闭环（核销，非残留）**：[HIGH] env 通道
  repo-可种（TUI 信任后合并 apply 含 project scope）→ 修 =
  `withoutMcpOauthCimdVars` 从一切 settings 源 env 剥离（repo 不可种；
  engine 车道 S-3a 结构性免疫 + 无 CIMD 消费点，双保险零改动）；
  [MEDIUM] CWE-20 env 值未验真 → 修 = getter https-验真（非 URL /
  非 https 忽略 + 回落 per-server）。判别单测 2 新锚在场。
- **3rd-review [HIGH/CWE-178] 同波闭环（核销，非残留）**：case-sensitive
  剥离 vs Windows process.env 大小写不敏感参考（异大小写变体可存活剥离
  被 getter 读回）→ 修 = 剥离键匹配 case-insensitive（`key.toUpperCase()`
  惯例对齐）；判别单测锚同步换绑。
