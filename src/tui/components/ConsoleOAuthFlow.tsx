import React from 'react'
import { useKeybinding } from '../keybindings/useKeybinding.js'
import { Box, Text } from '../ink.js'

type Props = {
  onDone(): void
  startingMessage?: string
  mode?: 'login' | 'setup-token'
  forceLoginMethod?: 'subscription' | 'console'
}

/**
 * de-ANT: the browser Anthropic-account OAuth login flow was removed. This
 * build authenticates via the gateway token (OPENAI_AUTH_TOKEN), OPENAI_API_KEY,
 * or apiKeyHelper — there is no browser account login. The component is kept
 * with the same props signature
 * so its callers (/login, onboarding, teleport-error, CLI util) compile
 * unchanged; it now renders an explanatory message and advances the caller
 * via onDone() on Enter.
 */
export function ConsoleOAuthFlow({
  onDone,
  startingMessage,
  mode,
  forceLoginMethod,
}: Props): React.ReactNode {
  // `mode` / `forceLoginMethod` / `startingMessage` are retained for API
  // compatibility with existing callers; the browser flow they parameterized
  // no longer exists.
  void mode
  void forceLoginMethod

  useKeybinding('confirm:yes', () => {
    onDone()
  })

  return (
    <Box flexDirection="column" gap={1}>
      <Text color="warning">
        {startingMessage ??
          'Browser account login is not available in this build.'}
      </Text>
      <Text>
        Authenticate via the gateway token (OPENAI_AUTH_TOKEN),
        OPENAI_API_KEY, or apiKeyHelper.
      </Text>
      <Text color="permission">
        Press <Text bold>Enter</Text> to continue.
      </Text>
    </Box>
  )
}
