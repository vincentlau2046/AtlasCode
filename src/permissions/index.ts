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
 * - permissions.ts：hasPermissionsToUseTool 决策主体（E-4 S-4b 规则支 +
 *   E-6 S-6b 工具面分发回填：1c 鸭子分发 / 1f 内容 ask / 1g safetyCheck /
 *   2a bypass + getUpdatedInputOrFallback / 3 passthrough→ask + ⑥ sandbox
 *   自动放行半落（dangerouslyDisableSandbox 守卫）；无上下文 = allow 薄骨架
 *   兼容；残留守：① 实现半 / ② dontAsk / ③ 分类器 / ④ denial 跟踪 /
 *   ⑤ hooks 反向边 / ⑥ 窗口接线）
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
 *   applyPermissionUpdate(s) + convertRulesToUpdates +
 *   applyPermissionRulesToPermissionContext；persist 族落 engine 侧
 *   engine/permissions/permissionPersist.ts（S-4c2，域叶约束不可 import
 *   engine settings/loader 面））
 * - permissionValidation.ts：规则语法校验核心 5 检（E-4 S-4c2，旧
 *   settings/permissionValidation.ts 262L 语义支 3 块裁 E-6；消费点 =
 *   engine/config filterInvalidPermissionRules 接缝③ 语法过滤支）
 * - permissionUpdateSchema.ts：update 6 变体 zod discriminatedUnion +
 *   destination 5 值 enum（E-4 S-4c2 旧 78L 逐字；H6 预声明接缝，
 *   消费面 = E-5 hooks-runner / SDK controlSchema / 组合根残留守）
 * - bashClassifier.ts：bash 分类器桩（E-6 S-6c，旧仓 61L 逐字——stub 即
 *   外部构建形态；零活消费者前向登记：auto-mode 纵切波分类器族 ~3030L
 *   消费点，§8.31 裁定 ①；matrix missing 行随之解锁）
 * - pathValidation.ts：路径校验核心 8 函数（E-6 S-6a，旧仓 487L 逐字；
 *   isPathAllowed 决策序 + validatePath 五安全块 + glob / 危险删除 /
 *   sandbox 写 allowlist 3.7 支；消费面 = Bash 工具本体 1303L 残留守，
 *   规则命中步 / 内部路径步走 filesystem ①② 残留守桩降级直通）
 * - sandboxAccess.ts：sandbox 状态跨域注入窗口（E-6 S-6a，placeholder
 *   禁用态；组合根接线 = E-wave-end 装配项）
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
export * from './permissionValidation'
export * from './permissionUpdateSchema'
export * from './pathValidation'
export * from './bashClassifier'
export * from './sandboxAccess'
export * from './bootstrap-env'
export * from './settingsPaths'
