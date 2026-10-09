/**
 * cli 域 S-C4 跨 commit 收口断言（零模型 / 零网络 / 零磁盘）
 *
 * 测试面（预声明接缝 = 域外裁/前向接缝头注登记，复审勿当遗漏重提）：
 *  - commit 6 -p 接线映射面：buildHeadlessOptions（commander options →
 *    HeadlessOptions 契约映射，测试面导出）：字段改名映射（tools→baseTools /
 *    addDir→addDirs / permissionPromptTool→permissionPromptToolName）/
 *    负位选项映射（sessionPersistence=false→disablePersistence）/ 布尔支
 *    （=== true 判真，commander --flag 缺省 undefined 不泄漏）/ 空选项最小面
 *  - commit 6 格式兼容校验支（旧 main.tsx L1500-1535 S-C4 回填）：
 *    stream-json 输入 + 非 stream-json 输出 / --replay-user-messages 跨字段
 *    约束 → 文案 + exit 1（process.exit stub 断言，H6 防空洞：断言显式
 *    校验行为而非能力假绿；支 1 文案 = S-C5 修波 S4 订正后逐字
 *    「requires output-format=stream-json」）；--sdk-url 支随 W-opt 可信波
 *    S1（C-3，#299）死 flag 裁除重锚 = commander unknown option 拒绝
 *    （CommanderError 断言，裁前错误支等价拒绝）
 *  - commit 6 门面显式名块（commands/sessionList/setup）：函数面在场
 *  - S-C5 修波：-p 支前置 runCliSetup（S2 安全门接线）后 -p 主面测试经
 *    setup 前导（hooks 快照 / getCommands 预取），ATLAS_CONFIG_DIR 隔离
 *    指不存在 tmp 路径 = ENOENT fail-soft 零真磁盘（getCommands 预取
 *    fire-and-forget + .catch 不阻塞断言面）
 */
import { describe, test, expect } from 'bun:test'
import { tmpdir } from 'node:os'
import {
  buildHeadlessOptions,
  buildProgram,
  getCommands,
  getSkillCommandIndex,
  listSessionLogs,
  findLatestSessionId,
  registerBuiltinCommandNames,
  runCliSetup,
} from '../../src/cli'

// -p 主面测试具：process.exit stub 抛验 + stderr 捕获 + ATLAS_CONFIG_DIR 隔离
// （S-C5 修波 S2 后 -p 支前置 runCliSetup：hooks 快照 / getCommands 预取经
// settings 读面，指向不存在 tmp 路径 → ENOENT fail-soft 零真磁盘；getCommands
// 预取 fire-and-forget + .catch（setup.ts 保真订正），不阻塞本断言面）。
async function runPrintAction(
  args: string[],
): Promise<{ exited: number | undefined; stderr: string }> {
  const program = buildProgram()
  program.exitOverride()
  const realExit = process.exit
  const realStderrWrite = process.stderr.write
  const realConfigDir = process.env.ATLAS_CONFIG_DIR
  let stderr = ''
  let exited: number | undefined
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += String(chunk)
    return true
  }) as typeof process.stderr.write
  process.exit = ((code?: number) => {
    exited = code
    throw new Error('__process_exit_stub')
  }) as typeof process.exit
  process.env.ATLAS_CONFIG_DIR = `${tmpdir()}/atlas-cli-sc4-p-nonexistent`
  try {
    await program.parseAsync(['node', 'atlascode', ...args])
  } catch (e) {
    if ((e as Error).message !== '__process_exit_stub') throw e
  } finally {
    process.exit = realExit
    process.stderr.write = realStderrWrite
    if (realConfigDir === undefined) delete process.env.ATLAS_CONFIG_DIR
    else process.env.ATLAS_CONFIG_DIR = realConfigDir
  }
  return { exited, stderr }
}

describe('cli 域 S-C4 commit 6 · -p 接线映射面（buildHeadlessOptions）', () => {
  test('字段改名映射（tools→baseTools / addDir→addDirs / permissionPromptTool→permissionPromptToolName）', () => {
    const opts = buildHeadlessOptions({
      tools: ['Read', 'Bash'],
      addDir: ['/tmp/a'],
      permissionPromptTool: 'my-mcp:prompt',
    })
    expect(opts.baseTools).toEqual(['Read', 'Bash'])
    expect(opts.addDirs).toEqual(['/tmp/a'])
    expect(opts.permissionPromptToolName).toBe('my-mcp:prompt')
  })

  test('直通字段 + 负位选项映射（sessionPersistence=false→disablePersistence）', () => {
    const opts = buildHeadlessOptions({
      continue: true,
      resume: 'session-id',
      resumeSessionAt: 'msg-1',
      rewindFiles: 'msg-2',
      verbose: true,
      outputFormat: 'json',
      allowedTools: ['Read'],
      disallowedTools: ['Bash'],
      permissionMode: 'plan',
      maxTurns: 5,
      model: 'premium',
      dangerouslySkipPermissions: true,
      // W-opt 可信波 S1（C-3，#299）：sdkUrl 输入键保留 = 判别支（HeadlessOptions
      // 字段已裁，多传该键不得泄漏进输出；输出侧断言缺席见下）
      sdkUrl: 'ws://example.com',
      replayUserMessages: true,
      agent: 'builder',
      sessionPersistence: false,
    })
    expect(opts).toEqual({
      continue: true,
      resume: 'session-id',
      resumeSessionAt: 'msg-1',
      rewindFiles: 'msg-2',
      verbose: true,
      outputFormat: 'json',
      allowedTools: ['Read'],
      disallowedTools: ['Bash'],
      baseTools: undefined,
      permissionMode: 'plan',
      permissionPromptToolName: undefined,
      maxTurns: 5,
      model: 'premium',
      dangerouslySkipPermissions: true,
      addDirs: undefined,
      // W-opt 可信波 S1（C-3，#299）：sdkUrl 字段随 HeadlessOptions 裁除离场
      //（1P 云传输域外；裁前 = 透传字段，裁后 = 输入多传该键不泄漏进输出）
      replayUserMessages: true,
      agent: 'builder',
      disablePersistence: true,
    })
  })

  test('空选项最小面（全 undefined，无泄漏键）', () => {
    expect(JSON.stringify(buildHeadlessOptions({}))).toBe('{}')
  })

  test('布尔支 === true 判真（commander 缺省 undefined 不泄漏）', () => {
    const opts = buildHeadlessOptions({ continue: undefined, verbose: 'x' })
    expect(opts.continue).toBeUndefined()
    expect(opts.verbose).toBeUndefined()
  })
})

describe('cli 域 S-C4 commit 6 · -p 格式兼容校验支（旧 main.tsx L1500-1535 回填）', () => {
  test('--input-format=stream-json + 非 stream-json 输出 → 错误支 exit 1', async () => {
    const { exited, stderr } = await runPrintAction([
      '-p',
      '--input-format',
      'stream-json',
      'hello',
    ])
    expect(exited).toBe(1)
    // S4 订正：旧 main.tsx L1507 逐字「requires output-format=stream-json」
    //（output-format 前无 --）
    expect(stderr).toContain(
      '--input-format=stream-json requires output-format=stream-json',
    )
  })

  test('--sdk-url 已裁 → commander unknown option 拒绝（裁前错误支等价拒绝）', async () => {
    // W-opt 可信波 S1（C-3，#299）：--sdk-url 死 flag 裁除（1P 云传输域外）。
    // 裁前「双格式错误支 exit 1」随 flag 离场；裁后等价拒绝 = commander
    // unknown option（exitOverride → CommanderError；gate ② 探针：exit 1 +
    // stderr 同文案「error: unknown option '--sdk-url'」）。H6：断言真拒绝支
    // （CommanderError 消息面），非 seam 文案。
    const program = buildProgram()
    program.exitOverride()
    let rejection: unknown
    try {
      await program.parseAsync([
        'node',
        'atlascode',
        '-p',
        '--sdk-url',
        'ws://example.com',
        'hello',
      ])
    } catch (e) {
      rejection = e
    }
    expect(rejection, '--sdk-url 应为 unknown option 拒绝').toBeInstanceOf(Error)
    expect((rejection as Error).message).toContain(
      "unknown option '--sdk-url'",
    )
  })

  test('--replay-user-messages + 非 stream-json 双格式 → 错误支 exit 1', async () => {
    const { exited, stderr } = await runPrintAction([
      '-p',
      '--replay-user-messages',
      'hello',
    ])
    expect(exited).toBe(1)
    expect(stderr).toContain(
      '--replay-user-messages requires both --input-format=stream-json and --output-format=stream-json',
    )
  })

  test(
    '-p 无输入 = runHeadless 入口校验支（接线核销证：动态 import 真执行，零模型）',
    async () => {
    // -p text 格式无 prompt + 无 stdin 数据（测试进程 stdin = 非 TTY，
    // getInputPrompt 3s peek 超时支 → 返回空）→ 落入 runHeadless 选项校验
    // 「输入必需」支（print.ts L464-469 逐字）exit 1。本支位于接线之后
    // （getInputPrompt + runHeadless 动态 import 真执行）——H6 防空洞：
    // 断言「到达 runHeadless 入口」而非 seam 文案（旧接缝文案已删，
    // 出现即接线回退）。3s peek 等待 → 放宽超时。
    const { exited, stderr } = await runPrintAction(['-p'])
    expect(exited).toBe(1)
    expect(stderr).toContain(
      'Input must be provided either through stdin or as a prompt argument when using --print',
    )
    expect(stderr).not.toContain('前向接缝')
  },
  15000,
)
})

describe('cli 域 S-C4 commit 6 · 门面显式名块（commands/sessionList/setup）', () => {
  test('显式名块函数面在场（STR-1 根门面契约）', () => {
    for (const fn of [
      getCommands,
      getSkillCommandIndex,
      registerBuiltinCommandNames,
      findLatestSessionId,
      listSessionLogs,
      runCliSetup,
      buildHeadlessOptions,
    ]) {
      expect(typeof fn, `${String(fn?.name ?? fn)}`).toBe('function')
    }
  })
})
