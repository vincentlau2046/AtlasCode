/**
 * engine/tools/files — Glob prompt 面（§8.55 S-C4，旧仓
 * src/tools/GlobTool/prompt.ts 7L 逐字随迁）。
 *
 * delta 登记（复审勿当遗漏重提）：
 *  - GLOB_TOOL_NAME → ../toolNames（engine/tools 单一事实源，值逐字同
 *    'Glob'）；本文件仅留 description 面。
 *  - 文案内 "the Agent tool" 指称逐字保留（模型面 prompt 字符串，旧仓
 *    即如此）。
 */
export const GLOB_DESCRIPTION = `- Fast file pattern matching tool that works with any codebase size
- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths sorted by modification time
- Use this tool when you need to find files by name patterns
- When you are doing an open ended search that may require multiple rounds of globbing and grepping, use the Agent tool instead`
