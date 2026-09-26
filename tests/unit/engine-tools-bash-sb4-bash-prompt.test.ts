/**
 * engine/tools/bash S-B4 bashPrompt unit 面（Bash 本体纵切子波 §8.54，
 * C 桶 ① 子波 2）。
 *
 * unit 层（零盘纪律 + 1 登记例外）：
 *  - getSimplePrompt 节控面：env ATLAS_DISABLE_BACKGROUND_TASKS（background
 *    note 开/关）/ ATLAS_DISABLE_GIT_INSTRUCTIONS（git 节开/关——显式 env
 *    判定在 getSettingsWithErrors 之前短路，零 settings 读）/ sandbox 窗口
 *    真 stub（## Command sandbox 节开 + 双支 override 文案 + 3 条
 *    restrictions 行 + dedup）
 *  - timeout 文案插值（getDefaultTimeoutMs / getMaxTimeoutMs 值逐字插值）
 *  - D-1 delta：commit 步骤 3 止于裸句点 + HEREDOC 示例体止于
 *    "Commit message here." + PR 示例体止于 TODO checklist 行（归属后缀支裁，
 *    全节骨架保留）
 *  - D-2：TodoWrite 经 TODO_WRITE_TOOL_NAME 插值
 *  - feature-off sleep 子项钉文（feature() 恒 false）
 *
 * 确定性登记（复审勿当遗漏重提）：
 *  - sandbox 真 stub 分支触达 permissions 域 getAtlasTempDir 一次性
 *    realpathSync(ATLAS_TMPDIR || '/tmp')（只读 syscall + 模块级 memoize；
 *    Linux 默认 base '/tmp'，结果不进入断言——$TMPDIR 归一只对等于
 *    temp dir 的 allowOnly 路径生效，stub 配置不含该路径）。零盘口径 =
 *    零写 + 零仓状态。
 *  - 测试面 feature('MONITOR_TOOL') 恒 false（bun-bundle-feature-
 *    untestable 先例）→ sleep 子项钉 else 支。
 *  - 工具名断言经 ../toolNames 导入构造（非硬编码字面），门面单一事实源
 *    漂移时断言自跟随。
 *
 * 深度 import（门面归集 = S-B5，本切片不预支）：
 *  ../../src/engine/tools/bash/bashPrompt
 */
import { describe, test, expect, afterEach } from 'bun:test'
import {
  getSimplePrompt,
  getDefaultTimeoutMs,
  getMaxTimeoutMs,
} from '../../src/engine/tools/bash/bashPrompt'
import { AGENT_TOOL_NAME } from '../../src/engine/tools/agent'
import { TODO_WRITE_TOOL_NAME } from '../../src/engine/tools/toolNames'
import {
  setSandboxAccess,
  resetSandboxAccess,
  type SandboxAccess,
} from '../../src/permissions'

function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => void,
): void {
  const saved: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  try {
    fn()
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

/** 全 8 成员 sandbox 窗口 stub（S-B4 扩面 4 成员真值面）。 */
function injectSandboxWindow(over: Partial<SandboxAccess>): void {
  setSandboxAccess({
    isSandboxingEnabled: () => true,
    isAutoAllowBashIfSandboxedEnabled: () => false,
    areUnsandboxedCommandsAllowed: () => true,
    getFsWriteConfig: () => ({ allowOnly: [], denyWithinAllow: [] }),
    getFsReadConfig: () => ({ denyOnly: [] }),
    getNetworkRestrictionConfig: () => ({}),
    getAllowUnixSockets: () => undefined,
    getIgnoreViolations: () => undefined,
    ...over,
  })
}

afterEach(() => {
  resetSandboxAccess()
})

describe('getSimplePrompt 基础面（placeholder 窗口 = sandbox 节关）', () => {
  test('固定开头 + 工具偏好族 + feature-off sleep 支 + background note 开', () => {
    withEnv({ ATLAS_DISABLE_GIT_INSTRUCTIONS: '1' }, () => {
      const p = getSimplePrompt()
      expect(p).toContain(
        'Executes a given bash command and returns its output.',
      )
      // 非 embedded（EMBEDDED_SEARCH_TOOLS 未设）→ find/grep 避让文案
      expect(p).toContain('`find`, `grep`, `cat`, `head`, `tail`, `sed`, `awk`, or `echo`')
      expect(p).toContain('File search: Use Glob (NOT find or ls)')
      expect(p).toContain('Content search: Use Grep (NOT grep or rg)')
      expect(p).toContain('Read files: Use Read (NOT cat/head/tail)')
      expect(p).toContain('Write files: Use Write (NOT echo >/cat <<EOF)')
      // feature-off sleep 钉文（feature() 恒 false）
      expect(p).toContain(
        'If you must poll an external process, use a check command',
      )
      expect(p).toContain('If you must sleep, keep the duration short (1-5 seconds)')
      // background note（env 未设）
      expect(p).toContain(
        'You can use the `run_in_background` parameter to run the command in the background.',
      )
      // placeholder 窗口 isSandboxingEnabled=false → sandbox 节关
      expect(p).not.toContain('## Command sandbox')
      // git 节显式 env 关
      expect(p).not.toContain('# Committing changes with git')
    })
  })

  test('background note env 关支', () => {
    withEnv(
      { ATLAS_DISABLE_GIT_INSTRUCTIONS: '1', ATLAS_DISABLE_BACKGROUND_TASKS: '1' },
      () => {
        const p = getSimplePrompt()
        expect(p).not.toContain(
          'You can use the `run_in_background` parameter to run the command in the background.',
        )
      },
    )
  })

  test('timeout 文案逐字插值', () => {
    withEnv({ ATLAS_DISABLE_GIT_INSTRUCTIONS: '1' }, () => {
      const p = getSimplePrompt()
      const def = getDefaultTimeoutMs()
      const max = getMaxTimeoutMs()
      expect(p).toContain(
        `You may specify an optional timeout in milliseconds (up to ${max}ms / ${max / 60000} minutes).`,
      )
      expect(p).toContain(
        `your command will timeout after ${def}ms (${def / 60000} minutes).`,
      )
    })
  })
})

describe('getSimplePrompt D-1 归属后缀裁 + 全节骨架保留', () => {
  test('commit 节：骨架在 + 后缀支裁', () => {
    withEnv({ ATLAS_DISABLE_GIT_INSTRUCTIONS: '0' }, () => {
      const p = getSimplePrompt()
      // 全节骨架（git 安全协议 / gh PR 流程 / HEREDOC 示例逐字保留）
      expect(p).toContain('# Committing changes with git')
      expect(p).toContain('NEVER update the git config')
      expect(p).toContain('# Creating pull requests')
      expect(p).toContain('gh pr create --title "the pr title"')
      // D-1：步骤 3 止于裸句点（"ending with:" 后缀支裁）
      expect(p).toContain('- Create the commit with a message.')
      expect(p).not.toContain('ending with:')
      // D-1：HEREDOC 示例体止于 "Commit message here."
      expect(p).toContain('Commit message here.\n   EOF')
      // D-1：PR 示例体止于 TODO checklist 行（无归属后缀）
      expect(p).toContain(
        '[Bulleted markdown checklist of TODOs for testing the pull request...]\nEOF',
      )
      // D-2：TodoWrite 经 TODO_WRITE_TOOL_NAME 插值
      expect(p).toContain(
        `NEVER use the ${TODO_WRITE_TOOL_NAME} or ${AGENT_TOOL_NAME} tools`,
      )
    })
  })
})

describe('getSimplePrompt sandbox 窗口 stub 面（S-B4 扩面 4 成员）', () => {
  test('allowUnsandboxedCommands=true 支：3 条 restrictions + override 文案', () => {
    withEnv({ ATLAS_DISABLE_GIT_INSTRUCTIONS: '1' }, () => {
      injectSandboxWindow({
        areUnsandboxedCommandsAllowed: () => true,
        getFsWriteConfig: () => ({
          allowOnly: ['/work'],
          denyWithinAllow: ['/work/secrets'],
        }),
        getFsReadConfig: () => ({ denyOnly: ['/etc/shadow', '/etc/shadow'] }),
        getNetworkRestrictionConfig: () => ({
          allowedHosts: ['api.example.com'],
        }),
        getAllowUnixSockets: () => ['/var/run/docker.sock'],
        getIgnoreViolations: () => ({ 'file-read': ['/x'] }),
      })
      const p = getSimplePrompt()
      expect(p).toContain('## Command sandbox')
      // dedup：denyOnly 重复项归一（窄视图成员真消费）
      expect(p).toContain(
        'Filesystem: {"read":{"denyOnly":["/etc/shadow"]},"write":{"allowOnly":["/work"],"denyWithinAllow":["/work/secrets"]}}',
      )
      expect(p).toContain(
        'Network: {"allowedHosts":["api.example.com"],"allowUnixSockets":["/var/run/docker.sock"]}',
      )
      expect(p).toContain('Ignored violations: {"file-read":["/x"]}')
      // allow 支 override 文案
      expect(p).toContain(
        "Immediately retry with `dangerouslyDisableSandbox: true` (don't ask, just do it)",
      )
      expect(p).not.toContain(
        'All commands MUST run in sandbox mode',
      )
      // $TMPDIR 指引行（节固定尾部）
      expect(p).toContain(
        'For temporary files, always use the `$TMPDIR` environment variable.',
      )
    })
  })

  test('allowUnsandboxedCommands=false 支：policy 锁文案', () => {
    withEnv({ ATLAS_DISABLE_GIT_INSTRUCTIONS: '1' }, () => {
      injectSandboxWindow({ areUnsandboxedCommandsAllowed: () => false })
      const p = getSimplePrompt()
      expect(p).toContain('## Command sandbox')
      expect(p).toContain(
        'All commands MUST run in sandbox mode - the `dangerouslyDisableSandbox` parameter is disabled by policy.',
      )
      expect(p).toContain(
        'Commands cannot run outside the sandbox under any circumstances.',
      )
      expect(p).not.toContain(
        "Immediately retry with `dangerouslyDisableSandbox: true`",
      )
    })
  })
})
