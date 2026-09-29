/**
 * eslint-legacy-plugins — 旧仓 lint 插件注册占位（§8.72 TUI 壳波 Slice B，
 * H6 头注登记，复审勿重提）：
 *
 * tui 闭包（C-7 旧仓原样搬，~1900 文件）内联 eslint-disable 指令引用旧仓
 * lint 管线的 3 个插件族：custom-rules（14 规则）/ react-hooks（2 规则）/
 * eslint-plugin-n（2 规则）。旧仓 lint 管线未整体移植（新仓基座 =
 * tseslint + boundaries 两插件）→ 三族规则名注册为 **no-op 规则**
 * （create 返回空 listener，永不报告），仅消解 ESLint 对未注册规则的
 * "Definition for rule 'X' was not found" 报错；检查**不生效**（非假装
 * 通过：检查体缺失是既定事实，逐条恢复规则体归 E-wave-end 审计，同
 * eslint.config.mjs tui 豁免桶头注登记）。
 *
 * 本插件族仅在 tui 域 override 块注册（见 eslint.config.mjs tui 桶头注），
 * 新域文件不受影响。
 */

const noopRule = {
  meta: { type: "problem", docs: { description: "legacy no-op (see header)" } },
  create: () => ({}),
}

const make = names => ({
  rules: Object.fromEntries(names.map(name => [name, noopRule])),
})

export const customRules = make([
  "no-cross-platform-process-issues",
  "no-direct-json-operations",
  "no-direct-ps-commands",
  "no-lookbehind-regex",
  "no-process-cwd",
  "no-process-env-top-level",
  "no-process-exit",
  "no-sync-fs",
  "no-top-level-dynamic-import",
  "no-top-level-side-effects",
  "prefer-use-keybindings",
  "prefer-use-terminal-size",
  "prompt-spacing",
  "require-bun-typeof-guard",
])

export const reactHooks = make(["exhaustive-deps", "rules-of-hooks"])

export const pluginN = make([
  "no-unsupported-features/node-builtins",
  "no-sync",
])
