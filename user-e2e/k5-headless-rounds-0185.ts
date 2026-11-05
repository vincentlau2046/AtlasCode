/**
 * 0.1.85 K5 补闭环 headless 活轮探针（e2e lane，gate 判据⑦ E 面；
 * 工单 docs/2026-11-02-p0-wave-0185-ticket.md §1-E：显式 Read 独立 round）。
 *
 * 四轮 `node dist/cli.js -p` + 沙箱 HOME（seeded → 8997 日志代理 → IFF 8999，
 * Qwen38-27B-VL 显式）：
 *   R-H1 UTF-16LE 活读（hard）：同 084（回归面不变）。
 *   R-H2 allow_large 全量活读（hard）：同 084（回归面不变）。
 *   R-H3a PDF 页读 hard 升级（085）：Read marker.pdf pages "3-3" →
 *        JSONL header + 安全根页图 + **provider 实收有效 JPEG**（FF D8 FF
 *        魔数；084 Gap B/newMessages 断链 → C85-B/C 修复）+ **VL 视觉答
 *        含 ORION-7742（084 soft → hard）** + marker 泄漏守卫。
 *   R-H3b 多页计数（hard，新）：pages "1-3" → provider 请求恰 3 个有效
 *        JPEG（数量与请求页一致）。
 *   R-H4 deny 显式失败（hard，新）：--disallowed-tools Read → 工具拒绝
 *        未执行（JSONL 零「PDF pages extracted」）+ 零 JPEG 线（deny 不
 *        交付补充媒体，C85-B 保守清空面）。
 *
 * 隔离：沙箱 HOME（job-tmp，零写真实 ~/.atlas/~/.claude）；fixture OUT 自建；
 * 四轮串行（gateway 串行纪律）。
 * 用法：
 *   ATLAS_E2E_K5HEAD_REPO=<worktree 绝对路径> \
 *   ATLAS_E2E_K5HEAD_OUT=<输出目录> \
 *     bun run /home/vince/projects/AtlasCode/user-e2e/k5-headless-rounds-0185.ts
 */
import { spawn, type ChildProcess } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { sleep } from './lib/util'

const REPO =
  process.env.ATLAS_E2E_K5HEAD_REPO ??
  '/home/vince/projects/AtlasCode/worktrees/worktree-gate-085-face'
const OUT =
  process.env.ATLAS_E2E_K5HEAD_OUT ??
  '/home/vince/.claude/jobs/09264df0/tmp/gate-085/k5head'
const PROXY_PORT = 8997
const UTF16_MARKER = 'MARKER-9917'
const LARGE_MARKER = 'K5-LARGE-END-MARKER-3350'
const PDF_MARKER = 'ORION-7742'

type Probe = { id: string, hard: boolean, ok: boolean | null, detail: string }
const probes: Probe[] = []
const push = (id: string, ok: boolean | null, detail: string, hard = true) =>
  probes.push({ id, hard, ok, detail })

// ── fixture（同 0184）─────────────────────────────────────────────────

function buildTextPdf(pages: string[]): Buffer {
  const objects: string[] = []
  const pageIds = pages.map((_, i) => 4 + i * 2)
  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`
  objects[2] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`
  objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`
  pages.forEach((text, i) => {
    const pid = 4 + i * 2
    const cid = pid + 1
    const stream = `BT /F1 12 Tf 20 110 Td (${text}) Tj ET`
    objects[pid] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320 144] /Resources << /Font << /F1 3 0 R >> >> /Contents ${cid} 0 R >>`
    objects[cid] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  })
  let body = '%PDF-1.4\n'
  const offsets: number[] = [0]
  for (let n = 1; n < objects.length; n++) {
    offsets[n] = body.length
    body += `${n} 0 obj\n${objects[n]}\nendobj\n`
  }
  const xrefOffset = body.length
  let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`
  for (let n = 1; n < objects.length; n++) {
    xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`
  }
  const trailer = `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(body + xref + trailer, 'latin1')
}

function writeFixtures(work: string): void {
  writeFileSync(
    join(work, 'marker.pdf'),
    buildTextPdf([
      'K5PDF page one ALPHA-1131',
      'K5PDF page two BRAVO-2242',
      `K5PDF page three ${PDF_MARKER}`,
    ]),
  )
  const leText = 'K5-UTF16LE 奔腾标记 MARKER-9917\r\nsecond line 中文\r\n'
  writeFileSync(
    join(work, 'utf16le.txt'),
    Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(leText, 'utf16le')]),
  )
  const lines: string[] = []
  for (let i = 0; i < 6200; i++) {
    lines.push(`line ${i} the quick brown fox jumps over the lazy dog padding ${i}`)
  }
  lines.push(LARGE_MARKER)
  writeFileSync(join(work, 'large.txt'), lines.join('\n'))
}

function seedHome(home: string): void {
  mkdirSync(join(home, '.atlas'), { recursive: true })
  const modelRef = { model: 'iff/Qwen38-27B-VL' }
  writeFileSync(
    join(home, '.atlas', 'settings.json'),
    JSON.stringify(
      {
        model: 'Qwen38-27B-VL',
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
            models: [
              {
                id: 'Qwen38-27B-VL',
                name: 'Qwen38-27B-VL',
                contextWindow: 256000,
                maxTokens: 32000,
              },
            ],
          },
        },
      },
      null,
      2,
    ),
  )
}

/** 收集 seq >= fromSeq 的请求体（按序号；前缀用原始字符串 '001'，勘误同 bridge）。 */
function readBodies(reqdir: string, fromSeq = 0): string[] {
  const bodies: string[] = []
  if (!existsSync(reqdir)) return bodies
  const metas = readdirSync(reqdir)
    .filter((f) => f.endsWith('-meta.json'))
    .map((f) => ({ raw: f.split('-')[0], seq: Number(f.split('-')[0]) }))
    .filter(({ seq }) => seq >= fromSeq)
    .sort((a, b) => a.seq - b.seq)
  for (const { raw } of metas) {
    try {
      bodies.push(readFileSync(join(reqdir, `${raw}-body.bin`), 'utf8'))
    } catch {
      /* empty body */
    }
  }
  return bodies
}

const JPEG_PREFIX = 'data:image/jpeg;base64,'

function hasJpeg(body: string): boolean {
  return body.includes(JPEG_PREFIX)
}

function decodeJpegs(body: string): Buffer[] {
  const out: Buffer[] = []
  const re = /data:image\/jpeg;base64,([A-Za-z0-9+/=]+)/g
  for (const m of body.matchAll(re)) {
    try {
      out.push(Buffer.from(m[1], 'base64'))
    } catch {
      out.push(Buffer.alloc(0))
    }
  }
  return out
}

const isJpeg = (b: Buffer) => b.length > 1000 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff

function runRound(
  cli: string,
  work: string,
  home: string,
  prompt: string,
  extraArgs: string[] = [],
): Promise<{ code: number | null, stdout: string, stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('node', [cli, '-p', prompt, '--dangerously-skip-permissions', ...extraArgs], {
      cwd: work,
      env: { ...process.env, HOME: home, DISABLE_AUTOUPDATER: '1' },
    })
    child.stdin?.end()
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => {
      stdout += d.toString()
    })
    child.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    child.on('close', (code) => resolve({ code, stdout, stderr }))
    setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        /* already gone */
      }
    }, 420_000).unref()
  })
}

function findAllFiles(root: string, pred: (p: string) => boolean): string[] {
  const out: string[] = []
  const stack = [root]
  while (stack.length) {
    const d = stack.pop() as string
    let entries: string[]
    try {
      entries = readdirSync(d)
    } catch {
      continue
    }
    for (const e of entries) {
      const p = join(d, e)
      try {
        readdirSync(p)
        stack.push(p)
      } catch {
        if (pred(p)) out.push(p)
      }
    }
  }
  return out
}

function jsonlHas(projRoot: string, needle: string): boolean {
  for (const f of findAllFiles(projRoot, (p) => p.endsWith('.jsonl'))) {
    if (readFileSync(f, 'utf8').includes(needle)) return true
  }
  return false
}

async function main(): Promise<void> {
  rmSync(OUT, { recursive: true, force: true })
  const home = join(OUT, 'home')
  const work = join(OUT, 'work')
  const reqdir = join(OUT, 'req')
  mkdirSync(work, { recursive: true })
  writeFixtures(work)
  seedHome(home)
  const cli = join(REPO, 'dist', 'cli.js')
  const projRoot = join(home, '.atlas', 'projects')

  const proxy: ChildProcess = spawn('python3', [
    '/home/vince/projects/AtlasCode/user-e2e/k5-bridge-proxy.py',
    '--port', String(PROXY_PORT),
    '--upstream', '127.0.0.1:8999',
    '--logdir', reqdir,
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  let proxyReady = false
  for (let i = 0; i < 40; i++) {
    await sleep(500)
    try {
      const r = await fetch(`http://127.0.0.1:${PROXY_PORT}/v1/models`, { method: 'GET' })
      void r
      proxyReady = true
      break
    } catch {
      /* not up yet */
    }
  }
  push('P-H0-proxy', proxyReady, proxyReady ? '8997 日志代理就绪' : '代理未就绪')
  if (!proxyReady) {
    finish(proxy)
    return
  }
  const seqOf = (): number => {
    if (!existsSync(reqdir)) return 0
    const nums = readdirSync(reqdir)
      .filter((f) => f.endsWith('-meta.json'))
      .map((f) => Number(f.split('-')[0]))
    return nums.length ? Math.max(...nums) + 1 : 0
  }

  // ── R-H1 UTF-16LE（回归面，同 084）──────────────────────────────────
  {
    const r = await runRound(
      cli, work, home,
      'Read the file utf16le.txt with the Read tool, then quote the exact marker text on line 1. Reply with just that line verbatim.',
    )
    writeFileSync(join(OUT, 'rh1-stdout.txt'), r.stdout)
    writeFileSync(join(OUT, 'rh1-stderr.txt'), r.stderr)
    const bodies = readBodies(reqdir)
    const answerOk = r.stdout.includes(UTF16_MARKER)
    // 勘误（run2 假红）：bodies 是数组，.includes 是元素相等不是子串；
    // 084 原版返回 join 后字符串。必须 join 后再做子串断言。
    const wireOk =
      bodies.join('\n').includes(UTF16_MARKER) && bodies.join('\n').includes('奔腾标记')
    push('P-H0-rh1-exit', r.code === 0, `R-H1 退出码 ${r.code}`)
    push('P-H1-utf16le-answer', answerOk,
      `模型答含 ${UTF16_MARKER}（K5-3 decodeTextLosslessly 活读）`)
    push('P-H1-utf16le-wire', wireOk,
      `provider 请求体含解码后文本（MARKER-9917 + 中文达线 = utf16le→utf8 无 BOM 直证）`)
  }

  // ── R-H2 allow_large（回归面，同 084）───────────────────────────────
  {
    const r = await runRound(
      cli, work, home,
      'Read the entire file large.txt in one Read tool call with allow_large set to true, then quote its final line exactly. Reply with just that final line.',
    )
    writeFileSync(join(OUT, 'rh2-stdout.txt'), r.stdout)
    writeFileSync(join(OUT, 'rh2-stderr.txt'), r.stderr)
    const bodies = readBodies(reqdir)
    const answerOk = r.stdout.includes(LARGE_MARKER)
    const wireOk = bodies.join('\n').includes(LARGE_MARKER) // join 后子串断言（run2 勘误）
    push('P-H0-rh2-exit', r.code === 0, `R-H2 退出码 ${r.code}`)
    push('P-H2-large-answer', answerOk,
      `模型答含末行 ${LARGE_MARKER}（K5-5 allow_large 全量活读）`)
    push('P-H2-large-wire', wireOk,
      `provider 请求体含 ${LARGE_MARKER}（全量内容达线非截断）`)
  }

  // ── R-H3a PDF 页读 hard（085 升级）──────────────────────────────────
  {
    const trRoot = join('/tmp', `.atlas-${process.getuid?.() ?? 0}`, 'tool-results')
    const before = new Set(existsSync(trRoot) ? readdirSync(trRoot) : [])
    const seq0 = seqOf()
    const r = await runRound(
      cli, work, home,
      'Read the file marker.pdf with the Read tool using pages "3-3", then report exactly the marker text printed on that page.',
    )
    writeFileSync(join(OUT, 'rh3a-stdout.txt'), r.stdout)
    writeFileSync(join(OUT, 'rh3a-stderr.txt'), r.stderr)
    const bodies = readBodies(reqdir, seq0)
    const allBodies = bodies.join('\n')
    let jsonlToolFace = jsonlHas(projRoot, 'PDF pages extracted: 1 page(s)')
    let newDir: string | null = null
    let jpgOk = false
    let mode0700 = false
    try {
      for (const e of readdirSync(trRoot)) {
        if (!before.has(e) && e.startsWith('pdf-')) {
          const d = join(trRoot, e)
          newDir = d
          jpgOk = readdirSync(d).some((f) => f.endsWith('.jpg'))
          mode0700 = (statSync(d).mode & 0o777) === 0o700
          break
        }
      }
    } catch {
      /* root missing */
    }
    const jpegBody = bodies.find(hasJpeg) ?? ''
    const imgs = jpegBody ? decodeJpegs(jpegBody).filter(isJpeg) : []
    const wireOk = imgs.length >= 1 && jpegBody.includes('marker.pdf') && jpegBody.includes('pages')
    const answerOk = r.stdout.includes(PDF_MARKER)
    // 泄漏守卫：首个 JPEG body 及之前零 marker 文本
    const jIdx = bodies.findIndex(hasJpeg)
    const leak = jIdx >= 0
      ? bodies.slice(0, jIdx + 1).some((b) => b.includes(PDF_MARKER))
      : allBodies.includes(PDF_MARKER)
    push('P-H0-rh3a-exit', r.code === 0, `R-H3a 退出码 ${r.code}`)
    push('P-H3a-pdf-toolface', jsonlToolFace,
      `会话 JSONL 含「PDF pages extracted: 1 page(s)」（pdftoppm 实跑工具面）`)
    push('P-H3a-pdf-secureroot', newDir !== null && jpgOk && mode0700,
      newDir
        ? `本轮新叶目录 ${newDir} 页图在场=${jpgOk} mode0700=${mode0700}（mkdtemp 安全根活面）`
        : 'tool-results 根未见本轮新 pdf-* 叶目录')
    push('P-H3a-jpeg-wire', wireOk,
      imgs.length
        ? `provider 实收有效 JPEG ${imgs.length} 幅（FF D8 FF）+ marker.pdf/pages 关联=${jpegBody.includes('marker.pdf') && jpegBody.includes('pages')}（084 Gap B/newMessages 断链 → C85-B/C 修复）`
        : 'provider 请求零有效 JPEG')
    push('P-H3a-visual', answerOk,
      `VL 视觉答含 ${PDF_MARKER}（084 soft → 085 hard；双证之答案面）`)
    push('P-H3a-no-leak', !leak,
      `marker 不在 ≤首个JPEG-body 的请求文本中（仅页栅格像素内；prompt/路径/header/fixture 名零泄漏）`)
  }

  // ── R-H3b 多页计数（hard，新）───────────────────────────────────────
  {
    const seq0 = seqOf()
    const r = await runRound(
      cli, work, home,
      'Read the file marker.pdf with the Read tool using pages "1-3". After the tool returns, reply with just: DONE.',
    )
    writeFileSync(join(OUT, 'rh3b-stdout.txt'), r.stdout)
    writeFileSync(join(OUT, 'rh3b-stderr.txt'), r.stderr)
    const bodies = readBodies(reqdir, seq0)
    const jpegBody = bodies.find(hasJpeg) ?? ''
    const imgs = jpegBody ? decodeJpegs(jpegBody).filter(isJpeg) : []
    push('P-H0-rh3b-exit', r.code === 0, `R-H3b 退出码 ${r.code}`)
    push('P-H3b-count', imgs.length === 3,
      `pages "1-3" → provider 实收有效 JPEG ${imgs.length}/3（数量与请求页一致；页数≤20 内多页批）`)
  }

  // ── R-H4 deny 显式失败（hard，新）───────────────────────────────────
  {
    const seq0 = seqOf()
    const r = await runRound(
      cli, work, home,
      'Read the file marker.pdf with the Read tool using pages "3-3", then report the marker text on that page.',
      ['--disallowed-tools', 'Read'],
    )
    writeFileSync(join(OUT, 'rh4-stdout.txt'), r.stdout)
    writeFileSync(join(OUT, 'rh4-stderr.txt'), r.stderr)
    const bodies = readBodies(reqdir, seq0)
    const noWire = !bodies.some(hasJpeg)
    push('P-H0-rh4-exit', r.code === 0, `R-H4 退出码 ${r.code}`)
    push('P-H4-deny-no-exec', !jsonlHas(projRoot, 'PDF pages extracted: 1 page(s)') || !bodies.some((b) => b.includes('"pages"') && b.includes('marker.pdf') && b.includes('tool_calls')),
      `Read 被 --disallowed-tools 拒绝未执行（JSONL 本轮零 pdftoppm header；C85-B deny 不执行工具面）`)
    push('P-H4-deny-no-media', noWire,
      `deny 轮 provider 请求零 JPEG（拒绝不交付补充媒体；无旧页图假答）`)
  }

  finish(proxy)
}

function finish(proxy: ChildProcess): void {
  proxy.kill('SIGTERM')
  const hardFail = probes.filter((p) => p.hard && p.ok === false).length
  const result = {
    probe: 'k5-headless-rounds-0185',
    hardFail,
    total: probes.length,
    probes,
  }
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, 'probes.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
  process.exit(hardFail > 0 ? 1 : 0)
}

void main()
