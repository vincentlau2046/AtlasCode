/**
 * 0.1.87 gate 判据④：系统提示词逐字节锚捕获探针。
 * 经 k5-bridge-proxy.py（本进程先行拉起，端口 8998）把 LLM 请求体全量落盘，
 * 单轮 echo 后抽取 system 字节面 → 与对侧 build 同法捕获后 diff。
 *
 *   ATLAS_E2E_SYSP_CMD="node <cli.js> --dangerously-skip-permissions" \
 *     ATLAS_E2E_SYSP_OUT=<dir> bun run user-e2e/tui-sysprompt-087.ts
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GenericPty } from './lib/pty-generic.js'
import { sleep } from './lib/util'

const CLI_CMD = process.env.ATLAS_E2E_SYSP_CMD!
const OUT = process.env.ATLAS_E2E_SYSP_OUT!
const REPO = '/home/vince/projects/AtlasCode'
const PROXY_PORT = 8998
const MODEL = process.env.HINT_MODEL ?? 'Qwen38-27B-VL'

const PROXY = join(REPO, 'user-e2e/k5-bridge-proxy.py')
const LOGDIR = join(OUT, 'reqlog')

function seedHome(home: string): void {
  mkdirSync(join(home, '.atlas'), { recursive: true })
  const modelRef = { model: `iff/${MODEL}` }
  writeFileSync(
    join(home, '.atlas', 'settings.json'),
    JSON.stringify(
      {
        model: MODEL,
        modelRoles: {
          small: { models: [modelRef], provider: 'iff' },
          fast: { models: [modelRef], provider: 'iff' },
          premium: { models: [modelRef], provider: 'iff' },
        },
        defaultRole: 'small',
        availableModels: ['small', 'premium', 'fast'],
        skipDangerousModePermissionPrompt: true,
        env: { DISABLE_AUTOUPDATER: '1' },
        providers: {
          iff: {
            baseURL: `http://127.0.0.1:${PROXY_PORT}/v1`,
            apiKey: 'sk-iff-local',
            api: 'openai-completions',
            defaultContextWindow: 256000,
            defaultMaxTokens: 32000,
            models: [{ id: MODEL, name: MODEL, contextWindow: 256000, maxTokens: 32000 }],
          },
        },
      },
      null,
      2,
    ),
  )
}

async function toRepl(pty: InstanceType<typeof GenericPty>): Promise<boolean> {
  let styleDone = false
  let enterDone = false
  let yoloDone = false
  for (let round = 0; round < 24; round++) {
    const t = pty.sinceText()
    if (t.includes('/help 查看全部命令') || t.includes('/sessionlist 会话列表')) return true
    if (!styleDone && (t.includes('Choose the text style') || t.includes('text style that looks best'))) {
      styleDone = true
      await sleep(400)
      pty.sendRaw('1')
      await sleep(300)
      pty.sendRaw('\r')
      await sleep(1_500)
      continue
    }
    if (!enterDone && t.includes('Press') && t.includes('to continue')) {
      enterDone = true
      await sleep(400)
      pty.sendRaw('\r')
      await sleep(1_500)
      continue
    }
    if (!yoloDone && t.includes('Yes, I accept')) {
      yoloDone = true
      await sleep(400)
      pty.sendRaw('\x1b[B')
      await sleep(400)
      pty.sendRaw('\r')
      await sleep(1_500)
      continue
    }
    await sleep(2_500)
  }
  return false
}

async function main(): Promise<void> {
  if (!CLI_CMD || !OUT) throw new Error('need ATLAS_E2E_SYSP_CMD + ATLAS_E2E_SYSP_OUT')
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(LOGDIR, { recursive: true })
  // 拉起捕获代理
  const proxy = spawn('python3', ['-I', PROXY, '--port', String(PROXY_PORT), '--upstream', '127.0.0.1:8999', '--logdir', LOGDIR], {
    stdio: 'ignore',
    detached: false,
  })
  await sleep(800)
  try {
    const home = join(OUT, 'home')
    seedHome(home)
    const logPath = join(OUT, 'pty.log')
    const pty = await GenericPty.start({
      logPath,
      workspace: OUT,
      cmd: CLI_CMD,
      home,
      unset: ['CLAUDECODE'],
      extraEnv: {},
    })
    const ready = await toRepl(pty)
    if (!ready) throw new Error('TUI not ready')
    // 单轮 echo（首发请求 = system prompt 全量在 body）
    pty.send('Reply with exactly: SYSP-087-OK')
    let done = false
    for (let i = 0; i < 30; i++) {
      await sleep(2_000)
      if (pty.sinceText().includes('SYSP-087-OK')) { done = true; break }
    }
    await sleep(1_500)
    pty.kill()
    // 抽取首个含 system 的请求体
    const metas = readdirSync(LOGDIR).filter((f) => f.endsWith('-meta.json')).sort()
    let sysOut: string | null = null
    let reqNo = -1
    for (const m of metas) {
      const meta = JSON.parse(readFileSync(join(LOGDIR, m), 'utf8'))
      const bodyFile = m.replace('-meta.json', '-body.bin')
      const body = readFileSync(join(LOGDIR, bodyFile))
      let parsed: any = null
      try { parsed = JSON.parse(body.toString('utf8')) } catch { /* 非 JSON 请求体跳过 */ }
      if (parsed && parsed.system !== undefined) {
        const sys = typeof parsed.system === 'string' ? parsed.system : JSON.stringify(parsed.system)
        sysOut = sys
        reqNo = meta.n
        writeFileSync(join(OUT, 'system.txt'), sys)
        writeFileSync(join(OUT, 'system-meta.json'), JSON.stringify({ reqNo, model: parsed.model, bodyBytes: meta.bodyBytes }, null, 2))
        break
      }
    }
    const result = { probe: 'tui-sysprompt-087', ready, echoDone: done, systemCaptured: sysOut !== null, reqNo }
    writeFileSync(join(OUT, 'probes.json'), JSON.stringify(result, null, 2))
    console.log(JSON.stringify(result))
    process.exit(result.ready && result.echoDone && result.systemCaptured ? 0 : 1)
  } finally {
    proxy.kill()
  }
}

void main().catch((e) => { console.error('fatal:', (e as Error).message); process.exit(2) })
