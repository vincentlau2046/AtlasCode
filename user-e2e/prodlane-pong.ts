/**
 * 生产 lane PONG 活轮探针（通用版，0.1.86 起）：npm 包 dist cli.js headless
 * 一轮 IFF 往返（seeded 沙箱 HOME，真实 ~/.atlas/~/.claude 零写入），断言：
 *   ① rc=0 + PONG marker 回显；② 零 anthropic 可达（api.anthropic.com 段零）。
 *   NPM_CLI=<npm 包 dist/cli.js 绝对路径> PONG_MARKER=PONG-086 \
 *   PONG_OUT=<dir> bun run user-e2e/prodlane-pong.ts
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const NPM_CLI = process.env.NPM_CLI ?? ''
const MARKER = process.env.PONG_MARKER ?? 'PONG-086'
const OUT = process.env.PONG_OUT ?? '/home/vince/.claude/jobs/09264df0/tmp/prodlane-pong'
const MODEL = process.env.PONG_MODEL ?? 'Qwen38-27B-VL'
const IFF_TARGET = process.env.PONG_TARGET ?? 'http://127.0.0.1:8999'
const WORKSPACE = process.env.PONG_WS ?? '/home/vince/.claude/jobs/09264df0/tmp/prodlane-pong/ws'

if (!NPM_CLI) {
  console.error('NPM_CLI required')
  process.exit(2)
}

function seedHome(home: string): void {
  const atlasDir = join(home, '.atlas')
  mkdirSync(atlasDir, { recursive: true })
  const settings = {
    model: MODEL,
    modelRoles: {
      small: { models: [{ model: `iff/${MODEL}` }], provider: 'iff' },
      fast: { models: [{ model: `iff/${MODEL}` }], provider: 'iff' },
      premium: { models: [{ model: `iff/${MODEL}` }], provider: 'iff' },
    },
    providers: {
      iff: {
        baseURL: `${IFF_TARGET}/v1`,
        apiKey: 'sk-iff-local',
        api: 'openai-completions',
        defaultContextWindow: 256000,
        defaultMaxTokens: 32000,
        models: [{ id: MODEL, name: MODEL, contextWindow: 256000, maxTokens: 32000 }],
      },
    },
    skipDangerousModePermissionPrompt: true,
    env: { DISABLE_AUTOUPDATER: '1' },
  }
  writeFileSync(join(atlasDir, 'settings.json'), JSON.stringify(settings, null, 2))
}

async function main(): Promise<void> {
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  mkdirSync(WORKSPACE, { recursive: true })
  // seeded 沙箱 HOME（mkdtemp 随机根，0700 面）
  const home = mkdtempSync(join(tmpdir(), 'atlas-pong-'))
  seedHome(home)
  const args = ['-p', `Reply with exactly: ${MARKER}`, '--model', MODEL, '--dangerously-skip-permissions']
  const t0 = Date.now()
  const rc = await new Promise<number | null>((resolve) => {
    const child = spawn('node', [NPM_CLI, ...args], {
      cwd: WORKSPACE,
      env: { ...process.env, HOME: home, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    child.stdout?.on('data', (d) => (out += d.toString()))
    child.stderr?.on('data', (d) => (out += d.toString()))
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL') } catch { /* gone */ }
    }, 180_000)
    child.on('exit', (code) => {
      clearTimeout(timer)
      writeFileSync(join(OUT, 'pong.out'), out)
      writeFileSync(join(home, 'pong.out'), out)
      console.log(`marker=${out.includes(MARKER)} anthropic-refs=${(out.match(/api\.anthropic\.com/g) ?? []).length} quota403=${(out.match(/403/g) ?? []).length}`)
      console.log(`out-tail: ${out.trim().slice(-200).replace(/\n+/g, ' | ')}`)
      resolve(code)
    })
  })
  const out = (await import('node:fs')).readFileSync(join(OUT, 'pong.out'), 'utf8')
  const ok = rc === 0 && out.includes(MARKER) && (out.match(/api\.anthropic\.com/g) ?? []).length === 0
  const result = {
    probe: 'prodlane-pong',
    marker: MARKER,
    npmCli: NPM_CLI,
    model: MODEL,
    rc,
    ms: Date.now() - t0,
    ok,
    markerSeen: out.includes(MARKER),
    anthropicRefs: (out.match(/api\.anthropic\.com/g) ?? []).length,
  }
  writeFileSync(join(OUT, 'pong-result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
  rmSync(home, { recursive: true, force: true })
  process.exit(ok ? 0 : 1)
}

void main()
