/**
 * FileTaskDialog — shows file-based tasks (TaskCreate / TaskUpdate) in TUI.
 *
 * Loads tasks from `.atlas/tasks/<taskListId>/` via `listTasks()` and
 * displays them with status filtering. Subscribes to `onTasksUpdated` for
 * live updates when tasks change in-process.
 *
 * This dialog is launched by the `/tasklist` slash command.
 */

import React, { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import {
  getTaskListId,
  listTasks,
  onTasksUpdated,
  type Task,
  type TaskStatus,
} from 'src/tui/utils/tasks.js'
import type { CommandResultDisplay } from '../../commands.js'
import { useRegisterOverlay } from '../../context/overlayContext.js'
import type { KeyboardEvent } from '../../ink/events/keyboard-event.js'
import { Box, Text } from '../../ink.js'
import { useKeybindings } from '../../keybindings/useKeybinding.js'
import { KeyboardShortcutHint } from '../design-system/KeyboardShortcutHint.js'
import { Dialog } from '../design-system/Dialog.js'
import { Byline } from '../design-system/Byline.js'
import type { ExitState } from '../../hooks/useExitOnCtrlCDWithKeybindings.js'

type StatusFilter = 'all' | TaskStatus

interface Props {
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void
}

/**
 * Colour for each task status badge, using Ink's built-in color names.
 */
const STATUS_COLOR: Record<TaskStatus, string> = {
  pending: 'yellow',
  in_progress: 'green',
  completed: 'dim',
}

/**
 * Icon for each task status badge.
 */
const STATUS_ICON: Record<TaskStatus, string> = {
  pending: '○',
  in_progress: '◉',
  completed: '✓',
}

const FILTERS: StatusFilter[] = ['all', 'pending', 'in_progress', 'completed']

/**
 * Human-readable label for the task status.
 */
function statusLabel(status: TaskStatus): string {
  switch (status) {
    case 'pending':
      return 'pending'
    case 'in_progress':
      return 'in-progress'
    case 'completed':
      return 'done'
  }
}

export function FileTaskDialog({ onDone }: Props): React.ReactNode {
  // React Compiler does not support useState destructuring on a custom hook,
  // so we use plain union state.
  const [tasks, setTasks] = useState<Task[] | 'loading' | 'error'>('loading')
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [detailTask, setDetailTask] = useState<Task | null>(null)

  // Register as modal overlay so parent keybindings are deactivated
  ;(useRegisterOverlay as any)('file-task-dialog')

  // Load tasks on mount and subscribe to in-process updates
  useEffect(() => {
    void loadTasks().then(setTasks)
    const unsub = onTasksUpdated(() => {
      void loadTasks().then(setTasks)
    })
    return unsub
  }, [])

  // Filtered task list based on current filter tab
  const filteredTasks = useMemo(() => {
    if (tasks === 'loading' || tasks === 'error') return []
    if (filter === 'all') return tasks
    return tasks.filter(t => t.status === filter)
  }, [tasks, filter])

  // Re-clamp selectedIndex when filtered tasks change
  useEffect(() => {
    setSelectedIndex(prev => Math.min(prev, Math.max(0, filteredTasks.length - 1)))
  }, [filteredTasks.length])

  // Counts for the filter tabs
  const counts = useMemo(() => {
    if (tasks === 'loading' || tasks === 'error') {
      return { all: 0, pending: 0, in_progress: 0, completed: 0 } as const
    }
    const all = tasks.length
    const pending = tasks.filter(t => t.status === 'pending').length
    const inProgress = tasks.filter(t => t.status === 'in_progress').length
    const completed = tasks.filter(t => t.status === 'completed').length
    return { all, pending, in_progress: inProgress, completed } as const
  }, [tasks])

  // Keyboard navigation
  useKeybindings(
    {
      'confirm:previous': () => setSelectedIndex(prev =>
        prev <= 0 ? filteredTasks.length - 1 : prev - 1,
      ),
      'confirm:next': () => setSelectedIndex(prev =>
        prev >= filteredTasks.length - 1 ? 0 : prev + 1,
      ),
      'confirm:yes': () => {
        if (filteredTasks[selectedIndex]) {
          setDetailTask(filteredTasks[selectedIndex]!)
        }
      },
    },
    { context: 'Confirmation', isActive: detailTask === null },
  )

  // Left arrow / Tab to toggle filter left
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (detailTask !== null) {
        // Detail mode: Esc or left goes back to list
        if (e.key === 'escape' || e.key === 'left') {
          e.preventDefault()
          setDetailTask(null)
        }
        return
      }
      // List mode
      if (e.key === 'left') {
        e.preventDefault()
        setFilter(prev => {
          const idx = FILTERS.indexOf(prev)
          return idx <= 0 ? FILTERS[FILTERS.length - 1]! : FILTERS[idx - 1]!
        })
        setSelectedIndex(0)
      }
      if (e.key === 'right') {
        e.preventDefault()
        setFilter(prev => {
          const idx = FILTERS.indexOf(prev)
          return idx >= FILTERS.length - 1 ? FILTERS[0]! : FILTERS[idx + 1]!
        })
        setSelectedIndex(0)
      }
      // 'x' to mark a pending/in-progress task as completed
      if (e.key === 'x') {
        const current = filteredTasks[selectedIndex]
        if (current && current.status !== 'completed') {
          e.preventDefault()
          // Optimistic: update local state immediately. The file write happens
          // via the tool, not here — this is just TUI convenience for the user
          // to signal completion. In practice the user would use TaskUpdate tool.
          // We just show the intent; actual persistence is tool-mediated.
          setTasks(prev => {
            if (prev === 'loading' || prev === 'error') return prev
            return prev.map(t =>
              t.id === current.id ? { ...t, status: 'completed' as const } : t,
            )
          })
        }
      }
    },
    [detailTask, filteredTasks, selectedIndex],
  )

  const handleCancel = useCallback(() => {
    onDone('File task list dismissed', { display: 'system' })
  }, [onDone])

  // Render filter tab bar
  const filterTabs = (
    <Box>
      {FILTERS.map(f => {
        const c = counts[f as keyof typeof counts] ?? 0
        const isActive = filter === f
        const label = f === 'all' ? 'All' : statusLabel(f as TaskStatus)
        return (
          <Text key={f} bold={isActive} inverse={isActive} dimColor={!isActive}>
            {' '}
            {label} ({c}){' '}
          </Text>
        )
      })}
    </Box>
  )

  // Actions shown in the input guide
  const actions = [
    <KeyboardShortcutHint key="upDown" shortcut="↑/↓" action="select" />,
    <KeyboardShortcutHint key="leftRight" shortcut="←/→" action="filter" />,
    <KeyboardShortcutHint key="enter" shortcut="Enter" action="view" />,
    <KeyboardShortcutHint key="esc" shortcut="Esc" action="close" />,
  ]

  function renderInputGuide(exitState: ExitState): ReactNode {
    if (exitState.pending) {
      return <Text>Press {exitState.keyName} again to exit</Text>
    }
    return <Byline>{actions}</Byline>
  }

  return (
    <Box flexDirection="column" tabIndex={0} autoFocus onKeyDown={handleKeyDown}>
      <Dialog
        title="File tasks"
        subtitle={filterTabs}
        onCancel={handleCancel}
        color="background"
        inputGuide={renderInputGuide}
      >
        {detailTask !== null ? (
          <TaskDetail
            task={detailTask}
            allTasks={
              tasks === 'loading' || tasks === 'error' ? [] : tasks
            }
            onBack={() => setDetailTask(null)}
          />
        ) : tasks === 'loading' ? (
          <Text dimColor>Loading tasks...</Text>
        ) : tasks === 'error' ? (
          <Box flexDirection="column">
            <Text color="red">Failed to load tasks</Text>
            <Text dimColor>Check .atlas/tasks/ directory permissions</Text>
          </Box>
        ) : filteredTasks.length === 0 ? (
          <Box flexDirection="column">
            <Text dimColor>
              {filter === 'all'
                ? 'No tasks yet. Use TaskCreate to add one.'
                : `No ${statusLabel(filter)} tasks.`}
            </Text>
          </Box>
        ) : (
          <Box flexDirection="column">
            {filteredTasks.map((task, i) => (
              <TaskLine
                key={task.id}
                task={task}
                isSelected={i === selectedIndex}
              />
            ))}
          </Box>
        )}
      </Dialog>
    </Box>
  )
}

// ─── Task line component ───────────────────────────────────────────────

interface TaskLineProps {
  task: Task
  isSelected: boolean
}

function TaskLine({ task, isSelected }: TaskLineProps): React.ReactNode {
  return (
    <Box>
      <Text bold={isSelected} inverse={isSelected}>
        {' '}
        <Text color={STATUS_COLOR[task.status]}>
          {STATUS_ICON[task.status]}
        </Text>{' '}
        <Text color={STATUS_COLOR[task.status]}>
          {statusLabel(task.status).padEnd(12)}
        </Text>
        #{task.id.padEnd(4)}
        {task.subject}
        {task.owner ? <Text dimColor> ({task.owner})</Text> : null}{' '}
      </Text>
    </Box>
  )
}

// ─── Task detail component ─────────────────────────────────────────────

interface TaskDetailProps {
  task: Task
  allTasks: Task[]
  onBack: () => void
}

function TaskDetail({ task, allTasks, onBack }: TaskDetailProps): React.ReactNode {
  // Resolve block/blockedBy task references by ID
  const blocking = allTasks.filter(t => task.blocks.includes(t.id))
  const blockedBy = allTasks.filter(t => task.blockedBy.includes(t.id))

  return (
    <Box flexDirection="column" onKeyDown={onBack}>
      <Box flexDirection="column" paddingX={1}>
        {/* Title line */}
        <Text bold>
          <Text color={STATUS_COLOR[task.status]}>
            {STATUS_ICON[task.status]}
          </Text>{' '}
          #{task.id} {task.subject}
        </Text>

        {/* Status badge */}
        <Text>
          Status:{' '}
          <Text color={STATUS_COLOR[task.status]} bold>
            {statusLabel(task.status)}
          </Text>
          {task.owner ? (
            <Text>
              {' '}· Owner: <Text bold>{task.owner}</Text>
            </Text>
          ) : null}
        </Text>

        {/* Description */}
        {task.description ? (
          <Box marginTop={1}>
            <Text dimColor>{task.description}</Text>
          </Box>
        ) : null}

        {/* Blocking */}
        {blocking.length > 0 ? (
          <Box flexDirection="column" marginTop={1}>
            <Text bold dimColor>
              Blocks:
            </Text>
            {blocking.map(b => (
              <Text key={b.id} dimColor>
                {'  '}#{b.id} {b.subject}{' '}
                <Text color={STATUS_COLOR[b.status]}>({statusLabel(b.status)})</Text>
              </Text>
            ))}
          </Box>
        ) : null}

        {/* Blocked by */}
        {blockedBy.length > 0 ? (
          <Box flexDirection="column" marginTop={1}>
            <Text bold dimColor>
              Blocked by:
            </Text>
            {blockedBy.map(b => (
              <Text key={b.id} dimColor>
                {'  '}#{b.id} {b.subject}{' '}
                <Text color={STATUS_COLOR[b.status]}>({statusLabel(b.status)})</Text>
              </Text>
            ))}
          </Box>
        ) : null}

        {/* Metadata */}
        {task.metadata && Object.keys(task.metadata).length > 0 ? (
          <Box flexDirection="column" marginTop={1}>
            <Text bold dimColor>
              Metadata:
            </Text>
            {Object.entries(task.metadata).map(([k, v]) => (
              <Text key={k} dimColor>
                {'  '}{k}: {String(v)}
              </Text>
            ))}
          </Box>
        ) : null}
      </Box>

      {/* Back hint */}
      <Box marginTop={1}>
        <Text dimColor>
          Press <Text bold>Esc</Text> or <Text bold>←</Text> to go back
        </Text>
      </Box>
    </Box>
  )
}

/**
 * Load tasks from the file system.
 */
async function loadTasks(): Promise<Task[] | 'error'> {
  try {
    const taskListId = getTaskListId()
    const result = await listTasks(taskListId)
    // Sort: in_progress first, then pending, then completed (newest first)
    return result.sort((a, b) => {
      const order = { in_progress: 0, pending: 1, completed: 2 } as const
      const aOrder = order[a.status]
      const bOrder = order[b.status]
      if (aOrder !== bOrder) return aOrder - bOrder
      // Within same status, sort by numeric ID descending
      return parseInt(b.id, 10) - parseInt(a.id, 10)
    })
  } catch {
    return 'error'
  }
}