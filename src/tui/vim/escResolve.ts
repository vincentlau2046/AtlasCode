/**
 * Slow-machine coalesced-Escape resolution (K6-2, wave 0.1.86 task A).
 *
 * On slow machines (SSH, loaded boxes) the PTY reader falls behind and the
 * OS-level tty buffer coalesces consecutive keypresses into ONE read chunk.
 * A lone ESC followed quickly by a printable key then arrives as `\x1b` +
 * letter in a single chunk. The parse layer (`parse-keypress.ts`
 * META_KEY_CODE_RE) must decide instantly and — with no byte timestamps —
 * resolves it as legacy Alt+letter (meta=true, name=''). The vim INSERT
 * handler previously fell through to the plain-character branch: the mode
 * stayed INSERT and the letter leaked into the buffer. That is the reported
 * "vim 模式慢机上 Escape 后滞留 INSERT" (upstream 301).
 *
 * Resolution (vim-domain only): in INSERT mode, a meta+single-alphanumeric
 * key with no other modifier is resolved toward the Escape — exit to NORMAL
 * and replay the letter as a NORMAL-mode command. Esc→j/k/h/l/w/b are the
 * standard vim intent sequence; Esc→i/I/a/A/o/O re-enter INSERT per :help.
 * True Alt+letter editing (meta+y yank, meta+arrow word jumps) is untouched:
 * those go through useTextInput in non-vim lanes, and NORMAL-mode vim reads
 * rawInput which ignores meta. The parse layer is deliberately NOT changed —
 * that would alter non-vim Escape/menu semantics.
 */
export type CoalescedEscapeKey = {
  meta: boolean
  escape: boolean
  ctrl: boolean
  return: boolean
  backspace: boolean
  delete: boolean
}

export function isCoalescedEscape(
  mode: 'INSERT' | 'NORMAL',
  key: CoalescedEscapeKey,
  input: string,
): boolean {
  return (
    mode === 'INSERT' &&
    key.meta &&
    !key.escape &&
    !key.ctrl &&
    !key.return &&
    !key.backspace &&
    !key.delete &&
    input.length === 1 &&
    /[a-zA-Z0-9]/.test(input)
  )
}
