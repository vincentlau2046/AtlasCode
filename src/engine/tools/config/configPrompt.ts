/**
 * engine/tools/config — ConfigTool prompt 面（S-E2 §8.60 config+ask-user 族子波）。
 *
 * 旧仓来源（a8af45b）：src/tools/ConfigTool/prompt.ts 93L 裁剪随迁
 * （DESCRIPTION 逐字 + generatePrompt 注册表驱动）。
 *
 * delta 登记（H6 逐条，复审勿当遗漏重提）：
 *  ① 旧 generatePrompt 的 voiceEnabled GrowthBook 运行时隐藏支（feature('VOICE_MODE')
 *    + isVoiceGrowthBookEnabled）裁：voice 键随注册表 global/settings 段裁除
 *    （supportedSettings delta ②），整支无消费。
 *  ② 模板两段固定结构（### Global Settings / ### Project Settings）→ 空段不渲染
 *    （裁剪注册表 global 段为空 → 旧逐字模板会渲染空 Global 段，误导模型；
 *    TUI 波 global 面复活时恢复逐字两段，前向接缝登记）；模板边界逐字 = 旧
 *    `${modelSection}\n## Examples` 单换行面（model 段与 Examples 间无空行，
 *    A-N5 复审注；model 行格式丢 `: ${description}` 后缀 = delta ③ 后果知悉项）。
 *  ③ 旧 generateModelSection 的 getModelOptions()（选项对象 {value, description,
 *    descriptionForModel} + catch 支）→ 新面 = supportedSettings getModelOptions()
 *    字符串列表（delta ④ supportedSettings）；catch 支（旧
 *    `(sonnet, opus, haiku, best, or full model ID)` fallback）随不可抛面的新
 *    getOptions 同裁（死支登记）。
 *  ④ 旧 Examples 段示例键（theme/editorMode/verbose）随注册表裁剪更新为存活键
 *    （model / permissions.defaultMode / autoMemoryEnabled），模板结构逐字。
 */
import { getAllKeys, getOptionsForSetting, SUPPORTED_SETTINGS } from './supportedSettings'

export const DESCRIPTION = 'Get or set Atlas configuration settings.'

/**
 * Generate the prompt documentation from the registry（旧 generatePrompt 裁剪面）。
 */
export function generatePrompt(): string {
  const projectSettings: string[] = []

  for (const key of getAllKeys()) {
    const config = SUPPORTED_SETTINGS[key]!
    // Skip model - it gets its own section with dynamic options
    if (key === 'model') continue

    const options = getOptionsForSetting(key)
    let line = `- ${key}`

    if (options) {
      line += `: ${options.map(o => `"${o}"`).join(', ')}`
    } else if (config.type === 'boolean') {
      line += `: true/false`
    }

    line += ` - ${config.description}`
    projectSettings.push(line)
  }

  const modelSection = generateModelSection()

  // delta ②：空段不渲染（global 段裁剪后为空）；边界逐字 = 旧模板
  // `${modelSection}\n## Examples` 单换行面（A-N5）
  return `Get or set Atlas configuration settings.

  View or change Atlas settings. Use when the user requests configuration changes, asks about current settings, or when adjusting a setting would benefit them.


## Usage
- **Get current value:** Omit the "value" parameter
- **Set new value:** Include the "value" parameter

## Configurable settings list
The following settings are available for you to change:

### Project Settings (stored in settings.json)
${projectSettings.join('\n')}

${modelSection}
## Examples
- Get model: { "setting": "model" }
- Change model: { "setting": "model", "value": "premium" }
- Change permission mode: { "setting": "permissions.defaultMode", "value": "plan" }
- Get auto-memory: { "setting": "autoMemoryEnabled" }
- Enable auto-memory: { "setting": "autoMemoryEnabled", "value": true }
`
}

// delta ③：新 getOptions = 字符串列表面（supportedSettings delta ④）
function generateModelSection(): string {
  const options = getOptionsForSetting('model') ?? []
  const lines = options.map(o => `  - "${o}"`)
  return `## Model
- model - Override the default model. Available options:
${lines.join('\n')}`
}
