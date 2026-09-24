/**
 * permissions 域 — 工具校验配置（E-6 S-6d，§8.43；旧仓
 * src/utils/settings/toolValidationConfig.ts 103L 纯数据，零 import）。
 *
 * 裁定 ⑥（订正）：「依赖工具注册表」判断错误——103L 纯数据零 import，
 * 3 块语义校验全落（非裁出）。
 *
 * 配置对齐（裁定 ④，新仓工具面）：
 *   - filePatternTools 裁 NotebookRead / NotebookEdit（新仓无 Notebook 工具）
 *     留 Read / Write / Edit / Glob。
 *   - bashPrefixTools = ['Bash']（域内本地名，与 permissions.ts
 *     BASH_TOOL_NAME 镜像同口径）。
 *   - customValidation = WebSearch / WebFetch（新仓均有，逐字）。
 *   - examples 字段沿 S-4c2 裁（提示面残留守）：返回型仅 error + suggestion。
 *
 * 消费点（H6 实挂）：permissionValidation.ts validatePermissionRule
 * 语义支 3 块（customValidation / isBashPrefixTool / isFilePatternTool）。
 */

// Tool validation configuration
//
// Most tools need NO configuration - basic validation works automatically.
// Only add your tool here if it has special pattern requirements.

export type ToolValidationConfig = {
  /** Tools that accept file glob patterns (e.g., *.ts, src/**) */
  filePatternTools: string[]

  /** Tools that accept bash wildcard patterns (* anywhere) and legacy :* prefix syntax */
  bashPrefixTools: string[]

  /** Custom validation rules for specific tools */
  customValidation: {
    [toolName: string]: (content: string) => {
      valid: boolean
      error?: string
      suggestion?: string
    }
  }
}

export const TOOL_VALIDATION_CONFIG: ToolValidationConfig = {
  // File pattern tools (accept *.ts, src/**, etc.)
  // 裁定 ④：NotebookRead / NotebookEdit 裁（新仓无 Notebook 工具）
  filePatternTools: ['Read', 'Write', 'Edit', 'Glob'],

  // Bash wildcard tools (accept * anywhere, and legacy command:* syntax)
  bashPrefixTools: ['Bash'],

  // Custom validation (only if needed)
  // examples 字段沿 S-4c2 裁（提示面残留守）
  customValidation: {
    // WebSearch doesn't support wildcards or complex patterns
    WebSearch: content => {
      if (content.includes('*') || content.includes('?')) {
        return {
          valid: false,
          error: 'WebSearch does not support wildcards',
          suggestion: 'Use exact search terms without * or ?',
        }
      }
      return { valid: true }
    },

    // WebFetch uses domain: prefix for hostname-based permissions
    WebFetch: content => {
      // Check if it's trying to use a URL format
      if (content.includes('://') || content.startsWith('http')) {
        return {
          valid: false,
          error: 'WebFetch permissions use domain format, not URLs',
          suggestion: 'Use "domain:hostname" format',
        }
      }

      // Must start with domain: prefix
      if (!content.startsWith('domain:')) {
        return {
          valid: false,
          error: 'WebFetch permissions must use "domain:" prefix',
          suggestion: 'Use "domain:hostname" format',
        }
      }

      // Allow wildcards in domain patterns
      // Valid: domain:*.example.com, domain:example.*, etc.
      return { valid: true }
    },
  },
}

// Helper to check if a tool uses file patterns
export function isFilePatternTool(toolName: string): boolean {
  return TOOL_VALIDATION_CONFIG.filePatternTools.includes(toolName)
}

// Helper to check if a tool uses bash prefix patterns
export function isBashPrefixTool(toolName: string): boolean {
  return TOOL_VALIDATION_CONFIG.bashPrefixTools.includes(toolName)
}

// Helper to get custom validation for a tool
export function getCustomValidation(toolName: string) {
  return TOOL_VALIDATION_CONFIG.customValidation[toolName]
}
