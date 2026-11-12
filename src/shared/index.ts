/**
 * shared 模块唯一公共出口（STR-1 门面规则）。
 *
 * 外部模块只许 `import { ... } from "../shared"`（或 "src/shared"）,
 * 不许 reach 内部文件（entry-point lint 拦截）。
 *
 * re-export: feature（A 波已实现）/ types / types-session /
 *            identity / sanitizeToolName / tokenEstimation（随各文件 B/C 波落地）
 */

// A 波：feature flag
export { feature, FEATURE_ON_BY_DEFAULT } from "./feature"

// A 波 A-2（工单 #272 HTTP User-Agent）：品牌串单一事实源（VERSION/PRODUCT_NAME/
// PACKAGE_NAME/REPOSITORY_URL + buildUserAgent）。核 modelprovider 经此门面取
// buildUserAgent 作 LLM 出站 UA（DEP-3 allow=[shared]），不引 tui/engine。
// BR-1（spec §6.2）：品牌身份扩常量 4 枚（PRODUCT_FAMILY/PRODUCT_BRAND/
// FEEDBACK_CHANNEL/ACCENT_HUE）与既有 3 枚同批入门面。
export {
  PRODUCT_NAME,
  PACKAGE_NAME,
  REPOSITORY_URL,
  REPOSITORY_SLUG, // 0.1.98 S1a 焊点①（owner/repo 派生，coordinatorMode 提示词消费）
  PRODUCT_FAMILY,
  PRODUCT_BRAND,
  FEEDBACK_CHANNEL,
  ACCENT_HUE,
  getVersion,
  buildUserAgent,
  buildWebFetchUserAgent,
} from "./identity"

// B 波 S1 + C1：env 解析纯函数（四域 config.ts 共用）
// C1 统一裁定：isEnvTruthy/isEnvDefinedFalsy = 布尔 env 单一事实源
// （B 波 parseBoolEnv 窄集合已被取代，C1b 删除）
export { parseBoundedIntEnv, isEnvTruthy, isEnvDefinedFalsy } from "./env"

// C1 叶子下沉：零依赖纯工具（旧仓 utils 叶子，跨 ≥2 域或为 C-Deep 地基）
export {
  escapeRegExp,
  capitalize,
  plural,
  firstLineOf,
  countCharInString,
  normalizeFullWidthDigits,
  normalizeFullWidthSpace,
  safeJoinLines,
  EndTruncatingAccumulator,
  truncateToLines,
} from "./stringUtils"
export { CircularBuffer } from "./circular-buffer"
export {
  hasExactErrorMessage,
  toError,
  errorMessage,
  getErrnoCode,
  isENOENT,
  getErrnoPath,
  shortErrorStack,
  isFsInaccessible,
} from "./errors"
export { formatFileSize } from "./format"
// 0.1.84 V3-5 K5-1：图片源有界读（O_NONBLOCK + fstat 类型/大小双验 + 读
// 累计帽；engine ReadTool 图片支 + TUI FileReadTool/attachments 消费）
export {
  MAX_IMAGE_SOURCE_BYTES,
  NonRegularFileError,
  ImageSourceTooLargeError,
  readBoundedFileBytes,
  readBoundedFromHandle,
  readBoundedImageBytes,
  type BoundedReadHandle,
} from "./boundedImageRead"
// 0.1.85-C（C85-C）：PDF 页图有界读取（顺序读 + 每图/累计 128MiB 硬上限 +
// 页号数值排序；engine readTool pages 支 + TUI FileReadTool pages 支共用，
// 层界依据 = tui 不 import engine/tools，shared 承载双面共享 helper）
export {
  PDF_PAGE_IMAGE_MAX_BYTES,
  readPDFPageImages,
  type PDFPageImageBlock,
} from "./pdfPageImages"
// 0.1.84 V3-5 K5-3：无损文本编码判别（UTF-8 严格验证全输入 + UTF-16LE 仅
// 明确 BOM 识别 + 码元验证；BE/传统编码明确拒绝不转码）。消费面 = 双体
// fileRead（mutation 编码元数据）+ 双体 readFileInRange（Read LE 支）——
// 4096B 前缀探测仅提示，本模块是唯一解码事实源。
export {
  decodeTextLosslessly,
  hasUtf16LeBom,
  UndecodableTextError,
  type DecodedText,
} from "./textEncoding"
// C-Deep 切片 3 T3：task 输出磁盘上限（task diskOutput cap + executor
// ShellCommand size watchdog 跨域共线，单一事实源）
export { MAX_TASK_OUTPUT_BYTES } from "./constants"
// C-Deep 切片 3 T5：permissions 薄骨架跨域纯叶子（permissions + sandbox +
// shell 共线，L3 四域互不 import → shared 唯一跨域叶子汇）
export {
  getConfigDirName,
  getConfigDirNameForProject,
  setConfigDirNameProvider,
  resetConfigDirNameProvider,
  type ConfigDirNameProvider,
} from "./configDir"
// C-Deep 切片 3 T5：用户专属 Atlas 临时目录名（跨域纯叶子，permissions +
// executor Shell 共线；§8.16 偏差：由 permissions 最小面提升 shared）
export { getAtlasTempDirName } from "./tempDir"
export {
  getPlatform,
  SUPPORTED_PLATFORMS,
  type Platform,
} from "./platform"
export {
  expandPath,
  containsPathTraversal,
  sanitizePath,
  MAX_SANITIZED_LENGTH,
} from "./path"
export { containsVulnerableUncPath } from "./unc"
export { djb2Hash } from "./hash"
export { lazySchema } from "./lazySchema"
export { logForDebugging, type DebugLogLevel } from "./debug"
// 0.1.93b 段 R-aux：最小 debug sink 注入窗（f4 裁定 2026-11-09；cli/debugSink 启动期注册）
export { setDebugSink, getDebugSink, type DebugSink } from "./debug"
// §8.55 S-C1：logError 跨域叶子（自 engine/tools/bash 域内 shim 提升，
// shared = 唯一跨域叶子汇，C-Deep T5 提升先例）
export { logError } from "./log"
// §8.55 S-C2：Windows↔POSIX 纯路径转换（memory 域 MinGW 比较 + bash 域
// cwd 转换双消费，旧仓 utils/windowsPaths 两纯函数体逐字）
export {
  windowsPathToPosixPath,
  posixPathToWindowsPath,
} from "./windowsPaths"
export {
  NodeFsOperations,
  setFsImplementation,
  getFsImplementation,
  setOriginalFsImplementation,
  safeResolvePath,
  type FsOperations,
} from "./fs-operations"

// C 波（§8.55 S-C1）：rough token 估计族（占位填充，旧 services/tokenEstimation 纯函数子集）
export {
  roughTokenCountEstimation,
  bytesPerTokenForFileType,
  roughTokenCountEstimationForFileType,
} from "./tokenEstimation"

// B 波契约冻结：纯类型骨架（atlas/message/SystemPrompt/ThinkingConfig/Effort/Tool）
export type * from "./types"

// B 波合并：值导出（export type * 不带值，S2 域消费 EFFORT_LEVELS + asSystemPrompt）
export { EFFORT_LEVELS, asSystemPrompt } from "./types"

// B 波契约冻结：会话级类型（Permission/MCP/Task）
export type * from "./types-session"

// 0.1.37 ⑧：P1 mailbox 审批兜底 deadline 策略纯面（shared 单一事实源：swarm
// engine + tui pane-worker 两消费面共享；boundaries tui↛swarm → shared 叶子）
export {
  resolveMailboxPermissionDeadlineMs,
  approvalUnavailableReason,
} from "./permissionDeadline"

// 0.1.85 Task A（C85-A）：@PDF 引用 provider 投影叶子（纯函数零 I/O；
// modelprovider params attachment 支 + TUI messages pdf_reference 支双面
// 消费同一叶子，双面文本恒等；不引 tui/engine）。C85-C 加 full-PDF 显式
// 错误类（双体 FileReadTool throw + tui attachments 引用车道回落判据）。
// C85-D 加落盘白名单投影（双 record 车道落盘前唯一通道，恶意额外字段
// 剥除的单一事实源 + compact 重建收集同源）。R-085-1（0.1.86 H）加 compact
// 重建收集器（TUI contextBodies 起源迁入 = 单一事实源；ENGINE
// compactConversation 富体/裁剪同源消费）。
export {
  collectPDFReferenceAttachmentsForCompact,
  formatPDFReferenceForModel,
  FullPDFReadUnsupportedError,
  projectPDFReferenceForRecord,
  type PDFReferenceMetadata,
} from "./pdfReference"

// 0.1.93 W-D-A（f4 批复五(c)）：agent teams 总门 + swarm 扩参字段 wire
// 投影过滤面单源（modelprovider/params.ts print+TUI 双车道与 tui/utils/api.ts
// 同消费；纯函数零 I/O，表键 = 'Agent'/'ExitPlanMode' 字面量——engine 工具名
// 常量不可 import 进 shared，值逐字同源见 swarmSchemaFilter.ts 头注）。
export { isAgentSwarmsEnabled } from "./agentSwarmsEnabled"
export {
  SWARM_FIELDS_BY_TOOL,
  filterSwarmFieldsFromSchema,
} from "./swarmSchemaFilter"
// 0.1.93 W-D-A（f4 批复五(a)）：Form A 角色模板注册表 + renderTeammatePrompt
// 纯函数（spawn 触发点 prompt 组装；engine AgentTool 消费，TUI 预览面预留）。
export {
  type AgentRoleTemplate,
  registerAgentRoleTemplate,
  getAgentRoleTemplate,
  resetAgentRoleTemplates,
  type TeammatePromptParts,
  renderTeammatePrompt,
} from "./agentRoleTemplates"

// 0.1.93 round 8 RED-E 单源化（§7.17）：in-process 队友 ALS 身份面唯一物理
// 副本（三副本直删二留一）；域内 import 一律走本门面（STR-1 folder-mode
// entry-point），re-export 门面（swarm/index · engine/messaging/teammate ·
// tui/utils/teammate）原样保留。
export {
  type TeammateContext,
  getTeammateContext,
  runWithTeammateContext,
  isInProcessTeammate,
  createTeammateContext,
} from "./teammateContext"

// 0.1.98 S1a（lock-face ①④ 批复形）：ProductDefinition 运行时清单参数接口
// （工具子集 / 配置目录维度）+ 不参数化清单冻结锚（本体头注）。
export {
  getActiveProductDefinition,
  type ProductDefinition,
} from "./ProductDefinition"
