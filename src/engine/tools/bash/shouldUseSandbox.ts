/**
 * engine/tools/bash — shouldUseSandbox（§8.53 S-T2b，旧仓
 * src/tools/BashTool/shouldUseSandbox.ts 124L 逐字随迁，工具本体波 C 桶 ①
 * 核心 3 文件之三）。
 *
 * sandbox 决策面：shouldUseSandbox（isSandboxingEnabled 总门 +
 * dangerouslyDisableSandbox && areUnsandboxedCommandsAllowed 逃生门 +
 * 用户 excludedCommands 不动点剥除匹配）——Bash 执行链 ⑧ 消费面
 * （S-T4 组合根接线激活：ShellExecutor.exec → 本函数决策）。
 *
 * delta 登记（import 替换 + 2 值位替换，函数体逐字；复审勿当遗漏重提）：
 *  - 旧 getSandboxManager（core/sandbox/compat 模块态）→ permissions 域
 *    sandboxAccess 注入窗口 getSandboxAccess（E-6 S-6a L3 自治先例；
 *    窗口新成员 areUnsandboxedCommandsAllowed placeholder false = 逃生门
 *    恒失活（保守面：dangerouslyDisableSandbox 恒仍 sandbox）——真策略读
 *    面归 S-T4 组合根 ⑧ setSandboxAccess 注入）
 *  - 旧 getSettings_DEPRECATED() → engine/config 门面 getSettingsWithErrors()
 *    .settings（S-3c 落 settings 族单一事实源；z.any() sandbox 兜底型 →
 *    excludedCommands 窄视图 cast 登记本处）
 *  - splitCommand_DEPRECATED → 同域 S-T1 commands；5 bashPermissions 导出
 *    同域 import 去 .js 后缀
 *
 * 测试面：func = settings 消费面（tmp 真盘 settings + session 缓存注入，
 * §8.53 S-T2b 落位）；探针 P-T5（excludedCommands 不动点循环删）归 S-T5。
 */
import { splitCommand_DEPRECATED } from './commands'
import { getSandboxAccess } from '../../../permissions'
import { getSettingsWithErrors } from '../../../engine/config'
import {
  BINARY_HIJACK_VARS,
  bashPermissionRule,
  matchWildcardPattern,
  stripAllLeadingEnvVars,
  stripSafeWrappers,
} from './bashPermissions'

type SandboxInput = {
  command?: string
  dangerouslyDisableSandbox?: boolean
}

// NOTE: excludedCommands is a user-facing convenience feature, not a security boundary.
// It is not a security bug to be able to bypass excludedCommands — the sandbox permission
// system (which prompts users) is the actual security control.
function containsExcludedCommand(command: string): boolean {
  // de-ANT: the ant-only dynamic disabled-commands config check was removed.

  // Check user-configured excluded commands from settings
  //（新仓 settings.sandbox = z.any() 兜底型 → 窄视图 cast，delta 见头注）
  const settings = getSettingsWithErrors().settings
  const userExcludedCommands: string[] = (settings.sandbox as
    | { excludedCommands?: string[] }
    | undefined)?.excludedCommands ?? []

  if (userExcludedCommands.length === 0) {
    return false
  }

  // Split compound commands (e.g. "docker ps && curl evil.com") into individual
  // subcommands and check each one against excluded patterns. This prevents a
  // compound command from escaping the sandbox just because its first subcommand
  // matches an excluded pattern.
  let subcommands: string[]
  try {
    subcommands = splitCommand_DEPRECATED(command)
  } catch {
    subcommands = [command]
  }

  for (const subcommand of subcommands) {
    const trimmed = subcommand.trim()
    // Also try matching with env var prefixes and wrapper commands stripped, so
    // that `FOO=bar bazel ...` and `timeout 30 bazel ...` match `bazel:*`. Not a
    // security boundary (see NOTE at top); the &&-split above already lets
    // `export FOO=bar && bazel ...` match. BINARY_HIJACK_VARS kept as a heuristic.
    //
    // We iteratively apply both stripping operations until no new candidates are
    // produced (fixed-point), matching the approach in filterRulesByContentsMatchingInput.
    // This handles interleaved patterns like `timeout 300 FOO=bar bazel run`
    // where single-pass composition would fail.
    const candidates = [trimmed]
    const seen = new Set(candidates)
    let startIdx = 0
    while (startIdx < candidates.length) {
      const endIdx = candidates.length
      for (let i = startIdx; i < endIdx; i++) {
        const cmd = candidates[i]!
        const envStripped = stripAllLeadingEnvVars(cmd, BINARY_HIJACK_VARS)
        if (!seen.has(envStripped)) {
          candidates.push(envStripped)
          seen.add(envStripped)
        }
        const wrapperStripped = stripSafeWrappers(cmd)
        if (!seen.has(wrapperStripped)) {
          candidates.push(wrapperStripped)
          seen.add(wrapperStripped)
        }
      }
      startIdx = endIdx
    }

    for (const pattern of userExcludedCommands) {
      const rule = bashPermissionRule(pattern)
      for (const cand of candidates) {
        switch (rule.type) {
          case 'prefix':
            if (cand === rule.prefix || cand.startsWith(rule.prefix + ' ')) {
              return true
            }
            break
          case 'exact':
            if (cand === rule.command) {
              return true
            }
            break
          case 'wildcard':
            if (matchWildcardPattern(rule.pattern, cand)) {
              return true
            }
            break
        }
      }
    }
  }

  return false
}

export function shouldUseSandbox(input: Partial<SandboxInput>): boolean {
  if (!getSandboxAccess().isSandboxingEnabled()) {
    return false
  }

  // Don't sandbox if explicitly overridden AND unsandboxed commands are allowed by policy
  if (
    input.dangerouslyDisableSandbox &&
    getSandboxAccess().areUnsandboxedCommandsAllowed()
  ) {
    return false
  }

  if (!input.command) {
    return false
  }

  // Don't sandbox if the command contains user-configured excluded commands
  if (containsExcludedCommand(input.command)) {
    return false
  }

  return true
}
