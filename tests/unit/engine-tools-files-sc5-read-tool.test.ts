/**
 * engine/tools/files S-C5 ReadTool 本体 unit 面（§8.55，高频族纵切子波 3）。
 *
 * unit 层（零磁盘——同 S-C4 core-face 纪律：permissions bootstrap-env 双戳
 * 不存在目录 FAKE_CWD + bootstrap cwd 双戳，无 fixture 无写）：
 *  - ReadTool 对象面（新仓 shared Tool 契约 = 纯对象，非 buildTool；
 *    S-B5/S-C4 先例）：name / JSON schema 4 字段面 / maxResultSizeChars
 *    Infinity / strict / TOOL_DEFAULTS 成员逐值（delta ④）/ userFacingName
 *    'Read'（delta ④ UI 3 支裁最小形）/ toAutoClassifierInput 逐字 /
 *    getPath 逐字（旧 L341-343 原样 file_path || getCwd()，非 expand）/
 *    description() 同源（delta ③ 旧 prompt 体）/ renderToolUseMessage 文本
 *    4 支（delta ⑯）/ extractSearchText 恒 ''（delta ⑯ 头注逐字）。
 *  - **checkPermissions 一线接线 = P-C4 探针族 Read 实例 2 红集 {工作目录内
 *    allow（decisionReason mode default），工作目录外无规则 ask}**（P-B2
 *    /S-C4 先例族 duck context 打 checkReadPermissionForTool 决策面；
 *    matchingRuleForInput = 桩 ① 规则求值波前向接缝，deny/allow 规则面
 *    不可观察，可观察判别 = 工作目录边界，登记）。
 *  - validateInput 面（纯路径/字符串面零 I/O）：pages errorCode 7（解析
 *    失败）/ 8（range 超限）/ binary errorCode 4（.exe 命中 + .png 图像
 *    排除支）/ P-C5 阻断设备 errorCode 9（/dev/zero + /proc/N/fd/N
 *    alias 支）/ 缺省 result true / 双站点兼容 delta ⑥（{ signal } 最小
 *    面 = 引擎 dispatch 站点，无 getAppState → 跳 deny 检查零 delta）。
 *    UNC 跳支（\\\\ 头 / // 头）= Windows NTLM 凭据泄漏防御面，POSIX
 *    测试平台不可达（expandPath 折叠双斜杠）→ 不在此断言（源体逐字保留，
 *    头注登记防当遗漏重提，S-C4 先例同源）。
 *  - mapToolResult 6 支（纯函数面）：text（行号前缀 + 测试环境模型面恒含
 *    CYBER_RISK_MITIGATION_REMINDER——getRoleConfig('small') 零配置 = ''
 *    恒不命中 MITIGATION_EXEMPT_MODELS）/ 空文件支 / 短于 offset 支 /
 *    file_unchanged（FILE_UNCHANGED_STUB 逐字）/ image / pdf / parts /
 *    notebook。
 *  - readPrompt 常量面 + memoryFreshness mtimeMs 4 函数族（纯函数，时间
 *    相对量 Date.now() 偏移）+ createUserMessage S-E3 M-1 不变量（uuid
 *    恒戳 + timestamp ISO + isMeta 面）+ binaryExtensions 面 +
 *    readFileLimits memoize 面 + registerFileReadListener 面 +
 *    MaxFileReadTokenExceededError 面。
 *
 * 深度 import（门面归集本切片落地，本文件经 tools 门面 = 双门面回归面）：
 *  ../../src/engine/tools（ReadTool / READ_TOOL_INPUT_SCHEMA /
 *  FILE_READ_TOOL_NAME / readPrompt 7 常量 / memoryFreshness 4 函数 /
 *  createUserMessage / MaxFileReadTokenExceededError /
 *  registerFileReadListener / CYBER_RISK_MITIGATION_REMINDER /
 *  binaryExtensions 3 名 / readFileLimits 3 名 / ReadToolInput·FileState·
 *  ReadFileState·ReadOutput 型）
 */
import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
} from 'bun:test'
import {
  ReadTool,
  READ_TOOL_INPUT_SCHEMA,
  FILE_READ_TOOL_NAME,
  FILE_UNCHANGED_STUB,
  MAX_LINES_TO_READ,
  DESCRIPTION,
  LINE_FORMAT_INSTRUCTION,
  OFFSET_INSTRUCTION_DEFAULT,
  OFFSET_INSTRUCTION_TARGETED,
  renderPromptTemplate,
  memoryAgeDays,
  memoryAge,
  memoryFreshnessText,
  memoryFreshnessNote,
  createUserMessage,
  MaxFileReadTokenExceededError,
  registerFileReadListener,
  CYBER_RISK_MITIGATION_REMINDER,
  BINARY_EXTENSIONS,
  hasBinaryExtension,
  isBinaryContent,
  DEFAULT_MAX_OUTPUT_TOKENS,
  getDefaultFileReadingLimits,
  type ReadOutput,
  type FilesToolUseContext,
} from '../../src/engine/tools'
import {
  resetPermissionsBootstrapEnv,
  setPermissionsBootstrapEnv,
} from '../../src/permissions'
import { setOriginalCwd, setCwdState } from '../../src/bootstrap'
import type { ToolPermissionContext } from '../../src/shared'

// ── 公共夹具（S-C4 同形）────────────────────────────────────────────────

const FAKE_CWD = '/home/atlas-sc5/proj' // 不存在目录：realpath ENOENT 短路零盘

function makeCtx(
  mode: ToolPermissionContext['mode'] = 'default',
): ToolPermissionContext {
  return {
    mode,
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: true,
  }
}

function makeFilesCtx(
  ctx: ToolPermissionContext,
): FilesToolUseContext {
  return {
    getAppState: () => ({ toolPermissionContext: ctx }),
    abortController: new AbortController(),
  }
}

beforeAll(() => {
  // permissions 域工作目录面 + bootstrap 域 cwd 面双戳 FAKE_CWD 零盘
  setPermissionsBootstrapEnv({
    getOriginalCwd: () => FAKE_CWD,
    getCwd: () => FAKE_CWD,
  })
  setOriginalCwd(FAKE_CWD)
  setCwdState(FAKE_CWD)
})

afterAll(() => {
  resetPermissionsBootstrapEnv()
})

type Decision = {
  behavior: string
  updatedInput?: unknown
  decisionReason?: { type: string; mode?: string }
}

// ── ReadTool 对象面（shared Tool 契约纯对象）────────────────────────────

describe('ReadTool 对象面', () => {
  test('name / schema 引用 / 展示面 / TOOL_DEFAULTS 逐值', () => {
    expect(ReadTool.name).toBe(FILE_READ_TOOL_NAME)
    expect(ReadTool.name).toBe('Read')
    // inputSchema = inputJSONSchema = 同一 JSON schema 对象（S-B5/S-C4 先例）
    expect(ReadTool.inputSchema).toBe(READ_TOOL_INPUT_SCHEMA)
    expect(ReadTool.inputJSONSchema).toBe(READ_TOOL_INPUT_SCHEMA)
    // delta ④：output bounded by maxTokens，never persist → Infinity
    expect(ReadTool.maxResultSizeChars).toBe(Infinity)
    expect(ReadTool.strict).toBe(true)
    expect(ReadTool.searchHint).toBe('read files, images, PDFs, notebooks')
    expect(ReadTool.isEnabled()).toBe(true)
    expect(ReadTool.isConcurrencySafe(null)).toBe(true)
    expect(ReadTool.isReadOnly(null)).toBe(true)
    expect(ReadTool.isDestructive?.(null)).toBe(false)
    // delta ④：旧生效值 = UI.tsx 3 支（Reading Plan / Read agent output /
    // Read）→ 最小 'Read'
    expect(ReadTool.userFacingName(null)).toBe('Read')
  })

  test('JSON schema 4 字段 + required 单一必填 + pages 描述含 20 页上限', () => {
    expect(READ_TOOL_INPUT_SCHEMA.type).toBe('object')
    const props = READ_TOOL_INPUT_SCHEMA.properties as Record<
      string,
      { description?: string }
    >
    expect(Object.keys(props)).toEqual([
      'file_path',
      'offset',
      'limit',
      'pages',
    ])
    expect(READ_TOOL_INPUT_SCHEMA.required).toEqual(['file_path'])
    expect(props.pages?.description).toContain('Maximum 20 pages per request')
  })

  test('toAutoClassifierInput = input.file_path（逐字）', () => {
    expect(ReadTool.toAutoClassifierInput({ file_path: '/a/b.txt' })).toBe(
      '/a/b.txt',
    )
  })

  test('getPath 逐字：缺省 → getCwd()（FAKE_CWD）/ 有值原样（非 expand）', () => {
    expect(ReadTool.getPath({})).toBe(FAKE_CWD)
    expect(ReadTool.getPath({ file_path: 'rel/x' })).toBe('rel/x')
    expect(ReadTool.getPath({ file_path: '/abs/x' })).toBe('/abs/x')
  })

  test('description() = 旧 prompt 体（delta ③，默认 limits 面）', async () => {
    const d = await ReadTool.description(null, {
      isNonInteractiveSession: true,
      toolPermissionContext: null,
      tools: [],
    })
    expect(d).toContain(`up to ${MAX_LINES_TO_READ} lines`)
    expect(d).toContain(LINE_FORMAT_INSTRUCTION)
    expect(d).toContain(OFFSET_INSTRUCTION_DEFAULT)
    // delta ② readFileLimits：includeMaxSizeInPrompt undefined → 无大小支
    expect(d).not.toContain('Files larger than')
    // 新模型名恒不命中 claude-3-haiku 子串 → PDF 块面恒支持（modelRef 裁定）
    expect(d).toContain('This tool can read PDF files')
    expect(d).toContain('Jupyter notebooks')
  })

  test('renderToolUseMessage 文本 4 支（delta ⑯ 逐字）', () => {
    expect(
      ReadTool.renderToolUseMessage({ pages: '1-5' }, { verbose: false }),
    ).toBeNull()
    expect(
      ReadTool.renderToolUseMessage(
        { file_path: '/tmp/shot.png', pages: '1-5' },
        { verbose: false },
      ),
    ).toBe('/tmp/shot.png · pages 1-5')
    // semantic 字符串数字容忍（delta ②，render 入口转换）
    expect(
      ReadTool.renderToolUseMessage(
        { file_path: '/tmp/f.txt', offset: '2', limit: '3' },
        { verbose: true },
      ),
    ).toBe('/tmp/f.txt · lines 2-4')
    expect(
      ReadTool.renderToolUseMessage(
        { file_path: '/tmp/f.txt', offset: '5' },
        { verbose: true },
      ),
    ).toBe('/tmp/f.txt · from line 5')
    expect(
      ReadTool.renderToolUseMessage(
        { file_path: '/tmp/f.txt' },
        { verbose: false },
      ),
    ).toBe('/tmp/f.txt')
  })

  test('extractSearchText 恒 ""（delta ⑯ 头注逐字）', () => {
    expect(ReadTool.extractSearchText?.({})).toBe('')
  })
})

// ── validateInput 面（纯路径/字符串面零 I/O）────────────────────────────

describe('validateInput 面', () => {
  test('缺省（纯文本相对路径）→ result true', async () => {
    expect(await ReadTool.validateInput?.({ file_path: 'a.txt' })).toEqual({
      result: true,
    })
  })

  test('pages 解析失败 → errorCode 7', async () => {
    const v = (await ReadTool.validateInput?.({
      file_path: 'a.pdf',
      pages: 'abc',
    })) as { result: boolean; message?: string; errorCode?: number }
    expect(v.result).toBe(false)
    expect(v.errorCode).toBe(7)
    expect(v.message).toContain('Invalid pages parameter')
  })

  test('pages range 超 20 页上限 → errorCode 8', async () => {
    const v = (await ReadTool.validateInput?.({
      file_path: 'a.pdf',
      pages: '1-25',
    })) as { result: boolean; message?: string; errorCode?: number }
    expect(v.result).toBe(false)
    expect(v.errorCode).toBe(8)
    expect(v.message).toContain('exceeds maximum of 20 pages')
  })

  test('pages 合法 range + 文本扩展名 → result true', async () => {
    expect(
      await ReadTool.validateInput?.({ file_path: 'a.pdf', pages: '1-20' }),
    ).toEqual({ result: true })
  })

  test('二进制扩展名 → errorCode 4 / 图像扩展名排除支 → result true', async () => {
    const exe = (await ReadTool.validateInput?.({
      file_path: 'a.exe',
    })) as { result: boolean; message?: string; errorCode?: number }
    expect(exe.result).toBe(false)
    expect(exe.errorCode).toBe(4)
    expect(exe.message).toContain('binary .exe file')
    // 图像 5 扩展名（png/jpg/jpeg/gif/webp）排除支
    expect(
      await ReadTool.validateInput?.({ file_path: 'a.png' }),
    ).toEqual({ result: true })
  })

  // ── P-C5 探针锚点（阻断设备 errorCode 9；恰 1 红集）───────────────────
  test('P-C5 阻断设备 /dev/zero → errorCode 9（无限输出面）', async () => {
    const v = (await ReadTool.validateInput?.({
      file_path: '/dev/zero',
    })) as { result: boolean; message?: string; errorCode?: number }
    expect(v.result).toBe(false)
    expect(v.errorCode).toBe(9)
    expect(v.message).toContain(
      "Cannot read '/dev/zero': this device file would block or produce infinite output.",
    )
  })

  test('P-C5 /proc/<pid>/fd/N stdio alias 支 → errorCode 9', async () => {
    const v = (await ReadTool.validateInput?.({
      file_path: '/proc/123/fd/1',
    })) as { result: boolean; errorCode?: number }
    expect(v.result).toBe(false)
    expect(v.errorCode).toBe(9)
  })

  test('双站点兼容（delta ⑥）：{ signal } 最小面（引擎 dispatch 站点）→ 跳 deny 检查零 delta', async () => {
    const signal = new AbortController().signal
    expect(
      await ReadTool.validateInput?.({ file_path: 'a.txt' }, { signal }),
    ).toEqual({ result: true })
  })
})

// ── checkPermissions 一线接线（P-C4 Read 实例 2 红集）────────────────────

describe('checkPermissions 一线接线（P-C4 2 红集 {工作目录内 allow, 工作目录外 ask}）', () => {
  test('Read 工作目录内路径（无规则）→ allow + decisionReason mode default + updatedInput 透传', async () => {
    const input = { file_path: `${FAKE_CWD}/sub/f.txt` }
    const dec = (await ReadTool.checkPermissions(
      input,
      makeFilesCtx(makeCtx()),
    )) as Decision
    expect(dec.behavior).toBe('allow')
    expect(dec.decisionReason).toEqual({ type: 'mode', mode: 'default' })
    expect(dec.updatedInput).toBe(input)
  })

  test('Read 工作目录外路径（无规则）→ ask', async () => {
    const dec = (await ReadTool.checkPermissions(
      { file_path: '/etc/hostname' },
      makeFilesCtx(makeCtx()),
    )) as Decision
    expect(dec.behavior).toBe('ask')
  })

  test('Read 缺 file_path → getPath 回退 getCwd()（工作目录内）→ allow', async () => {
    const dec = (await ReadTool.checkPermissions(
      {},
      makeFilesCtx(makeCtx()),
    )) as Decision
    expect(dec.behavior).toBe('allow')
  })
})

// ── mapToolResult 6 支（纯函数面）───────────────────────────────────────

function textData(partial: Partial<ReadOutput['file']> & {
  startLine?: number
}): Extract<ReadOutput, { type: 'text' }> {
  return {
    type: 'text',
    file: {
      filePath: '/x/a.txt',
      content: 'l1\nl2',
      numLines: 2,
      startLine: 1,
      totalLines: 2,
      ...partial,
    } as Extract<ReadOutput, { type: 'text' }>['file'],
  }
}

describe('mapToolResult 6 支', () => {
  test('text 支：行号前缀（紧凑 N\\t 面）+ 测试环境模型面恒含缓解提醒', () => {
    const block = ReadTool.mapToolResultToToolResultBlockParam(
      textData({}),
      'tu-t1',
    )
    expect(block.tool_use_id).toBe('tu-t1')
    // 默认 ATLAS_DISABLE_COMPACT_LINE_PREFIX 未设 → 紧凑 N\t 面
    // 测试环境 getRoleConfig('small') 零配置 = '' 恒不命中豁免集 → 含提醒
    expect(block.content).toBe(
      `1\tl1\n2\tl2` + CYBER_RISK_MITIGATION_REMINDER,
    )
  })

  test('text 支 startLine 偏移：前缀随行号走', () => {
    const block = ReadTool.mapToolResultToToolResultBlockParam(
      textData({ content: 'x', startLine: 3 }),
      'tu-t2',
    )
    expect(block.content).toBe(`3\tx` + CYBER_RISK_MITIGATION_REMINDER)
  })

  test('text 支空文件：contents are empty system-reminder', () => {
    const block = ReadTool.mapToolResultToToolResultBlockParam(
      textData({ content: '', totalLines: 0 }),
      'tu-t3',
    )
    expect(block.content).toBe(
      '<system-reminder>Warning: the file exists but the contents are empty.</system-reminder>',
    )
  })

  test('text 支短于 offset：shorter than offset system-reminder', () => {
    const block = ReadTool.mapToolResultToToolResultBlockParam(
      textData({ content: '', totalLines: 5, startLine: 10 }),
      'tu-t4',
    )
    expect(block.content).toBe(
      '<system-reminder>Warning: the file exists but is shorter than the provided offset (10). The file has 5 lines.</system-reminder>',
    )
  })

  test('file_unchanged 支：FILE_UNCHANGED_STUB 逐字', () => {
    const block = ReadTool.mapToolResultToToolResultBlockParam(
      { type: 'file_unchanged', file: { filePath: '/x/a.txt' } },
      'tu-t5',
    )
    expect(block.content).toBe(FILE_UNCHANGED_STUB)
  })

  test('image 支：base64 块面（media_type 透传）', () => {
    const block = ReadTool.mapToolResultToToolResultBlockParam(
      {
        type: 'image',
        file: { base64: 'AA==', type: 'image/png', originalSize: 2 },
      },
      'tu-t6',
    )
    expect(block.content).toEqual([
      {
        type: 'image',
        source: { type: 'base64', data: 'AA==', media_type: 'image/png' },
      },
    ])
  })

  test('pdf 支：元数据单行（内容走 document 块 newMessages 面）', () => {
    const block = ReadTool.mapToolResultToToolResultBlockParam(
      {
        type: 'pdf',
        file: { filePath: '/x/a.pdf', base64: 'AA==', originalSize: 626 },
      },
      'tu-t7',
    )
    expect(typeof block.content).toBe('string')
    expect(block.content as string).toContain('PDF file read: /x/a.pdf')
  })

  test('parts 支：页数 + 路径元数据', () => {
    const block = ReadTool.mapToolResultToToolResultBlockParam(
      {
        type: 'parts',
        file: {
          filePath: '/x/a.pdf',
          originalSize: 626,
          count: 3,
          outputDir: '/tmp/pages',
        },
      },
      'tu-t8',
    )
    expect(block.content).toContain('PDF pages extracted: 3 page(s) from /x/a.pdf')
  })

  test('notebook 支：cells → 块面（文本块合并经 mapNotebookCellsToToolResult）', () => {
    const block = ReadTool.mapToolResultToToolResultBlockParam(
      {
        type: 'notebook',
        file: {
          filePath: '/x/a.ipynb',
          cells: [{ cell_type: 'code', source: 'x = 1' }],
        },
      },
      'tu-t9',
    )
    const content = block.content as Array<{ type: string; text?: string }>
    expect(Array.isArray(content)).toBe(true)
    expect(
      content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n'),
    ).toContain('x = 1')
  })
})

// ── readPrompt 常量面（delta ③ 同源单一事实源）──────────────────────────

describe('readPrompt 面', () => {
  test('常量逐字', () => {
    expect(MAX_LINES_TO_READ).toBe(2000)
    expect(DESCRIPTION).toBe('Read a file from the local filesystem.')
    expect(LINE_FORMAT_INSTRUCTION).toBe(
      '- Results are returned using cat -n format, with line numbers starting at 1',
    )
    expect(FILE_UNCHANGED_STUB).toContain('File unchanged since last read')
    expect(OFFSET_INSTRUCTION_DEFAULT).toContain('offset and limit')
    expect(OFFSET_INSTRUCTION_TARGETED).toContain('only read that part')
  })

  test('renderPromptTemplate 三参拼装', () => {
    const out = renderPromptTemplate('L', 'M', 'O')
    expect(out).toContain('up to 2000 lines')
    expect(out).toContain('L')
    expect(out).toContain('M')
    expect(out).toContain('O')
  })
})

// ── memoryFreshness mtimeMs 4 函数族（纯函数，时间相对量）────────────────

describe('memoryFreshness 面（delta ⑬ mtimeMs 族，区别于 src/memory 域 filePath 族）', () => {
  const now = Date.now()
  const HOUR = 3_600_000
  const DAY = 86_400_000

  test('memoryAgeDays：today 0 / yesterday 1 / N 天 N / 未来时钟偏斜 clamp 0', () => {
    expect(memoryAgeDays(now)).toBe(0)
    expect(memoryAgeDays(now - 40 * HOUR)).toBe(1)
    expect(memoryAgeDays(now - 47 * DAY)).toBe(47)
    expect(memoryAgeDays(now + 10 * DAY)).toBe(0)
  })

  test('memoryAge：today / yesterday / N days ago', () => {
    expect(memoryAge(now)).toBe('today')
    expect(memoryAge(now - 40 * HOUR)).toBe('yesterday')
    expect(memoryAge(now - 47 * DAY)).toBe('47 days ago')
  })

  test('memoryFreshnessText：≤1 天 "" / >1 天陈旧警示', () => {
    expect(memoryFreshnessText(now)).toBe('')
    expect(memoryFreshnessText(now - 40 * HOUR)).toBe('')
    expect(memoryFreshnessText(now - 3 * DAY)).toContain(
      'This memory is 3 days old.',
    )
  })

  test('memoryFreshnessNote：system-reminder 包裹 + 尾换行 / 新记忆 ""', () => {
    expect(memoryFreshnessNote(now)).toBe('')
    const note = memoryFreshnessNote(now - 3 * DAY)
    expect(note).toContain('<system-reminder>This memory is 3 days old.')
    expect(note.endsWith('</system-reminder>\n')).toBe(true)
  })
})

// ── createUserMessage 域内最小形（S-E3 M-1 不变量）──────────────────────

describe('createUserMessage 面（delta ① 不变量）', () => {
  test('uuid 恒戳 + timestamp ISO + message 面', () => {
    const m = createUserMessage({ content: 'hello' })
    expect(m.type).toBe('user')
    expect(typeof m.uuid).toBe('string')
    expect(m.uuid.length).toBeGreaterThan(0)
    expect(Number.isFinite(Date.parse(m.timestamp))).toBe(true)
    expect(m.message.role).toBe('user')
    expect(m.message.content).toBe('hello')
    expect(m.isMeta).toBeUndefined()
  })

  test('isMeta 面透传 + content 块面引用透传', () => {
    const blocks: unknown[] = [{ type: 'document' }]
    const m = createUserMessage({ content: blocks, isMeta: true })
    expect(m.isMeta).toBe(true)
    expect(m.message.content).toBe(blocks)
  })
})

// ── binaryExtensions 面（S-C1 移植，delta 头注见该文件）─────────────────

describe('binaryExtensions 面', () => {
  test('hasBinaryExtension：扩展名命中 / 纯文本 / 无扩展名', () => {
    expect(hasBinaryExtension('a.exe')).toBe(true)
    expect(hasBinaryExtension('a.zip')).toBe(true)
    expect(hasBinaryExtension('a.txt')).toBe(false)
    expect(hasBinaryExtension('Makefile')).toBe(false)
    expect(BINARY_EXTENSIONS.has('.png')).toBe(true)
  })

  test('isBinaryContent：NUL 字节强信号 / 纯文本否', () => {
    expect(isBinaryContent(Buffer.from([0x41, 0x00, 0x42]))).toBe(true)
    expect(isBinaryContent(Buffer.from('plain text here'))).toBe(false)
  })
})

// ── readFileLimits 面（memoize 首次调用固化）────────────────────────────

describe('readFileLimits 面', () => {
  test('DEFAULT_MAX_OUTPUT_TOKENS 逐值', () => {
    expect(DEFAULT_MAX_OUTPUT_TOKENS).toBe(25000)
  })

  test('getDefaultFileReadingLimits：默认值逐字段 + memoize 同引用', () => {
    const a = getDefaultFileReadingLimits()
    // MAX_OUTPUT_SIZE = 0.25MB（fileUtils S-C1 单一事实源）
    expect(a.maxSizeBytes).toBe(Math.floor(0.25 * 1024 * 1024))
    expect(a.maxTokens).toBe(25000)
    expect(a.includeMaxSizeInPrompt).toBeUndefined()
    expect(a.targetedRangeNudge).toBeUndefined()
    expect(getDefaultFileReadingLimits()).toBe(a)
  })
})

// ── 监听器 / 错误类 / 常量面 + 双门面回归────────────────────────────────

describe('监听器 / 错误类 / 双门面回归面', () => {
  test('registerFileReadListener 返回 unregister 函数', () => {
    const calls: Array<[string, string]> = []
    const unregister = registerFileReadListener((p, c) => {
      calls.push([p, c])
    })
    expect(typeof unregister).toBe('function')
    unregister()
    expect(calls).toEqual([])
  })

  test('MaxFileReadTokenExceededError 经门面可达 + 消息面', () => {
    const e = new MaxFileReadTokenExceededError(30000, 25000)
    expect(e.name).toBe('MaxFileReadTokenExceededError')
    expect(e.message).toContain('exceeds maximum allowed tokens (25000)')
  })

  test('CYBER_RISK_MITIGATION_REMINDER 逐字面（malware + system-reminder 包裹）', () => {
    expect(CYBER_RISK_MITIGATION_REMINDER).toContain('malware')
    expect(CYBER_RISK_MITIGATION_REMINDER).toContain('<system-reminder>')
    expect(CYBER_RISK_MITIGATION_REMINDER.endsWith('\n')).toBe(true)
  })

  test('S-C5 符号经 tools 门面可达（import 即回归断言）', () => {
    expect(typeof ReadTool.call).toBe('function')
    expect(READ_TOOL_INPUT_SCHEMA.type).toBe('object')
    expect(DESCRIPTION).toContain('Read a file')
  })
})
