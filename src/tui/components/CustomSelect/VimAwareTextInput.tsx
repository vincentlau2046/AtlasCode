import React, { useEffect, useState } from 'react'
import TextInput from '../TextInput.js'
import VimTextInput from '../VimTextInput.js'
import { useKeybinding } from '../../keybindings/useKeybinding.js'
import { isVimModeEnabled } from '../PromptInput/utils.js'
import { shouldConsumeSelectCancel } from '../../vim/escResolve.js'
import type { BaseTextInputProps, VimMode } from '../../types/textInputTypes.js'

/**
 * K6-3 (wave 0.1.86 task A): the AskUserQuestion free-text box, rendered by
 * SelectInputOption, was a plain TextInput — one Esc cancelled the whole
 * dialog and discarded every typed answer, because the Select-context
 * `escape: 'select:cancel'` binding is registered unconditionally by
 * use-select-input.ts (isInInput only excludes navigation/accept).
 *
 * Upstream 302 resolution, two pieces:
 *  1. the box becomes vim-aware (VimTextInput) when vim mode is enabled —
 *     Esc #1 exits INSERT and keeps the dialog + drafts;
 *  2. only NORMAL-mode Esc cancels: this interceptor consumes select:cancel
 *     while vim mode is on and the inner state is INSERT (see
 *     shouldConsumeSelectCancel). Non-vim lanes never register it — legacy
 *     Esc behavior is untouched.
 *
 * Thin glue by design: the decision lives in the pure
 * vim/escResolve.ts::shouldConsumeSelectCancel (unit-tested); user-visible
 * behavior is re-verified by the e2e gate PTY probes.
 *
 * Registration order note: this hook must live INSIDE the Select tree —
 * BaseTextInput's useInput registers first (child effects fire before
 * parent effects), so the vim handler has already consumed INSERT Escapes
 * before this runs; this interceptor only needs to shield the Select-level
 * cancel for the residual case.
 */
type Props = BaseTextInputProps

export function VimAwareTextInput(props: Props): React.ReactNode {
  const [vimMode, setVimMode] = useState<VimMode>('INSERT')

  const vimEnabled = isVimModeEnabled()

  // Reset to INSERT whenever the input (re)gains focus: the inner
  // VimTextInput unmounts/remounts as focus follows option selection
  // (focus-follows-selection), and a stale NORMAL left over from the
  // previous focus would let the FIRST Esc cancel instead of switching
  // modes. Esc #1 (exit INSERT→NORMAL) does not toggle `focus`, so this
  // does not fight the mode switch itself.
  useEffect(() => {
    if (props.focus) {
      setVimMode('INSERT')
    }
  }, [props.focus])

  useKeybinding(
    'select:cancel',
    () => {
      // consume (void) while INSERT — Esc #1 exits INSERT, dialog + drafts
      // survive; return false in NORMAL/undefined to let Select cancel.
      if (!shouldConsumeSelectCancel(vimMode)) {
        return false
      }
    },
    { context: 'Select', isActive: (props.focus ?? false) && vimEnabled },
  )

  if (!vimEnabled) {
    return <TextInput {...props} />
  }
  return <VimTextInput {...props} onModeChange={setVimMode} />
}
