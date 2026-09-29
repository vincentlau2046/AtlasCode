import { modelProvider, buildOpenAIParams, toResponseFormat } from 'src/modelprovider'
import type { Message } from '../../types/message.js'
import { logForDebugging } from '../../utils/debug.js'
import { errorMessage } from '../../utils/errors.js'
import { safeParseJSON } from '../../utils/json.js'
import { createUserMessage, extractTextContent } from '../../utils/messages.js'
import { extractConversationText } from '../../utils/sessionTitle.js'
import { asSystemPrompt } from '../../utils/systemPromptType.js'

export async function generateSessionName(
  messages: Message[],
  signal: AbortSignal,
): Promise<string | null> {
  const conversationText = extractConversationText(messages)
  if (!conversationText) {
    return null
  }

  try {
    const messages = [createUserMessage({ content: conversationText })]
      const thinkingConfig = { type: 'disabled' as const }
      const opts = {
        querySource: 'rename_generate_name',
        agents: [],
        isNonInteractiveSession: false,
        hasAppendSystemPrompt: false,
        mcpTools: [],
      }
      const params = await buildOpenAIParams(
        { messages, systemPrompt: asSystemPrompt([
          'Generate a short kebab-case name (2-4 words) that captures the main topic of this conversation. Use lowercase words separated by hyphens. Examples: "fix-login-bug", "add-auth-feature", "refactor-api-client", "debug-test-failures". Return JSON with a "name" field.',
        ]), thinkingConfig, tools: [], options: opts },
        'fast',
      )
      const outputFormat = {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
          additionalProperties: false,
        },
      }
      const responseFormat = toResponseFormat(outputFormat)
      const openaiParams = responseFormat ? { ...params, response_format: responseFormat } : params
      const result = await modelProvider.chat({
        role: 'fast',
        signal,
        openaiParams,
        options: {},
      })

      const content = extractTextContent(result.message.content)

    const response = safeParseJSON(content)
    if (
      response &&
      typeof response === 'object' &&
      'name' in response &&
      typeof (response as { name: unknown }).name === 'string'
    ) {
      return (response as { name: string }).name
    }
    return null
  } catch (error) {
    // Haiku timeout/rate-limit/network are expected operational failures —
    // logForDebugging, not logError. Called automatically on every 3rd bridge
    // message (initReplBridge.ts), so errors here would flood the error file.
    logForDebugging(`generateSessionName failed: ${errorMessage(error)}`, {
      level: 'error',
    })
    return null
  }
}
