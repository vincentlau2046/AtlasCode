/**
 * eslint-legacy-plugins 规则体单测（F-S2-3 · D-4b，S-4 §8.73.2）
 *
 * 目的：为 5 枚从零自研的 custom-rules 真体提供**执行验证**（H6 防空洞）——
 * 直接调 rule.create(ctx) + 喂代表 AST 节点 + 断言 report 命中/不命中，
 * 而非依赖 `eslint src/` 真跑（5 真体"已注册未启用"，见插件头注；启用 +
 * 处置重燃基线 = 全量 lint 复原波前向接缝）。另锁「其余 13 枚仍 no-op」契约。
 *
 * 注：tests/ 不在 tsconfig include（tsc --noEmit 只查 src/**），故本文件可
 * 直接 import 仓根 .mjs（bun bundler 解析，无 tsc 声明面顾虑）。
 */
import { describe, test, expect } from "bun:test"
import { customRules, reactHooks, pluginN } from "../../eslint-legacy-plugins.mjs"

// 最小 ESLint 规则体执行器：抓 context.report 命中。listeners 按 node.type 派发
// （含 "NodeName:exit" 键）；对无对应 visitor 的 node.type 静默跳过。
type Rule = { create: (ctx: unknown) => Record<string, (node: unknown) => void> }
function runRule(rule: Rule, nodes: Array<Record<string, unknown>>): string[] {
  const reports: string[] = []
  const listeners = rule.create({
    report: (info: { message?: string }) => {
      reports.push(info?.message ?? "")
    },
    getSourceCode: () => ({ getText: () => "" }),
    getFilename: () => "test.ts",
  })
  for (const node of nodes) {
    const key = node.type as string
    if (listeners[key]) listeners[key](node)
  }
  return reports
}

const processExitCallee = {
  type: "MemberExpression",
  object: { type: "Identifier", name: "process" },
  property: { type: "Identifier", name: "exit" },
  computed: false,
}
const callExpr = (callee: Record<string, unknown>, arguments_: unknown[] = []) => ({
  type: "CallExpression",
  callee,
  arguments: arguments_,
})

describe("F-S2-3 · D-4b：5 枚 custom-rules 真体", () => {
  test("no-process-exit：process.exit() 报；console.log 不报", () => {
    const rule = customRules.rules["no-process-exit"] as Rule
    expect(runRule(rule, [callExpr(processExitCallee)]).length).toBe(1)
    const clean = callExpr({
      type: "MemberExpression",
      object: { type: "Identifier", name: "console" },
      property: { type: "Identifier", name: "log" },
      computed: false,
    })
    expect(runRule(rule, [clean]).length).toBe(0)
  })

  test("no-sync-fs：Form A fs.readFileSync + Form B 具名 readFileSync 报；fs.readFile 不报", () => {
    const rule = customRules.rules["no-sync-fs"] as Rule
    const formA = callExpr({
      type: "MemberExpression",
      object: { type: "Identifier", name: "fs" },
      property: { type: "Identifier", name: "readFileSync" },
      computed: false,
    })
    const formB = callExpr({ type: "Identifier", name: "readFileSync" })
    expect(runRule(rule, [formA]).length).toBe(1)
    expect(runRule(rule, [formB]).length).toBe(1)
    const asyncFs = callExpr({
      type: "MemberExpression",
      object: { type: "Identifier", name: "fs" },
      property: { type: "Identifier", name: "readFile" },
      computed: false,
    })
    expect(runRule(rule, [asyncFs]).length).toBe(0)
  })

  test("no-cross-platform-process-issues：child_process.exec('which node') 报；'node --version' 不报", () => {
    const rule = customRules.rules["no-cross-platform-process-issues"] as Rule
    const execCallee = {
      type: "MemberExpression",
      object: { type: "Identifier", name: "child_process" },
      property: { type: "Identifier", name: "exec" },
      computed: false,
    }
    const hit = callExpr(execCallee, [{ type: "Literal", value: "which node" }])
    const miss = callExpr(execCallee, [{ type: "Literal", value: "node --version" }])
    expect(runRule(rule, [hit]).length).toBe(1)
    expect(runRule(rule, [miss]).length).toBe(0)
  })

  test("no-lookbehind-regex：/(?<!<) 报；a(?=b) 前瞻不报", () => {
    const rule = customRules.rules["no-lookbehind-regex"] as Rule
    const hit = { type: "Literal", regex: { pattern: "(?<!<)<<", flags: "" } }
    const miss = { type: "Literal", regex: { pattern: "a(?=b)", flags: "" } }
    expect(runRule(rule, [hit]).length).toBe(1)
    expect(runRule(rule, [miss]).length).toBe(0)
  })

  test("no-process-env-top-level：顶层 process.env 报；函数内不报", () => {
    const rule = customRules.rules["no-process-env-top-level"] as Rule
    const reports: string[] = []
    const listeners = rule.create({
      report: (info: { message?: string }) => {
        reports.push(info?.message ?? "")
      },
    })
    const envAccess = {
      type: "MemberExpression",
      object: { type: "Identifier", name: "process" },
      property: { type: "Identifier", name: "env" },
      computed: false,
    }
    listeners.MemberExpression(envAccess) // 顶层（depth 0）→ 报
    expect(reports.length).toBe(1)
    listeners.FunctionExpression({ type: "FunctionExpression" }) // 入函数（depth 1）
    listeners.MemberExpression(envAccess) // 函数内 → 不报
    expect(reports.length).toBe(1)
  })
})

describe("F-S2-3 · D-4b：其余 13 枚仍 no-op 注册（create 返回空 listener，永不 report）", () => {
  const NOOP_NAMES = [
    // customRules 余 9 枚
    "no-direct-json-operations",
    "no-direct-ps-commands",
    "no-process-cwd",
    "no-top-level-dynamic-import",
    "no-top-level-side-effects",
    "prefer-use-keybindings",
    "prefer-use-terminal-size",
    "prompt-spacing",
    "require-bun-typeof-guard",
    // reactHooks 2
  ]
  test("9 custom no-op + reactHooks 2 + pluginN 2 的 create 均返回空对象 listener", () => {
    for (const name of NOOP_NAMES) {
      const rule = customRules.rules[name] as Rule
      expect(Object.keys(rule.create({}))).toEqual([])
    }
    for (const name of ["exhaustive-deps", "rules-of-hooks"]) {
      expect(Object.keys((reactHooks.rules[name] as Rule).create({}))).toEqual([])
    }
    for (const name of ["no-unsupported-features/node-builtins", "no-sync"]) {
      expect(Object.keys((pluginN.rules[name] as Rule).create({}))).toEqual([])
    }
  })
  test("5 真体 create 返回非空 listener（真体已就位，非 no-op）", () => {
    const REAL_NAMES = [
      "no-process-exit",
      "no-sync-fs",
      "no-cross-platform-process-issues",
      "no-lookbehind-regex",
      "no-process-env-top-level",
    ]
    for (const name of REAL_NAMES) {
      const rule = customRules.rules[name] as Rule
      expect(Object.keys(rule.create({})).length).toBeGreaterThan(0)
    }
  })
})
