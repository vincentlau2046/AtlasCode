import * as React from 'react'
import type { LocalJSXCommandContext } from '../../commands.js'
import { FileTaskDialog } from '../../components/tasks/FileTaskDialog.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'

export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: LocalJSXCommandContext,
): Promise<React.ReactNode> {
  return <FileTaskDialog onDone={onDone} />
}