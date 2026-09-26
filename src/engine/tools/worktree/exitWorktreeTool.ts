/**
 * engine/tools/worktree — ExitWorktreeTool 本体（S-D2b §8.57 worktree 工具
 * 本体子波；49 口径 18/49；注册表 ⑭ worktree mode 槽随 Enter 同批
 * materialize，isEnabled = isWorktreeModeEnabled 自门控）。
 *
 * 旧仓来源（a8af45b）：src/tools/ExitWorktreeTool/ExitWorktreeTool.ts 318L
 * 逐字随迁（input { action: 'keep'|'remove', discard_changes? } / output 8
 * 字段 / countWorktreeChanges 失败封闭双 git 探针 / restoreSessionToOriginalCwd
 * 逆序恢复 / validateInput 3 支守卫（ec1 no-op / ec3 状态不可验 / ec2 变更
 * 列举）/ call keep·remove 双分支 + tmux 判别 + discard 注记面）+ prompt.ts
 * 32L 逐字（worktreePrompt.ts 门面）+ UI.tsx 纯字符串面（renderToolUseMessage
 * 'Exiting worktree…' 保留，JSX renderToolResultMessage 面裁 TUI 波）。
 *
 * delta 登记（旧 buildTool(zod) → 新 shared Tool 契约 + 多裁，函数体逐字；
 * 复审勿当遗漏重提）：
 *  ① 旧 buildTool(zod inputSchema/outputSchema) → 新 shared Tool 契约：
 *    inputSchema = 纯 JSON schema 对象（z.strictObject 无 additionalProperties
 *    槽位随迁，S-C5 Read ① 同面；z.enum(['keep','remove']) → enum 键逐字）；
 *    旧 zod outputSchema（z.infer 推断 Output 8 字段）→ TS 型承载（引擎侧
 *    无 wire outputSchema 消费者，D 波前向接缝）。
 *  ② 旧 prompt() 成员 → 新契约唯一 prompt 面 description() = 旧 prompt()
 *    体（EXIT_WORKTREE_PROMPT 逐字，S-C5 delta ③ 先例）；旧短 description()
 *    体 → EXIT_WORKTREE_DESCRIPTION 导出不接线（TUI 波前向接缝，同 S-D3
 *    DESCRIPTION 族）。
 *  ③ 旧 buildTool TOOL_DEFAULTS 成员对象化（逐值）：isConcurrencySafe
 *    false / isReadOnly false（def 无覆写取默认）/ isDestructive =
 *    input.action === 'remove'（def 成员）/ maxResultSizeChars 100_000
 *    （def 体）/ shouldDefer true / searchHint 'exit a worktree session
 *    and return to the original directory'（def 体）/ userFacingName
 *    'Exiting worktree'（def 成员）/ toAutoClassifierInput = input.action
 *    （def 体）。
 *  ④ checkPermissions = 旧 buildTool 默认（{ behavior:'allow',
 *    updatedInput }，委托通用权限系统）显式固化（def 无 member，S-D3
 *    delta ⑤ 同族先例，本工具无路径面）。
 *  ⑤ 注册表 ⑭ worktree mode 槽自门控：isEnabled = isWorktreeModeEnabled
 *    （同 Enter，delta ⑥ 同源）。
 *  ⑥ 旧 count（utils/array lodash 裁面）→ 域内本地实现（与 bash/arrayUtils
 *    同源旧仓 utils/array.ts:5-9 逐字；lodash 裁剪先例「首消费者落本地」，
 *    共享 utils/array 面未整体随迁）。
 *  ⑦ 旧 execFileNoThrow('git', ['-C', path, ...])（utils/execFileNoThrow.ts）
 *    → worktree 域门面 execFileNoThrowWithCwd(gitExe(), args)（无显式 cwd
 *    参数，git -C 携路径，语义逐字；gitExe() = ATLAS_GIT_EXE env 覆写 +
 *    缺省 'git'，git.ts 头注登记「whichSync 糖整砍」）。返回形
 *    { stdout, stderr, code, error? } 与旧 execFileNoThrow 同形（逐字核心）。
 *  ⑧ 旧 saveWorktreeState(null)（restoreSessionToOriginalCwd 内）→ 裁 =
 *    CLI 波前向接缝（session 域 record.ts 头注裁面登记，同 Enter delta ⑧；
 *    旧仓语义「exit 时置 null 使 --resume 不 cd 回 worktree」= 写入口裁后
 *    无残留写入，零行为损失）。
 *  ⑨ 旧清缓存三件套（clearSystemPromptSections / clearMemoryFileCaches /
 *    getPlansDirectory.cache.clear?.()，restoreSessionToOriginalCwd 内）
 *    → 裁（CLI/TUI 波前向接缝，同 Enter delta ⑨，H6 此处登记）。
 *  ⑩ 旧 call 5 参声明 → 0 参声明（旧体不消费 context/canUseTool/
 *    parentMessage/onProgress，裁，零行为；S-B5 delta ⑩ / S-D4 delta ⑨
 *    先例）。旧 import 重指：bootstrap/state → bootstrap 门面（getProjectRoot
 *    / setProjectRoot S-D2a ⑥ 面）/ utils/hooks/hooksConfigSnapshot
 *    updateHooksConfigSnapshot → config 域门面（E-3 S-3c hooks 字段族）/
 *    utils/Shell setCwd → executor 门面（bootstrap port 落 cwdState）/
 *    utils/worktree → worktree 域门面（S-D2a 回填面）/ utils/plans /
 *    utils/sessionStorage / systemPromptSections / memoryFiles → ⑧⑨ 裁 /
 *    UI renderToolResultMessage JSX 面 → 裁 TUI 波（纯字符串
 *    renderToolUseMessage 保留）。
 *  ⑪ restoreSessionToOriginalCwd 体逐字保留（setCwd / setOriginalCwd /
 *    projectRootIsWorktree 判别支 setProjectRoot（S-D2a no-op 逐字）+
 *    updateHooksConfigSnapshot 对称恢复位（旧 setup.ts --worktree 块配对）），
 *    ⑧⑨ 裁位以 delta 注记随体。
 */
import {
  getOriginalCwd,
  getProjectRoot,
  setOriginalCwd,
  setProjectRoot,
} from '../../../bootstrap'
import { setCwd } from '../../../executor'
import {
  type Tool,
  type ToolInputJSONSchema,
  type ToolResult,
  type ToolResultBlockParam,
  type ValidationResult,
} from '../../../shared'
import { updateHooksConfigSnapshot } from '../../config'
import {
  cleanupWorktree,
  execFileNoThrowWithCwd,
  getCurrentWorktreeSession,
  gitExe,
  keepWorktree,
  killTmuxSession,
} from '../../worktree'
import { EXIT_WORKTREE_TOOL_NAME } from '../toolNames'
import {
  EXIT_WORKTREE_PROMPT,
  isWorktreeModeEnabled,
} from './worktreePrompt'
import type { ExitWorktreeToolInput } from './worktreeToolInput'

/** 旧仓 zod outputSchema z.infer 型（delta ① TS 型承载）。 */
export type ExitWorktreeOutput = {
  action: 'keep' | 'remove'
  originalCwd: string
  worktreePath: string
  worktreeBranch?: string
  tmuxSessionName?: string
  discardedFiles?: number
  discardedCommits?: number
  message: string
}

type ChangeSummary = {
  changedFiles: number
  commits: number
}

/** 旧仓 utils/array lodash 裁面 → 域内本地实现（delta ⑥，同源逐字）。 */
function count<T>(arr: readonly T[], pred: (x: T) => unknown): number {
  let n = 0
  for (const x of arr) n += +!!pred(x)
  return n
}

/**
 * Returns null when state cannot be reliably determined — callers that use
 * this as a safety gate must treat null as "unknown, assume unsafe"
 * (fail-closed). A silent 0/0 would let cleanupWorktree destroy real work.
 *
 * Null is returned when:
 * - git status or rev-list exit non-zero (lock file, corrupt index, bad ref)
 * - originalHeadCommit is undefined but git status succeeded — this is the
 *   hook-based-worktree-wrapping-git case (worktree.ts:525-532 doesn't set
 *   originalHeadCommit). We can see the working tree is git, but cannot count
 *   commits without a baseline, so we cannot prove the branch is clean.
 */
async function countWorktreeChanges(
  worktreePath: string,
  originalHeadCommit: string | undefined,
): Promise<ChangeSummary | null> {
  // delta ⑦：旧 execFileNoThrow('git', ...) → worktree 域门面同形执行层
  const status = await execFileNoThrowWithCwd(gitExe(), [
    '-C',
    worktreePath,
    'status',
    '--porcelain',
  ])
  if (status.code !== 0) {
    return null
  }
  const changedFiles = count(status.stdout.split('\n'), l => l.trim() !== '')

  if (!originalHeadCommit) {
    // git status succeeded → this is a git repo, but without a baseline
    // commit we cannot count commits. Fail-closed rather than claim 0.
    return null
  }

  const revList = await execFileNoThrowWithCwd(gitExe(), [
    '-C',
    worktreePath,
    'rev-list',
    '--count',
    `${originalHeadCommit}..HEAD`,
  ])
  if (revList.code !== 0) {
    return null
  }
  const commits = parseInt(revList.stdout.trim(), 10) || 0

  return { changedFiles, commits }
}

/**
 * Restore session state to reflect the original directory.
 * This is the inverse of the session-level mutations in EnterWorktreeTool.call().
 *
 * keepWorktree()/cleanupWorktree() handle process.chdir and currentWorktreeSession;
 * this handles everything above the worktree utility layer.
 */
function restoreSessionToOriginalCwd(
  originalCwd: string,
  projectRootIsWorktree: boolean,
): void {
  setCwd(originalCwd)
  // EnterWorktree sets originalCwd to the *worktree* path (intentional — see
  // state.ts getProjectRoot comment). Reset to the real original.
  setOriginalCwd(originalCwd)
  // --worktree startup sets projectRoot to the worktree; mid-session
  // EnterWorktreeTool does not. Only restore when it was actually changed —
  // otherwise we'd move projectRoot to wherever the user had cd'd before
  // entering the worktree (session.originalCwd), breaking the "stable project
  // identity" contract.
  if (projectRootIsWorktree) {
    setProjectRoot(originalCwd)
    // setup.ts's --worktree block called updateHooksConfigSnapshot() to re-read
    // hooks from the worktree. Restore symmetrically. (Mid-session
    // EnterWorktreeTool never touched the snapshot, so no-op there.)
    updateHooksConfigSnapshot()
  }
  // delta ⑧：旧 saveWorktreeState(null) → 裁（CLI 波前向接缝）
  // delta ⑨：旧清缓存三件套（clearSystemPromptSections /
  // clearMemoryFileCaches / getPlansDirectory.cache.clear?.()）→ 裁
}

/** 旧仓 zod inputSchema 逐字段转写（delta ① 纯 JSON schema，S-B5 先例）。 */
export const EXIT_WORKTREE_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['keep', 'remove'],
      description:
        '"keep" leaves the worktree and branch on disk; "remove" deletes both.',
    },
    discard_changes: {
      type: 'boolean',
      description:
        'Required true when action is "remove" and the worktree has uncommitted files or unmerged commits. The tool will refuse and list them otherwise.',
    },
  },
  required: ['action'],
}

export const ExitWorktreeTool: Tool = {
  name: EXIT_WORKTREE_TOOL_NAME,
  inputSchema: EXIT_WORKTREE_TOOL_INPUT_SCHEMA,
  inputJSONSchema: EXIT_WORKTREE_TOOL_INPUT_SCHEMA,
  searchHint: 'exit a worktree session and return to the original directory',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  // 注册表 ⑭ worktree mode 槽自门控（delta ⑤）
  isEnabled: () => isWorktreeModeEnabled(),
  // 旧 buildTool TOOL_DEFAULTS 成员对象化（delta ③，逐值）
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: (input: unknown) =>
    (input as ExitWorktreeToolInput).action === 'remove',
  toAutoClassifierInput: (input: unknown) =>
    (input as ExitWorktreeToolInput).action,
  userFacingName: () => 'Exiting worktree',
  // delta ④：旧 buildTool 默认显式固化（委托通用权限系统）
  checkPermissions: async (input: unknown) => ({
    behavior: 'allow',
    updatedInput: input,
  }),
  // delta ②：新契约唯一 prompt 面 = 旧 prompt() 体（逐字）
  description: async () => EXIT_WORKTREE_PROMPT,
  async validateInput(input: unknown): Promise<ValidationResult> {
    const inp = input as ExitWorktreeToolInput
    // 注：旧体此处解构名 input（与成员参数同名位），新契约参数 unknown 位
    // 保持旧名 input 会遮蔽 cast 位 → cast 局部名 inp（标识符位唯一 delta，
    // 逐字体不动，复审勿当遗漏重提）
    // Scope guard: getCurrentWorktreeSession() is null unless EnterWorktree
    // (specifically createWorktreeForSession) ran in THIS session. Worktrees
    // created by `git worktree add`, or by EnterWorktree in a previous
    // session, do not populate it. This is the sole entry gate — everything
    // past this point operates on a path EnterWorktree created.
    const session = getCurrentWorktreeSession()
    if (!session) {
      return {
        result: false,
        message:
          'No-op: there is no active EnterWorktree session to exit. This tool only operates on worktrees created by EnterWorktree in the current session — it will not touch worktrees created manually or in a previous session. No filesystem changes were made.',
        errorCode: 1,
      }
    }

    if (inp.action === 'remove' && !inp.discard_changes) {
      const summary = await countWorktreeChanges(
        session.worktreePath,
        session.originalHeadCommit,
      )
      if (summary === null) {
        return {
          result: false,
          message: `Could not verify worktree state at ${session.worktreePath}. Refusing to remove without explicit confirmation. Re-invoke with discard_changes: true to proceed — or use action: "keep" to preserve the worktree.`,
          errorCode: 3,
        }
      }
      const { changedFiles, commits } = summary
      if (changedFiles > 0 || commits > 0) {
        const parts: string[] = []
        if (changedFiles > 0) {
          parts.push(
            `${changedFiles} uncommitted ${changedFiles === 1 ? 'file' : 'files'}`,
          )
        }
        if (commits > 0) {
          parts.push(
            `${commits} ${commits === 1 ? 'commit' : 'commits'} on ${session.worktreeBranch ?? 'the worktree branch'}`,
          )
        }
        return {
          result: false,
          message: `Worktree has ${parts.join(' and ')}. Removing will discard this work permanently. Confirm with the user, then re-invoke with discard_changes: true — or use action: "keep" to preserve the worktree.`,
          errorCode: 2,
        }
      }
    }

    return { result: true }
  },
  // delta ⑩：0 参声明
  async call(args: unknown): Promise<ToolResult<ExitWorktreeOutput>> {
    const input = args as ExitWorktreeToolInput
    const session = getCurrentWorktreeSession()
    if (!session) {
      // validateInput guards this, but the session is module-level mutable
      // state — defend against a race between validation and execution.
      throw new Error('Not in a worktree session')
    }

    // Capture before keepWorktree/cleanupWorktree null out currentWorktreeSession.
    const {
      originalCwd,
      worktreePath,
      worktreeBranch,
      tmuxSessionName,
      originalHeadCommit,
    } = session

    // --worktree startup calls setOriginalCwd(getCwd()) and
    // setProjectRoot(getCwd()) back-to-back right after setCwd(worktreePath)
    // (setup.ts:235/239), so both hold the same realpath'd value and BashTool
    // cd never touches either. Mid-session EnterWorktreeTool sets originalCwd
    // but NOT projectRoot. (Can't use getCwd() — BashTool mutates it on every
    // cd. Can't use session.worktreePath — it's join()'d, not realpath'd.)
    const projectRootIsWorktree = getProjectRoot() === getOriginalCwd()

    // Re-count at execution time for accurate analytics and output — the
    // worktree state at validateInput time may not match now. Null (git
    // failure) falls back to 0/0; safety gating already happened in
    // validateInput, so this only affects analytics + messaging.
    const { changedFiles, commits } = (await countWorktreeChanges(
      worktreePath,
      originalHeadCommit,
    )) ?? { changedFiles: 0, commits: 0 }

    if (input.action === 'keep') {
      await keepWorktree()
      restoreSessionToOriginalCwd(originalCwd, projectRootIsWorktree)

      const tmuxNote = tmuxSessionName
        ? ` Tmux session ${tmuxSessionName} is still running; reattach with: tmux attach -t ${tmuxSessionName}`
        : ''
      return {
        data: {
          action: 'keep' as const,
          originalCwd,
          worktreePath,
          worktreeBranch,
          tmuxSessionName,
          message: `Exited worktree. Your work is preserved at ${worktreePath}${worktreeBranch ? ` on branch ${worktreeBranch}` : ''}. Session is now back in ${originalCwd}.${tmuxNote}`,
        },
      }
    }

    // action === 'remove'
    if (tmuxSessionName) {
      await killTmuxSession(tmuxSessionName)
    }
    await cleanupWorktree()
    restoreSessionToOriginalCwd(originalCwd, projectRootIsWorktree)

    const discardParts: string[] = []
    if (commits > 0) {
      discardParts.push(`${commits} ${commits === 1 ? 'commit' : 'commits'}`)
    }
    if (changedFiles > 0) {
      discardParts.push(
        `${changedFiles} uncommitted ${changedFiles === 1 ? 'file' : 'files'}`,
      )
    }
    const discardNote =
      discardParts.length > 0 ? ` Discarded ${discardParts.join(' and ')}.` : ''
    return {
      data: {
        action: 'remove' as const,
        originalCwd,
        worktreePath,
        worktreeBranch,
        discardedFiles: changedFiles,
        discardedCommits: commits,
        message: `Exited and removed worktree at ${worktreePath}.${discardNote} Session is now back in ${originalCwd}.`,
      },
    }
  },
  // delta ④：旧 UI 面 renderToolUseMessage() → 纯字符串保留（旧 UI.tsx 逐字）
  renderToolUseMessage: () => 'Exiting worktree…',
  mapToolResultToToolResultBlockParam(
    content: unknown,
    toolUseID: string,
  ): ToolResultBlockParam {
    const { message } = content as ExitWorktreeOutput
    return {
      type: 'tool_result',
      content: message,
      tool_use_id: toolUseID,
    }
  },
}
