/**
 * 对比冒烟：仅启动两个 TUI（不发 prompt），抓取各自 REPL 就绪/提示符面，
 * 确认「两者都能被 pty-generic 驱动 + 各自的 ready marker 是什么」。
 *
 * 用法：bun run user-e2e/compare/smoke.ts
 */
import { mkdirSync, cpSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { GenericPty } from '../lib/pty-generic'
import { sleep, stripAnsi, readWhole } from '../lib/util'
import { acceptClaudeStartupDialogs } from './dialogs'

const REPO = '/home/vince/projects/AtlasCode'
const FIX = join(REPO, 'user-e2e/compare/fixtures')
const RUNS = join(REPO, 'user-e2e/compare/runs')
const runId = 'smoke-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '-' + Math.random().toString(36).slice(2, 7)
const root = join(RUNS, runId)

/** 预置 claude 沙箱 HOME：onboarding-complete（跳过 theme-picker）+ 该 workspace 已信任（跳过 trust 弹窗） */
function seedClaudeHome(home: string, wsPath: string) {
  const claudeJson: Record<string, unknown> = {
    hasCompletedOnboarding: true,
    installMethod: 'global',
    numStartups: 1,
    hasSeenTasksHint: true,
    hasSeenAutoModeEntryWarning: true,
    hasSeenAutoModeOutsideReadPrompt: true,
    hasSeenAutoDefaultNotice: true,
    officialMarketplaceAutoInstallAttempted: true,
    officialMarketplaceAutoInstalled: true,
    lastReleaseNotesSeen: '2.1.287',
    theme: 'dark',
    projects: { [wsPath]: { hasTrustDialogAccepted: true, allowedTools: [], mcpServers: {} } },
  }
  mkdirSync(home, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify(claudeJson, null, 2))
}

function setupWs(kind: 'atlas' | 'claude', base: string): string {
  const ws = join(base, kind, 'ws')
  const home = join(base, kind, 'home')
  rmSync(ws, { recursive: true, force: true })
  rmSync(home, { recursive: true, force: true })
  mkdirSync(ws, { recursive: true })
  mkdirSync(home, { recursive: true })
  for (const f of ['calc.js', 'data.json', 'notes.md']) cpSync(join(FIX, f), join(ws, f))
  if (kind === 'atlas') {
    cpSync(join(FIX, 'atlas-summarize'), join(ws, '.atlas', 'skills', 'summarize-numbers'), { recursive: true })
  } else {
    cpSync(join(FIX, 'claude-summarize'), join(ws, '.claude', 'skills', 'summarize-numbers'), { recursive: true })
    seedClaudeHome(home, ws)
  }
  return ws
}

const ATLAS_CMD = `bun run ${REPO}/src/atlascode/cli.ts code --dangerously-skip-permissions`
const CLAUDE_CMD = 'claude --dangerously-skip-permissions'

// 嵌套会话标记：启动嵌套 claude 前必须剥离（否则会误判为子会话）
const UNSET = [
  'CLAUDECODE', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_PID',
  'CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_SESSION_ATTENDED', 'AI_AGENT',
  'CLAUDE_EFFORT', 'CLAUDE_CODE_EXECPATH',
]

async function main() {
  mkdirSync(root, { recursive: true })
  const results: Record<string, unknown> = { runId, at: new Date().toISOString() }

  // ---- Atlas TUI ----
  {
    const base = join(root, 'atlas')
    const ws = setupWs('atlas', base)
    const home = join(base, 'atlas', 'home')
    const log = join(root, 'atlas', 'transcript.log')
    const pty = await GenericPty.start({
      logPath: log,
      workspace: ws,
      cmd: ATLAS_CMD,
      home,
      extraEnv: { IS_DEMO: '1' },
      readySubs: ['查看全部命令', '❯'],
      readyMs: 90_000,
    })
    await pty.settle(4000, 60_000)
    const txt = pty.text()
    writeFileSync(join(root, 'atlas', 'stripped.txt'), txt)
    results.atlas = {
      alive: pty.alive(),
      len: txt.length,
      tail: txt.split('\n').filter(l => l.trim()).slice(-30),
    }
    pty.kill()
  }

  // ---- Claude TUI ----
  {
    const base = join(root, 'claude')
    const ws = setupWs('claude', base)
    const home = join(base, 'claude', 'home')
    const log = join(root, 'claude', 'transcript.log')
    const pty = await GenericPty.start({
      logPath: log,
      workspace: ws,
      cmd: CLAUDE_CMD,
      home,
      extraEnv: { CLAUDE_CODE_MAX_CONTEXT_TOKENS: '262144', CLAUDE_CODE_MAX_OUTPUT_TOKENS: '32000' },
      unset: UNSET,
      readySubs: ['❯', 'Type to message', 'Claude Code'],
      readyMs: 120_000,
    })
    const dialogs = await acceptClaudeStartupDialogs(pty)
    await pty.settle(5000, 60_000)
    const txt = pty.text()
    writeFileSync(join(root, 'claude', 'stripped.txt'), txt)
    results.claude = {
      alive: pty.alive(),
      dialogs,
      len: txt.length,
      tail: txt.split('\n').filter(l => l.trim()).slice(-30),
    }
    pty.kill()
  }

  writeFileSync(join(root, 'smoke-result.json'), JSON.stringify(results, null, 2))
  console.log('=== ATLAS tail ===')
  console.log(JSON.stringify(results.atlas, null, 2))
  console.log('\n=== CLAUDE tail ===')
  console.log(JSON.stringify(results.claude, null, 2))
  console.log('\nartifacts → ' + root)
}

main().catch(e => { console.error(e); process.exit(1) })
