import { memoizeWithLRU } from '../memoize.js'
import specs from '../../../kernel/shell/bash/specs/index.js'

import type { CommandSpec, Argument, Option } from '../../../kernel/shell/bash/types.js'

export type { CommandSpec, Argument, Option }


export async function loadFigSpec(
  command: string,
): Promise<CommandSpec | null> {
  if (!command || command.includes('/') || command.includes('\\')) return null
  if (command.includes('..')) return null
  if (command.startsWith('-') && command !== '-') return null

  try {
    const module = await import(`@withfig/autocomplete/build/${command}.js`)
    return module.default || module
  } catch {
    return null
  }
}
export const getCommandSpec = memoizeWithLRU(
  async (command: string): Promise<CommandSpec | null> => {
    const spec =
      specs.find(s => s.name === command) ||
      (await loadFigSpec(command)) ||
      null
    return spec
  },
  (command: string) => command,
)
