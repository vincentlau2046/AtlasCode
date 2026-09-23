/**
 * permissions 域门面（STR-1：外部消费者只 import 域根 index）。
 *
 * L3 自治：permissions 域不 import 其他域——bootstrap 域两 cwd 状态
 * （getOriginalCwd / getCwd）经 ./bootstrap-env 注入窗口斩断（§8.14 注入序
 * permissions→task→hooks 首步；未注入 fail-fast）。纯叶子（getConfigDirName /
 * getPlatform / expandPath / sanitizePath / containsVulnerableUncPath /
 * getFsImplementation）走 shared 单一事实源。
 *
 * 当前面（切片 3 T5 薄骨架 + E-4 S-4a）：
 * - PermissionRule.ts：规则类型 + zod schema（40L 随迁，零深依赖）
 * - filesystem.ts：filesystem 最小面（getProjectTempDir / getAtlasTempDirName +
 *   getAtlasTempDir / checkRead·WritePermissionForTool / pathInAllowedWorkingPath /
 *   DANGEROUS_FILES·DIRECTORIES；规则求值树 + 内部路径 + 建议生成 归 engine）
 * - permissions.ts：hasPermissionsToUseTool no-op-allow 起步（规则求值 / 分类器 /
 *   yoloClassifier / permissionSetup 归 engine）
 * - permissionRuleParser.ts：规则串 parse/serialize 纯字符串函数组（E-4 S-4a，
 *   escape/unescape/parse/toString 逐字 + LEGACY alias 注入窗口
 *   set/get/resetLegacyToolNameAliases——engine 侧模块加载注册，未注入 =
 *   identity 降级；settingsPaths 先例同型）
 * - bootstrap-env.ts：bootstrap 状态跨域注入窗口（setPermissionsBootstrapEnv /
 *   get / reset，未注入 fail-fast）
 * - settingsPaths.ts：settings 路径跨域注入窗口（S-3c，setSettingsPathsProvider /
 *   get / reset，未注入 = 空数组降级——区别于 bootstrap 窗 fail-fast）
 */
export * from './PermissionRule'
export * from './filesystem'
export * from './permissions'
export * from './permissionRuleParser'
export * from './bootstrap-env'
export * from './settingsPaths'
