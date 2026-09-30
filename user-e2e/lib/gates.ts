/**
 * user-e2e T0 门控（方案 §4，func 层双门先例的 e2e 版）：
 * ① 网关 HTTP 探针（/v1/models，5s）；② 沙箱 settings 装载校验；
 * ③ 真 LLM 单轮（headless marker 回合，顺带验鉴权车道）。
 * 任一失败 → 后续 LLM 面 case SKIP(GATE)，本地命令面照跑（skip-clean 不红）。
 * 注意 F4（方案 §2）：①的 0/0 1ms 形态 = 健康探针正常态，不得与空 chat 响应混读。
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { headlessRound, type HOut } from './headless'
import { nowIso } from './util'

export interface GateReport {
  ts: string
  gateway: { ok: boolean; code: number | null; ms: number; host: string; models: string[] }
  settings: { ok: boolean; note: string; defaultRole: string | null; poolHead: string | null }
  llmProbe: HOut & { ok: boolean }
  pass: boolean
  /** LLM 面是否放行（③ 通过即放行；①失败但③通过也算放行——以真回合为准） */
  llmGo: boolean
}

const GATEWAY = process.env.ATLAS_E2E_GATEWAY ?? '127.0.0.1:8999'

export async function runGates(
  repoRoot: string,
  sandboxHome: string,
  workspace: string,
  realSettingsPath: string,
): Promise<GateReport> {
  // ① 网关 HTTP 探针
  let gateway = { ok: false, code: null as number | null, ms: 0, host: GATEWAY, models: [] as string[] }
  {
    const t0 = Date.now()
    try {
      const r = await fetch(`http://${GATEWAY}/v1/models`, {
        signal: AbortSignal.timeout(5000),
      })
      const body: any = await r.json().catch(() => null)
      gateway = {
        ok: r.ok,
        code: r.status,
        ms: Date.now() - t0,
        host: GATEWAY,
        models: (body?.data ?? []).map((m: any) => m.id).slice(0, 8),
      }
    } catch (e: any) {
      gateway = { ok: false, code: null, ms: Date.now() - t0, host: GATEWAY, models: [] }
      gateway.note = String(e?.message ?? e)
    }
  }

  // ② 沙箱 settings 装载校验（沙箱 .atlas 由 run.ts 建好；这里只读校验）
  const sandboxSettings = join(sandboxHome, '.atlas', 'settings.json')
  let settings = { ok: false, note: '', defaultRole: null as string | null, poolHead: null as string | null }
  try {
    const s = JSON.parse(readFileSync(sandboxSettings, 'utf8'))
    settings = {
      ok: Boolean(s.modelRoles && Object.keys(s.modelRoles).length > 0),
      note: `roles=${Object.keys(s.modelRoles ?? {})}`,
      defaultRole: s.defaultRole ?? null,
      poolHead: s.modelRoles?.[s.defaultRole ?? 'small']?.models?.[0]?.model ?? null,
    }
  } catch (e: any) {
    settings = { ok: false, note: `settings 读取失败: ${e?.message ?? e}`, defaultRole: null, poolHead: null }
  }

  // ③ 真 LLM 单轮（marker，弱模型下确定性最高）
  const probe = await headlessRound({
    repoRoot,
    workspace,
    sandboxHome,
    prompt: '回复且仅回复：OK',
    timeoutMs: 240_000,
  })
  const llmProbe = { ...probe, ok: probe.ok && probe.assistantText.includes('OK') }

  const llmGo = llmProbe.ok
  return {
    ts: nowIso(),
    gateway,
    settings,
    llmProbe,
    pass: gateway.ok && settings.ok && llmGo,
    llmGo,
  }
}

/** 建沙箱 HOME（方案 §3 隔离）：复制 settings，默认裁剪插件/MCP 面（确定性优先） */
export function makeSandboxHome(
  runHome: string,
  realSettingsPath: string,
  fullHome: boolean,
): string {
  const atlasDir = join(runHome, '.atlas')
  mkdirSync(atlasDir, { recursive: true })
  const raw = JSON.parse(readFileSync(realSettingsPath, 'utf8'))
  if (!fullHome) {
    delete raw.enabledPlugins
    delete raw.enabledMcpServers
    delete raw.extraKnownMarketplaces
  }
  writeFileSync(join(atlasDir, 'settings.json'), JSON.stringify(raw, null, 2))
  return runHome
}
