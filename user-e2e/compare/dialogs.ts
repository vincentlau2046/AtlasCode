/**
 * Claude TUI 启动 dialog 处理（fresh 沙箱 HOME + --dangerously-skip-permissions 才出现）：
 *   ① trust-this-folder（"Quick safety check: Is this a project you created or one you trust?"）
 *   ② BypassPermissions 确认（"WARNING: Claude Code running in BypassPermissions mode …"）
 * 两个 dialog 都是「No, exit」高亮为首项、「Yes…」为次项 → 需 下移(Down) 再 Enter 才选中 Yes。
 * 这些是启动面，不属于对比目标（任务执行渲染），只需通过。
 */
import type { GenericPty } from '../lib/pty-generic'
import { sleep } from '../lib/util'

export interface ClaudeDialogs {
  trust: boolean
  bypass: boolean
  repl: boolean
}

/** 接受 claude 启动 dialog；返回遇到了哪些 + REPL 是否就绪 */
export async function acceptClaudeStartupDialogs(pty: GenericPty): Promise<ClaudeDialogs> {
  const out: ClaudeDialogs = { trust: false, bypass: false, repl: false }

  const t1 = await pty.waitAnySince(
    ['Isthisaprojectyoucreated', 'trustthisfolder', 'Quicksafetycheck', 'thisfolderfirst', 'Itrustthisfolder'],
    25_000,
  )
  if (t1.ok) {
    out.trust = true
    pty.sendRaw('\x1b[B') // Down → 移到 "Yes, I trust this folder"
    await sleep(400)
    pty.sendRaw('\r') // Enter 确认
    await sleep(800)
  }

  const t2 = await pty.waitAnySince(
    ['BypassPermissionsmode', 'acceptallresponsibility', 'Yes,Iaccept', 'potentiallydangerouscommands', 'BypassPermissions'],
    25_000,
  )
  if (t2.ok) {
    out.bypass = true
    pty.sendRaw('\x1b[B') // Down → "Yes, I accept"
    await sleep(400)
    pty.sendRaw('\r')
    await sleep(800)
  }

  const r = await pty.waitAnySince(['❯', 'Type to message', 'Claude Code', 'AskClaude', 'Shift+Tab'], 60_000)
  out.repl = r.ok && pty.alive()
  return out
}
