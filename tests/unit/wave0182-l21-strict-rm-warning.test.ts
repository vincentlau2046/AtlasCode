/**
 * 0.1.82 K3-C L21 判别单测（上游 299）：rm 提示非字面面（strict env 门控）。
 *
 * 默认面（getDestructiveCommandWarning 的 rm 模式）只判**字面可判 rm**：
 * 命令位锚 `(^|[;&|\n]\s*)` 结构性排除拼接 / 变量 / 脚本内 rm——上游
 * 299 的关切正是这些非字面面。strict env
 * （ATLAS_STRICT_INLINE_SHELL_RM_PROMPT=1）补两族：
 *   ① 拼接族：rm + 递归/强删旗标（-r/-f 组合形 + --recursive/--force
 *      长旗标）出现在命令行**任意位置**（echo / bash -c / 变量拼接）；
 *   ② 脚本调用族：命令位 shell 调用（bash/sh/zsh/dash/ksh，含绝对
 *      路径）、source / . 点命令、命令位 *.sh——本仓不读脚本内省，
 *      strict 下保守提示。
 *
 * 消费契约：BashPermissionRequest `getDestructiveCommandWarning(command)
 * ?? (strict ? getStrictInlineShellRmWarning(command) : null)`——`??`
 * 保字面面优先（字面 rm 的警告文案归默认面）。
 *
 * 双体：engine src/engine/tools/bash/destructiveCommandWarning.ts 与 TUI
 * src/tui/tools/BashTool/destructiveCommandWarning.ts 同构双副本，两体
 * 同断言（L20 COPIES 先例）。纯信息面——不影响权限逻辑/自动放行。
 */
import { describe, expect, test } from 'bun:test'

import {
  getDestructiveCommandWarning,
} from '../../src/engine/tools/bash/destructiveCommandWarning.js'
import { getDestructiveCommandWarning as tuiGetWarning } from '../../src/tui/tools/BashTool/destructiveCommandWarning.js'

const engine = await import('../../src/engine/tools/bash/destructiveCommandWarning.js')
const tui = await import('../../src/tui/tools/BashTool/destructiveCommandWarning.js')

const STRICT_ENV = 'ATLAS_STRICT_INLINE_SHELL_RM_PROMPT'
const STRICT_CONCAT_RM_WARNING =
  'Note: may remove files via a non-literal rm invocation'
const STRICT_SCRIPT_WARNING =
  'Note: runs a shell script whose contents are not inspected'

const COPIES = [
  { label: 'engine', strict: engine.getStrictInlineShellRmWarning, isEnabled: engine.isStrictInlineShellRmPromptEnabled, warning: getDestructiveCommandWarning },
  { label: 'tui', strict: tui.getStrictInlineShellRmWarning, isEnabled: tui.isStrictInlineShellRmPromptEnabled, warning: tuiGetWarning },
] as const

for (const { label, strict, isEnabled, warning } of COPIES) {
  describe(`K3-C L21：strict rm 提示 env 门控 [${label}]`, () => {
    test('env 两态：=1 开；缺省/0/true/空 关（严格 === \'1\'）', () => {
      expect(isEnabled({ [STRICT_ENV]: '1' })).toBe(true)
      expect(isEnabled({})).toBe(false)
      expect(isEnabled({ [STRICT_ENV]: '0' })).toBe(false)
      expect(isEnabled({ [STRICT_ENV]: 'true' })).toBe(false)
      expect(isEnabled({ [STRICT_ENV]: '' })).toBe(false)
      // 测试环境未设 → 缺省参读 process.env 为关
      delete process.env[STRICT_ENV]
      expect(isEnabled()).toBe(false)
    })

    test('缺省参随 process.env 实时读', () => {
      process.env[STRICT_ENV] = '1'
      try {
        expect(isEnabled()).toBe(true)
      } finally {
        delete process.env[STRICT_ENV]
      }
    })
  })

  describe(`K3-C L21：strict rm 提示拼接族 [${label}]`, () => {
    test('拼接/变量/嵌套引号里的 rm 旗标命中（默认面恒 null 的差量面）', () => {
      const cases = [
        'echo rm -rf "$D"',
        'bash -c "rm -r /tmp/x"',
        'X="rm -f important"; "$X"',
        'rm --recursive ./build',
        'rm --force stale.log',
      ]
      for (const cmd of cases) {
        expect(strict(cmd)).toBe(STRICT_CONCAT_RM_WARNING)
      }
    })

    test('默认面对拼接形态恒 null（L21 缺口本体物证）+ 字面面恒等锚', () => {
      // 拼接/嵌套形态默认面不提示——这正是 strict env 补的差量
      expect(warning('echo rm -rf "$D"')).toBeNull()
      expect(warning('bash -c "rm -r /tmp/x"')).toBeNull()
      // 字面面归默认面（`??` 保其文案优先；strict 同命中无害）
      expect(warning('rm -rf build')).toBe(
        'Note: may recursively force-remove files',
      )
    })
  })

  describe(`K3-C L21：strict rm 提示脚本调用族 [${label}]`, () => {
    test('命令位 shell/source/./.sh 调用保守提示', () => {
      const cases = [
        './deploy.sh',
        'bash cleanup.sh',
        'sh run.sh',
        '. ./env.sh',
        'source setup.sh',
        '/bin/sh bootstrap.sh',
        'make all && bash risky.sh',
      ]
      for (const cmd of cases) {
        expect(strict(cmd)).toBe(STRICT_SCRIPT_WARNING)
      }
    })
  })

  describe(`K3-C L21：strict 面不误报（恒等锚）[${label}]`, () => {
    test('普通命令 / 无旗标词 rm / .js 令牌全 null', () => {
      const cases = [
        'ls -la',
        'echo hello world',
        'cat notes.txt | grep rm',
        'git push origin master',
        'node server.js',
        'npm test',
      ]
      for (const cmd of cases) {
        expect(strict(cmd)).toBeNull()
      }
    })
  })
}
