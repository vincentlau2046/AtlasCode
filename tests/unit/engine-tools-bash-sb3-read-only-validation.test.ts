/**
 * engine/tools/bash S-B3 只读命令校验本体 unit 面（Bash 本体纵切子波
 * §8.54，C 桶 ① 子波 2）。
 *
 * unit 层（零盘）：
 *  - isCommandSafeViaFlagParsing COMMAND_ALLOWLIST flag-parse 决策：
 *    允许基本族 / xargs 目标 break 差分 / `$` 与 brace 展开拒绝 /
 *    git ls-remote URL 守卫 / callback 族（hostname·date·ps·tput·lsof·sed）/
 *    非 allowlist 命令与操作符 / grep 换行注入
 *  - checkReadOnlyConstraints 五段决策链：read-only allow（+updatedInput
 *    原对象引用）/ 非只读 passthrough / 安全早退 / 复合 cd+git 门 /
 *    git-internal 写门 / 变量展开复合命令
 *
 * 深度 import（门面归集 = S-B5）：
 *  ../../src/engine/tools/bash/readOnlyValidation
 *
 * 确定性登记（复审勿当遗漏重提）：
 *  - git 子命令用例经 isCurrentDirectoryBareGitRepo 进程 cwd 探针：仓根
 *    （.git 目录 + .git/HEAD 文件）与非仓目录双态均恒 false → 零盘确定。
 *  - sandbox 支经 permissions 域 getSandboxAccess placeholder（未注入态
 *    isSandboxingEnabled = false）→ 短路不触达，零盘确定。
 *  - UNC 'ask' 支 = 非 Windows 平台恒 false（Linux unit 零支，S-B3 头注
 *    已登记）。
 *
 * 探针 P-B1 锚点（§8.54 ⑧ 突变面，S-B6 消费）：
 *  containsUnquotedExpansion 单引号反斜杠失步守卫（`!inSingleQuote`）→
 *  「ls '\' *」判 passthrough（守卫在：glob 检出非只读）；突变去守卫
 *  → 引号追踪失步 → `*` 误判引号内 → ls regex 命中 → allow，恰 1 红。
 *
 * 预期值双仓对钉：全部断言 2026-09-26 双仓同输入集实测一致
 * （旧仓 a8af45b vs 新仓本切片，25 flag 例 + 9 决策链例逐行零差）。
 */
import { describe, test, expect } from 'bun:test'
import {
  checkReadOnlyConstraints,
  isCommandSafeViaFlagParsing,
} from '../../src/engine/tools/bash/readOnlyValidation'

describe('isCommandSafeViaFlagParsing COMMAND_ALLOWLIST 允许族', () => {
  test('基本允许族（git/grep/ps/hostname/sed/tree/base64/rg）', () => {
    expect(isCommandSafeViaFlagParsing('git status')).toBe(true)
    expect(isCommandSafeViaFlagParsing('grep -rn foo src')).toBe(true)
    expect(isCommandSafeViaFlagParsing('rg -F foo')).toBe(true)
    expect(isCommandSafeViaFlagParsing('ps -ef')).toBe(true)
    expect(isCommandSafeViaFlagParsing('hostname -f')).toBe(true)
    expect(isCommandSafeViaFlagParsing('sed -n p f')).toBe(true)
    expect(isCommandSafeViaFlagParsing('tree -d')).toBe(true)
    expect(isCommandSafeViaFlagParsing('base64 -d f')).toBe(true)
  })

  test('date 位置参必须 + 格式串', () => {
    expect(isCommandSafeViaFlagParsing('date +"%Y-%m-%d"')).toBe(true)
  })

  test('xargs 目标 break 差分（SAFE 目标放行 / 非目标续验拒绝）', () => {
    // echo ∈ SAFE_TARGET_COMMANDS_FOR_XARGS → 目标后 break → 放行
    expect(isCommandSafeViaFlagParsing('xargs -E EOF echo')).toBe(true)
    // curl ∉ SAFE_TARGET → 目标后续验（无 curl 配置）→ 拒绝
    expect(isCommandSafeViaFlagParsing('xargs -E EOF curl')).toBe(false)
  })

  test('rg --no-glob 不在 rg 安全 flag 表 = 拒绝（表缺省即拒绝语义）', () => {
    expect(isCommandSafeViaFlagParsing('rg --no-glob foo')).toBe(false)
  })
})

describe('isCommandSafeViaFlagParsing 拒绝族', () => {
  test('$ 变量展开 token 全 token 拒绝（前缀 + 内嵌）', () => {
    // 前缀形：`"$Z"` → 字面 `$Z` token（env 回调保留）
    expect(isCommandSafeViaFlagParsing('git diff "$Z"')).toBe(false)
    // 内嵌形：ps callback regex 可被 `$` 击穿，token 级 `$` 检兜底
    expect(isCommandSafeViaFlagParsing('ps ax$Ze')).toBe(false)
  })

  test('brace 展开混淆（{ + , 同 token）拒绝', () => {
    expect(
      isCommandSafeViaFlagParsing('git diff {0},--output=/tmp/pwned'),
    ).toBe(false)
  })

  test('git ls-remote URL 外泄守卫', () => {
    expect(isCommandSafeViaFlagParsing('git ls-remote https://x/y')).toBe(
      false,
    )
    expect(isCommandSafeViaFlagParsing('git ls-remote origin')).toBe(true)
  })

  test('callback 危险族（hostname 位置参 / date 数值 / ps BSD e / tput / lsof +m / sed -i）', () => {
    expect(isCommandSafeViaFlagParsing('hostname newhost')).toBe(false)
    expect(isCommandSafeViaFlagParsing('date 1231')).toBe(false)
    expect(isCommandSafeViaFlagParsing('ps axe')).toBe(false)
    expect(isCommandSafeViaFlagParsing('tput init')).toBe(false)
    expect(isCommandSafeViaFlagParsing('lsof +m/tmp/x')).toBe(false)
    // sed -i 原地写 = 非只读（sedValidation allowlist 拒绝）
    expect(isCommandSafeViaFlagParsing('sed -i s/a/b/ f')).toBe(false)
  })

  test('非 allowlist 命令 / 操作符 / 未知命令 = 拒绝', () => {
    // cat = READONLY_COMMANDS regex 族（非 flag-parse allowlist）→ 本函数拒绝
    expect(isCommandSafeViaFlagParsing('cat file.txt')).toBe(false)
    expect(isCommandSafeViaFlagParsing('frobnicate --help')).toBe(false)
    // 管道操作符 → 非简单命令
    expect(isCommandSafeViaFlagParsing('git status | cat')).toBe(false)
  })

  test('grep/rg 换行注入拒绝', () => {
    expect(isCommandSafeViaFlagParsing('grep x\ny')).toBe(false)
  })
})

describe('checkReadOnlyConstraints 五段决策链', () => {
  test('纯只读命令 = allow + updatedInput 原对象引用', () => {
    const input = { command: 'ls' }
    const r = checkReadOnlyConstraints(input, false)
    expect(r.behavior).toBe('allow')
    if (r.behavior === 'allow') {
      expect(r.updatedInput).toBe(input)
    }
  })

  test('echo 字面族 = allow', () => {
    expect(checkReadOnlyConstraints({ command: 'echo hi' }, false).behavior)
      .toBe('allow')
  })

  test('git status = allow（仓根 bare-repo 探针 + placeholder sandbox 窗口双零支）', () => {
    expect(checkReadOnlyConstraints({ command: 'git status' }, false).behavior)
      .toBe('allow')
  })

  test('非只读命令 = 终段 passthrough', () => {
    const r = checkReadOnlyConstraints({ command: 'rm -rf /' }, false)
    expect(r.behavior).toBe('passthrough')
    if (r.behavior === 'passthrough') {
      expect(r.message).toBe(
        'Command is not read-only, requires further permission checks',
      )
    }
  })

  test('命令替换早退（bashCommandIsSafe 非 passthrough）', () => {
    expect(
      checkReadOnlyConstraints({ command: 'echo $(rm x)' }, false).behavior,
    ).toBe('passthrough')
  })

  test('复合命令变量展开偷渡（IFS 位置参 smuggling）= passthrough', () => {
    expect(
      checkReadOnlyConstraints(
        { command: 'echo " /etc/passwd /tmp/x"; uniq --skip-chars=0$_' },
        false,
      ).behavior,
    ).toBe('passthrough')
  })

  test('复合 cd + git 门 = passthrough', () => {
    const r = checkReadOnlyConstraints(
      { command: 'cd /tmp && git status' },
      true,
    )
    expect(r.behavior).toBe('passthrough')
    if (r.behavior === 'passthrough') {
      expect(r.message).toBe(
        'Compound commands with cd and git require permission checks for enhanced security',
      )
    }
  })

  test('git-internal 路径写 + git 复合 = passthrough', () => {
    const r = checkReadOnlyConstraints(
      { command: 'mkdir -p hooks && git status' },
      false,
    )
    expect(r.behavior).toBe('passthrough')
    if (r.behavior === 'passthrough') {
      expect(r.message).toBe(
        'Compound commands that create git internal files and run git require permission checks for enhanced security',
      )
    }
  })

  test('P-B1 锚：单引号反斜杠失步守卫（glob 检出 → 非只读）', () => {
    // `ls '\' *`：bash 语义下 `*` 为未引号 glob（`'\'` 内反斜杠字面）→
    // 非只读 passthrough。S-B6 探针重选登记（§8.54 P-B1 初版锚失效）：
    // 「删 `!inSingleQuote` 守卫」突变实测 0 红——所有失步输入（奇数尾
    // 反斜杠引号串）被 L1871 bashCommandIsSafe_DEPRECATED 预检先行拦截
    // （passthrough 早退，containsUnquotedExpansion 不可达），该守卫 =
    // 设计性不可观测量（防御纵深，函数头注「Defense-in-depth」逐字旧仓）。
    // 正向判别基线保留（本测试），活探针改挂双引号 glob 字面支（下测）。
    expect(
      checkReadOnlyConstraints({ command: "ls '\\' *" }, false).behavior,
    ).toBe('passthrough')
  })

  test('P-B1 重选锚：双引号内 glob 字面（unquoted-expansion 双引号 skip 支）', () => {
    // `ls "x*y"`：双引号内 glob = 字面（bash 语义）→ containsUnquoted
    // Expansion 双引号 skip 支（L1634-1636 逐字旧仓）→ 无未引号展开 →
    // ls 只读 regex 族命中 → allow。
    // 探针突变（S-B6 实测）：删双引号 skip 支 → `*` 误检未引号 glob →
    // 非只读 → passthrough 恰 1 红。
    expect(
      checkReadOnlyConstraints({ command: 'ls "x*y"' }, false).behavior,
    ).toBe('allow')
  })
})
