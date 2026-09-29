/**
 * CancelRequestHandler component for handling cancel/escape keybinding.
 *
 * Must be rendered inside KeybindingSetup to have access to the keybinding context.
 * This component renders nothing - it just registers the cancel keybinding handler.
 */
import { useCallback, useRef, type RefObject } from 'react'
import {
  useAppState,
  useAppStateStore,
  useSetAppState,
} from 'src/tui/state/AppState.js'
import { isVimModeEnabled } from '../components/PromptInput/utils.js'
import type { ToolUseConfirm } from '../components/permissions/PermissionRequest.js'
import type { SpinnerMode } from '../components/Spinner/types.js'
import { useNotifications } from '../context/notifications.js'
import { useIsOverlayActive } from '../context/overlayContext.js'
import { useCommandQueue } from '../hooks/useCommandQueue.js'
import { getShortcutDisplay } from '../keybindings/shortcutFormat.js'
import { useKeybinding } from '../keybindings/useKeybinding.js'
import type { Screen } from '../screens/REPL.js'
import { exitTeammateView } from '../state/teammateViewHelpers.js'
import { getVisibleAgentTasks } from '../components/CoordinatorAgentStatus.js'
import {
  killAllRunningAgentTasks,
  killAsyncAgent,
  markAgentsNotified,
} from '../tasks/LocalAgentTask/LocalAgentTask.js'
import type { PromptInputMode, VimMode } from '../types/textInputTypes.js'
import {
  clearCommandQueue,
  enqueuePendingNotification,
  hasCommandsInQueue,
} from '../utils/messageQueueManager.js'
import { emitTaskTerminatedSdk } from '../utils/sdkEventQueue.js'

/** Time window in ms during which a second press kills all background agents. */
const KILL_AGENTS_CONFIRM_WINDOW_MS = 3000

type CancelRequestHandlerProps = {
  setToolUseConfirmQueue: (
    f: (toolUseConfirmQueue: ToolUseConfirm[]) => ToolUseConfirm[],
  ) => void
  onCancel: () => void
  onAgentsKilled: () => void
  isMessageSelectorVisible: boolean
  screen: Screen
  abortSignal?: AbortSignal
  abortControllerRef?: RefObject<AbortController | null>
  popCommandFromQueue?: () => void
  vimMode?: VimMode
  isLocalJSXCommand?: boolean
  isSearchingHistory?: boolean
  isHelpOpen?: boolean
  inputMode?: PromptInputMode
  inputValue?: string
  streamMode?: SpinnerMode
}

/**
 * Component that handles cancel requests via keybinding.
 * Renders null but registers the 'chat:cancel' keybinding handler.
 */
export function CancelRequestHandler(props: CancelRequestHandlerProps): null {
  const {
    setToolUseConfirmQueue,
    onCancel,
    onAgentsKilled,
    isMessageSelectorVisible,
    screen,
    abortSignal,
    abortControllerRef,
    popCommandFromQueue,
    vimMode,
    isLocalJSXCommand,
    isSearchingHistory,
    isHelpOpen,
    inputMode,
    inputValue,
    streamMode,
  } = props
  const store = useAppStateStore()
  const setAppState = useSetAppState()
  const queuedCommandsLength = useCommandQueue().length
  const { addNotification, removeNotification } = useNotifications()
  const lastKillAgentsPressRef = useRef<number>(0)
  const viewSelectionMode = useAppState(s => s.viewSelectionMode)

  const handleCancel = useCallback(() => {
    // Priority 1: If there's an active task running, cancel it first
    // This takes precedence over queue management so users can always interrupt Claude
    if (abortSignal !== undefined && !abortSignal.aborted) {
      setToolUseConfirmQueue(() => [])
      onCancel()
      return
    }

    // Priority 2: Pop queue when Claude is idle (no running task to cancel)
    if (hasCommandsInQueue()) {
      if (popCommandFromQueue) {
        popCommandFromQueue()
        return
      }
    }

    // Fallback: nothing to cancel or pop (shouldn't reach here if isActive is correct)
    setToolUseConfirmQueue(() => [])
    onCancel()
  }, [
    abortSignal,
    popCommandFromQueue,
    setToolUseConfirmQueue,
    onCancel,
    streamMode,
  ])

  // Determine if this handler should be active
  // Other contexts (Transcript, HistorySearch, Help) have their own escape handlers
  // Overlays (ModelPicker, ThinkingToggle, etc.) register themselves via useRegisterOverlay
  // Local JSX commands (like /model, /btw) handle their own input
  const isOverlayActive = useIsOverlayActive()
  const canCancelRunningTask = abortSignal !== undefined && !abortSignal.aborted
  const hasQueuedCommands = queuedCommandsLength > 0
  // When in bash/background mode with empty input, escape should exit the mode
  // rather than cancel the request. Let PromptInput handle mode exit.
  // This only applies to Escape, not Ctrl+C which should always cancel.
  const isInSpecialModeWithEmptyInput =
    inputMode !== undefined && inputMode !== 'prompt' && !inputValue
  // When viewing a teammate's transcript, let useBackgroundTaskNavigation handle Escape
  const isViewingTeammate = viewSelectionMode === 'viewing-agent'
  // Context guards: other screens/overlays handle their own cancel
  // NOTE: isContextActive includes !isOverlayActive for Escape—when an overlay
  // is open, Escape should dismiss the overlay, not cancel. But ctrl+C should
  // ALWAYS be able to interrupt, even when overlays are active. Overlays have
  // their own app:interrupt handler (useExitOnCtrlCDWithKeybindings) that fires
  // first (child component), so CancelRequestHandler only fires as a fallback
  // if the overlay doesn't consume the event.
  const isContextActive =
    screen !== 'transcript' &&
    !isSearchingHistory &&
    !isMessageSelectorVisible &&
    !isLocalJSXCommand &&
    !isHelpOpen &&
    !isOverlayActive &&
    !(isVimModeEnabled() && vimMode === 'INSERT')

  // Separate context check for ctrl+C: same as isContextActive but WITHOUT the
  // isOverlayActive gate. Overlays register their own app:interrupt via
  // useExitOnCtrlCDWithKeybindings (child fires first). If they don't consume
  // the event, CancelRequestHandler should still be active to handle it.
  // Also WITHOUT the vim-INSERT gate: vim owns Escape semantics, but ctrl+C is
  // a universal interrupt and must stay registered in vim mode too (otherwise
  // with editorMode:"vim" the handler is unregistered in normal typing state
  // and falls through to the double-press-exit, silently breaking interrupt).
  // handleInterrupt reads live state at keypress and returns false when
  // nothing is running, so the double-press-exit still works when idle.
  const isCtrlCContextActive =
    screen !== 'transcript' &&
    !isSearchingHistory &&
    !isMessageSelectorVisible &&
    !isLocalJSXCommand &&
    !isHelpOpen

  // Escape (chat:cancel) defers to mode-exit when in special mode with empty
  // input, and to useBackgroundTaskNavigation when viewing a teammate
  const isEscapeActive =
    isContextActive &&
    (canCancelRunningTask || hasQueuedCommands) &&
    !isInSpecialModeWithEmptyInput &&
    !isViewingTeammate

  // Ctrl+C (app:interrupt):
  // - While main session is streaming: cancel the current query
  // - While idle with background agents running: kill all agents
  // - While viewing a teammate: kill everything and return
  // - While a task is focused in the footer: kill just that one
  // - While queued commands exist: pop the queue
  // The handler returns false when nothing matches, so other handlers
  // (copy-selection, double-press exit) still see the keypress.
  // Registration gate is context-only (isCtrlCContextActive), NOT a render-time
  // snapshot of "is there anything to do". useKeybinding unregisters the
  // handler entirely when isActive is false (useKeybinding.ts:42-45,96), so the
  // old OR-chain (canCancelRunningTask || …) silently dropped the handler on any
  // frame where the abortSignal prop was null/stale → Ctrl+C fell through to the
  // TextInput double-press-exit (docs/16-TUI缺陷与修复方案.md §D3). The "what to
  // do" decision now lives in handleInterrupt, which reads live state
  // (store.getState() + abortControllerRef) at keypress time and returns false
  // when nothing matches, so copy-selection / double-press-exit still work.
  const isCtrlCActive = isCtrlCContextActive

  useKeybinding('chat:cancel', handleCancel, {
    context: 'Chat',
    isActive: isEscapeActive,
  })

  // Shared kill path: stop all agents, suppress per-agent notifications,
  // emit SDK events, enqueue a single aggregate model-facing notification.
  // Returns true if anything was killed.
  const killAllAgentsAndNotify = useCallback((): boolean => {
    const tasks = store.getState().tasks
    const running = Object.entries(tasks as Record<string, any>).filter(
      ([, t]) => t.type === 'local_agent' && t.status === 'running',
    )
    if (running.length === 0) return false
    killAllRunningAgentTasks(tasks, setAppState)
    const descriptions: string[] = []
    for (const [taskId, task] of running) {
      markAgentsNotified(taskId, setAppState)
      descriptions.push(task.description)
      emitTaskTerminatedSdk(taskId, 'stopped', {
        toolUseId: task.toolUseId,
        summary: task.description,
      })
    }
    const summary =
      descriptions.length === 1
        ? `Background agent "${descriptions[0]}" was stopped by the user.`
        : `${descriptions.length} background agents were stopped by the user: ${descriptions.map(d => `"${d}"`).join(', ')}.`
    enqueuePendingNotification({ value: summary, mode: 'task-notification' })
    onAgentsKilled()
    return true
  }, [store, setAppState, onAgentsKilled])

  // Ctrl+C (app:interrupt). Priority chain:
  // 1. Kill running background agents when main is idle (most common case)
  // 2. Focused task in footer → kill just that one task
  // 3. Viewing a teammate → kill all agents + exit teammate view
  // 4. Cancelable running task or queued commands → cancel everything
  const handleInterrupt = useCallback(() => {
    const latestState = store.getState()
    // Read the LIVE controller at keypress time. The render-time abortSignal
    // prop can be null/stale mid-stream (which is what broke the old gate); the
    // ref always points at the controller the running turn actually listens to.
    const live = abortControllerRef?.current
    const canCancelLive = live != null && !live.signal.aborted
    const viewingTeammate = latestState.viewSelectionMode === 'viewing-agent'
    const queued = hasCommandsInQueue()

    // Priority 1: when the main session is idle but background agents are
    // running, a single ctrl+C kills ALL background agents. This is the most
    // intuitive behaviour: "ctrl+C = stop what's running".
    if (!canCancelLive) {
      const hasRunningAgents = Object.values(
        latestState.tasks as Record<string, any>,
      ).some(
        t => t.type === 'local_agent' && t.status === 'running',
      )
      if (hasRunningAgents) {
        killAllAgentsAndNotify()
        return
      }
    }

    // Priority 2: if a specific task is focused in the footer, kill just
    // that one — the user explicitly selected it (D3 surgical interrupt).
    if (latestState.footerSelection === 'tasks' && latestState.coordinatorTaskIndex > 0) {
      const visibleTasks = getVisibleAgentTasks(latestState.tasks)
      const targetIdx = latestState.coordinatorTaskIndex - 1 // 0 = Main, 1+ = visible[i-1]
      if (targetIdx < visibleTasks.length) {
        const targetTask = visibleTasks[targetIdx]
        if (targetTask.status === 'running') {
          killAsyncAgent(targetTask.id, setAppState)
          addNotification({
            key: `killed-task-${targetTask.id}`,
            text: `已中断: ${targetTask.description || 'background task'}`,
            priority: 'immediate',
            timeoutMs: 3000,
          })
          return
        }
      }
    }
    // Priority 3: viewing a teammate — kill everything and exit
    if (viewingTeammate) {
      killAllAgentsAndNotify()
      exitTeammateView(setAppState)
    }
    // Priority 4: normal cancel (live controller or queued commands)
    if (canCancelLive || queued) {
      handleCancel()
      return
    }
    // Nothing to do — propagate event to other handlers (e.g.
    // ScrollKeybindingHandler copy-selection, double-press exit).
    return false
  }, [
    store,
    setAppState,
    addNotification,
    killAllAgentsAndNotify,
    abortControllerRef,
    handleCancel,
  ])

  useKeybinding('app:interrupt', handleInterrupt, {
    context: 'Global',
    isActive: isCtrlCActive,
  })

  // chat:killAgents uses a two-press pattern: first press shows a
  // confirmation hint, second press within the window actually kills all
  // agents. Reads tasks from the store directly to avoid stale closures.
  const handleKillAgents = useCallback(() => {
    const tasks = store.getState().tasks
    const hasRunningAgents = Object.values(tasks as Record<string, any>).some(
      t => t.type === 'local_agent' && t.status === 'running',
    )
    if (!hasRunningAgents) {
      addNotification({
        key: 'kill-agents-none',
        text: 'No background agents running',
        priority: 'immediate',
        timeoutMs: 2000,
      })
      return
    }
    const now = Date.now()
    const elapsed = now - lastKillAgentsPressRef.current
    if (elapsed <= KILL_AGENTS_CONFIRM_WINDOW_MS) {
      // Second press within window -- kill all background agents
      lastKillAgentsPressRef.current = 0
      removeNotification('kill-agents-confirm')
      clearCommandQueue()
      killAllAgentsAndNotify()
      return
    }
    // First press -- show confirmation hint in status bar
    lastKillAgentsPressRef.current = now
    const shortcut = getShortcutDisplay(
      'chat:killAgents',
      'Chat',
      'ctrl+x ctrl+k',
    )
    addNotification({
      key: 'kill-agents-confirm',
      text: `Press ${shortcut} again to stop background agents`,
      priority: 'immediate',
      timeoutMs: KILL_AGENTS_CONFIRM_WINDOW_MS,
    })
  }, [store, addNotification, removeNotification, killAllAgentsAndNotify])

  // Must stay always-active: ctrl+x is consumed as a chord prefix regardless
  // of isActive (because ctrl+x ctrl+e is always live), so an inactive handler
  // here would leak ctrl+k to readline kill-line. Handler gates internally.
  useKeybinding('chat:killAgents', handleKillAgents, {
    context: 'Chat',
  })

  return null
}
