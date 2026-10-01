/**
 * user-e2e slash 命令面枚举（方案 §5 T2）：
 * 单一真源 = TUI 命令注册表（运行时 dump，新增命令永不过期）；
 * dump 失败时回退到内置清单（2026-10-01 注册表静态计数 ≈58 活跃项）。
 */

export interface RegCmd {
  name: string
  type?: string
  aliases?: string[]
  isMcp?: boolean
  isPlugin?: boolean
}

/** 回退清单（src/tui/commands.ts 注册表 2026-10-01 静态枚举；feature/dev 门控项默认关） */
const BAKED: string[] = [
  'add-dir', 'agents', 'ant-trace', 'autofix-pr', 'backfill-sessions',
  'branch', 'break-cache', 'btw', 'bughunter', 'clear', 'color',
  'commit', 'commit-push-pr', 'compact', 'config', 'context', 'copy',
  'cost', 'ctx_viz', 'debug-tool-call', 'diff', 'doctor', 'effort',
  'env', 'exit', 'export', 'feedback', 'files', 'good-atlas', 'heapdump',
  'help', 'hooks', 'ide', 'init', 'init-verifiers', 'insights',
  'install', 'install-slack-app', 'issue', 'keybindings', 'login',
  'logout', 'mcp', 'memory', 'model', 'oauth-refresh', 'onboarding',
  'output-style', 'perf-issue', 'permissions', 'plan', 'plugin',
  'pr_comments', 'release-notes', 'reload-plugins', 'rename', 'resume',
  'review', 'rewind', 'sandbox-toggle', 'security-review', 'session',
  'sessionlist', 'share', 'skills', 'stats', 'status', 'statusline',
  'stickers', 'summary', 'tag', 'tasklist', 'tasks', 'terminal-setup',
  'theme', 'thinkback', 'thinkback-play', 'usage', 'version', 'vim',
]

export async function dumpCommands(cwd: string): Promise<{ cmds: RegCmd[]; source: 'live' | 'baked' }> {
  try {
    // 本文件在 user-e2e/lib/ 下：repo 根 = ../../（单层 ../ 会落到 user-e2e/src，不存在）
    const { getCoreDependencies } = await import('../../src/atlascode/index.js')
    getCoreDependencies()
    const mod = await import('../../src/tui/commands.js')
    const cmds = (await mod.getCommands(cwd)) as any[]
    const out: RegCmd[] = cmds
      .filter(c => c && typeof c.name === 'string' && !c.isMcp && !c.isPlugin)
      .map(c => ({
        name: c.name,
        type: c.type,
        aliases: c.aliases,
        isMcp: c.isMcp,
        isPlugin: c.isPlugin,
      }))
    if (out.length === 0) throw new Error('live dump 空')
    return { cmds: out, source: 'live' }
  } catch (e: any) {
    return { cmds: BAKED.map(name => ({ name })), source: 'baked' }
  }
}
