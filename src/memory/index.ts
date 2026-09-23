/**
 * memory 模块唯一公共出口（STR-1 门面规则）。
 *
 * 外部模块只许 `import { ... } from "../memory"`（或 "src/memory"）,
 * 不许 reach 内部文件（entry-point lint 拦截）。
 *
 * re-export: types / FileSystemMemoryStore / RootedMemoryStore /
 *            InMemoryStore / CompositeMemoryStore / paths / config /
 *            memoryTypes / memoryAge
 */

// 接口 + 实现类
export type { MemoryStore, StoreDirent, FileReadResult } from './types'
export { FileSystemMemoryStore } from './FileSystemMemoryStore'
export { InMemoryStore } from './InMemoryStore'
export { CompositeMemoryStore } from './CompositeMemoryStore'
export { RootedMemoryStore } from './RootedMemoryStore'

// 路径解析（memdir/paths 收进域内）
export {
  isAutoMemoryEnabled,
  isExtractModeActive,
  getMemoryBaseDir,
  validateMemoryPath,
  getCoworkMemoryPathOverride,
  hasAutoMemPathOverride,
  getAutoMemPath,
  getAutoMemEntrypoint,
  isAutoMemPath,
} from './paths'

// 配置
export { createMemoryConfig, autoMemoryEnabledFromEnv } from './config'
export type { MemoryConfig } from './config'

// envUtils: Atlas 配置主目录（ATLAS_CONFIG_DIR 覆盖，NFC 归一化）
export { getAtlasConfigHomeDir } from './envUtils'

// 记忆类型分类 + prompt 段落常量
export {
  MEMORY_TYPES,
  parseMemoryType,
  TYPES_SECTION_COMBINED,
  TYPES_SECTION_INDIVIDUAL,
  WHAT_NOT_TO_SAVE_SECTION,
  MEMORY_DRIFT_CAVEAT,
  WHEN_TO_ACCESS_SECTION,
  TRUSTING_RECALL_SECTION,
  MEMORY_FRONTMATTER_EXAMPLE,
} from './memoryTypes'
export type { MemoryType } from './memoryTypes'

// 记忆年龄
export {
  memoryAgeDays,
  memoryAge,
  memoryFreshnessText,
  memoryFreshnessNote,
} from './memoryAge'
