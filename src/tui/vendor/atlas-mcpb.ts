// De-Anthropic (P1.2): the public import specifier is `#atlas-mcpb`
// (resolved via the package.json `imports` map).
//
// [ATLAS-HOLD] 物理 npm 依赖仍为 @anthropic-ai/mcpb（下方 require 路径）：
// 包改名需 Atlas 以自有 scope 重新发包（待 Atlas 发版），在此之前
// node_modules 路径保持原名。消费面已全部走 #atlas-mcpb 公开说明符，
// 本文件是 @anthropic-ai 命名的最后残留点。
//
// The published `@anthropic-ai/mcpb` build is incomplete: `dist/index.js`
// re-exports a missing `./types.js`, so importing the package root entry
// fails at runtime. The package is also not installed locally (CI installs
// it) — mirror the atlas-sandbox-runtime shim pattern: try to require the
// two working dist modules, fall back to stubs so the module graph loads.
//
// Types are declared locally (their definitions lived in the missing
// types.js / are not usable for type-checking in this environment).

export type McpbManifest = any
export type McpbUserConfigurationOption = any

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadMcpb(): any {
  try {
    // @ts-ignore — external package (CI installs it).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return {
      schemas: require('@anthropic-ai/mcpb/dist/schemas.js'),
      config: require('@anthropic-ai/mcpb/dist/shared/config.js'),
    }
  } catch {
    // Package not installed — stubs. Consumers that actually call into mcpb
    // fail at call time, which is correct for environments lacking it.
    return {
      schemas: {},
      config: {},
    }
  }
}

const _mcpb = loadMcpb()

export const McpbManifestSchema: any = _mcpb.schemas.McpbManifestSchema
export const getMcpConfigForManifest: any = _mcpb.config.getMcpConfigForManifest
