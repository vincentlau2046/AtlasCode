/**
 * engine/tools/bash — BashTool 本体（Bash 本体纵切子波 §8.54 S-B5，
 * C 桶 ① 子波 2）。
 *
 * 旧仓来源（a8af45b）: src/tools/BashTool/BashTool.ts 251L 逐字随迁
 * （JSON schema 7 字段 / BgTask 模块态 + getBackgroundTask /
 * listBackgroundTasks / call 同步 spawn + timeout clamp + run_in_background
 * 真 detached spawn / mapToolResultToToolResultBlockParam 分支）。消费方 =
 * `bash/` + `tools/` 双门面导出 + 组合根 baseTools 注入（D 波 cli.ts 单入口，
 * 注入位零改动）。
 *
 * delta 登记（旧 buildTool(zod) → 新 shared Tool 契约 + 两裁，函数体逐字；
 * 复审勿当遗漏重提）：
 *  ① 旧 buildTool(zod inputSchema) → 新 shared Tool 契约：inputSchema = 纯
 *    JSON schema 对象（BASH_TOOL_INPUT_SCHEMA，AgentTool 先例；7 字段与
 *    bashToolInput.ts duck 型逐字段对齐——duck 型 = 类型位单一事实源，
 *    类型位消费方 8 个（既有 6 + 本波新增 2，详见 bashToolInput 头注
 *    S-B6 订正），§8.54 ④）。
 *  ② 旧 zod `.int().positive()` 约束不进 JSON schema（ToolInputJSONSchema
 *    宽骨架面）——行为 delta 登记：类型面不再约束 int/positive，运行时
 *    timeout clamp（Math.min 封顶）保留（P-B4 探针锚点）；嵌套
 *    _simulatedSedEdit 的 required（filePath 必填）随转写保留（旧 zod
 *    z.object 内必填逐字对齐，duck 型 filePath 非可选，S-B6 MINOR-3 补
 *    登记）。
 *  ③ 旧 prompt() 成员（与 description 重复）不在新 Tool 契约 → 裁（
 *    description 唯一 prompt 面，getSimplePrompt 同源）。
 *  ④ 旧 buildTool TOOL_DEFAULTS 4 成员对象化显式（isConcurrencySafe false /
 *    isDestructive false / toAutoClassifierInput ''；userFacingName 旧
 *    **生效值 = name**（buildTool 返回体 `() => def.name` 夹在
 *    TOOL_DEFAULTS 与 def 之间覆盖默认 ''，旧 def 无覆写——旧仓头注
 *    「userFacingName → name」与生效链一致）→ 新 = BASH_TOOL_NAME
 *    （toolNames 单一事实源，值逐字同 'Bash'；S-B6 MAJOR-1 订正：初版
 *    误读生效链取 TOOL_DEFAULTS 默认 '' 且测试锁死，订正为恢复生效值）
 *  ⑤ checkPermissions：旧 = buildTool 默认 `{ allow, updatedInput }`（委托
 *    通用权限系统，§8.43 裁定① 旧仓事实）；**本波裁定** = 一线接线
 *    bashToolHasPermission（新核已鸭子化，签名逐字对齐；abort 重抛语义由
 *    gate 侧 1c catch 继承，工具面零自有 try/catch = 本仓首个非-passthrough
 *    工具面实现，激活 S-T 波登记的 1c 分发面；P-B2 探针锚点）。
 *  ⑥ renderToolUseMessage = () => null（TUI 残留守：UI.tsx /
 *    BashToolResultMessage.tsx 域外，D 波/TUI 波）。
 *  ⑦ **D-7**（§8.54 ⑥）：call 面 context duck = BashToolUseContext
 *    （bashToolInput.ts +1 成员 options.cwd）；旧 `context && context.options &&`
 *    三判 any 守卫 → duck 可选链（等价语义，零行为）。
 *  ⑧ 旧 `as any` ×2（mapToolResult 返回 + BashProgress）→ shared 宽骨架：
 *    ToolResultBlockParam / ToolProgressData（unknown，cast 收窄登记）。
 *  ⑨ isReadOnly 消费同域 ./bashReadOnly（S-T2b 抽离单一事实源，前向接缝
 *    本切片闭合）；BASH_TOOL_NAME = ../toolNames（D-4 不落 toolName.ts）。
 *  ⑩ call 5 参声明 → 2 参声明（Tool 契约允少参；旧 canUseTool /
 *    _parentMessage / onProgress 旧体不消费，裁，零行为）；旧 `export
 *    type BashProgress = any` 死类型（零消费者，S-B6 NOTE-1 登记）随之
 *    不随迁。
 *  ⑪ getAtlasTempDir = permissions 域门面（S-B4 同 import 行先例）；
 *    logForDebugging = shared（C1 统一裁定）。
 *
 * 残留守（防「以为已全」）：BgTask 模块态 map 保模块内（经门面转出读面）；
 * 真 ToolUseContext（全字段面）/ UI 渲染面 = 残留守（D 波/TUI 波）。
 */
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import type {
  Tool,
  ToolInputJSONSchema,
  ToolResult,
  ToolResultBlockParam,
} from '../../../shared'
import { logForDebugging } from '../../../shared'
import { getAtlasTempDir } from '../../../permissions'
import {
  getSimplePrompt,
  getDefaultTimeoutMs,
  getMaxTimeoutMs,
} from './bashPrompt'
import { BASH_TOOL_NAME } from '../toolNames'
import { isReadOnlyCommand } from './bashReadOnly'
import { bashToolHasPermission } from './bashPermissions'
import type { BashToolInput, BashToolUseContext } from './bashToolInput'

/**
 * 输入 JSON schema（旧仓 zod inputSchema 逐字段转写，§8.54 ①/②；与
 * bashToolInput.ts duck 型单一事实源逐字段对齐）。
 */
export const BASH_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    command: {
      type: 'string',
      description: 'The bash command to execute.',
    },
    description: {
      type: 'string',
      description:
        'Clear, concise description of what this command does (shown in the UI).',
    },
    timeout_ms: {
      type: 'number',
      description:
        'Timeout in milliseconds. The executor applies its configured default and cap, and kills the command on expiry.',
    },
    timeout: {
      type: 'number',
      description:
        'Timeout in milliseconds (alias accepted by the shared tool-execution layer).',
    },
    _simulatedSedEdit: {
      type: 'object',
      properties: {
        filePath: { type: 'string' },
        before: { type: 'string' },
        after: { type: 'string' },
      },
      // 嵌套必填（旧 zod z.object 内 filePath 必填逐字对齐，duck 型
      // filePath: string 非可选，S-B6 MINOR-3 补转写）
      required: ['filePath'],
    },
    run_in_background: {
      type: 'boolean',
      description:
        'Run in the background and return a task id immediately (collect with TaskOutput, stop with TaskStop).',
    },
    dangerouslyDisableSandbox: {
      type: 'boolean',
      description:
        'Run the command outside the sandbox (use only when sandbox restrictions caused the failure).',
    },
  },
  required: ['command'],
}

export type Out = {
  stdout: string
  stderr: string
  exitCode: number | null
  interrupted: boolean
  isImage?: boolean
  returnCodeInterpretation?: string | null
  noOutputExpected?: boolean
  backgroundTaskId?: string | null
}

export type BgTask = {
  id: string
  pid: number | null
  command: string
  outputFile: string
  done: boolean
  exitCode: number | null
}

const backgroundTasks = new Map<string, BgTask>()

export function getBackgroundTask(taskId: string): BgTask | undefined {
  return backgroundTasks.get(taskId)
}

export function listBackgroundTasks(): BgTask[] {
  return [...backgroundTasks.values()]
}

export const BashTool: Tool = {
  name: BASH_TOOL_NAME,
  inputSchema: BASH_TOOL_INPUT_SCHEMA,
  inputJSONSchema: BASH_TOOL_INPUT_SCHEMA,
  maxResultSizeChars: 20_000,
  searchHint: 'run shell commands via bash',
  isEnabled: () => true,
  // 旧 buildTool TOOL_DEFAULTS 4 成员（delta ④，逐值）
  isConcurrencySafe: () => false,
  isDestructive: () => false,
  toAutoClassifierInput: () => '',
  // delta ④（S-B6 订正）：旧生效值 = buildTool 返回体 `userFacingName:
  // () => def.name`（TOOL_DEFAULTS 与 def 之间，覆盖默认 ''；旧 def 无
  // 覆写）= 'Bash'；新 = BASH_TOOL_NAME（toolNames 单一事实源，值逐字同）
  userFacingName: () => BASH_TOOL_NAME,
  isReadOnly: (input: unknown) =>
    isReadOnlyCommand((input as BashToolInput).command),
  // delta ⑤：一线接线 bashToolHasPermission（首个非-passthrough 工具面；
  // 零自有 try/catch，abort 重抛由 gate 1c catch 继承）
  checkPermissions: (input: unknown, context: unknown) =>
    bashToolHasPermission(
      input as BashToolInput,
      context as BashToolUseContext,
    ),
  description: async () => getSimplePrompt(),
  // TUI 残留守（delta ⑥）
  renderToolUseMessage: () => null,
  mapToolResultToToolResultBlockParam(
    content: unknown,
    toolUseID: string,
  ): ToolResultBlockParam {
    const c = content as unknown as Out
    const parts: string[] = []
    if (c) {
      const codeText =
        c.exitCode === null || c.exitCode === undefined
          ? 'n/a'
          : String(c.exitCode)
      parts.push('[exit code: ' + codeText + ']')
      if (c.stdout) parts.push(c.stdout)
      if (c.stderr && c.stderr.trim() !== '') parts.push(c.stderr)
      if (c.backgroundTaskId)
        parts.push('[running in background, task id: ' + c.backgroundTaskId + ']')
      if (c.interrupted) parts.push('[command was interrupted or timed out]')
    }
    return {
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: parts.filter(x => x !== '').join(String.fromCharCode(10)),
    }
  },
  async call(args: unknown, context: unknown): Promise<ToolResult<Out>> {
    const input = (args ?? {}) as BashToolInput
    const ctx = (context ?? {}) as BashToolUseContext
    logForDebugging('[BASH] executing: ' + input.command)
    // delta ⑦（D-7）：duck 可选链（旧 any 三判守卫等价语义）
    const cwd = ctx.options?.cwd ?? process.cwd()
    const timeoutMs = Math.min(
      input.timeout_ms ?? input.timeout ?? getDefaultTimeoutMs(),
      getMaxTimeoutMs(),
    )

    if (input.run_in_background) {
      const id =
        'task-' +
        Date.now().toString(36) +
        Math.random().toString(36).slice(2, 8)
      const outputFile = path.join(getAtlasTempDir(), 'bash-' + id + '.log')
      try {
        fs.mkdirSync(path.dirname(outputFile), { recursive: true })
      } catch {}
      const outFd = fs.openSync(outputFile, 'w')
      const child = spawn('bash', ['-c', input.command], {
        cwd: cwd,
        detached: true,
        stdio: ['ignore', outFd, outFd],
        env: process.env,
      })
      const task: BgTask = {
        id: id,
        pid: child.pid ?? null,
        command: input.command,
        outputFile: outputFile,
        done: false,
        exitCode: null,
      }
      backgroundTasks.set(id, task)
      child.on('close', (code: number | null, signal: string | null) => {
        task.done = true
        task.exitCode = code !== null ? code : (signal ? 1 : 0)
        try {
          fs.closeSync(outFd)
        } catch {}
        logForDebugging(
          '[BASH] background task ' + id + ' finished, exit=' + task.exitCode,
        )
      })
      child.on('error', (err: Error) => {
        task.done = true
        task.exitCode = 127
        try {
          fs.closeSync(outFd)
        } catch {}
        logForDebugging(
          '[BASH] background task ' + id + ' error: ' + err.message,
        )
      })
      child.unref()
      return {
        data: {
          stdout: '',
          stderr: '',
          exitCode: null,
          interrupted: false,
          backgroundTaskId: id,
        },
      }
    }

    return await new Promise<ToolResult<Out>>(resolve => {
      const child = spawn('bash', ['-c', input.command], {
        cwd: cwd,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      let settled = false

      child.stdout.on('data', (d: Buffer) => {
        stdout += d.toString()
      })
      child.stderr.on('data', (d: Buffer) => {
        stderr += d.toString()
      })

      const timer = setTimeout(() => {
        child.kill('SIGTERM')
      }, timeoutMs)

      child.on('close', (code: number | null, signal: string | null) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        const interrupted = signal !== null || (code !== null && code !== 0)
        logForDebugging(
          '[BASH] finished, exit=' + (code !== null ? String(code) : 'signal'),
        )
        resolve({
          data: {
            stdout: stdout,
            stderr: stderr,
            exitCode: code !== null ? code : (signal ? 1 : 0),
            interrupted: interrupted,
            noOutputExpected: false,
          },
        })
      })
      child.on('error', (err: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        logForDebugging('[BASH] spawn error: ' + err.message)
        resolve({
          data: {
            stdout: '',
            stderr: 'Error: ' + err.message,
            exitCode: 127,
            interrupted: false,
          },
        })
      })
    })
  },
}
