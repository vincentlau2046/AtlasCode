import type { Command } from '../types/command.js'
import type { ContentBlockParam } from '../types/atlas.js'
import type { ToolUseContext } from '../Tool.js'

/**
 * force-snip: a builtin prompt command that triggers the SnipTool to
 * summarize/replace the conversation history. Only registered when the
 * HISTORY_SNIP feature flag is on.
 */
const command: Command = {
  type: 'prompt',
  name: 'force-snip',
  description: 'Force a snip of the conversation history (summarize older turns)',
  progressMessage: 'snipping conversation history',
  contentLength: 0,
  source: 'builtin',
  allowedTools: ['Snip'],
  disableNonInteractive: false,
  async getPromptForCommand(
    _args: string,
    _context: ToolUseContext,
  ): Promise<ContentBlockParam[]> {
    return [
      {
        type: 'text',
        text:
          'Snip the current conversation history: summarize the older turns into a ' +
          'compact summary and keep only the most recent turns verbatim. ' +
          'Use the Snip tool to run this.',
      },
    ]
  },
}

export default command
