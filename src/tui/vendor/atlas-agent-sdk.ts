// De-Anthropic (P1.2): public specifier is `#atlas-agent-sdk` (import map).
// This shim re-exports the `PermissionMode` type from the installed
// `@anthropic-ai/claude-agent-sdk` (type-only; package not installed, so
// resolved via the ambient declaration in missing-deps.d.ts).
// [ATLAS-HOLD] 类型导出目标为 @anthropic-ai/claude-agent-sdk npm 包名：
// 改名需 Atlas 以自有 scope 重发包（待 Atlas 发版），在此之前保持原名。
export type { PermissionMode } from '@anthropic-ai/claude-agent-sdk'
