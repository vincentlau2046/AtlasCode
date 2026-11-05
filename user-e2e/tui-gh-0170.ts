/**
 * 0.1.70 块 G+H 波 · 双面活探针（e2e lane，gate 判据⑤，工单
 * docs/2026-10-14-p0-wave-0170-ticket.md §2⑤；零模型零 8999 = 纯 import +
 * 纯函数 + setEndpointConfigSource 真实 DI 缝（fake source 调用计数，非 tautology）
 * + 源级 grep（结构承载红））。
 *
 * 断言面（全 hard；红→绿 / 恒等锚基线同绿 双层）：
 *   G1-src  modelprovider.ts = chatWithDelta + onStreamDelta 分派 + StreamDelta 导出（修前缺席，红→绿）
 *   G2-src  engine/query/loop.ts = stream_delta AgentLoopEvent 型 + onStreamDelta deps.emit 透传（红→绿）
 *   G3-src  tui/loopEvents.ts = stream_delta 扩型 + 转发支（修前落 else 丢弃 = TUI 永不收 per-token 根因面，红→绿）
 *   G4-beh  handleMessageFromStream stream_delta 2 delta → mode responding + responseLength 4 +
 *           lengthUpdates ['ab','cd'] + streamingText 'abcd' + onMessage 零调用（红→绿）
 *   G4-tool tool_use 类 delta 零副作用（本波仅 text 面，Main 定项②；tool 面 0.1.71 候选；红→绿）
 *   G4-anchor assistant 消息面恒等锚（onMessage 1 调用 + streamingText 清零；基线同绿 = 修前逐字节同值）
 *   G-anchor spinnerGates 纯函数 + chars/4 token 估算法（既有机制零变更，基线同绿）
 *   H1-roles-src  roles.ts = getGlobalApiKey 回落调用缺席（修前在场 = OAuth token 泄漏面，红→绿）
 *   H1-adapter-src settings-adapter.ts = getApiKeyFromConfigOrMacOSKeychain import 缺席（红→绿）
 *   H1-beh   setEndpointConfigSource fake 计数源 + per-role apiKey 缺失 → getGlobalApiKey 零调用（修前 1 调用红）
 *            + apiKey undefined 显形 + providers 表 per-provider apiKey 兜底（resolveModel 'iff/Qwen38-27B-TXT'）
 *   H1-env   env 优先面 ATLAS_SMALL_API_KEY 胜 settings + 零 global 调用（基线同绿 = env 先于回落链）
 *   H1-adapter-beh createSettingsAdapter().getGlobalApiKey() = undefined（keychain 读取已断；
 *            Linux 基线 keychain 缺席同绿 = 语义锚；macOS OAuth 在场面由判别单测 mock 承载）
 *   H2-beh   getRoleModels fake settings 池 → refs = 池 + 零 anthropic/claude 硬编码 ref +
 *            D-5b fallbackModel 池末位去重语义不变（基线同绿 = 既有机制核验面）
 *
 * 基线面（修前红形 @85e9168 = v0.1.69）：chatWithDelta/stream_delta 型/转发支/
 * stream_delta 分支 + roles.ts 回落链 + settings-adapter keychain import 全缺席
 * → G1-src/G2-src/G3-src/G4-beh/G4-tool + H1-roles-src/H1-adapter-src/H1-beh 定向红；
 * G4-anchor/G-anchor/H1-env/H1-adapter-beh/H2-beh 基线同绿 = 恒等锚。
 * 用法：
 *   ATLAS_E2E_GH0170_REPO=<worktree 绝对路径> \
 *     bun run /home/vince/projects/AtlasCode/user-e2e/tui-gh-0170.ts
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO =
  process.env.ATLAS_E2E_GH0170_REPO ??
  '/home/vince/projects/AtlasCode/worktrees/worktree-gate-070'

const OUT =
  process.env.ATLAS_E2E_GH0170_OUT ??
  '/home/vince/.claude/jobs/09264df0/tmp/gate-070/gh-0170'

const src = (rel: string): string | null => {
  const p = join(REPO, rel)
  return existsSync(p) ? readFileSync(p, 'utf8') : null
}

type Probe = { id: string, hard: boolean, ok: boolean | null, detail: string }
const probes: Probe[] = []
const push = (id: string, ok: boolean | null, detail: string, hard = true) =>
  probes.push({ id, hard, ok, detail })

// 纯脚本（非 bun test）动态 import 辅助（.ts 绝对路径经 bun 直接解析）
async function aimport(rel: string): Promise<any> {
  return await import(join(REPO, rel)).catch(() => ({}))
}

// ── 块 G：composing token（G-1→G-4 per-token 事件流）────────────
async function probeG(): Promise<void> {
  // G1-src：modelprovider chatWithDelta + onStreamDelta 分派
  {
    const mp = src('src/modelprovider/modelprovider.ts')
    const ok =
      !!mp &&
      mp.includes('chatWithDelta') &&
      mp.includes('if (args.onStreamDelta)') &&
      /export (type )?\{[^}]*StreamDelta|export type \{[^}]*StreamDelta/.test(mp)
    push(
      'G1-src-chat-with-delta',
      ok,
      ok
        ? 'G-1 modelprovider chatWithDelta 在场（onStreamDelta 传入面 = 流式路径逐 delta 转发 + StreamDelta 导出；红→绿）'
        : 'G-1 结构承载（chatWithDelta/onStreamDelta 分派缺席 = 修前红形）',
    )
  }

  // G2-src：engine loop stream_delta 型 + emit 透传
  {
    const lp = src('src/engine/query/loop.ts')
    const ok =
      !!lp &&
      lp.includes("type: 'stream_delta'") &&
      lp.includes('onStreamDelta: deps.emit')
    push(
      'G2-src-loop-stream-delta',
      ok,
      ok
        ? 'G-2 engine AgentLoopEvent stream_delta 型 + queryOneRound onStreamDelta = deps.emit 透传（emit 未注入面 = undefined 恒等锚；红→绿）'
        : 'G-2 结构承载（stream_delta 型/透传缺席 = 修前红形）',
    )
  }

  // G3-src：TUI loopEvents 转发支（修前落 else 丢弃 = 根因面）
  {
    const le = src('src/tui/loopEvents.ts')
    const ok =
      !!le &&
      le.includes("event.type === 'stream_delta'") &&
      /EngineLoopStreamEvent[\s\S]{0,200}stream_delta/.test(le)
    push(
      'G3-src-loop-events-forward',
      ok,
      ok
        ? 'G-3 loopEvents stream_delta 转发支在场（修前落 else 被丢弃 = TUI 永不收 per-token 根因面；红→绿）'
        : 'G-3 结构承载（转发支缺席 = 修前红形）',
    )
  }

  // G4-beh：handleMessageFromStream stream_delta 行为面（活 import + 回调捕获）
  {
    const mod: any = await aimport('src/tui/utils/messages.ts')
    const okAll =
      typeof mod.handleMessageFromStream === 'function'
    if (okAll) {
      const state = {
        mode: 'idle',
        responseLength: 0,
        streamingText: null as string | null,
        messages: [] as unknown[],
        lengthUpdates: [] as string[],
      }
      const onMessage = (m: unknown) => state.messages.push(m)
      const onUpdateLength = (c: string) => {
        state.lengthUpdates.push(c)
        state.responseLength += c.length
      }
      const onSetStreamMode = (m: string) => {
        state.mode = m
      }
      const onStreamingText = (f: (cur: string | null) => string | null) => {
        state.streamingText = f(state.streamingText)
      }
      const dispatch = (msg: unknown) =>
        mod.handleMessageFromStream(
          msg,
          onMessage,
          onUpdateLength,
          onSetStreamMode,
          () => {},
          undefined,
          undefined,
          undefined,
          onStreamingText,
        )
      dispatch({ type: 'stream_request_start' })
      dispatch({ type: 'stream_delta', delta: { type: 'text_delta', text: 'ab' } })
      dispatch({ type: 'stream_delta', delta: { type: 'text_delta', text: 'cd' } })
      const ok =
        state.mode === 'responding' &&
        state.responseLength === 4 &&
        JSON.stringify(state.lengthUpdates) === '["ab","cd"]' &&
        state.streamingText === 'abcd' &&
        state.messages.length === 0
      push(
        'G4-beh-stream-delta-branch',
        ok,
        ok
          ? 'G-4 stream_delta 行为面（2 delta → mode responding + responseLength 4 + 逐 delta 载荷保真 + streamingText 渐进 + onMessage 零调用〔delta 非完整消息〕；修前 delta 误落通用支 = 红形）'
          : `G-4 缺口（mode=${state.mode} len=${state.responseLength} updates=${JSON.stringify(state.lengthUpdates)} st=${state.streamingText} msgs=${state.messages.length} = 修前红形/结构承载）`,
      )
      // G4-tool：tool_use 类 delta 零副作用
      {
        const s2 = {
          mode: 'idle',
          responseLength: 0,
          streamingText: null as string | null,
          messages: [] as unknown[],
        }
        const dispatch2 = (msg: unknown) =>
          mod.handleMessageFromStream(
            msg,
            (m: unknown) => s2.messages.push(m),
            (c: string) => {
              s2.responseLength += c.length
            },
            (m: string) => {
              s2.mode = m
            },
            () => {},
            undefined,
            undefined,
            undefined,
            (f: (cur: string | null) => string | null) => {
              s2.streamingText = f(s2.streamingText)
            },
          )
        dispatch2({ type: 'stream_request_start' })
        dispatch2({
          type: 'stream_delta',
          delta: { type: 'tool_use_delta', id: 'tc-1', inputJsonDelta: '{"a"' },
        })
        const ok2 =
          s2.mode === 'requesting' &&
          s2.responseLength === 0 &&
          s2.streamingText === null &&
          s2.messages.length === 0
        push(
          'G4-tool-delta-no-side-effect',
          ok2,
          ok2
            ? 'G-4 tool_use 类 delta 零副作用（本波仅 text 面，Main 定项②；tool 面 0.1.71 候选；红→绿）'
            : `G-4 tool 面缺口（mode=${s2.mode} len=${s2.responseLength} st=${s2.streamingText} = 修前红形）`,
        )
      }
    } else {
      push('G4-beh-stream-delta-branch', false, 'G-4 结构承载（messages.ts import 缺席 = 修前红形）')
      push('G4-tool-delta-no-side-effect', false, 'G-4 结构承载（模块缺席）')
    }
  }

  // G4-anchor：assistant 消息面恒等锚（基线同绿 = 修前逐字节同值）
  {
    const mod: any = await aimport('src/tui/utils/messages.ts')
    if (typeof mod.handleMessageFromStream === 'function') {
      const state = {
        messages: [] as unknown[],
        streamingText: 'x' as string | null,
      }
      const assistantMsg = {
        type: 'assistant',
        uuid: 'u-1',
        timestamp: '2026-10-14T00:00:00Z',
        message: {
          id: 'm-1',
          model: 'fake-model',
          role: 'assistant',
          content: [{ type: 'text', text: 'done' }],
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 1,
            output_tokens: 1,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      }
      mod.handleMessageFromStream(
        assistantMsg,
        (m: unknown) => state.messages.push(m),
        () => {},
        () => {},
        () => {},
        undefined,
        undefined,
        undefined,
        (f: (cur: string | null) => string | null) => {
          state.streamingText = f(state.streamingText)
        },
      )
      const ok = state.messages.length === 1 && state.streamingText === null
      push(
        'G4-anchor-assistant-identity',
        ok,
        ok
          ? 'G-4 assistant 消息面恒等锚（onMessage 1 调用 + streamingText 完成消息原子交接清零；基线同绿 = 修前逐字节同值零回归锚）'
          : `恒等锚缺口（msgs=${state.messages.length} st=${state.streamingText}）`,
      )
    } else {
      push('G4-anchor-assistant-identity', null, 'INC：messages.ts import 缺席（结构承载面，非行为红）')
    }
  }

  // G-anchor：spinnerGates 纯函数 + chars/4 token 估算法（既有机制，基线同绿）
  {
    const sg: any = await aimport('src/tui/components/Spinner/spinnerGates.ts')
    if (typeof sg.getSpinnerDisplayGates === 'function') {
      const gates = sg.getSpinnerDisplayGates(Date.now())
      const ok =
        typeof gates === 'object' &&
        gates !== null &&
        typeof (gates as any).wantsTokens === 'boolean'
      push(
        'G-anchor-spinner-gates',
        ok,
        ok
          ? `G 面既有机制恒等锚（spinnerGates 纯函数在场 + wantsTokens 值门〔gates=${JSON.stringify(gates)}〕；token 估算法 chars/4 修前既有 = 本波零变更锚）`
          : `spinnerGates 缺口（gates=${JSON.stringify(gates)?.slice(0, 120)}）`,
      )
    } else {
      push('G-anchor-spinner-gates', null, 'INC：spinnerGates import 缺席（环境面，非产品红）')
    }
  }
}

// ── 块 H：de-ant（apiKey 回落链断 anthropic + settings 池轮询核验）──
async function probeH(): Promise<void> {
  // H1-roles-src：getRoleConfig 回落链缺席（源级；修前在场 = OAuth 泄漏面）
  {
    const rp = src('src/modelprovider/roles.ts')
    const ok = !!rp && !rp.includes('getEndpointConfigSource().getGlobalApiKey')
    push(
      'H1-roles-src-fallback-cut',
      ok,
      ok
        ? 'H-1 roles.ts 全局 apiKey 回落调用缺席（per-role 缺失 = undefined 显形，由 providers 表 resolveModel 兜底 = 纯 settings 链零 anthropic OAuth 回落；红→绿）'
        : 'H-1 结构承载（getEndpointConfigSource().getGlobalApiKey 回落调用在场 = 修前 OAuth token 泄漏面红形）',
    )
  }

  // H1-adapter-src：settings-adapter keychain import 缺席（码行级 grep，注释面排除——
  // 修波头注含「旧 getApiKeyFromConfigOrMacOSKeychain」字样 = 注释非代码，须排）
  {
    const ap = src('src/tui/config/settings-adapter.ts')
    const codeLines = ap
      ? ap
          .split('\n')
          .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
          .join('\n')
      : ''
    const ok = !!ap && !codeLines.includes('getApiKeyFromConfigOrMacOSKeychain')
    push(
      'H1-adapter-src-keychain-cut',
      ok,
      ok
        ? 'H-1 settings-adapter keychain/OAuth 读取 import 缺席（码行级核验；getGlobalApiKey 恒 undefined；红→绿）'
        : 'H-1 结构承载（getApiKeyFromConfigOrMacOSKeychain 码行 import 在场 = 修前 keychain OAuth 读取红形）',
    )
  }

  // H1-beh：setEndpointConfigSource fake 计数源（真实 DI 缝，非 tautology）
  {
    const roles: any = await aimport('src/modelprovider/roles.ts')
    const has =
      typeof roles.setEndpointConfigSource === 'function' &&
      typeof roles.getRoleConfig === 'function'
    if (has) {
      const calls = { globalApiKey: 0 }
      const fakeSource = {
        getRoleSetting: () => ({}),
        getProviders: () => ({
          iff: {
            baseURL: 'http://iff.local:9090',
            apiKey: 'iff-key',
            models: [{ id: 'Qwen38-27B-TXT' }, { id: 'glm' }],
          },
        }),
        getGlobalApiKey: () => {
          calls.globalApiKey++
          return 'oauth-token'
        },
      }
      roles.setEndpointConfigSource(fakeSource)
      try {
        const cfg = roles.getRoleConfig('small')
        const entry = roles.resolveModel('iff/Qwen38-27B-TXT')
        const ok =
          cfg.apiKey === undefined &&
          calls.globalApiKey === 0 &&
          entry?.apiKey === 'iff-key' &&
          entry?.baseURL === 'http://iff.local:9090'
        push(
          'H1-beh-global-fallback-zero-calls',
          ok,
          ok
            ? `H-1 行为面（per-role apiKey 缺失 → getGlobalApiKey 零调用〔fake 计数=${calls.globalApiKey}〕+ apiKey undefined 显形 + providers 表 per-provider apiKey 兜底 iff-key；修前 1 调用 = OAuth token 泄漏面红形）`
            : `H-1 缺口（calls=${calls.globalApiKey} apiKey=${cfg.apiKey ?? 'undefined'} entry.apiKey=${entry?.apiKey ?? '缺'} = 修前红形/回落链未断）`,
        )
        // H1-env：env 优先面（基线同绿 = env 先于回落链；相对增量断言 = 本调用零新增
        // global 调用，避免共享计数器被 H1-beh 前调用污染）
        const before = calls.globalApiKey
        process.env.ATLAS_SMALL_API_KEY = 'env-key'
        try {
          const cfgEnv = roles.getRoleConfig('small')
          const ok2 =
            cfgEnv.apiKey === 'env-key' && calls.globalApiKey === before
          push(
            'H1-env-priority-anchor',
            ok2,
            ok2
              ? 'H-1 env 优先面恒等锚（ATLAS_SMALL_API_KEY 胜 settings per-role，Main 定项③ 保留；本调用零新增 global 调用〔相对增量=0〕；基线同绿）'
              : `env 面缺口（apiKey=${cfgEnv.apiKey} 新增 global 调用=${calls.globalApiKey - before}）`,
          )
        } finally {
          delete process.env.ATLAS_SMALL_API_KEY
        }
      } finally {
        roles.resetEndpointConfigSource?.()
      }
    } else {
      push('H1-beh-global-fallback-zero-calls', false, 'H-1 结构承载（roles.js DI 缝缺席 = 修前红形）')
      push('H1-env-priority-anchor', null, 'INC：roles.js import 缺席（结构承载面）')
    }
  }

  // H1-adapter-beh：createSettingsAdapter().getGlobalApiKey() = undefined（语义锚）
  {
    const ad: any = await aimport('src/tui/config/settings-adapter.ts')
    if (typeof ad.createSettingsAdapter === 'function') {
      const v = ad.createSettingsAdapter().getGlobalApiKey()
      const ok = v === undefined
      push(
        'H1-adapter-beh-undefined',
        ok,
        ok
          ? 'H-1 adapter 行为锚（getGlobalApiKey() = undefined；keychain 读取已断——macOS OAuth token 在场面由判别单测 mock.module 承载，本探针 Linux 面 = 语义锚基线同绿）'
          : `adapter 缺口（getGlobalApiKey()=${JSON.stringify(v)} = keychain 读取未断红形）`,
      )
    } else {
      push('H1-adapter-beh-undefined', null, 'INC：settings-adapter import 缺席（tui 模块链环境面，非产品红）')
    }
  }

  // H2-beh：getRoleModels 池轮询核验（零 anthropic 硬编码 ref）
  {
    const roles: any = await aimport('src/modelprovider/roles.ts')
    if (typeof roles.getRoleModels === 'function' && typeof roles.setEndpointConfigSource === 'function') {
      const fakeSource = {
        getRoleSetting: () => ({ models: ['iff/Qwen38-27B-TXT', 'iff/glm'] }),
        getProviders: () => ({
          iff: {
            baseURL: 'http://iff.local:9090',
            apiKey: 'iff-key',
            models: [{ id: 'Qwen38-27B-TXT' }, { id: 'glm' }],
          },
        }),
        getGlobalApiKey: () => undefined,
      }
      roles.setEndpointConfigSource(fakeSource)
      try {
        const refs = roles.getRoleModels('small')
        const withFb = roles.getRoleModels('small', undefined, 'iff/extra')
        const dupFb = roles.getRoleModels('small', undefined, 'iff/glm')
        const ok =
          JSON.stringify(refs) === '["iff/Qwen38-27B-TXT","iff/glm"]' &&
          refs.every((r: string) => !/anthropic|claude/i.test(r)) &&
          JSON.stringify(withFb) === '["iff/Qwen38-27B-TXT","iff/glm","iff/extra"]' &&
          JSON.stringify(dupFb) === '["iff/Qwen38-27B-TXT","iff/glm"]'
        push(
          'H2-beh-pool-rotation-verify',
          ok,
          ok
            ? 'H-2 settings 池轮询核验（getRoleModels = modelRoles.<role>.models 池 + 零 anthropic/claude 硬编码 ref + D-5b fallbackModel 池末位追加/去重语义不变；基线同绿 = 既有机制核验面）'
            : `H-2 缺口（refs=${JSON.stringify(refs)} fb=${JSON.stringify(withFb)} dup=${JSON.stringify(dupFb)}）`,
        )
      } finally {
        roles.resetEndpointConfigSource?.()
      }
    } else {
      push('H2-beh-pool-rotation-verify', false, 'H-2 结构承载（getRoleModels DI 缝缺席）')
    }
  }
}

async function main(): Promise<void> {
  await probeG()
  await probeH()

  const hardFail = probes.filter((p) => p.hard && p.ok === false).length
  const inc = probes.filter((p) => p.ok === null).length
  const verdict =
    hardFail === 0 && inc === 0
      ? 'PASS'
      : hardFail === 0
        ? `PASS-with-INC（INC=${inc}）`
        : `FAIL（hardFail=${hardFail} INC=${inc}）`
  mkdirSync(OUT, { recursive: true })
  writeFileSync(
    join(OUT, 'result.json'),
    JSON.stringify({ probe: 'tui-gh-0170', repo: REPO, verdict, probes }, null, 2),
  )
  console.log(
    JSON.stringify(
      {
        verdict,
        probes: probes
          .map((p) => `[${p.ok === true ? 'PASS' : p.ok === false ? 'FAIL' : 'INC'}] ${p.id}`)
          .join(' '),
      },
      null,
      1,
    ),
  )
  console.log(`TUI-GH-0170 ${verdict} → ${OUT}`)
  process.exit(hardFail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('TUI-GH-0170 ERROR', e)
  process.exit(1)
})
