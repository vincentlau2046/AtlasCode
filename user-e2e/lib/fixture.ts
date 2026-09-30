/**
 * user-e2e fixture 工程生成（方案 §5 T4/T5）：
 * 迷你 git 仓（5 文件 + 植入 bug + 测试脚本），运行时生成到 case 工作区
 * （不提交嵌套 .git 入库——仓库 .gitignore 已排 user-e2e/workspaces）。
 * 断言全部走磁盘 ground truth（方案 §6.2：只信磁盘不信自述）。
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export function buildCalcFixture(ws: string): void {
  mkdirSync(join(ws, 'src'), { recursive: true })
  mkdirSync(join(ws, 'test'), { recursive: true })

  writeFileSync(
    join(ws, 'package.json'),
    JSON.stringify(
      {
        name: 'calc-fixture',
        version: '0.1.0',
        private: true,
        scripts: { test: 'node test/run.js' },
      },
      null,
      2,
    ),
  )
  // 植入 bug：subtract 返回 a+b（应为 a-b）
  writeFileSync(
    join(ws, 'src/calc.js'),
    [
      'function add(a, b) {',
      '  return a + b;',
      '}',
      '',
      'function subtract(a, b) {',
      '  return a + b; // BUG: 应为 a - b',
      '}',
      '',
      'function multiply(a, b) {',
      '  return a * b;',
      '}',
      '',
      'function divide(a, b) {',
      '  if (b === 0) throw new Error("division by zero");',
      '  return a / b;',
      '}',
      '',
      'module.exports = { add, subtract, multiply, divide };',
      '',
    ].join('\n'),
  )
  writeFileSync(
    join(ws, 'src/notes.js'),
    [
      "// 领域备忘：本模块面向报表系统，所有运算必须保证整数精度。",
      "// subtract 被 3 处报表代码调用，修复时勿改函数签名。",
      '',
    ].join('\n'),
  )
  writeFileSync(
    join(ws, 'README.md'),
    ['# calc-fixture', '', '测试：`npm test`（或 `node test/run.js`）', ''].join('\n'),
  )
  writeFileSync(
    join(ws, 'test/run.js'),
    [
      "const assert = require('node:assert');",
      'const { add, subtract, multiply, divide } = require("../src/calc.js");',
      '',
      'assert.strictEqual(add(2, 3), 5, "add");',
      'assert.strictEqual(subtract(10, 4), 6, "subtract(10,4) 应为 6");',
      'assert.strictEqual(multiply(3, 4), 12, "multiply");',
      'assert.strictEqual(divide(10, 2), 5, "divide");',
      'assert.throws(() => divide(1, 0), /division by zero/, "divide zero");',
      'console.log("ALL TESTS PASSED");',
      '',
    ].join('\n'),
  )

  const git = (args: string[]): string =>
    execFileSync('git', ['-c', 'user.name=e2e', '-c', 'user.email=e2e@atlas.local', ...args], {
      cwd: ws,
      stdio: 'pipe',
    }).toString()
  git(['init', '-q'])
  git(['add', '.'])
  git(['commit', '-q', '-m', 'fixture: initial (calc with planted bug)'])
}

/** 测试脚本退出码（磁盘 ground truth 判定） */
export function runFixtureTest(ws: string): { pass: boolean; output: string } {
  try {
    const out = execFileSync('node', ['test/run.js'], { cwd: ws, stdio: 'pipe', timeout: 30_000 })
      .toString()
    return { pass: true, output: out.toString() }
  } catch (e: any) {
    return { pass: false, output: String(e?.stdout ?? e?.message ?? e) }
  }
}

export function gitLog(ws: string): string {
  try {
    return execFileSync('git', ['log', '--oneline'], { cwd: ws, stdio: 'pipe' }).toString()
  } catch {
    return '(no git log)'
  }
}

export function gitDiffStat(ws: string): string {
  try {
    return execFileSync('git', ['diff', '--stat', 'HEAD~1'], { cwd: ws, stdio: 'pipe' }).toString()
  } catch {
    return ''
  }
}
