/**
 * CLI arg 解析面（S-C2，§8.71.1.4）— 旧仓 main.tsx run() L800-3726 commander 面
 * 逐字随迁 + 裁登记。
 *
 * 随迁：program 构造（option 面 L883-915 + 尾段条件选项 L3067-3105 + print 模式
 * 子命令跳过 L3108-3123 + 入域子命令子集注册〔mcp 族 / auto-mode 族〕）。
 *
 * 裁登记（不随迁 / 不注册，复审勿当遗漏重提）：
 *   域外裁（归属波）：
 *   - --advisor（canUserConfigureAdvisor advisor 面域外）/ --teleport·--remote
 *     （remote 族波）/ --remote-control·--rc（BRIDGE_MODE 桥面 [ATLAS-HOLD]）
 *   - --sdk-url 消费支（CCR 域外；选项注册保留为惰性数据，消费裁）
 *   - 子命令域外子集（不注册）：server / ssh / open（remote 族波）·
 *     plugin·marketplace 全族（新仓无 plugin 域，plugin 域波）· agents
 *     （agent 定义 loader 缺席，残留守）· auth 全族（订阅车道裁 [ATLAS-HOLD]，
 *     新仓 auth 车道 = OpenAI 静态键，无账号面）· doctor / update / install
 *     （版本管理方案波）· setup-token（订阅裁）· mcp add-from-claude-desktop
 *     （无 Desktop 面）· mcp xaa-idp（isXaaEnabled XAA 面域外）· bg / up /
 *     rollback（旧仓 de-ANT no-op 存根不迁，H6 防空洞）
 *   preAction hook 裁（面未落盘，前向接缝）：
 *   - ensureMdmSettingsLoaded / ensureKeychainPrefetchCompleted（MDM/keychain
 *     面残留守）/ init()（组合根启动 init = S-C3/S-C4）/ initSinks（logEvent
 *     死面，旧仓 879 点清核）/ runMigrations（全局 config store 缺席，配置域
 *     前向接缝）/ setInlinePlugins·clearPluginCache（新仓无 plugin 域，
 *     --plugin-dir 选项保留为惰性数据）/ loadPolicyLimits（远程企业设置域外）/
 *     UPLOAD_USER_SETTINGS（settingsSync 服务缺席；feature 门保留，消费裁）
 *   delta 登记：
 *   - 旧 MACRO.VERSION（构建期注入）→ 本地 CLI_VERSION 占位；D 波
 *     atlascode/identity.ts 构建期 --define 注入点（现 A 波骨架占位）落盘后接管。
 *   - 旧 feature('UDS_INBOX') 门 → 新仓 remote 域 isUdsInboxEnabled()（UDS inbox
 *     env opt-in 默认 OFF，语义保真；remote 根门面消费，swarm/mcp/remote 同型先例）。
 *   - --bare 描述句裁：「OAuth and keychain are never read」（新仓无 keychain 面）+
 *     「3P providers (Bedrock/Vertex/Foundry) use their own credentials.」
 *     （新仓 modelprovider = OpenAI 静态键车道，3P 异构已清）。
 *   - auto-mode 注册：旧 getAutoModeEnabledStateIfCached() 缓存态短路支裁（新仓
 *     缺席；feature('TRANSCRIPT_CLASSIFIER') 门保留，ON_BY_DEFAULT 恒开）。
 *   主面 action（H6 防空洞：明示接缝，exit 1，不伪装能力不静默通过）：
 *   - --init-only = S-C4 setup.ts 已落盘（cli/setup.ts runCliSetup，S-C2 前向接缝核销；旧 main.tsx「Run Setup and SessionStart hooks, then exit」语义）/ -p·--print = S-C4 commit 6 落盘（buildHeadlessOptions 映射 + dispatch.getInputPrompt stdin 3s peek 面 + 旧 main.tsx L1500-1535 格式兼容校验 3 支 + print.runHeadless S-C3 本体，惰性动态 import）/
 *     交互入口 = 壳波 #152 前向接缝（launchRepl/showSetupScreens 归壳波，明示接缝 exit 1）。
 *   - 支消解登记：旧 --no-session-persistence「仅 print 模式可用」错误支
 *     （旧 main.tsx L1533，交互态校验）= 消解（交互入口 = 壳波前向接缝，
 *     非 print 支无落盘面；print 支双面消费：bootstrap ⑥ 族 kill-switch +
 *     HeadlessOptions.disablePersistence transcript 持久化裁支）/
 *     旧 --include-partial-messages 校验支 = 裁（字段不入 HeadlessOptions
 *     契约，选项注册惰性数据）。
 *   - mcp 族 6 接缝（serve/add/remove/list/get/add-json）= S-C4 commit 4 落盘
 *     （cli/handlers/mcp.ts handler 面 + cli/mcpConfigWrite.ts 写回面；本文件
 *     惰性动态 import + type-only 选项面，handler 模块不 eager 加载）/
 *     auto-mode 族 3 接缝（defaults/config/critique）= S-C4 commit 5 落盘
 *     （cli/handlers/autoMode.ts + engine/config getAutoModeConfig；sC4SeamAction
 *     随最后一族核销整删，本文件全 9 接缝 0 残留守）。
 */
import {
  Command as CommanderCommand,
  InvalidArgumentError,
  Option,
} from '@commander-js/extra-typings'
import { setSessionPersistenceDisabled } from '../bootstrap'
import { PERMISSION_MODES } from '../permissions'
import { feature, isEnvTruthy } from '../shared'
import { isUdsInboxEnabled } from '../remote'
import type { AutoModeCritiqueOptions } from './handlers/autoMode'
import type {
  McpAddJsonOptions,
  McpAddOptions,
  McpRemoveOptions,
  McpServeOptions,
} from './handlers/mcp'
import type { HeadlessOptions } from './print'
import { runCliSetup } from './setup'

/**
 * 版本占位（旧仓 MACRO.VERSION 构建期注入 → 本地占位；D 波 identity 波接管，
 * delta 登记见头注）。
 */
const CLI_VERSION = '0.0.0'

/**
 * 本地逐字（旧仓 run() 内 createSortedHelpConfig L806-817 逐字）：
 * commander 支持 compareOptions 运行时面但 @commander-js/extra-typings 类型缺，
 * Object.assign 补入。
 */
function createSortedHelpConfig(): {
  sortSubcommands: true
  sortOptions: true
} {
  const getOptionSortKey = (opt: Option): string =>
    opt.long?.replace(/^--/, '') ?? opt.short?.replace(/^-/, '') ?? ''
  return Object.assign(
    {
      sortSubcommands: true,
      sortOptions: true,
    } as const,
    {
      compareOptions: (a: Option, b: Option) =>
        getOptionSortKey(a).localeCompare(getOptionSortKey(b)),
    },
  )
}

/**
 * commander options → HeadlessOptions 映射（S-C4 commit 6；print.ts 定契约、
 * dispatch 侧做映射——print.ts L147 头注同裁定）。测试面导出（cli-sc4.test.ts
 * 映射断言）。
 *
 * 字段映射（旧 main.tsx L2405-2436 选项块 → S-C3 HeadlessOptions 契约）：
 *   - tools → baseTools（commander key 'tools' = 基础工具池选项面）
 *   - addDir → addDirs（commander key 'addDir' vs 契约 'addDirs'）
 *   - permissionPromptTool → permissionPromptToolName
 *   - sessionPersistence === false → disablePersistence（headless transcript
 *     持久化裁支；与 bootstrap ⑥ 族 kill-switch 同 flag 双面消费）
 * 裁登记（选项注册惰性数据、字段不入契约，见头注主面段）：jsonSchema /
 * thinking / maxThinkingTokens / taskBudget / systemPrompt /
 * appendSystemPrompt / fallbackModel / includePartialMessages / forkSession /
 * enableAuthStatus / betas / workload / file / chrome / agents /
 * settingSources。
 */
export function buildHeadlessOptions(
  options: Record<string, unknown>,
): HeadlessOptions {
  return {
    continue: options.continue === true ? true : undefined,
    resume: options.resume as HeadlessOptions['resume'],
    resumeSessionAt: options.resumeSessionAt as HeadlessOptions['resumeSessionAt'],
    rewindFiles: options.rewindFiles as HeadlessOptions['rewindFiles'],
    verbose: options.verbose === true ? true : undefined,
    outputFormat: options.outputFormat as HeadlessOptions['outputFormat'],
    allowedTools: options.allowedTools as HeadlessOptions['allowedTools'],
    disallowedTools: options.disallowedTools as HeadlessOptions['disallowedTools'],
    baseTools: options.tools as HeadlessOptions['baseTools'],
    permissionMode: options.permissionMode as HeadlessOptions['permissionMode'],
    permissionPromptToolName: options
      .permissionPromptTool as HeadlessOptions['permissionPromptToolName'],
    maxTurns: options.maxTurns as HeadlessOptions['maxTurns'],
    model: options.model as HeadlessOptions['model'],
    dangerouslySkipPermissions:
      options.dangerouslySkipPermissions === true ? true : undefined,
    addDirs: options.addDir as HeadlessOptions['addDirs'],
    sdkUrl: options.sdkUrl as HeadlessOptions['sdkUrl'],
    replayUserMessages:
      options.replayUserMessages === true ? true : undefined,
    agent: options.agent as HeadlessOptions['agent'],
    disablePersistence:
      options.sessionPersistence === false ? true : undefined,
  }
}

/** 主面 action（裁登记见头注；options 面 = commander 解析后全量）。 */
async function mainActionSeam(
  prompt: string | undefined,
  options: Record<string, unknown>,
): Promise<void> {
  if (options.initOnly) {
    // --init-only（S-C4 回填，S-C2 前向接缝核销）：跑 setup 面后退出（旧
    // main.tsx「Run Setup and SessionStart hooks, then exit」语义，不进
    // query 环）。options 映射 = setup.ts CliSetupOptions（worktreePRNumber
    // 无选项面恒 undefined，setup.ts 头注登记）。
    await runCliSetup({
      permissionMode: options.permissionMode as string | undefined,
      allowDangerouslySkipPermissions:
        options.allowDangerouslySkipPermissions === true,
      worktreeEnabled: options.worktree !== undefined,
      worktreeName:
        typeof options.worktree === 'string' ? options.worktree : undefined,
      tmuxEnabled: options.tmux !== undefined,
      customSessionId: options.sessionId as string | undefined,
      messagingSocketPath: options.messagingSocketPath as string | undefined,
      bare: options.bare === true,
    })
    return
  } else if (options.print) {
    // --no-session-persistence（commander --no- 负位选项：present 时
    // options.sessionPersistence === false，缺省 undefined）→ bootstrap ⑥ 族
    // 持久化 kill-switch（S-C4；旧仓 main.tsx 调用点同语义，--print 面生效；
    // 消费点 = engine/session project.ts shouldSkipPersistence 回填支）。
    if (options.sessionPersistence === false) {
      setSessionPersistenceDisabled(true)
    }
    // S-C4 commit 6：-p/--print → runHeadless 真接线（S-C3 前向接缝核销；
    // 旧 main.tsx L1543 getInputPrompt + L2402 runHeadless import + L2405
    // 选项块 → 新 buildHeadlessOptions 契约映射）
    const inputFormat = (options.inputFormat ?? 'text') as
      | 'text'
      | 'stream-json'
    const outputFormat = options.outputFormat as HeadlessOptions['outputFormat']
    // 旧 main.tsx L1500-1535 格式兼容校验支（S-C4 回填；commander choices
    // 已保值域，仅保留跨字段约束 3 支——旧「非法 input format」支消解于
    // choices 面）
    if (inputFormat === 'stream-json' && outputFormat !== 'stream-json') {
      process.stderr.write(
        'Error: --input-format=stream-json requires --output-format=stream-json.\n',
      )
      process.exit(1)
    }
    if (
      options.sdkUrl &&
      (inputFormat !== 'stream-json' || outputFormat !== 'stream-json')
    ) {
      process.stderr.write(
        'Error: --sdk-url requires both --input-format=stream-json and --output-format=stream-json.\n',
      )
      process.exit(1)
    }
    if (
      options.replayUserMessages &&
      (inputFormat !== 'stream-json' || outputFormat !== 'stream-json')
    ) {
      process.stderr.write(
        'Error: --replay-user-messages requires both --input-format=stream-json and --output-format=stream-json.\n',
      )
      process.exit(1)
    }
    // 惰性接线（handler 族同型）：dispatch.getInputPrompt（stdin 3s peek
    // 面）+ print.runHeadless（S-C3 headless 本体；await = 自然退出码面，
    // 旧 void fire-and-forget delta 登记——新仓 main action 返回后自然退出）
    const { getInputPrompt } = await import('./dispatch')
    const { runHeadless } = await import('./print')
    const inputPrompt = await getInputPrompt(prompt ?? '', inputFormat)
    await runHeadless(inputPrompt, buildHeadlessOptions(options))
    return
  } else {
    process.stderr.write(
      'atlascode 交互入口 = 壳波 #152 前向接缝（launchRepl 未落盘）\n',
    )
  }
  process.exit(1)
}

/**
 * 构造 commander program（option 面逐字 + 条件尾段 + 入域子命令子集）。
 * parse 时机由 runCli() 控制（print 模式跳过子命令注册后提前 parse）。
 */
export function buildProgram(): CommanderCommand {
  const program = new CommanderCommand()
    .configureHelp(createSortedHelpConfig())
    .enablePositionalOptions()

  // preAction hook（S-C2 最小 seam；裁登记见头注 preAction 段）：
  // 旧仓钩子体 = MDM/keychain 预取 + init() + process.title + sinks +
  // plugin-dir 接线 + migrations + 远程策略 + 设置同步，逐件裁/前向接缝。
  program.hook('preAction', async () => {
    if (!isEnvTruthy(process.env.ATLAS_DISABLE_TERMINAL_TITLE)) {
      process.title = 'atlascode'
    }
  })

  program
    .name('atlascode')
    .description(
      'AtlasCode - starts an interactive session by default, use -p/--print for non-interactive output',
    )
    .argument('[prompt]', 'Your prompt', String)
    // Subcommands inherit helpOption via commander's copyInheritedSettings —
    // setting it once here covers mcp, auto-mode and all other subcommands.
    .helpOption('-h, --help', 'Display help for command')
    .option(
      '-d, --debug [filter]',
      'Enable debug mode with optional category filtering (e.g., "api,hooks" or "!1p,!file")',
      (_value: string | true) => {
        // If value is provided, it will be the filter string
        // If not provided but flag is present, value will be true
        // The actual filtering is handled in debug.ts by parsing process.argv
        // 裁登记：新仓无 debug.ts（debug 面 = 残留守），选项注册为惰性数据
        return true
      },
    )
    .addOption(
      new Option('--debug-to-stderr', 'Enable debug mode (to stderr)')
        .argParser(Boolean)
        .hideHelp(),
    )
    .option(
      '--debug-file <path>',
      'Write debug logs to a specific file path (implicitly enables debug mode)',
      String,
    )
    .option('--verbose', 'Override verbose mode setting from config', () => true)
    .option(
      '-p, --print',
      'Print response and exit (useful for pipes). Note: The workspace trust dialog is skipped when AtlasCode is run with the -p mode. Only use this flag in directories you trust.',
      () => true,
    )
    .option(
      // delta 登记：裁 keychain 句 + 3P providers 句（头注 delta 段）
      '--bare',
      'Minimal mode: skip hooks, LSP, plugin sync, attribution, auto-memory, background prefetches, keychain reads, and ATLAS.md auto-discovery. Sets ATLAS_SIMPLE=1. Auth is strictly OPENAI_API_KEY or apiKeyHelper via --settings. Skills still resolve via /skill-name. Explicitly provide context via: --system-prompt[-file], --append-system-prompt[-file], --add-dir (ATLAS.md dirs), --mcp-config, --settings, --agents, --plugin-dir.',
      () => true,
    )
    .addOption(
      new Option('--init', 'Run Setup hooks with init trigger, then continue')
        .hideHelp(),
    )
    .addOption(
      new Option(
        '--init-only',
        'Run Setup and SessionStart:startup hooks, then exit',
      ).hideHelp(),
    )
    .addOption(
      new Option(
        '--maintenance',
        'Run Setup hooks with maintenance trigger, then continue',
      ).hideHelp(),
    )
    .addOption(
      new Option(
        '--output-format <format>',
        'Output format (only works with --print): "text" (default), "json" (single result), or "stream-json" (realtime streaming)',
      ).choices(['text', 'json', 'stream-json']),
    )
    .addOption(
      new Option(
        '--json-schema <schema>',
        'JSON Schema for structured output validation. ' +
          'Example: {"type":"object","properties":{"name":{"type":"string"}},"required":["name"]}',
      ).argParser(String),
    )
    .option(
      '--include-hook-events',
      'Include all hook lifecycle events in the output stream (only works with --output-format=stream-json)',
      () => true,
    )
    .option(
      '--include-partial-messages',
      'Include partial message chunks as they arrive (only works with --print and --output-format=stream-json)',
      () => true,
    )
    .addOption(
      new Option(
        '--input-format <format>',
        'Input format (only works with --print): "text" (default), or "stream-json" (realtime streaming input)',
      ).choices(['text', 'stream-json']),
    )
    .option(
      '--mcp-debug',
      '[DEPRECATED. Use --debug instead] Enable MCP debug mode (shows MCP server errors)',
      () => true,
    )
    .option(
      '--dangerously-skip-permissions',
      'Bypass all permission checks. Recommended only for sandboxes with no internet access.',
      () => true,
    )
    .option(
      '--allow-dangerously-skip-permissions',
      'Enable bypassing all permission checks as an option, without it being enabled by default. Recommended only for sandboxes with no internet access.',
      () => true,
    )
    .addOption(
      new Option(
        '--thinking <mode>',
        'Thinking mode: enabled (equivalent to adaptive), disabled',
      )
        .choices(['enabled', 'adaptive', 'disabled'])
        .hideHelp(),
    )
    .addOption(
      new Option(
        '--max-thinking-tokens <tokens>',
        '[DEPRECATED. Use --thinking instead for newer models] Maximum number of thinking tokens (only works with --print)',
      )
        .argParser(Number)
        .hideHelp(),
    )
    .addOption(
      new Option(
        '--max-turns <turns>',
        'Maximum number of agentic turns in non-interactive mode. This will early exit the conversation after the specified number of turns. (only works with --print)',
      )
        .argParser(Number)
        .hideHelp(),
    )
    .addOption(
      new Option(
        '--task-budget <tokens>',
        'API-side task budget in tokens (output_config.task_budget)',
      )
        .argParser(value => {
          const tokens = Number(value)
          if (isNaN(tokens) || tokens <= 0 || !Number.isInteger(tokens)) {
            throw new Error('--task-budget must be a positive integer')
          }
          return tokens
        })
        .hideHelp(),
    )
    .option(
      '--replay-user-messages',
      'Re-emit user messages from stdin back on stdout for acknowledgment (only works with --input-format=stream-json and --output-format=stream-json)',
      () => true,
    )
    .addOption(
      new Option('--enable-auth-status', 'Enable auth status messages in SDK mode')
        .default(false)
        .hideHelp(),
    )
    .option(
      '--allowedTools, --allowed-tools <tools...>',
      'Comma or space-separated list of tool names to allow (e.g. "Bash(git:*) Edit")',
    )
    .option(
      '--tools <tools...>',
      'Specify the list of available tools from the built-in set. Use "" to disable all tools, "default" to use all tools, or specify tool names (e.g. "Bash,Edit,Read").',
    )
    .option(
      '--disallowedTools, --disallowed-tools <tools...>',
      'Comma or space-separated list of tool names to deny (e.g. "Bash(git:*) Edit")',
    )
    .option(
      '--mcp-config <configs...>',
      'Load MCP servers from JSON files or strings (space-separated)',
    )
    .addOption(
      new Option(
        '--permission-prompt-tool <tool>',
        'MCP tool to use for permission prompts (only works with --print)',
      )
        .argParser(String)
        .hideHelp(),
    )
    .addOption(
      new Option('--system-prompt <prompt>', 'System prompt to use for the session')
        .argParser(String),
    )
    .addOption(
      new Option(
        '--system-prompt-file <file>',
        'Read system prompt from a file',
      )
        .argParser(String)
        .hideHelp(),
    )
    .addOption(
      new Option(
        '--append-system-prompt <prompt>',
        'Append a system prompt to the default system prompt',
      ).argParser(String),
    )
    .addOption(
      new Option(
        '--append-system-prompt-file <file>',
        'Read system prompt from a file and append to the default system prompt',
      )
        .argParser(String)
        .hideHelp(),
    )
    .addOption(
      new Option('--permission-mode <mode>', 'Permission mode to use for the session')
        .argParser(String)
        .choices(PERMISSION_MODES),
    )
    .option(
      '-c, --continue',
      'Continue the most recent conversation in the current directory',
      () => true,
    )
    .option(
      '-r, --resume [value]',
      'Resume a conversation by session ID, or open interactive picker with optional search term',
      value => value || true,
    )
    .option(
      '--fork-session',
      'When resuming, create a new session ID instead of reusing the original (use with --resume or --continue)',
      () => true,
    )
    .addOption(
      new Option(
        '--prefill <text>',
        'Pre-fill the prompt input with text without submitting it',
      ).hideHelp(),
    )
    .addOption(
      new Option(
        '--deep-link-origin',
        'Signal that this session was launched from a deep link',
      ).hideHelp(),
    )
    .addOption(
      new Option(
        '--deep-link-repo <slug>',
        'Repo slug the deep link ?repo= parameter resolved to the current cwd',
      ).hideHelp(),
    )
    .addOption(
      new Option(
        '--deep-link-last-fetch <ms>',
        'FETCH_HEAD mtime in epoch ms, precomputed by the deep link trampoline',
      )
        .argParser(v => {
          const n = Number(v)
          return Number.isFinite(n) ? n : undefined
        })
        .hideHelp(),
    )
    .option(
      '--from-pr [value]',
      'Resume a session linked to a PR by PR number/URL, or open interactive picker with optional search term',
      value => value || true,
    )
    .option(
      '--no-session-persistence',
      'Disable session persistence - sessions will not be saved to disk and cannot be resumed (only works with --print)',
    )
    .addOption(
      new Option(
        '--resume-session-at <message id>',
        'When resuming, only messages up to and including the assistant message with <message.id> (use with --resume in print mode)',
      )
        .argParser(String)
        .hideHelp(),
    )
    .addOption(
      new Option(
        '--rewind-files <user-message-id>',
        'Restore files to state at the specified user message and exit (requires --resume)',
      ).hideHelp(),
    )
    .option(
      '--model <model>',
      "Model for the current session. Provide a role alias (e.g. 'small' or 'premium') or a provider/model reference (e.g. 'bailian/qwen38-27b').",
    )
    .addOption(
      new Option(
        '--effort <level>',
        'Effort level for the current session (low, medium, high, xhigh, max)',
      ).argParser((rawValue: string) => {
        const value = rawValue.toLowerCase()
        const allowed = ['low', 'medium', 'high', 'xhigh', 'max']
        if (!allowed.includes(value)) {
          throw new InvalidArgumentError(`It must be one of: ${allowed.join(', ')}`)
        }
        return value
      }),
    )
    .option(
      '--agent <agent>',
      "Agent for the current session. Overrides the 'agent' setting.",
    )
    .option(
      '--betas <betas...>',
      'Beta headers to include in API requests (API key users only)',
    )
    .option(
      '--fallback-model <model>',
      'Enable automatic fallback to specified model when default model is overloaded (only works with --print)',
    )
    .addOption(
      new Option(
        '--workload <tag>',
        'Workload tag for billing-header attribution (cc_workload). Process-scoped; set by SDK daemon callers that spawn subprocesses for cron work. (only works with --print)',
      ).hideHelp(),
    )
    .option(
      '--settings <file-or-json>',
      'Path to a settings JSON file or a JSON string to load additional settings from',
    )
    .option('--add-dir <directories...>', 'Additional directories to allow tool access to')
    .option(
      '--ide',
      'Automatically connect to IDE on startup if exactly one valid IDE is available',
      () => true,
    )
    .option(
      '--strict-mcp-config',
      'Only use MCP servers from --mcp-config, ignoring all other MCP configurations',
      () => true,
    )
    .option(
      '--session-id <uuid>',
      'Use a specific session ID for the conversation (must be a valid UUID)',
    )
    .option(
      '-n, --name <name>',
      'Set a display name for this session (shown in /resume and terminal title)',
    )
    .option(
      '--agents <json>',
      "JSON object defining custom agents (e.g. '{\"reviewer\": {\"description\": \"Reviews code\", \"prompt\": \"You are a code reviewer\"}}')",
    )
    .option(
      '--setting-sources <sources>',
      'Comma-separated list of setting sources to load (user, project, local).',
    )
    // gh-33508: <paths...> (variadic) consumed everything until the next
    // --flag. `atlascode --plugin-dir /path mcp add --transport http` swallowed
    // `mcp` and `add` as paths, then choked on --transport as an unknown
    // top-level option. Single-value + collect accumulator means each
    // --plugin-dir takes exactly one arg; repeat the flag for multiple dirs.
    .option(
      '--plugin-dir <path>',
      'Load plugins from a directory for this session only (repeatable: --plugin-dir A --plugin-dir B)',
      (val: string, prev: string[]) => [...prev, val],
      [] as string[],
    )
    .option('--disable-slash-commands', 'Disable all skills', () => true)
    .option('--chrome', 'Enable AtlasCode in Chrome integration')
    .option('--no-chrome', 'Disable AtlasCode in Chrome integration')
    .option(
      '--file <specs...>',
      'File resources to download at startup. Format: file_id:relative_path (e.g., --file file_abc:doc.txt file_def:img.png)',
    )
    .action(mainActionSeam)
    .version(`${CLI_VERSION} (AtlasCode)`, '-v, --version', 'Output the version number')

  // Worktree flags
  program.option(
    '-w, --worktree [name]',
    'Create a new git worktree for this session (optionally specify a name)',
  )
  program.option(
    '--tmux',
    'Create a tmux session for the worktree (requires --worktree). Uses iTerm2 native panes when available; use --tmux=classic for traditional tmux.',
  )
  // 裁登记：--advisor（canUserConfigureAdvisor advisor 面域外，不随迁）
  if (feature('TRANSCRIPT_CLASSIFIER')) {
    program.addOption(
      new Option('--enable-auto-mode', 'Opt in to auto mode').hideHelp(),
    )
  }
  // delta 登记：旧 feature('UDS_INBOX') 门 → 新仓 remote 域 isUdsInboxEnabled()
  if (isUdsInboxEnabled()) {
    program.addOption(
      new Option(
        '--messaging-socket-path <path>',
        'Unix domain socket path for the UDS messaging server (defaults to a tmp path)',
      ),
    )
  }

  // Teammate identity options (set by leader when spawning tmux teammates)
  // These replace the ATLAS_* environment variables
  program.addOption(
    new Option('--agent-id <id>', 'Teammate agent ID').hideHelp(),
  )
  program.addOption(
    new Option('--agent-name <name>', 'Teammate display name').hideHelp(),
  )
  program.addOption(
    new Option('--team-name <name>', 'Team name for swarm coordination').hideHelp(),
  )
  program.addOption(
    new Option('--agent-color <color>', 'Teammate UI color').hideHelp(),
  )
  program.addOption(
    new Option('--plan-mode-required', 'Require plan mode before implementation')
      .hideHelp(),
  )
  program.addOption(
    new Option(
      '--parent-session-id <id>',
      'Parent session ID for analytics correlation',
    ).hideHelp(),
  )
  program.addOption(
    new Option(
      '--teammate-mode <mode>',
      'How to spawn teammates: "tmux", "in-process", or "auto"',
    )
      .choices(['auto', 'tmux', 'in-process'])
      .hideHelp(),
  )
  program.addOption(
    new Option('--agent-type <type>', 'Custom agent type for this teammate').hideHelp(),
  )

  // Enable SDK URL for all builds but hide from help
  // 裁登记：消费支 = CCR 域外（选项保留为惰性数据）
  program.addOption(
    new Option(
      '--sdk-url <url>',
      'Use remote WebSocket endpoint for SDK I/O streaming (only with -p and stream-json format)',
    ).hideHelp(),
  )

  // 裁登记：--teleport / --remote（remote 族波）/ --remote-control·--rc
  // （BRIDGE_MODE 桥面 [ATLAS-HOLD]）不随迁
  if (feature('HARD_FAIL')) {
    program.addOption(
      new Option(
        '--hard-fail',
        'Crash on logError calls instead of silently logging',
      ).hideHelp(),
    )
  }

  return program
}

/**
 * 入域子命令子集注册（mcp 族 + auto-mode 族；裁登记见头注）。导出 = 测试面
 * （seam 接线断言需 buildProgram + 本注册组合，不经 runCli 的 process.argv
 * 解析支）。
 */
export function registerInDomainSubcommands(program: CommanderCommand): void {
  // atlascode mcp
  const mcp = program
    .command('mcp')
    .description('Configure and manage MCP servers')
    .configureHelp(createSortedHelpConfig())
    .enablePositionalOptions()

  mcp
    .command('serve')
    .description('Start the AtlasCode MCP server')
    .option('-d, --debug', 'Enable debug mode', () => true)
    .option('--verbose', 'Override verbose mode setting from config', () => true)
    .action(async (options: McpServeOptions) => {
      // 惰性加载面保真（旧头注：dynamically imported only when the command
      // runs）
      const { mcpServeHandler } = await import('./handlers/mcp')
      await mcpServeHandler(options)
    })

  // 旧仓 commands/mcp/addCommand.ts 选项面逐字随迁（--xaa 裁：isXaaEnabled XAA
  // 面域外，登记）；handler = S-C4 handlers/mcp.ts
  mcp
    .command('add <name> <commandOrUrl> [args...]')
    .description(
      'Add an MCP server to AtlasCode.\n\n' +
        'Examples:\n' +
        '  # Add HTTP server:\n' +
        '  atlascode mcp add --transport http sentry https://mcp.sentry.dev/mcp\n\n' +
        '  # Add stdio server with environment variables:\n' +
        '  atlascode mcp add -e API_KEY=xxx my-server -- npx my-mcp-server\n\n' +
        '  # Add stdio server with subprocess flags:\n' +
        '  atlascode mcp add my-server -- my-command --some-flag arg1',
    )
    .option(
      '-s, --scope <scope>',
      'Configuration scope (local, user, or project)',
      'local',
    )
    .option(
      '-t, --transport <transport>',
      'Transport type (stdio, sse, http). Defaults to stdio if not specified.',
    )
    .option('-e, --env <env...>', 'Set environment variables (e.g. -e KEY=value)')
    .option(
      '-H, --header <header...>',
      'Set WebSocket headers (e.g. -H "X-Api-Key: abc123" -H "X-Custom: value")',
    )
    .option('--client-id <clientId>', 'OAuth client ID for HTTP/SSE servers')
    .option(
      '--client-secret',
      'Prompt for OAuth client secret (or set MCP_CLIENT_SECRET env var)',
    )
    .option(
      '--callback-port <port>',
      'Fixed port for OAuth callback (for servers requiring pre-registered redirect URIs)',
    )
    .helpOption('-h, --help', 'Display help for command')
    .action(
      async (
        name: string,
        commandOrUrl: string,
        args: string[] | undefined,
        options: McpAddOptions,
      ) => {
        const { mcpAddHandler } = await import('./handlers/mcp')
        await mcpAddHandler(name, commandOrUrl, args ?? [], options)
      },
    )

  mcp
    .command('remove <name>')
    .description(
      'Remove an MCP server',
    )
    .option(
      '-s, --scope <scope>',
      'Configuration scope (local, user, or project) - if not specified, removes from whichever scope it exists in',
    )
    .action(async (name: string, options: McpRemoveOptions) => {
      const { mcpRemoveHandler } = await import('./handlers/mcp')
      await mcpRemoveHandler(name, options)
    })

  mcp
    .command('list')
    .description(
      'List configured MCP servers. Note: The workspace trust dialog is skipped and stdio servers from .mcp.json are spawned for health checks. Only use this command in directories you trust.',
    )
    .action(async () => {
      const { mcpListHandler } = await import('./handlers/mcp')
      await mcpListHandler()
    })

  mcp
    .command('get <name>')
    .description(
      'Get details about an MCP server. Note: The workspace trust dialog is skipped and stdio servers from .mcp.json are spawned for health checks. Only use this command in directories you trust.',
    )
    .action(async (name: string) => {
      const { mcpGetHandler } = await import('./handlers/mcp')
      await mcpGetHandler(name)
    })

  mcp
    .command('add-json <name> <json>')
    .description('Add an MCP server (stdio or SSE) with a JSON string')
    .option(
      '-s, --scope <scope>',
      'Configuration scope (local, user, or project)',
      'local',
    )
    .option(
      '--client-secret',
      'Prompt for OAuth client secret (or set MCP_CLIENT_SECRET env var)',
    )
    .action(
      async (name: string, json: string, options: McpAddJsonOptions) => {
        const { mcpAddJsonHandler } = await import('./handlers/mcp')
        await mcpAddJsonHandler(name, json, options)
      },
    )

  // 裁登记：mcp reset-project-choices（.mcp.json 项目批准面 = 信任对话框面，
  // 壳波随迁）/ mcp add-from-claude-desktop（无 Desktop 面）/ mcp xaa-idp
  // （XAA 面域外）

  // Auto mode 子族（feature TRANSCRIPT_CLASSIFIER 门保留 ON_BY_DEFAULT；
  // 旧 getAutoModeEnabledStateIfCached 缓存态短路支裁登记见头注 delta 段；
  // handler = S-C4 handlers/autoMode.ts，消费 permissions autoMode 面）
  if (feature('TRANSCRIPT_CLASSIFIER')) {
    const autoModeCmd = program
      .command('auto-mode')
      .description('Inspect auto mode classifier configuration')
    autoModeCmd
      .command('defaults')
      .description(
        'Print the default auto mode environment, allow, and deny rules as JSON',
      )
      .action(async () => {
        // 惰性加载面保真（同 mcp 族：handler 模块按子命令动态 import）
        const { autoModeDefaultsHandler } = await import('./handlers/autoMode')
        autoModeDefaultsHandler()
      })
    autoModeCmd
      .command('config')
      .description(
        'Print the effective auto mode config as JSON: your settings where set, defaults otherwise',
      )
      .action(async () => {
        const { autoModeConfigHandler } = await import('./handlers/autoMode')
        autoModeConfigHandler()
      })
    autoModeCmd
      .command('critique')
      .description('Get AI feedback on your custom auto mode rules')
      .option('--model <model>', 'Override which model is used')
      .action(async (options: AutoModeCritiqueOptions) => {
        const { autoModeCritiqueHandler } = await import('./handlers/autoMode')
        await autoModeCritiqueHandler(options)
      })
  }
}

/**
 * CLI 主面入口（旧仓 run() 同型）：构造 program → print 模式跳过子命令注册
 * （commander 把 prompt 路由给默认 action；子命令注册路径旧仓实测 ~65ms）→
 * 全量 parse。
 */
export async function runCli(): Promise<CommanderCommand> {
  const program = buildProgram()

  // -p/--print mode: skip subcommand registration（旧仓注释逐字保真：
  // cc:// URLs 由 main() 预解析块改写（新仓该块域外裁登记），argv 检查安全）
  const isPrintMode =
    process.argv.includes('-p') || process.argv.includes('--print')
  const isCcUrl = process.argv.some(
    a => a.startsWith('cc://') || a.startsWith('cc+unix://'),
  )
  if (isPrintMode && !isCcUrl) {
    await program.parseAsync(process.argv)
    return program
  }

  registerInDomainSubcommands(program)
  await program.parseAsync(process.argv)
  return program
}
