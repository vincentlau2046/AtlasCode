/**
 * ascend 5 运行时 skill 内容门面（M3-S4，D-3 Ascend 独立实施波）。
 *
 * 5 运行时工具链 skill（generate / validate / debug / optimize / modelAdapt）
 * 的 SKILL_MD + register 元数据单一事实源 = 本目录。旧仓 src/skills/bundled/
 * 逐字同源。壳侧 src/tui/skills/bundled/ascend*.ts 消费本域内容经
 * applyToolchainPlaceholders 渲染后 registerBundledSkill（壳→域，正确方向）。
 *
 * 6 域知识层（tiling-design / precision-debug / runtime-debug / perf-optimize /
 * code-review / test-design）不进本目录：作为 atlas-plugins 市场 6 个单 skill
 * 插件条目发布（TUI 启动预装），非二进制 bundle（单一内容归属 = 市场仓）。
 *
 * S5（后续切片）经 ASCEND_BUNDLED_SKILLS 把 skill 面聚合进 ascendPackage 四元组
 * （tools + skills + prompt + executor），供 mount.ts 消费。
 */
export {
  ASCEND_GENERATE_SKILL_MD,
  ASCEND_GENERATE_NAME,
  ASCEND_GENERATE_DESCRIPTION,
  ASCEND_GENERATE_WHEN_TO_USE,
  ASCEND_GENERATE_ALLOWED_TOOLS,
} from './ascendGenerate'
export {
  ASCEND_VALIDATE_SKILL_MD,
  ASCEND_VALIDATE_NAME,
  ASCEND_VALIDATE_DESCRIPTION,
  ASCEND_VALIDATE_WHEN_TO_USE,
  ASCEND_VALIDATE_ALLOWED_TOOLS,
} from './ascendValidate'
export {
  ASCEND_DEBUG_SKILL_MD,
  ASCEND_DEBUG_NAME,
  ASCEND_DEBUG_DESCRIPTION,
  ASCEND_DEBUG_WHEN_TO_USE,
  ASCEND_DEBUG_ALLOWED_TOOLS,
} from './ascendDebug'
export {
  ASCEND_OPTIMIZE_SKILL_MD,
  ASCEND_OPTIMIZE_NAME,
  ASCEND_OPTIMIZE_DESCRIPTION,
  ASCEND_OPTIMIZE_WHEN_TO_USE,
  ASCEND_OPTIMIZE_ALLOWED_TOOLS,
} from './ascendOptimize'
export {
  ASCEND_MODEL_ADAPT_SKILL_MD,
  ASCEND_MODEL_ADAPT_NAME,
  ASCEND_MODEL_ADAPT_DESCRIPTION,
  ASCEND_MODEL_ADAPT_WHEN_TO_USE,
  ASCEND_MODEL_ADAPT_ALLOWED_TOOLS,
} from './ascendModelAdapt'

import {
  ASCEND_GENERATE_SKILL_MD,
  ASCEND_GENERATE_NAME,
  ASCEND_GENERATE_DESCRIPTION,
  ASCEND_GENERATE_WHEN_TO_USE,
  ASCEND_GENERATE_ALLOWED_TOOLS,
} from './ascendGenerate'
import {
  ASCEND_VALIDATE_SKILL_MD,
  ASCEND_VALIDATE_NAME,
  ASCEND_VALIDATE_DESCRIPTION,
  ASCEND_VALIDATE_WHEN_TO_USE,
  ASCEND_VALIDATE_ALLOWED_TOOLS,
} from './ascendValidate'
import {
  ASCEND_DEBUG_SKILL_MD,
  ASCEND_DEBUG_NAME,
  ASCEND_DEBUG_DESCRIPTION,
  ASCEND_DEBUG_WHEN_TO_USE,
  ASCEND_DEBUG_ALLOWED_TOOLS,
} from './ascendDebug'
import {
  ASCEND_OPTIMIZE_SKILL_MD,
  ASCEND_OPTIMIZE_NAME,
  ASCEND_OPTIMIZE_DESCRIPTION,
  ASCEND_OPTIMIZE_WHEN_TO_USE,
  ASCEND_OPTIMIZE_ALLOWED_TOOLS,
} from './ascendOptimize'
import {
  ASCEND_MODEL_ADAPT_SKILL_MD,
  ASCEND_MODEL_ADAPT_NAME,
  ASCEND_MODEL_ADAPT_DESCRIPTION,
  ASCEND_MODEL_ADAPT_WHEN_TO_USE,
  ASCEND_MODEL_ADAPT_ALLOWED_TOOLS,
} from './ascendModelAdapt'

/** 单个运行时 skill 的内容面（纯数据；getPromptForCommand 由壳侧注入）。 */
export interface AscendBundledSkillContent {
  name: string
  description: string
  whenToUse: string
  allowedTools: readonly string[]
  /** SKILL_MD（含 {{toolchain.commands.*}} 占位符，壳侧渲染后注册）。 */
  skillMd: string
}

/**
 * 5 运行时 skill 内容聚合（S5 ascendPackage 四元组的 skill 面）。
 * 顺序 = 生成 → 验证 → 排障 → 调优 → 部署（工具目录面，非调用顺序）。
 */
export const ASCEND_BUNDLED_SKILLS: readonly AscendBundledSkillContent[] = [
  {
    name: ASCEND_GENERATE_NAME,
    description: ASCEND_GENERATE_DESCRIPTION,
    whenToUse: ASCEND_GENERATE_WHEN_TO_USE,
    allowedTools: ASCEND_GENERATE_ALLOWED_TOOLS,
    skillMd: ASCEND_GENERATE_SKILL_MD,
  },
  {
    name: ASCEND_VALIDATE_NAME,
    description: ASCEND_VALIDATE_DESCRIPTION,
    whenToUse: ASCEND_VALIDATE_WHEN_TO_USE,
    allowedTools: ASCEND_VALIDATE_ALLOWED_TOOLS,
    skillMd: ASCEND_VALIDATE_SKILL_MD,
  },
  {
    name: ASCEND_DEBUG_NAME,
    description: ASCEND_DEBUG_DESCRIPTION,
    whenToUse: ASCEND_DEBUG_WHEN_TO_USE,
    allowedTools: ASCEND_DEBUG_ALLOWED_TOOLS,
    skillMd: ASCEND_DEBUG_SKILL_MD,
  },
  {
    name: ASCEND_OPTIMIZE_NAME,
    description: ASCEND_OPTIMIZE_DESCRIPTION,
    whenToUse: ASCEND_OPTIMIZE_WHEN_TO_USE,
    allowedTools: ASCEND_OPTIMIZE_ALLOWED_TOOLS,
    skillMd: ASCEND_OPTIMIZE_SKILL_MD,
  },
  {
    name: ASCEND_MODEL_ADAPT_NAME,
    description: ASCEND_MODEL_ADAPT_DESCRIPTION,
    whenToUse: ASCEND_MODEL_ADAPT_WHEN_TO_USE,
    allowedTools: ASCEND_MODEL_ADAPT_ALLOWED_TOOLS,
    skillMd: ASCEND_MODEL_ADAPT_SKILL_MD,
  },
]
