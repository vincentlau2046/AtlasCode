import { randomUUID } from 'crypto'
import type { HookEvent } from 'src/tui/entrypoints/agentSdkTypes.js'
import {
  queryEngineLoopStream,
  type EngineLoopStreamEvent,
} from 'src/tui/loopEvents'
import { buildAgentLoopParams } from 'src/tui/agentLoopDeps'
import type { ToolUseContext } from '../../Tool.js'
import { type Tool, toolMatchesName } from '../../Tool.js'
import { SYNTHETIC_OUTPUT_TOOL_NAME } from '../../tools/SyntheticOutputTool/SyntheticOutputTool.js'
import { ALL_AGENT_DISALLOWED_TOOLS } from '../../tools.js'
import { asAgentId } from '../../types/ids.js'
import type { Message } from '../../types/message.js'
import { createAbortController } from '../abortController.js'
import { createAttachmentMessage } from '../attachments.js'
import { createCombinedAbortSignal } from '../combinedAbortSignal.js'
import { logForDebugging } from '../debug.js'
import { errorMessage } from '../errors.js'
import type { HookResult } from '../hooks.js'
import { createUserMessage, handleMessageFromStream } from '../messages.js'
import { getDefaultFastModel } from '../model/model.js'
import { hasPermissionsToUseTool } from '../permissions/permissions.js'
import { getAgentTranscriptPath, getTranscriptPath } from '../sessionStorage.js'
import type { AgentHook } from '../settings/types.js'
import { jsonStringify } from '../slowOperations.js'
import { asSystemPrompt } from '../systemPromptType.js'
import {
  addArgumentsToPrompt,
  createStructuredOutputTool,
  hookResponseSchema,
  registerStructuredOutputEnforcement,
} from './hookHelpers.js'
import { clearSessionHooks } from './sessionHooks.js'

/**
 * Execute an agent-based hook using a multi-turn LLM query
 */
export async function execAgentHook(
  hook: AgentHook,
  hookName: string,
  hookEvent: HookEvent,
  jsonInput: string,
  signal: AbortSignal,
  toolUseContext: ToolUseContext,
  toolUseID: string | undefined,
  // Kept for signature stability with the other exec*Hook functions.
  // Was used by hook.prompt(messages) before the .transform() was removed
  // (CC-79) — the only consumer of that was ExitPlanModeV2Tool's
  // programmatic construction, since refactored into VerifyPlanExecutionTool.
  _messages: Message[],
  agentName?: string,
): Promise<HookResult> {
  const effectiveToolUseID = toolUseID || `hook-${randomUUID()}`

  // Get transcript path from context
  const transcriptPath = toolUseContext.agentId
    ? getAgentTranscriptPath(toolUseContext.agentId)
    : getTranscriptPath()
  const hookStartTime = Date.now()
  try {
    // Replace $ARGUMENTS with the JSON input
    const processedPrompt = addArgumentsToPrompt(hook.prompt, jsonInput)
    logForDebugging(
      `Hooks: Processing agent hook with prompt: ${processedPrompt}`,
    )

    // Create user message directly - no need for processUserInput which would
    // trigger UserPromptSubmit hooks and cause infinite recursion
    const userMessage = createUserMessage({ content: processedPrompt })
    const agentMessages = [userMessage]

    logForDebugging(
      `Hooks: Starting agent query with ${agentMessages.length} messages`,
    )

    // Setup timeout and combine with parent signal
    const hookTimeoutMs = hook.timeout ? hook.timeout * 1000 : 60000
    const hookAbortController = createAbortController()

    // Combine parent signal with timeout, and have it abort our controller
    const { signal: parentTimeoutSignal, cleanup: cleanupCombinedSignal } =
      createCombinedAbortSignal(signal, { timeoutMs: hookTimeoutMs })
    const onParentTimeout = () => hookAbortController.abort()
    parentTimeoutSignal.addEventListener('abort', onParentTimeout)

    // Combined signal is just our controller's signal now
    const combinedSignal = hookAbortController.signal

    try {
      // Create StructuredOutput tool with our schema
      const structuredOutputTool = createStructuredOutputTool()

      // Filter out any existing StructuredOutput tool to avoid duplicates with different schemas
      // (e.g., when parent context has a StructuredOutput tool from --json-schema flag)
      const filteredTools = toolUseContext.options.tools.filter(
        tool => !toolMatchesName(tool, SYNTHETIC_OUTPUT_TOOL_NAME),
      )

      // Use all available tools plus our structured output tool
      // Filter out disallowed agent tools to prevent stop hook agents from spawning subagents
      // or entering plan mode, and filter out duplicate StructuredOutput tools
      const tools: Tool[] = [
        ...filteredTools.filter(
          tool => !ALL_AGENT_DISALLOWED_TOOLS.has(tool.name),
        ),
        structuredOutputTool,
      ]

      const systemPrompt = asSystemPrompt([
        `You are verifying a stop condition in Atlas. Your task is to verify that the agent completed the given plan. The conversation transcript is available at: ${transcriptPath}\nYou can read this file to analyze the conversation history if needed.

Use the available tools to inspect the codebase and verify the condition.
Use as few steps as possible - be efficient and direct.

When done, return your result using the ${SYNTHETIC_OUTPUT_TOOL_NAME} tool with:
- ok: true if the condition is met
- ok: false with reason if the condition is not met`,
      ])

      const model = hook.model ?? getDefaultFastModel()
      const MAX_AGENT_TURNS = 50

      // Create unique agentId for this hook agent
      const hookAgentId = asAgentId(`hook-agent-${randomUUID()}`)

      // Create a modified toolUseContext for the agent
      const agentToolUseContext: ToolUseContext = {
        ...toolUseContext,
        agentId: hookAgentId,
        abortController: hookAbortController,
        options: {
          ...toolUseContext.options,
          tools,
          mainLoopModel: model,
          isNonInteractiveSession: true,
          thinkingConfig: { type: 'disabled' as const },
        },
        setInProgressToolUseIDs: () => {},
        getAppState() {
          const appState = toolUseContext.getAppState()
          // Add session rule to allow reading transcript file
          const existingSessionRules =
            appState.toolPermissionContext.alwaysAllowRules.session ?? []
          return {
            ...appState,
            toolPermissionContext: {
              ...appState.toolPermissionContext,
              mode: 'dontAsk' as const,
              alwaysAllowRules: {
                ...appState.toolPermissionContext.alwaysAllowRules,
                session: [...existingSessionRules, `Read(/${transcriptPath})`],
              },
            },
          }
        },
      }

      // Register a session-level stop hook to enforce structured output
      registerStructuredOutputEnforcement(
        toolUseContext.setAppState,
        hookAgentId,
      )

      let structuredOutputResult: { ok: boolean; reason?: string } | null = null
      let turnCount = 0
      let hitMaxTurns = false

      // Use the engine loop for multi-turn execution（W3-3c S8-agent 族
      // §8.74.18：orchestrator query 退役）。W-opt 残留守（H6 登记，复审
      // 勿当遗漏重提）：structured_output attachment 活流 → assistant
      // 消息 tool_use 块探测面（SyntheticOutput 工具名匹配；input = 旧
      // attachment.data 同源，StructuredOutput 工具 call 返回
      // { data, structured_output: input } 经 pipeline 映射，input 即载荷）；
      // per-token stream_event 活流不入 engine（§8.74.2 裁定同型）。
      const {
        deps: hookLoopDeps,
        args: hookLoopArgs,
      } = buildAgentLoopParams({
        messages: agentMessages,
        userContext: {},
        systemPrompt,
        systemContext: {},
        tools,
        canUseTool: hasPermissionsToUseTool,
        toolUseContext: agentToolUseContext,
        toolPermissionContext:
          agentToolUseContext.getAppState().toolPermissionContext,
        getAppState: () => agentToolUseContext.getAppState(),
        querySource: 'hook_agent',
        signal: hookAbortController.signal,
      })
      const hookStream = queryEngineLoopStream({
        deps: hookLoopDeps,
        args: hookLoopArgs,
      })
      let hookStreamDone = false
      let hookStep = await hookStream.next()
      while (!hookStreamDone && !hookStep.done) {
        const message = hookStep.value as EngineLoopStreamEvent

        // Process stream events to update response length in the spinner
        handleMessageFromStream(
          message,
          () => {}, // onMessage - we handle messages below
          newContent =>
            toolUseContext.setResponseLength(
              length => length + newContent.length,
            ),
          toolUseContext.setStreamMode ?? (() => {}),
          () => {}, // onStreamingToolUses - not needed for hooks
        )

        // Skip streaming events for further processing
        if (message.type === 'stream_request_start') {
          hookStep = await hookStream.next()
          continue
        }

        // Count assistant turns
        if (message.type === 'assistant') {
          turnCount++

          // Check if we've hit the turn limit
          if (turnCount >= MAX_AGENT_TURNS) {
            hitMaxTurns = true
            logForDebugging(
              `Hooks: Agent turn ${turnCount} hit max turns, aborting`,
            )
            hookAbortController.abort()
            hookStreamDone = true
            break
          }

          // Check for structured output in the assistant tool_use blocks
          // （旧 attachment 活流 → tool_use 块探测，W-opt 残留守见上头注）
          const content = (
            message as { message?: { content?: unknown } }
          ).message?.content
          if (Array.isArray(content)) {
            for (const block of content) {
              const toolUseBlock = block as {
                type?: string
                name?: string
                input?: unknown
              }
              if (
                toolUseBlock.type === 'tool_use' &&
                toolUseBlock.name === SYNTHETIC_OUTPUT_TOOL_NAME
              ) {
                const parsed = hookResponseSchema().safeParse(
                  toolUseBlock.input,
                )
                if (parsed.success) {
                  structuredOutputResult = parsed.data
                  logForDebugging(
                    `Hooks: Got structured output: ${jsonStringify(structuredOutputResult)}`,
                  )
                  // Got structured output, abort and exit
                  hookAbortController.abort()
                  hookStreamDone = true
                  break
                }
              }
            }
          }
        }
        hookStep = await hookStream.next()
      }

      parentTimeoutSignal.removeEventListener('abort', onParentTimeout)
      cleanupCombinedSignal()

      // Clean up the session hook we registered for this agent
      clearSessionHooks(toolUseContext.setAppState, hookAgentId)

      // Check if we got a result
      if (!structuredOutputResult) {
        // If we hit max turns, just log and return cancelled (no UI message)
        if (hitMaxTurns) {
          logForDebugging(
            `Hooks: Agent hook did not complete within ${MAX_AGENT_TURNS} turns`,
          )
          return {
            hook,
            outcome: 'cancelled',
          }
        }

        // For other cases (e.g., agent finished without calling structured output tool),
        // just log and return cancelled (don't show error to user)
        logForDebugging(`Hooks: Agent hook did not return structured output`)
        return {
          hook,
          outcome: 'cancelled',
        }
      }

      // Return result based on structured output
      if (!structuredOutputResult.ok) {
        logForDebugging(
          `Hooks: Agent hook condition was not met: ${structuredOutputResult.reason}`,
        )
        return {
          hook,
          outcome: 'blocking',
          blockingError: {
            blockingError: `Agent hook condition was not met: ${structuredOutputResult.reason}`,
            command: hook.prompt,
          },
        }
      }

      // Condition was met
      logForDebugging(`Hooks: Agent hook condition was met`)
      return {
        hook,
        outcome: 'success',
        message: createAttachmentMessage({
          type: 'hook_success',
          hookName,
          toolUseID: effectiveToolUseID,
          hookEvent,
          content: '',
        }),
      }
    } catch (error) {
      parentTimeoutSignal.removeEventListener('abort', onParentTimeout)
      cleanupCombinedSignal()

      if (combinedSignal.aborted) {
        return {
          hook,
          outcome: 'cancelled',
        }
      }
      throw error
    }
  } catch (error) {
    const errorMsg = errorMessage(error)
    logForDebugging(`Hooks: Agent hook error: ${errorMsg}`)
    return {
      hook,
      outcome: 'non_blocking_error',
      message: createAttachmentMessage({
        type: 'hook_non_blocking_error',
        hookName,
        toolUseID: effectiveToolUseID,
        hookEvent,
        stderr: `Error executing agent hook: ${errorMsg}`,
        stdout: '',
        exitCode: 1,
      }),
    }
  }
}
