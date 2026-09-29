/* eslint-disable custom-rules/no-process-exit -- CLI subcommand handler intentionally exits */

import { performLogout } from '../../commands/logout/logout.js'
import { getAtlasApiKeyWithSource, getAuthTokenSource } from '../../utils/auth.js'
import { isRunningOnHomespace } from '../../utils/envUtils.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import {
  buildAccountProperties,
  buildAPIProviderProperties,
} from '../../utils/status.js'

// de-ANT: the browser Anthropic-account OAuth flow (installOAuthTokens) and
// the refresh-token env exchange path were removed with the claude.ai
// subscription chain. This build authenticates via the gateway token
// (OPENAI_AUTH_TOKEN), OPENAI_API_KEY, or apiKeyHelper.

export async function authLogin({
  email,
  sso,
  console: useConsole,
  claudeai,
}: {
  email?: string
  sso?: boolean
  console?: boolean
  claudeai?: boolean
}): Promise<void> {
  if (useConsole && claudeai) {
    process.stderr.write(
      'Error: --console and --claudeai cannot be used together.\n',
    )
    process.exit(1)
  }

  // de-ANT: the browser Anthropic-account OAuth flow and the refresh-token
  // env exchange path are removed. This build authenticates via the gateway
  // token (OPENAI_AUTH_TOKEN), OPENAI_API_KEY, or apiKeyHelper — there is no
  // browser account login.
  void email
  void sso
  process.stderr.write(
    'This build does not support browser account login. Authenticate via the ' +
      'gateway token (OPENAI_AUTH_TOKEN), OPENAI_API_KEY, or apiKeyHelper.\n',
  )
  process.exit(1)
}

export async function authStatus(opts: {
  json?: boolean
  text?: boolean
}): Promise<void> {
  const { source: authTokenSource, hasToken } = getAuthTokenSource()
  const { source: apiKeySource } = getAtlasApiKeyWithSource()
  const hasApiKeyEnvVar =
    !!(process.env.OPENAI_API_KEY) && !isRunningOnHomespace()
  const using3P = false
  const loggedIn =
    hasToken || apiKeySource !== 'none' || hasApiKeyEnvVar || using3P

  // Determine auth method (3P provider removed — always first-party)
  let authMethod: string = 'none'
  if (authTokenSource === 'OPENAI_AUTH_TOKEN') {
    authMethod = 'openai_token'
  } else if (authTokenSource === 'apiKeyHelper') {
    authMethod = 'api_key_helper'
  } else if (authTokenSource !== 'none') {
    authMethod = 'oauth_token'
  } else if (apiKeySource === 'OPENAI_API_KEY' || hasApiKeyEnvVar) {
    authMethod = 'api_key'
  } else if (apiKeySource === '/login managed key') {
    authMethod = 'api_key'
  }

  if (opts.text) {
    const properties = [
      ...buildAccountProperties(),
      ...buildAPIProviderProperties(),
    ]
    let hasAuthProperty = false
    for (const prop of properties) {
      const value =
        typeof prop.value === 'string'
          ? prop.value
          : Array.isArray(prop.value)
            ? prop.value.join(', ')
            : null
      if (value === null || value === 'none') {
        continue
      }
      hasAuthProperty = true
      if (prop.label) {
        process.stdout.write(`${prop.label}: ${value}\n`)
      } else {
        process.stdout.write(`${value}\n`)
      }
    }
    if (!hasAuthProperty && hasApiKeyEnvVar) {
      process.stdout.write('API key: OPENAI_API_KEY\n')
    }
    if (!loggedIn) {
      process.stdout.write(
        'Not logged in. Run claude auth login to authenticate.\n',
      )
    }
  } else {
    const apiProvider = 'firstParty'
    const resolvedApiKeySource =
      apiKeySource !== 'none'
        ? apiKeySource
        : hasApiKeyEnvVar
          ? 'OPENAI_API_KEY'
          : null
    const output: Record<string, string | boolean | null> = {
      loggedIn,
      authMethod,
      apiProvider,
    }
    if (resolvedApiKeySource) {
      output.apiKeySource = resolvedApiKeySource
    }

    process.stdout.write(jsonStringify(output, null, 2) + '\n')
  }
  process.exit(loggedIn ? 0 : 1)
}

export async function authLogout(): Promise<void> {
  try {
    await performLogout({ clearOnboarding: false })
  } catch {
    process.stderr.write('Failed to log out.\n')
    process.exit(1)
  }
  process.stdout.write('Successfully logged out from your Anthropic account.\n')
  process.exit(0)
}
