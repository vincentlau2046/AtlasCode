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
 *
 * ── F-S2-3 · D-4b（S-4，§8.73.2）：5 高价值 custom-rules 真体从零重写 ──
 * 旧仓无 eslint 管线随迁 + 上游 claude-code 2.1.88 sourcemap 还原 0 命中
 * （四查 0 命中）→ 本仓自研 5 枚 AST 规则体（no-process-exit / no-sync-fs /
 * no-cross-platform-process-issues / no-lookbehind-regex / no-process-env-
 * top-level）。`make(names, realRules)` 现对 realRules[name] 命中者用真体、
 * 其余回落 noopRule —— 故 customRules 14 枚中 5 真体 + 9 no-op，reactHooks
 * 2 + pluginN 2 仍全 no-op（合计 13 枚 no-op 注册，消闭包内联 eslint-disable
 * 的 "Definition not found"）。
 *
 * H6 防空洞登记（复审勿重提）：这 5 枚真体 **W4 已全域启用**（eslint.config.mjs
 * src 全域块按 error 启用，§8.74.21 全量 lint 复原波）——重燃面 W4 重测 =
 * 324 errors（no-sync-fs 220/62 文件 + no-process-exit 85/15 + no-process-env-
 * top-level 11/9 + no-lookbehind-regex 8/5；no-cross-platform 0）；存量处置 =
 * 逐文件/逐行 eslint-disable 带 owner 注登记（行为零改动纪律：sync→async 改写 /
 * 顶层 env 惰性化 / lookbehind 正则改写均违零行为，W-opt 波再议）。启用前
 * 的「已注册未启用」前向接缝（F-S2-3 · D-4b 登记）由 W4 闭环核销。5 真体经
 * tests/unit/eslint-legacy-plugins.test.ts 逐体执行验证（create(ctx) + 喂代表
 * AST 节点 + 断言 report），非空洞 no-op。
 */

const noopRule = {
  meta: { type: "problem", docs: { description: "legacy no-op (see header)" } },
  create: () => ({}),
}

// ── F-S2-3 · D-4b：5 高价值规则体（AST 启发式，自研）────────────────────

// 禁 process.exit()：长驻 agent/TUI 进程调 process.exit 会跳过清理钩子。
const noProcessExit = {
  meta: {
    type: "problem",
    docs: { description: "禁止 process.exit()（长驻进程跳过清理钩子）" },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const c = node.callee
        if (
          c.type === "MemberExpression" &&
          !c.computed &&
          c.object.type === "Identifier" &&
          c.object.name === "process" &&
          c.property.type === "Identifier" &&
          c.property.name === "exit"
        ) {
          context.report({ node, message: "Unexpected process.exit(); use a graceful shutdown path." })
        }
      },
    }
  },
}

// 禁同步 fs：阻塞事件循环。双形态——Form A `import * as fs` 的 `fs.xSync(...)`
// 成员调用；Form B `import { readFileSync } from 'fs'` 的裸 `xSync(...)` 标识符调用。
const NO_SYNC_FS = new Set([
  "accessSync", "appendFileSync", "closeSync", "copyFileSync", "fchmodSync",
  "fchownSync", "fdatasyncSync", "fstatSync", "fsyncSync", "ftruncateSync",
  "lchownSync", "linkSync", "lstatSync", "mkdirSync", "mkdtempSync", "openSync",
  "readSync", "readlinkSync", "readdirSync", "readFileSync", "realpathSync",
  "renameSync", "rmSync", "rmdirSync", "statSync", "symlinkSync",
  "truncateSync", "unlinkSync", "utimesSync", "writeFileSync", "writeSync",
])
const noSyncFs = {
  meta: {
    type: "problem",
    docs: { description: "禁止同步 fs 调用（阻塞事件循环；Form A fs.xSync / Form B 具名导入 xSync）" },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const c = node.callee
        // Form A：fs.xSync(...)（namespace import）
        if (
          c.type === "MemberExpression" &&
          !c.computed &&
          c.object.type === "Identifier" &&
          c.object.name === "fs" &&
          c.property.type === "Identifier" &&
          /Sync$/.test(c.property.name)
        ) {
          context.report({ node, message: `Avoid synchronous fs call fs.${c.property.name}().` })
          return
        }
        // Form B：具名导入的裸 xSync(...) 标识符调用
        if (c.type === "Identifier" && NO_SYNC_FS.has(c.name)) {
          context.report({ node, message: `Avoid synchronous fs call ${c.name}().` })
        }
      },
    }
  },
}

// 禁跨平台断裂 shell-out：exec/spawn 首参含已知 unix-only 二进制 token。
// 启发式（旧仓仅 1 枚 eslint-disable 指令，最低价值）；token 表可后续扩。
const UNIX_ONLY_BINARIES = new Set([
  "cat", "which", "uname", "sed", "awk", "head", "tail", "wc", "ps",
  "whoami", "hostname", "tput", "lsof",
])
const SHELL_CALL_NAMES = new Set([
  "exec", "execSync", "execFile", "execFileSync", "spawn", "spawnSync",
])
const noCrossPlatformProcessIssues = {
  meta: {
    type: "problem",
    docs: { description: "禁止调用 unix-only 二进制的 shell-out（跨平台断裂；启发式 token 表）" },
    schema: [],
  },
  create(context) {
    const firstStringArg = (node) => {
      const arg = node.arguments && node.arguments[0]
      if (!arg) return null
      if (arg.type === "Literal" && typeof arg.value === "string") return arg.value
      if (arg.type === "TemplateLiteral" && arg.expressions.length === 0 && arg.quasis[0]) {
        return arg.quasis[0].value.cooked || ""
      }
      return null
    }
    return {
      CallExpression(node) {
        const c = node.callee
        const name =
          c.type === "MemberExpression"
            ? c.property.type === "Identifier" ? c.property.name : null
            : c.type === "Identifier" ? c.name : null
        if (!name || !SHELL_CALL_NAMES.has(name)) return
        const cmd = firstStringArg(node)
        if (!cmd) return
        for (const token of cmd.trim().split(/\s+/)) {
          // 取末段（去路径/引号）判 unix-only 命令
          const base = token.replace(/^["']|["']$/g, "").split("/").pop()
          if (UNIX_ONLY_BINARIES.has(base)) {
            context.report({
              node,
              message: `Shell-out to unix-only binary "${base}" breaks cross-platform; guard by process.platform.`,
            })
            break
          }
        }
      },
    }
  },
}

// 禁正则 lookbehind：(?<=  / (?<!  部分引擎不支持/难调试。
// 正则字面量：ESTree Literal 带 .regex.pattern（@typescript-eslint），并兼容
// 旧 RegexLiteral 型 + new RegExp("...") 字符串首参。
const noLookbehindRegex = {
  meta: {
    type: "problem",
    docs: { description: "禁止正则 lookbehind 断言（(?<= / (?<!）" },
    schema: [],
  },
  create(context) {
    const reportIfLookbehind = (pattern, node) => {
      if (typeof pattern === "string" && (pattern.includes("(?<=") || pattern.includes("(?<!"))) {
        context.report({ node, message: "Avoid regex lookbehind assertion; rewrite without (?<= / (?<!." })
      }
    }
    return {
      // @typescript-eslint（ESTree）：正则字面量 = Literal 带 .regex
      Literal(node) {
        if (node.regex && typeof node.regex.pattern === "string") {
          reportIfLookbehind(node.regex.pattern, node)
        }
      },
      // 兼容旧型 RegexLiteral（.pattern 直挂）
      RegexLiteral(node) {
        if (typeof node.pattern === "string") reportIfLookbehind(node.pattern, node)
      },
      // new RegExp("(?<=...)")
      NewExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "RegExp" &&
          node.arguments[0] &&
          node.arguments[0].type === "Literal" &&
          typeof node.arguments[0].value === "string"
        ) {
          reportIfLookbehind(node.arguments[0].value, node)
        }
      },
    }
  },
}

// 禁模块顶层读 process.env：模块加载期固化值，破坏测试注入隔离；应函数内惰性读。
// 深度计数：进入任一 Function* 节点 depth++，顶层（depth 0）见 process.env 即报。
const noProcessEnvTopLevel = {
  meta: {
    type: "problem",
    docs: { description: "禁止模块顶层读 process.env（应函数内惰性读，保测试注入隔离）" },
    schema: [],
  },
  create(context) {
    let depth = 0
    const enterFn = () => { depth++ }
    const exitFn = () => { depth-- }
    const isProcessEnv = (node) =>
      node.type === "MemberExpression" &&
      !node.computed &&
      node.object.type === "Identifier" &&
      node.object.name === "process" &&
      node.property.type === "Identifier" &&
      node.property.name === "env"
    return {
      FunctionDeclaration: enterFn,
      "FunctionDeclaration:exit": exitFn,
      FunctionExpression: enterFn,
      "FunctionExpression:exit": exitFn,
      ArrowFunctionExpression: enterFn,
      "ArrowFunctionExpression:exit": exitFn,
      MemberExpression(node) {
        if (depth === 0 && isProcessEnv(node)) {
          context.report({
            node,
            message: "Avoid reading process.env at module top level; read it lazily inside a function.",
          })
        }
      },
    }
  },
}

// F-S2-3 · D-4b：5 真体注册表。make(names, realRules) 命中用真体，否则 noopRule。
const REAL_RULES = {
  "no-process-exit": noProcessExit,
  "no-sync-fs": noSyncFs,
  "no-cross-platform-process-issues": noCrossPlatformProcessIssues,
  "no-lookbehind-regex": noLookbehindRegex,
  "no-process-env-top-level": noProcessEnvTopLevel,
}

const make = (names, realRules = {}) => ({
  rules: Object.fromEntries(names.map(name => [name, realRules[name] ?? noopRule])),
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
], REAL_RULES)

export const reactHooks = make(["exhaustive-deps", "rules-of-hooks"])

export const pluginN = make([
  "no-unsupported-features/node-builtins",
  "no-sync",
])
