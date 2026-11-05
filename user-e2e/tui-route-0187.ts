/**
 * 0.1.87 gate ⑤：三总纲路由活面探针（单轮参数化）。
 *
 *   ATLAS_E2E_ROUTE_CMD="node <cli.js> --dangerously-skip-permissions" \
 *     ATLAS_E2E_ROUTE_OUT=<round dir> \
 *     ATLAS_E2E_ROUTE_PROMPT="<scenario prompt>" \
 *     ATLAS_E2E_ROUTE_MARKER=ROUTE-DONE-1 \
 *     ATLAS_E2E_ROUTE_TARGETS="ascend-debug,ascend-precision-debug" \  # 路由目标 substring 集（逗号分隔）
 *     [ATLAS_E2E_ROUTE_FORBID="Skill(ascend-optimism"] \              # 反例断言：缺席面
 *     [ATLAS_E2E_ROUTE_MSPROF=1] \                                    # doctor 域 msprof-mcp 真调用断言
 *     [ATLAS_E2E_ROUTE_MAXWAIT=300000] \
 *     bun run user-e2e/tui-route-0187.ts
 *
 * 断言面（raw pty.log 字节序 + 屏面重放）：
 *   R0 TUI 就绪；R1 回合完成（marker 在场）；R2 Step0 先于路由（首个
 *   AscendSkillSourceCheck 字节偏移 < 首个路由目标偏移）；R3 verdict 在场
 *   （fresh|drift|unreachable）；R4 路由目标在场；R5 FORBID 缺席（反例轮）；
 *   R6 msprof-mcp 真调用在场（doctor 轮）。
 */
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { GenericPty } from './lib/pty-generic.js'
import { sleep } from './lib/util'

const CLI_CMD = process.env.ATLAS_E2E_ROUTE_CMD!
const OUT = process.env.ATLAS_E2E_ROUTE_OUT!
const PROMPT = process.env.ATLAS_E2E_ROUTE_PROMPT!
const MARKER = process.env.ATLAS_E2E_ROUTE_MARKER!
const TARGETS = (process.env.ATLAS_E2E_ROUTE_TARGETS ?? '').split(',').filter(Boolean)
const FORBID = process.env.ATLAS_E2E_ROUTE_FORBID
const MSPROF = process.env.ATLAS_E2E_ROUTE_MSPROF === '1'
const MAXWAIT = Number(process.env.ATLAS_E2E_ROUTE_MAXWAIT ?? 300_000)
const REPLAY = '/home/vince/.claude/jobs/09264df0/tmp/supplement-086/replay-wx.py'
const COLS = 200
const ROWS = 50

type Probe = { id: string, ok: boolean | null, detail: string }
const probes: Probe[] = []
const push = (id: string, ok: boolean | null, detail: string) =>
  probes.push({ id, ok, detail })

async function toRepl(pty: InstanceType<typeof GenericPty>): Promise<boolean> {
  let styleDone = false
  let enterDone = false
  let yoloDone = false
  for (let round = 0; round < 30; round++) {
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

function replay(file: string, mode: string): string {
  const p = Bun.spawnSync(['python3', '-I', REPLAY, file, String(COLS), String(ROWS), mode], {
    stdout: 'pipe', stderr: 'pipe',
  })
  return new TextDecoder().decode(p.stdout)
}

async function main(): Promise<void> {
  if (!CLI_CMD || !OUT || !PROMPT || !MARKER) throw new Error('need ROUTE_CMD/OUT/PROMPT/MARKER')
  rmSync(join(OUT, 'probes.json'), { force: true })
  const logPath = join(OUT, 'pty.log')
  mkdirSync(OUT, { recursive: true })

  let pty: InstanceType<typeof GenericPty> | null = null
  let raw = ''
  try {
    pty = await GenericPty.start({
      logPath,
      workspace: join(OUT, 'ws'),
      cmd: CLI_CMD,
      home: join(OUT, 'home'),
      unset: ['CLAUDECODE'],
      extraEnv: process.env.ATLAS_E2E_ROUTE_ENV ? JSON.parse(process.env.ATLAS_E2E_ROUTE_ENV) : {},
    })
    const ready = await toRepl(pty)
    push('R0-tui', ready, ready ? 'TUI REPL 就绪' : 'TUI 未就绪')
    if (!ready) throw new Error('TUI not ready')
    await sleep(1_000)

    pty.send(PROMPT)
    // marker 断言基线 = 回显落定后的字节偏移（防 prompt 自带 token 的输入回显假阳性）
    await sleep(3_000)
    const baseline = readFileSync(logPath, 'utf8').length
    let done = false
    let doneAt = -1
    const t0 = Date.now()
    let envFail = false
    while (Date.now() - t0 < MAXWAIT) {
      await sleep(3_000)
      raw = readFileSync(logPath, 'utf8')
      // 模型面失败早断（429/配额/网络等），不空转满 MAXWAIT
      if (raw.indexOf('本轮执行出错', baseline) >= 0) { envFail = true; break }
      const i = raw.indexOf(MARKER, baseline)
      if (i >= 0) {
        // settle 复核：5s 后仍在（防 in-flight 部分帧误判）
        await sleep(5_000)
        raw = readFileSync(logPath, 'utf8')
        const j = raw.indexOf(MARKER, baseline)
        if (j >= 0) { done = true; doneAt = j; break }
      }
    }
    raw = readFileSync(logPath, 'utf8')
    await sleep(2_000)
    raw = readFileSync(logPath, 'utf8')
    copyFileSync(logPath, join(OUT, 'final.ptylog'))
    push('R1-turn-complete', done, `回合完成（marker '${MARKER}' 在场）=${done}${done ? '' : envFail ? '（早断：本轮执行出错——环境面/模型面失败，详见 final.ptylog）' : '（超时截断，断言按已渲染面取）'}`)

    // R2 Step0 先于路由（字节序）
    const idxStep0 = raw.indexOf('AscendSkillSourceCheck')
    let idxRoute = -1
    let routedName = ''
    for (const t of TARGETS) {
      const i = raw.indexOf(t)
      if (i >= 0 && (idxRoute < 0 || i < idxRoute)) { idxRoute = i; routedName = t }
    }
    if (TARGETS.length === 0) {
      push('R2-step0-before-route', null, '未配置 ROUTE_TARGETS——本轮不做路由序断言')
    } else if (idxStep0 < 0) {
      push('R2-step0-before-route', false, `AscendSkillSourceCheck 调用缺席（路由目标 '${routedName || '无'}' 偏移=${idxRoute}）——Step 0 未执行`)
    } else if (idxRoute < 0) {
      push('R2-step0-before-route', false, `路由目标缺席（AscendSkillSourceCheck@${idxStep0} 在场但无目标 ${TARGETS.join('/')}）——路由未发生`)
    } else {
      push('R2-step0-before-route', idxStep0 < idxRoute,
        `Step0 先于路由=${idxStep0 < idxRoute}（AscendSkillSourceCheck@${idxStep0} < ${routedName}@${idxRoute}）`)
    }

    // R3 verdict 在场
    const vFresh = raw.includes('fresh'); const vDrift = raw.includes('drift'); const vUnreach = raw.includes('unreachable')
    push('R3-verdict-present', idxStep0 >= 0 && (vFresh || vDrift || vUnreach),
      `verdict 在场=${idxStep0 >= 0 && (vFresh || vDrift || vUnreach)}（fresh=${vFresh} drift=${vDrift} unreachable=${vUnreach}）`)

    // R4 路由目标在场
    if (TARGETS.length > 0) {
      push('R4-route-target-present', idxRoute >= 0, `路由目标 '${routedName}' 在场=${idxRoute >= 0}（targets=${TARGETS.join('/')}）`)
    }

    // R5 FORBID 缺席（反例轮）
    if (FORBID) {
      const bad = raw.includes(FORBID)
      push('R5-forbid-absent', !bad, `禁达面 '${FORBID}' 缺席=${!bad}`)
    }

    // R6 msprof-mcp 真调用
    if (MSPROF) {
      const idxMcp = raw.indexOf('msprof-mcp')
      // 真调用证据：工具链 chip（mcp__msprof-mcp__<tool>）或结果面（列名回显）
      const chip = raw.includes('mcp__msprof-mcp__') || /msprof-mcp[- ][a-z_]+\s*\((MCP)\)/.test(raw) || /msprof-mcp[:(]/.test(raw)
      const resultEvidence = (raw.includes('Op Name') || raw.includes('OpName')) && (raw.includes('Total Time') || raw.includes('TotalTime') || raw.includes('total_rows'))
      push('R6-msprof-real-call', idxMcp >= 0 && chip,
        `msprof-mcp 真调用=${idxMcp >= 0 && chip}（提及@${idxMcp}，chip=${chip}，fixture 列回显=${resultEvidence}）`)
    }

    // R7 drift→update 双调用 + updatedTo（drift 专用轮）
    if (process.env.ATLAS_E2E_ROUTE_UPDATE === '1') {
      let count = 0, i = -1
      while ((i = raw.indexOf('AscendSkillSourceCheck', i + 1)) >= 0) count++
      const updatedTo = raw.includes('updatedTo') || raw.includes('drift resolved by update') || /updated to [0-9a-f]{8}/i.test(raw)
      push('R7-update-executed', count >= 2 && updatedTo,
        `AscendSkillSourceCheck 调用次数=${count}（check+update ≥2 期待），update 证据=${updatedTo}`)
    }

    // 屏面终态快照（pyte 重放，报告用）
    const snap = replay(join(OUT, 'final.ptylog'), 'full')
    writeFileSync(join(OUT, 'final-screen.txt'), snap)
  } catch (e) {
    push('R0-fatal', false, `fatal: ${(e as Error).message}`)
  } finally {
    pty?.kill()
  }

  const fails = probes.filter((p) => p.ok === false).length
  const result = { probe: 'tui-route-0187', round: OUT, fails, total: probes.length, probes }
  writeFileSync(join(OUT, 'probes.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
  process.exit(fails > 0 ? 1 : 0)
}

void main().catch((e) => { console.error('fatal:', (e as Error).message); process.exit(2) })
