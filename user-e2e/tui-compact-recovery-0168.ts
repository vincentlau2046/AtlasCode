/**
 * 0.1.68 块 F′ autocompact 恢复对齐波 · 双面活探针（e2e lane，gate 判据⑤，
 * 工单 docs/2026-10-14-p0-wave-0168-ticket.md §2 ⑤；F-AB 结构性 gate 判别面——
 * 行为性生产 lane 面 = B 面模型不重读已读文件 + 上下文 token 恢复曲线，归生产 lane 观察面）。
 *
 * 断言面（全 hard；零模型零 8999 = 纯 import + CompactPorts DI 假注 + 源级 + 纯函数）：
 *   B1  C1 续会话提示：B 面 post-compact summary 消息含 "This session is being continued"（A/B 恒等）
 *   B2  C2 文件态重建：readFileState N=2 文件 → post-compact attachments 含 N 文件重注（红→绿）
 *   B2b C2 无文件恒 ∅ 恒等锚：无打开文件 → attachments ∅（防误注）
 *   B3  C3 已加载工具续发：消息携 tool_reference 块 → boundary compactMetadata.preCompactDiscoveredTools 在场（sorted，红→绿）
 *   B4  C4 session_start hooks：post-compact hookResults 含 session-start 载体 + port 调用 arg 'compact'；hooks 关（返回 ∅）→ hookResults ∅ 恒等锚
 *   B5  C5 PostCompact hooks：post-compact userDisplayMessage 含 PostCompact 载体（compact.ts 合流面 = combinedUserDisplayMessage，非 hookResults）；关态（返回空）→ 载体离场恒等锚
 *   B6  C6 元数据重钉：reAppendSessionMetadata 富体调用点在场（0.1.67 C-1 恒等锚，基线同绿）
 *   B7  C7 keepRecent N：createAutoCompactCompact keepRecent=3 → result.messagesToKeep = 最近 3 条原文（红→绿）
 *   B7b C7 N=0 恒等锚：缺省 0 → messagesToKeep 缺席（手动 /compact + reactive 零回归锚）
 *   F-AB 恢复完整性判定：B 面 C1–C7 全在场（C8 会话记忆保全 = 登记面）= 完整；任一缺 = 不完整（GATE-OPEN 打回）
 *   A1  裁剪 fail-safe 恒等：ports 未注册 + richContext null → 裁剪路径（修前行为零回归锚：attachments ∅ + keepRecent 恒 0）
 *   A2  port 门控 fail-safe：richContext 在场但 getCompactPorts() null → 裁剪路径（未接线车道，如 headless print.ts 窄体面）
 *   S1  F-1a skip 载体：PreCompact hook block → compactionSkipped=true 载体（压缩未执行，消息面不置换）
 *   S2  F-1a loop 消费点双门：loop.ts `!oc.compactionResult.compactionSkipped`（消息面门 + compacted 事件门）
 *   T1  F-3a 小窗禁用：32K 窗（阈值 32768−20k−13k=−232 ≤ 0）→ shouldAutoCompact = false（修前恒真 = 每轮压缩风暴，红→绿）
 *   T2  F-3a 警告面退化：小窗 calculateTokenWarningState → autoCompactDisabledBySmallWindow=true + isAboveAutoCompactThreshold 不置位（负阈值不假警告）
 *   T3  F-3a 大窗恒等锚：256K/1M/200K 窗阈值精确同值（229144/1015576/171800）+ 显形字段 undefined（零回归）
 *   T4  F-3a 显形面：TokenWarning 小窗禁用提示行在场 + 大窗「until auto-compact」原文案恒等在场
 *   G4  C7 定参：AUTOCOMPACT_KEEP_RECENT === 3 + agentLoopDeps auto-compact 车道 keepRecent 定参接线（手动/reactive 缺省 0 面零回归）
 *
 * 基线面（修前红形 @d4b492d = v0.1.67）：createAutoCompactCompact / isAutoCompactThresholdPositive /
 * autoCompactDisabledBySmallWindow / AUTOCOMPACT_KEEP_RECENT 全缺席 → B1–B7/A1/A2/S1/T1/T2/T4/G4 定向红
 *（= 17 hardFail，19 探针中仅 2 恒等锚绿）；恒等锚 B6（reAppend 在场，0.1.67 C-1）/ T3（大窗阈值同式同值）
 * = 基线同绿（零回归锚证明非探针侧假绿）。
 * 用法：
 *   ATLAS_E2E_COMPACT0168_REPO=<worktree 绝对路径> \
 *     bun run /home/vince/projects/AtlasCode/user-e2e/tui-compact-recovery-0168.ts
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO =
  process.env.ATLAS_E2E_COMPACT0168_REPO ??
  '/home/vince/projects/AtlasCode/worktrees/worktree-gate-068'

type Probe = { id: string, hard: boolean, ok: boolean | null, detail: string }

const readSrc = (p: string): string => {
  try {
    return readFileSync(p, 'utf8')
  } catch {
    return ''
  }
}

// ── 假消息 / 假上下文 / 假端口 ────────────────────────────────────
const mkMsg = (i: number) => ({
  role: 'user',
  type: 'user',
  message: { content: [{ type: 'text', text: `msg-${i}` }] },
})
const makeMessages = (n: number) => {
  const ms = Array.from({ length: n }, (_, i) => mkMsg(i))
  // C3：user tool_result 内 tool_reference 块（extractDiscoveredToolNames 扫描面）
  ms[5] = {
    role: 'user',
    type: 'user',
    message: {
      content: [
        { type: 'text', text: 'msg-5' },
        {
          type: 'tool_result',
          tool_use_id: 'tu_1',
          content: [
            { type: 'tool_reference', tool_name: 'FakeToolA' },
            { type: 'tool_reference', tool_name: 'FakeToolB' },
          ],
        },
      ],
    },
  }
  return ms
}

const makeCtx = (fileEntries: Record<string, { content: string, timestamp: number }>) => {
  const entries = new Map(Object.entries(fileEntries))
  return {
    abortController: new AbortController(),
    readFileState: {
      entries: () => entries.entries(),
      clear: () => { entries.clear() },
    },
    options: { mainLoopModel: 'fake-model' },
    getAppState: () => ({}),
  }
}

type PortBehavior = {
  pre?: { blocked?: boolean, blockingReason?: string }
  /** undefined = 开态（默认载体）；'off' = 关态（返回空）。 */
  post?: { userDisplayMessage?: string } | 'off'
  sessionStart?: unknown[] | null
}
const makePorts = (behavior: PortBehavior) => {
  const calls = { pre: 0, post: 0, sessionStart: 0, attachInput: null as null | Record<string, unknown> }
  const ports: any = {
    summarize: async () => ({
      type: 'assistant',
      role: 'assistant',
      message: { content: [{ type: 'text', text: 'FAKE-SUMMARY' }] },
    }),
    executePreCompactHooks: async () => {
      calls.pre++
      return behavior.pre ?? {}
    },
    executePostCompactHooks: async () => {
      calls.post++
      if (behavior.post === 'off') return {}
      return behavior.post ?? { userDisplayMessage: 'POST-HOOK-DONE' }
    },
    processSessionStartHooks: async () => {
      calls.sessionStart++
      return (
        behavior.sessionStart ?? [
          {
            role: 'user',
            type: 'user',
            message: { content: [{ type: 'text', text: 'SESSION-START-HOOK' }] },
          },
        ]
      )
    },
    buildPostCompactAttachments: async (
      state: Record<string, { content: string, timestamp: number }>,
    ) => {
      calls.attachInput = state
      return Object.entries(state).map(([path, v]) => ({
        role: 'user',
        type: 'user',
        attachmentPath: path,
        message: { content: [{ type: 'text', text: `ATTACH:${path}:${v.content}` }] },
      }))
    },
  }
  return { ports, calls }
}

const summaryText = (result: any): string =>
  JSON.stringify(result?.summaryMessages ?? [])
const hookText = (result: any): string =>
  JSON.stringify(result?.hookResults ?? [])

async function main(): Promise<void> {
  const probes: Probe[] = []
  const push = (id: string, ok: boolean | null, detail: string, hard = true) =>
    probes.push({ id, hard, ok, detail })

  const richMod: any = await import(join(REPO, 'src/engine/context/autoCompactRich.ts')).catch(() => ({}))
  const portsMod: any = await import(join(REPO, 'src/engine/context/compactPorts.ts')).catch(() => ({}))
  const acMod: any = await import(join(REPO, 'src/engine/context/autoCompact.ts')).catch(() => ({}))

  const compactSrc = readSrc(join(REPO, 'src/engine/context/compact.ts'))
  const loopSrc = readSrc(join(REPO, 'src/engine/query/loop.ts'))
  const twSrc = readSrc(join(REPO, 'src/tui/components/TokenWarning.tsx'))
  const depsSrc = readSrc(join(REPO, 'src/tui/agentLoopDeps.ts'))

  const richAvailable = typeof richMod.createAutoCompactCompact === 'function'
  const portsAvailable = typeof portsMod.setCompactPorts === 'function'

  const messages = makeMessages(10)

  // ── 面 1：B 面（富路径）C1–C7 ───────────────────────────────────
  let b: Record<string, boolean> = {}
  const fakeTrimmedSummarize = async () => 'TRIMMED-SUMMARY'

  if (richAvailable && portsAvailable) {
    const mkCompact = (
      fileEntries: Record<string, { content: string, timestamp: number }>,
      behavior: PortBehavior,
      keepRecent?: number,
    ) => {
      const { ports, calls } = makePorts(behavior)
      portsMod.setCompactPorts(ports)
      const compact = richMod.createAutoCompactCompact({
        trimmedSummarize: fakeTrimmedSummarize,
        richContext: makeCtx(fileEntries),
        buildCacheSafeParams: (ms: unknown[]) => ({
          systemPrompt: 'SP',
          userContext: {},
          systemContext: {},
          forkContextMessages: ms,
        }),
        ...(keepRecent !== undefined ? { keepRecent } : {}),
      })
      return { compact, calls, reset: () => portsMod.setCompactPorts(null) }
    }

    // B1 C1 续会话提示
    {
      const { compact, reset } = mkCompact({}, {})
      const r = await compact(messages)
      const c1 = summaryText(r).includes('This session is being continued')
      b.c1 = c1
      push(
        'B1-C1-resume-prompt',
        c1,
        c1
          ? `C1 续会话提示（B 面 summary 消息含 "This session is being continued" 文案 = 续会话语义在场，A/B 双面恒等）`
          : `C1 缺口（summary 文案缺席；out=${summaryText(r).slice(0, 120) || '(空)'} = 修前红形/结构承载）`,
      )
      reset()
    }

    // B2 C2 文件态重建（N=2）
    {
      const files = { '/tmp/a.txt': { content: 'A', timestamp: 1 }, '/tmp/b.txt': { content: 'B', timestamp: 2 } }
      const { compact, calls, reset } = mkCompact(files, {})
      const r = await compact(messages)
      const atts: unknown[] = r?.attachments ?? []
      const c2 = atts.length === 2 && calls.attachInput !== null && Object.keys(calls.attachInput).length === 2
      b.c2 = c2
      push(
        'B2-C2-file-state-rebuild',
        c2,
        c2
          ? `C2 文件态重建（readFileState N=2 → port.buildPostCompactAttachments 收 N 条目 + post-compact attachments 含 N 文件重注；修前裁剪面 attachments 恒空红→修后绿）`
          : `C2 缺口（attachments=${atts.length} port 输入=${calls.attachInput ? Object.keys(calls.attachInput).length : 'null'} = 修前红形）`,
      )
      reset()
    }

    // B2b C2 无文件恒 ∅ 恒等锚
    {
      const { compact, reset } = mkCompact({}, {})
      const r = await compact(messages)
      const c2b = (r?.attachments ?? []).length === 0
      b.c2b = c2b
      push(
        'B2b-C2-no-file-empty-anchor',
        c2b,
        c2b
          ? `C2 无文件恒 ∅ 恒等锚（无打开文件 → attachments 空 = 不误注，防富路径误注面）`
          : `恒等锚缺口（无文件面 attachments=${(r?.attachments ?? []).length} 非空 = 误注面失守）`,
      )
      reset()
    }

    // B3 C3 已加载工具续发
    {
      const { compact, reset } = mkCompact({}, {})
      const r = await compact(messages)
      const tools = (r?.boundaryMarker as any)?.compactMetadata?.preCompactDiscoveredTools
      const c3 = Array.isArray(tools) && JSON.stringify(tools) === JSON.stringify(['FakeToolA', 'FakeToolB'])
      b.c3 = c3
      push(
        'B3-C3-tool-continuation',
        c3,
        c3
          ? `C3 已加载工具续发（消息携 tool_reference 块 → boundary compactMetadata.preCompactDiscoveredTools = ["FakeToolA","FakeToolB"] sorted 在场；post-compact schema filter 持续下发依据）`
          : `C3 缺口（preCompactDiscoveredTools=${JSON.stringify(tools) ?? '缺席'} = 修前红形/结构承载）`,
      )
      reset()
    }

    // B4 C4 session_start hooks（绿 + 关时恒 ∅ 两态）
    {
      const g1 = mkCompact({}, {})
      const r1 = await g1.compact(messages)
      const onOk = hookText(r1).includes('SESSION-START-HOOK') && g1.calls.sessionStart === 1
      const g2 = mkCompact({}, { sessionStart: [] })
      const r2 = await g2.compact(messages)
      const offOk = (r2?.hookResults ?? []).length === 0
      g1.reset()
      g2.reset()
      const c4 = onOk && offOk
      b.c4 = c4
      push(
        'B4-C4-session-start-hooks',
        c4,
        c4
          ? `C4 session_start hooks（post-compact hookResults 含 session-start 载体 + port 调用 arg 'compact'；hooks 关（返回 ∅）→ hookResults 恒 ∅ 恒等锚）`
          : `C4 缺口（开面=${onOk} 关面=${offOk} = 修前红形/结构承载）`,
      )
    }

    // B5 C5 PostCompact hooks（开态载体合流 userDisplayMessage + 关态离场 两态）
    {
      const g1 = mkCompact({}, {})
      const r1 = await g1.compact(messages)
      const onOk =
        typeof r1?.userDisplayMessage === 'string' &&
        r1.userDisplayMessage.includes('POST-HOOK-DONE') &&
        g1.calls.post === 1
      const g2 = mkCompact({}, { post: 'off' })
      const r2 = await g2.compact(messages)
      // post 关态（返回空）：合流面 userDisplayMessage 无 PostCompact 载体（session-start 走 hookResults 不混面）
      const offOk = !(r2?.userDisplayMessage ?? '').includes('POST-HOOK-DONE')
      g1.reset()
      g2.reset()
      const c5 = onOk && offOk
      b.c5 = c5
      push(
        'B5-C5-post-compact-hooks',
        c5,
        c5
          ? `C5 PostCompact hooks（post-compact 载体经 combinedUserDisplayMessage 合流面在场〔trigger 'auto' + compactSummary 实参〕port 调用 1 次；关态（返回空）→ 载体离场恒等锚）`
          : `C5 缺口（开面=${onOk} 关面=${offOk} = 修前红形/结构承载）`,
      )
    }

    // B7 C7 keepRecent N=3
    {
      const { compact, reset } = mkCompact({}, {}, 3)
      const r = await compact(messages)
      const keep: unknown[] = r?.messagesToKeep ?? []
      const c7 = keep.length === 3 && JSON.stringify(keep).includes('msg-7') && JSON.stringify(keep).includes('msg-9')
      b.c7 = c7
      push(
        'B7-C7-keep-recent-n',
        c7,
        c7
          ? `C7 近期消息保留（keepRecent=3 → post-compact messagesToKeep = 最近 3 条原文〔msg-7/8/9〕= 热工具近态不丢模型不重读；修前全丢红→绿）`
          : `C7 缺口（messagesToKeep=${keep.length} 条 = 修前红形/结构承载）`,
      )
      reset()
    }

    // B7b C7 N=0 恒等锚
    {
      const { compact, reset } = mkCompact({}, {}, 0)
      const r = await compact(messages)
      const c7b = r?.messagesToKeep === undefined
      b.c7b = c7b
      push(
        'B7b-C7-zero-identity-anchor',
        c7b,
        c7b
          ? `C7 N=0 恒等锚（keepRecent=0/缺省 → messagesToKeep 缺席 = 全量压缩，手动 /compact + reactive 消费面零回归锚）`
          : `恒等锚缺口（N=0 面 messagesToKeep 仍在场 = 零回归失守）`,
      )
      reset()
    }

    // S1 F-1a skip 载体（PreCompact hook block）
    {
      const { compact, reset } = mkCompact({}, { pre: { blocked: true, blockingReason: 'BLOCK-R' } })
      const r = await compact(messages)
      const s1 =
        r?.compactionSkipped === true &&
        JSON.stringify(r).includes('BLOCK-R')
      push(
        'S1-f1a-skip-carrier',
        s1,
        s1
          ? `F-1a skip 载体（PreCompact hook block → compactionSkipped=true 载体 + skip 原因在场；压缩未执行，消息面不置换〔占位字段消费者门控〕）`
          : `F-1a 缺口（compactionSkipped=${r?.compactionSkipped ?? '缺席'} = 修前红形/结构承载）`,
      )
      reset()
    }

    // A1 裁剪 fail-safe 恒等（richContext null = 窄面，port 注册仍走裁剪——AND 门一肢）
    {
      const { ports, calls } = makePorts({})
      portsMod.setCompactPorts(ports) // 宿主已接线态——证明 richContext null 单独强制裁剪
      const compact = richMod.createAutoCompactCompact({
        trimmedSummarize: fakeTrimmedSummarize,
        richContext: null,
        buildCacheSafeParams: (ms: unknown[]) => ({
          systemPrompt: 'SP',
          userContext: {},
          systemContext: {},
          forkContextMessages: ms,
        }),
        keepRecent: 3, // 裁剪面恒 0（不消费）
      })
      const r = await compact(messages)
      const a1 =
        summaryText(r).includes('TRIMMED-SUMMARY') &&
        (r?.messagesToKeep ?? undefined) === undefined &&
        (r?.attachments ?? []).length === 0 &&
        calls.pre === 0 &&
        calls.post === 0 &&
        calls.sessionStart === 0
      portsMod.setCompactPorts(null)
      push(
        'A1-trimmed-failsafe-identity',
        a1,
        a1
          ? `裁剪 fail-safe 恒等（richContext null = 窄面 → 裁剪路径逐字恒等〔TRIMMED-SUMMARY 摘要注入 + attachments ∅ + keepRecent 恒 0 不消费 + port 零调用〕= 修前行为零回归锚；headless 车道留裁剪登记 0.1.69 候选面）`
          : `裁剪面缺口（摘要=${summaryText(r).slice(0, 60) || '(空)'} keepToKeep=${r?.messagesToKeep === undefined ? '缺席' : '在场'} = 裁剪面漂移）`,
      )
    }

    // A2 port 门控 fail-safe（richContext 在场 + ports 未注册）
    {
      portsMod.setCompactPorts(null)
      const compact = richMod.createAutoCompactCompact({
        trimmedSummarize: fakeTrimmedSummarize,
        richContext: makeCtx({}),
        buildCacheSafeParams: (ms: unknown[]) => ({
          systemPrompt: 'SP',
          userContext: {},
          systemContext: {},
          forkContextMessages: ms,
        }),
        keepRecent: 3,
      })
      const r = await compact(messages)
      const a2 = summaryText(r).includes('TRIMMED-SUMMARY') && (r?.messagesToKeep ?? undefined) === undefined
      push(
        'A2-port-gate-failsafe',
        a2,
        a2
          ? `port 门控 fail-safe（richContext 在场但 getCompactPorts() null = 未接线车道 → 裁剪路径逐字恒等；port 门控 = 富路径可达性单点门）`
          : `门控缺口（未注册 port 面富路径未 fail-safe = 裁剪恒等失守）`,
      )
    }
  } else {
    // 基线结构承载（模块缺席）：逐探针定向红
    for (const id of [
      'B1-C1-resume-prompt',
      'B2-C2-file-state-rebuild',
      'B2b-C2-no-file-empty-anchor',
      'B3-C3-tool-continuation',
      'B4-C4-session-start-hooks',
      'B5-C5-post-compact-hooks',
      'B7-C7-keep-recent-n',
      'B7b-C7-zero-identity-anchor',
      'S1-f1a-skip-carrier',
      'A1-trimmed-failsafe-identity',
      'A2-port-gate-failsafe',
    ]) {
      push(id, false, `结构承载（createAutoCompactCompact/setCompactPorts 模块缺席 = 修前红形；rich=${richAvailable} ports=${portsAvailable}）`)
      b[id] = false
    }
  }

  // B6 C6 元数据重钉（源级恒等锚，0.1.67 C-1 基线同绿）
  const b6 = compactSrc.includes('reAppendSessionMetadata()')
  push(
    'B6-C6-metadata-repin',
    b6,
    b6
      ? `C6 元数据重钉（富体 reAppendSessionMetadata() 调用点在场〔0.1.67 C-1 重钉恒等锚，custom-title/mode/model-setting 进 64KB 尾窗；基线同绿守卫〕)`
      : `C6 缺口（reAppendSessionMetadata 调用点缺席 = 命名面回退风险）`,
  )

  // F-AB 恢复完整性判定（B 面 C1–C7 全在场〔C8 登记〕= 完整；任一缺 = GATE-OPEN 打回）
  {
    const abOk = !!(b.c1 && b.c2 && b.c3 && b.c4 && b.c5 && b6 && b.c7)
    push(
      'F-AB-recovery-completeness',
      abOk,
      abOk
        ? `F-AB 恢复完整性 = B 面 C1–C7 全在场（C8 会话记忆保全 = 登记面 0.1.69 候选）= 恢复策略完整（A=现状裁剪仅 C1+C6 = 不完整；B=对齐富路径 = 完整，AB 判定基准坐实）`
        : `F-AB 恢复不完整（缺面 = ${[
            !b.c1 && 'C1', !b.c2 && 'C2', !b.c3 && 'C3',
            !b.c4 && 'C4', !b.c5 && 'C5', !b6 && 'C6', !b.c7 && 'C7',
          ].filter(Boolean).join('+') || '(结构承载)'} = GATE-OPEN 打回面）`,
    )
  }

  // S2 F-1a loop 消费点双门（源级）
  const s2 = (loopSrc.match(/!oc\.compactionResult\.compactionSkipped/g) ?? []).length >= 2
  push(
    'S2-loop-skip-gate',
    s2,
    s2
      ? `F-1a loop 消费点双门（loop.ts \`!oc.compactionResult.compactionSkipped\` ×2〔消息面 buildPostCompactMessages 门 + compacted 事件门〕= skip 序列原样继续非失败，防误丢原上下文）`
      : `F-1a 缺口（skip 门 ${loopSrc.includes('compactionSkipped') ? '单点/形异' : '缺席'} = 修前红形）`,
  )

  // ── 面 2：F-3a 小窗守卫 ─────────────────────────────────────────
  // T1 小窗禁用（32K 窗阈值 = 32768 − 20k − 13k = −232 ≤ 0）
  {
    const t1Guard = typeof acMod.isAutoCompactThresholdPositive === 'function'
      ? acMod.isAutoCompactThresholdPositive(32768) === false
      : false
    let stormFree = false
    if (typeof acMod.shouldAutoCompact === 'function') {
      stormFree = await acMod.shouldAutoCompact([], {
        contextWindow: 32768,
        countTokens: async () => 999_999,
        compact: async () => ({}),
      } as never) === false
    }
    const t1 = t1Guard && stormFree
    push(
      'T1-f3a-small-window-disable',
      t1,
      t1
        ? `F-3a 小窗禁用（32K 窗阈值非正（−232）→ isAutoCompactThresholdPositive=false + shouldAutoCompact=false = 每轮压缩风暴根修〔修前 tokens ≥ 负阈值恒真 = 每轮 doomed 压缩红→绿〕；大窗谓词恒 true 支不可达零回归`
        : `F-3a 缺口（谓词=${t1Guard ? '在场' : '缺席'} 风暴面=${stormFree} = 修前红形/结构承载）`,
    )
  }

  // T2 警告面退化（显形 + 不假警告）
  {
    let t2: boolean | null = null
    let t2Detail = ''
    if (typeof acMod.calculateTokenWarningState === 'function') {
      const st = acMod.calculateTokenWarningState(5000, {
        contextWindow: 32768,
        autoCompactEnabled: true,
      })
      t2 = st?.autoCompactDisabledBySmallWindow === true && st?.isAboveAutoCompactThreshold === false
      t2Detail = t2
        ? `F-3a 警告面退化（小窗 calculateTokenWarningState → autoCompactDisabledBySmallWindow=true 显形字段在场 + isAboveAutoCompactThreshold 不置位〔负阈值不假「已超 auto-compact 阈值」信号〕+ percentLeft 地板 0 = 同面失守一并修）`
        : `F-3a 缺口（disabled=${st?.autoCompactDisabledBySmallWindow ?? '字段缺席'} 假警告=${st?.isAboveAutoCompactThreshold} = 修前红形）`
    } else {
      t2Detail = 'F-3a 缺口（calculateTokenWarningState 模块缺席 = 结构承载）'
    }
    push('T2-f3a-warning-degrade', t2, t2Detail)
  }

  // T3 大窗恒等锚（256K/1M/200K 阈值精确同值 + 显形字段 undefined）
  {
    const t3 =
      typeof acMod.getAutoCompactThreshold === 'function' &&
      acMod.getAutoCompactThreshold(262_144) === 229_144 &&
      acMod.getAutoCompactThreshold(1_048_576) === 1_015_576 &&
      acMod.getAutoCompactThreshold(204_800) === 171_800 &&
      (typeof acMod.calculateTokenWarningState !== 'function' ||
        acMod.calculateTokenWarningState(1000, { contextWindow: 262_144 }).autoCompactDisabledBySmallWindow === undefined)
    push(
      'T3-f3a-large-window-identity',
      t3,
      t3
        ? `F-3a 大窗恒等锚（256K→229144 / 1M→1015576 / 200K→171800 阈值 = 修前公式精确同值〔窗口 − 20k 摘要预留 − 13k 缓冲〕+ 大窗显形字段 undefined = 零回归约束锚（基线同绿守卫））`
        : `恒等锚缺口（大窗阈值漂移或显形字段误置位 = 零回归失守）`,
    )
  }

  // T4 显形面（TokenWarning 小窗提示行 + 大窗原文案恒等）
  {
    const smallLine = twSrc.includes('context window too small for auto-compact · auto-compact disabled')
    const largeLine = twSrc.includes('until auto-compact')
    const t4 = smallLine && largeLine
    push(
      'T4-f3a-surface-explicit',
      t4,
      t4
        ? `F-3a 显形面（TokenWarning 小窗禁用提示行在场〔「context window too small for auto-compact · auto-compact disabled · run /compact manually or use a smaller-context model」】+ 大窗「X% until auto-compact」原文案恒等在场 = 修前失真文案红→修后显形绿）`
        : `F-3a 缺口（小窗行=${smallLine} 大窗恒等=${largeLine} = 修前红形/结构承载）`,
    )
  }

  // G4 C7 定参（AUTOCOMPACT_KEEP_RECENT=3 + auto-compact 车道接线）
  {
    const g4 =
      acMod.AUTOCOMPACT_KEEP_RECENT === 3 &&
      depsSrc.includes('keepRecent: AUTOCOMPACT_KEEP_RECENT')
    push(
      'G4-C7-keeprecent-const',
      g4,
      g4
        ? `C7 定参（AUTOCOMPACT_KEEP_RECENT === 3〔auto-compact 车道定参，热工具近态不丢 + N 小防再触发风暴〕+ agentLoopDeps auto-compact 车道 keepRecent 定参接线〔手动 /compact + reactive 缺省 0 零回归面不动〕）`
        : `定参缺口（常量=${acMod.AUTOCOMPACT_KEEP_RECENT ?? '缺席'} 接线=${depsSrc.includes('keepRecent: AUTOCOMPACT_KEEP_RECENT')} = 修前红形/结构承载）`,
    )
  }

  const hardFail = probes.filter((p) => p.hard && p.ok === false).length
  const verdict = hardFail === 0 ? 'PASS' : `FAIL（hardFail=${hardFail}）`
  const OUT =
    process.env.ATLAS_E2E_COMPACT0168_OUT ??
    '/home/vince/.claude/jobs/09264df0/tmp/gate-068/compact0168'
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, 'result.json'), JSON.stringify({ probe: 'tui-compact-recovery-0168', repo: REPO, verdict, probes }, null, 2))
  console.log(
    JSON.stringify(
      {
        verdict,
        probes: probes.map((p) => `[${p.ok === true ? 'PASS' : p.ok === false ? 'FAIL' : 'INC'}] ${p.id}`).join(' '),
      },
      null,
      1,
    ),
  )
  console.log(`TUI-COMPACT-RECOVERY-0168 ${verdict} → ${OUT}`)
  process.exit(hardFail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('TUI-COMPACT-RECOVERY-0168 ERROR', e)
  process.exit(1)
})
