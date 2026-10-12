/**
 * /output-style 命令本体（0.1.60 TUI-1，CC 2.1.269）。
 *
 * 无参 = 状态面（报当前 + 可用列表，不改配置）；带 name = 写 userSettings
 * outputStyle + 失效输出 style 缓存 + 系统提示 section 缓存（in-session 切换生效，
 * 不重启）；非法 name（不在 getAllOutputStyles 可用集）= 可操作报错面，不写配置。
 *
 * 零回归：既有 outputStyle 配置语义不变——本命令仅新增消费入口，切换后的生效路径
 * 复用既有 getOutputStyleConfig 消费面（system prompt `output_style` section 由
 * clearSystemPromptSections 失效后按既有语义重算）。
 */
import type { LocalCommandCall } from '../../types/command.js'
import {
  DEFAULT_OUTPUT_STYLE_NAME,
  getAllOutputStyles,
  getOutputStyleConfig,
  clearAllOutputStylesCache,
} from '../../constants/outputStyles.js'
import { clearSystemPromptSections } from '../../constants/systemPromptSections.js'
import { updateSettingsForSource } from '../../utils/settings/settings.js'
import { getCwd } from '../../utils/cwd.js'

const USAGE = 'Usage: /output-style [name] (no argument = current + available)'

export const call: LocalCommandCall = async (_args, _context) => {
  const arg = (_args ?? '').trim()
  const allStyles = await getAllOutputStyles(getCwd())
  const available = Object.keys(allStyles)

  if (arg === '') {
    const current =
      (await getOutputStyleConfig())?.name ?? DEFAULT_OUTPUT_STYLE_NAME
    return {
      type: 'text',
      value: `Current output style: ${current}\nAvailable: ${available.join(', ')}\n${USAGE}`,
    }
  }

  if (!available.includes(arg)) {
    return {
      type: 'text',
      value: `Invalid /output-style "${arg}". Available: ${available.join(', ')}`,
    }
  }

  const { error } = updateSettingsForSource('userSettings', {
    outputStyle: arg,
  })
  if (error) {
    return {
      type: 'text',
      value: `Failed to persist output style "${arg}": ${error.message}`,
    }
  }

  // in-session 生效（不重启）：失效输出 style 缓存（getAllOutputStyles 重读）+
  // 系统提示 section 缓存（output_style section 按既有语义重算，取新 outputStyle）。
  clearAllOutputStylesCache()
  clearSystemPromptSections()

  return {
    type: 'text',
    value:
      arg === DEFAULT_OUTPUT_STYLE_NAME
        ? 'Output style set to default (in-session switch, no restart).'
        : `Output style switched to "${arg}" (in-session switch, no restart).`,
  }
}
