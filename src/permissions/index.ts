/**
 * permissions 域门面（STR-1：外部消费者只 import 域根 index）。
 *
 * L3 自治：permissions 域不 import 其他域——bootstrap 域两 cwd 状态
 * （getOriginalCwd / getCwd）经 ./bootstrap-env 注入窗口斩断（§8.14 注入序
 * permissions→task→hooks 首步；未注入 fail-fast）。纯叶子（getConfigDirName /
 * getPlatform / expandPath / sanitizePath / containsVulnerableUncPath /
 * getFsImplementation）走 shared 单一事实源。
 *
 * 当前面（切片 3 T5 薄骨架 + E-4 S-4a + E-4 S-4b）：
 * - PermissionRule.ts：规则类型 + zod schema（40L 随迁，零深依赖）
 * - filesystem.ts：filesystem 最小面（getProjectTempDir / getAtlasTempDirName +
 *   getAtlasTempDir / checkRead·WritePermissionForTool / pathInAllowedWorkingPath /
 *   DANGEROUS_FILES·DIRECTORIES；PermissionTool 窄视图 E-4 S-4b 扩 mcpInfo? +
 *   checkPermissions? 两可选字段）
 * - permissions.ts：hasPermissionsToUseTool 规则支决策面（E-4 S-4b 翻新：
 *   forceDecision → deny → ask → allow tool-wide → 空规则集 = allow 默认兼容；
 *   分类器 / dontAsk / denial 跟踪 / hooks 反向边 / sandbox 自动放行残留守）
 * - permissionMode.ts：PermissionMode 常量族 + permissionModeFromString
 *   （E-4 S-4c1，旧仓 types/permissions 常量 + PermissionMode.ts fromString；
 *   auto 支裁登记，UI 配置面随 S-4b 裁剪口径）
 * - permissionRuleParser.ts：规则串 parse/serialize 纯字符串函数组（E-4 S-4a，
 *   escape/unescape/parse/toString 逐字 + LEGACY alias 注入窗口
 *   set/get/resetLegacyToolNameAliases——engine 侧模块加载注册，未注入 =
 *   identity 降级；settingsPaths 先例同型）
 * - ruleMatching.ts：规则匹配核心（E-4 S-4b，getAllow/Deny/AskRules +
 *   toolMatchesRule + tool 规则访问器族 + getRuleByContentsForTool(Name) +
 *   checkRuleBasedPermissions 规则支 1a-1g + createPermissionRequestMessage
 *   五变体裁剪版 + PERMISSION_RULE_SOURCES 域内 8 值元组）
 * - mcpRuleNames.ts：MCP 名归一/解析/权限规则名匹配纯函数（E-4 S-4b，
 *   mcpInfoFromString / normalizeNameForMCP / getMcpPrefix / buildMcpToolName /
 *   getToolNameForPermissionCheck——旧 mcpStringUtils 纯函数域内本地定义，
 *   TODO PR to shared）
 * - shellRuleMatching.ts：shell 工具规则匹配三态（E-4 S-4b 全迁，
 *   parsePermissionRule exact/`:*` 前缀/wildcard + matchWildcardPattern +
 *   suggestion 两函数）
 * - permissionUpdate.ts：权限更新纯应用核心（E-4 S-4b 传递依赖提前，
 *   applyPermissionUpdate(s) + applyPermissionRulesToPermissionContext；
 *   persist 族归 S-4c1/c2）
 * - bootstrap-env.ts：bootstrap 状态跨域注入窗口（setPermissionsBootstrapEnv /
 *   get / reset，未注入 fail-fast）
 * - settingsPaths.ts：settings 路径跨域注入窗口（S-3c，setSettingsPathsProvider /
 *   get / reset，未注入 = 空数组降级——区别于 bootstrap 窗 fail-fast）
 */
export * from './PermissionRule'
export * from './filesystem'
export * from './permissions'
export * from './permissionMode'
export * from './permissionRuleParser'
export * from './ruleMatching'
export * from './mcpRuleNames'
export * from './shellRuleMatching'
export * from './permissionUpdate'
export * from './bootstrap-env'
export * from './settingsPaths'
