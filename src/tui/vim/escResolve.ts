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

/**
 * AskUserQuestion cancel gating (K6-3, wave 0.1.86 task A).
 *
 * The Select-rendered AskUserQuestion free-text box is a plain TextInput:
 * pressing Esc once cancelled the whole dialog and discarded every typed
 * answer. Root cause: the cancel path is the Select-context keybinding
 * `escape: 'select:cancel'` (defaultBindings.ts), which use-select-input.ts
 * registers UNCONDITIONALLY — the isInInput exclusion list only filters
 * navigation/accept, not cancel. Upstream 302 resolution is a two-piece
 * fix: make the free-text box vim-aware (VimTextInput) and only allow
 * cancellation from NORMAL mode. This predicate IS that gate: the
 * select:cancel interceptor (VimAwareTextInput, inside the Select tree)
 * consumes the keybinding while the user is still in INSERT — Esc #1
 * exits INSERT and preserves the draft — and passes it through in NORMAL,
 * where a second Esc is an explicit cancel. `undefined` = non-vim lane:
 * the interceptor is never registered there, so legacy Esc behavior is
 * untouched.
 */
export function shouldConsumeSelectCancel(
  mode: 'INSERT' | 'NORMAL' | undefined,
): boolean {
  return mode === 'INSERT'
}
