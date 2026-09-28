/**
 * engine/tools/lsp — LSPTool prompt 面（§8.67 D 波 S-E2c；旧仓
 * src/tools/LSPTool/prompt.ts 21L 裁面落）。
 *
 * delta 登记（H6 逐条，复审勿当遗漏重提）：
 *  ① 旧 prompt.ts LSP_TOOL_NAME 常量（'LSP' as const）→ 工具名字符串
 *    单一事实源收敛 toolNames.ts（house 先例：SKILL_TOOL_NAME 等由
 *    toolNames 块 seed 不重出，S-E2b 同口径）。
 *  ② 旧 DESCRIPTION 逐字（9 操作清单 + 3 必填参数 + LSP 需配置提示）。
 */

export const LSP_DESCRIPTION = `Interact with Language Server Protocol (LSP) servers to get code intelligence features.

Supported operations:
- goToDefinition: Find where a symbol is defined
- findReferences: Find all references to a symbol
- hover: Get hover information (documentation, type info) for a symbol
- documentSymbol: Get all symbols (functions, classes, variables) in a document
- workspaceSymbol: Search for symbols across the entire workspace
- goToImplementation: Find implementations of an interface or abstract method
- prepareCallHierarchy: Get call hierarchy item at a position (functions/methods)
- incomingCalls: Find all functions/methods that call the function at a position
- outgoingCalls: Find all functions/methods called by the function at a position

All operations require:
- filePath: The file to operate on
- line: The line number (1-based, as shown in editors)
- character: The character offset (1-based, as shown in editors)

Note: LSP servers must be configured for the file type. If no server is available, an error will be returned.`
