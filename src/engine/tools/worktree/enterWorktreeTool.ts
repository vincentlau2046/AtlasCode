/**
 * engine/tools/worktree — EnterWorktreeTool 本体（S-D2b §8.57 worktree 工具
 * 本体子波；49 口径 18/49（本批落 2 件后态）；注册表 ⑭ worktree mode
 * 槽 materialize，
 * isEnabled = isWorktreeModeEnabled 自门控）。
 *
 * 旧仓来源（a8af45b）：src/tools/EnterWorktreeTool/EnterWorktreeTool.ts 123L
 * 逐字随迁（input 1 字段 name? / output { worktreePath, worktreeBranch?,
 * message } / call = 会话守卫 + 主仓根 chdir + createWorktreeForSession +
 * chdir/setCwd/setOriginalCwd 序列 + mapResult 单行）+ prompt.ts 30L 逐字
 * （worktreePrompt.ts 门面）+ UI.tsx 纯字符串面（renderToolUseMessage
 * 'Creating worktree…' 保留，JSX renderToolResultMessage 面裁 TUI 波）。
 *
 * delta 登记（旧 buildTool(zod) → 新 shared Tool 契约 + 多裁，函数体逐字；
 * 复审勿当遗漏重提）：
 *  ① 旧 buildTool(zod inputSchema/outputSchema) → 新 shared Tool 契约：
 *    inputSchema = 纯 JSON schema 对象（z.strictObject 无 additionalProperties
 *    槽位随迁，S-C5 Read ① 同面）；旧 zod outputSchema（z.infer 推断 Output）
 *    → TS 型承载（引擎侧无 wire outputSchema 消费者，D 波前向接缝）。
 *  ② 旧 zod superRefine(validateWorktreeSlug catch → addIssue) → 本体
 *    validateInput 成员（schema 宽骨架面；name 缺省直通，present 时
 *    validateWorktreeSlug 同步判别——旧 P-W4 守卫语义「slug 校验先于 git
 *    探针」不变）。
 *  ③ 旧 prompt() 成员 → 新契约唯一 prompt 面 description() = 旧 prompt()
 *    体（ENTER_WORKTREE_PROMPT 逐字，S-C5 delta ③ 先例）；旧短
 *    description() 体 → ENTER_WORKTREE_DESCRIPTION 导出不接线（TUI 波
 *    前向接缝，同 S-D3 DESCRIPTION 族）。
 *  ④ 旧 buildTool TOOL_DEFAULTS 成员对象化（逐值）：isConcurrencySafe
 *    false / isReadOnly false / isDestructive false（def 无覆写取默认）/
 *    maxResultSizeChars 100_000（def 体）/ shouldDefer true / searchHint
 *    'create an isolated git worktree and switch into it'（def 体）/
 *    userFacingName 'Creating worktree'（def 成员）/ toAutoClassifierInput
 *    = input.name ?? ''（def 体）。
 *  ⑤ checkPermissions = 旧 buildTool 默认（{ behavior:'allow',
 *    updatedInput }，委托通用权限系统）显式固化（def 无 member，S-D3
 *    delta ⑤ 同族先例，本工具无路径面）。
 *  ⑥ 注册表 ⑭ worktree mode 槽 materialize：isEnabled = isWorktreeModeEnabled
 *    自门控（旧 isWorktreeModeEnabled ≡ true → 新仓 ATLAS_DISABLE_WORKTREE_MODE
 *    kill-switch，GA 缺省开；isCronEnabled/isTodoV2Enabled 自门控同族先例）。
 *  ⑦ 旧 getPlanSlug()（word slug + plans 目录冲突重试 + 会话缓存，旧
 *    utils/plans.ts）→ 裁（plans 域 = CLI/plans 波前向接缝，新仓
 *    getPlanSlugCache/getPromptId stub 面 S-D2a 已整砍）；兜底位 =
 *    randomUUID 本地 slug（单段 36 字符 hex+连字符，满足
 *    validateWorktreeSlug 字符集，零行为发明——仅旧 getPlanSlug() 的
 *    「无 name 时生成随机名」语义位）。
 *  ⑧ 旧 saveWorktreeState(worktreeSession)（transcript worktree-state entry
 *    + Project 单例 + reAppendSessionMetadata 重尾，旧 utils/sessionStorage.ts）
 *    → 裁 = CLI 波前向接缝（session 域 record.ts 头注裁面登记：entry 类型
 *    WorktreeStateEntry + reAppend 写分支 domain 保留，仅写入口裁；S-D2a
 *    「3 保存点裁」同源）。
 *  ⑨ 旧清缓存三件套（clearSystemPromptSections / clearMemoryFileCaches /
 *    getPlansDirectory.cache.clear?.()）→ 裁（system prompt 段缓存 /
 *    memory 文件缓存 / plans 目录 memoize 面 = CLI/TUI 波前向接缝，H6
 *    此处登记，复审勿当遗漏）。
 *  ⑩ 旧 call 5 参声明 → 0 参声明（旧体不消费 context/canUseTool/
 *    parentMessage/onProgress，裁，零行为；S-B5 delta ⑩ / S-D4 delta ⑨
 *    先例）。旧 import 重指：utils/cwd getCwd → bootstrap getCwdState /
 *    utils/Shell setCwd → executor 门面（bootstrap port 落 cwdState）/
 *    utils/worktree → worktree 域门面（S-D2a 回填面）/ utils/plans
 *    getPlanSlug → ⑦ 裁 / utils/sessionStorage saveWorktreeState → ⑧ 裁 /
 *    constants·systemPromptSections + utils·memoryFiles + plans 缓存三件套
 *    → ⑨ 裁 / UI renderToolResultMessage JSX 面 → 裁 TUI 波（纯字符串
 *    renderToolUseMessage 保留）。
 */
import { randomUUID } from 'crypto'
import {
  getCwdState,
  getSessionId,
  setOriginalCwd,
} from '../../../bootstrap'
import { setCwd } from '../../../executor'
import {
  type Tool,
  type ToolInputJSONSchema,
  type ToolResult,
  type ToolResultBlockParam,
  type ValidationResult,
} from '../../../shared'
import {
  createWorktreeForSession,
  findCanonicalGitRoot,
  getCurrentWorktreeSession,
  validateWorktreeSlug,
} from '../../worktree'
import { ENTER_WORKTREE_TOOL_NAME } from '../toolNames'
import {
  ENTER_WORKTREE_PROMPT,
  isWorktreeModeEnabled,
} from './worktreePrompt'
import type { EnterWorktreeToolInput } from './worktreeToolInput'

/** 旧仓 zod outputSchema z.infer 型（delta ① TS 型承载）。 */
export type EnterWorktreeOutput = {
  worktreePath: string
  worktreeBranch?: string
  message: string
}

/** 旧仓 zod inputSchema 逐字段转写（delta ① 纯 JSON schema，S-B5 先例）。 */
export const ENTER_WORKTREE_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      description:
        'Optional name for the worktree. Each "/"-separated segment may contain only letters, digits, dots, underscores, and dashes; max 64 chars total. A random name is generated if not provided.',
    },
  },
}

export const EnterWorktreeTool: Tool = {
  name: ENTER_WORKTREE_TOOL_NAME,
  inputSchema: ENTER_WORKTREE_TOOL_INPUT_SCHEMA,
  inputJSONSchema: ENTER_WORKTREE_TOOL_INPUT_SCHEMA,
  searchHint: 'create an isolated git worktree and switch into it',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  // 注册表 ⑭ worktree mode 槽自门控（delta ⑥）
  isEnabled: () => isWorktreeModeEnabled(),
  // 旧 buildTool TOOL_DEFAULTS 成员对象化（delta ④，逐值）
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
  toAutoClassifierInput: (input: unknown) =>
    (input as EnterWorktreeToolInput).name ?? '',
  userFacingName: () => 'Creating worktree',
  // delta ⑤：旧 buildTool 默认显式固化（委托通用权限系统）
  checkPermissions: async (input: unknown) => ({
    behavior: 'allow',
    updatedInput: input,
  }),
  // delta ③：新契约唯一 prompt 面 = 旧 prompt() 体（逐字）
  description: async () => ENTER_WORKTREE_PROMPT,
  // delta ②：旧 zod superRefine(validateWorktreeSlug) → 本体 validateInput
  // （共享 ValidationResult 失败支必带 errorCode——输入校验拒 = 1；
  // Exit 侧会话/探针判别码 1/2/3 独立编号，两工具不混用）
  async validateInput(input: unknown): Promise<ValidationResult> {
    const { name } = input as EnterWorktreeToolInput
    if (name === undefined) {
      return { result: true }
    }
    try {
      validateWorktreeSlug(name)
    } catch (e) {
      return { result: false, errorCode: 1, message: (e as Error).message }
    }
    return { result: true }
  },
  // delta ⑩：0 参声明
  async call(args: unknown): Promise<ToolResult<EnterWorktreeOutput>> {
    const input = args as EnterWorktreeToolInput
    // Validate not already in a worktree created by this session
    if (getCurrentWorktreeSession()) {
      throw new Error('Already in a worktree session')
    }

    // Resolve to main repo root so worktree creation works from within a worktree
    const mainRepoRoot = findCanonicalGitRoot(getCwdState())
    if (mainRepoRoot && mainRepoRoot !== getCwdState()) {
      process.chdir(mainRepoRoot)
      setCwd(mainRepoRoot)
    }

    // delta ⑦：旧 getPlanSlug() 裁 → randomUUID 本地 slug 兜底位
    const slug = input.name ?? randomUUID()

    const worktreeSession = await createWorktreeForSession(
      getSessionId(),
      slug,
    )

    process.chdir(worktreeSession.worktreePath)
    setCwd(worktreeSession.worktreePath)
    setOriginalCwd(getCwdState())
    // delta ⑧：旧 saveWorktreeState(worktreeSession) → 裁（CLI 波前向接缝，
    // session 域 record.ts 头注裁面登记：entry 类型 + reAppend 分支域内保留）
    // delta ⑨：旧清缓存三件套（clearSystemPromptSections /
    // clearMemoryFileCaches / getPlansDirectory.cache.clear?.()）→ 裁
    // （CLI/TUI 波前向接缝）

    const branchInfo = worktreeSession.worktreeBranch
      ? ` on branch ${worktreeSession.worktreeBranch}`
      : ''

    return {
      data: {
        worktreePath: worktreeSession.worktreePath,
        worktreeBranch: worktreeSession.worktreeBranch,
        message: `Created worktree at ${worktreeSession.worktreePath}${branchInfo}. The session is now working in the worktree. Use ExitWorktree to leave mid-session, or exit the session to be prompted.`,
      },
    }
  },
  // delta ④：旧 UI 面 renderToolUseMessage() → 纯字符串保留（旧 UI.tsx 逐字）
  renderToolUseMessage: () => 'Creating worktree…',
  mapToolResultToToolResultBlockParam(
    content: unknown,
    toolUseID: string,
  ): ToolResultBlockParam {
    const { message } = content as EnterWorktreeOutput
    return {
      type: 'tool_result',
      content: message,
      tool_use_id: toolUseID,
    }
  },
}
