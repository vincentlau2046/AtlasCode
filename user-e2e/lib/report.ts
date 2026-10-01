/**
 * user-e2e 报告生成（方案 §8）：
 * report.md（用户视角）+ diagnosis.md（分层定位 + P0/P1/P2 修复清单）+ summary.json。
 * 每 tier 完成后增量重建（中断也有已完成面报告）。
 */
import { mkdirSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { RunState, CaseRec } from './checkpoint'
import { classify, type LayerResult } from './classify'
import { nowIso } from './util'

const VERDICT_ICON: Record<string, string> = {
  PASS: '✅',
  FAIL: '❌',
  TIMEOUT: '⏰',
  STUCK: '💥',
  NAVFAIL: '🧭',
  SKIP: '⏭️',
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m${s % 60}s`
}

function verdictSummary(recs: CaseRec[]): string {
  const c: Record<string, number> = {}
  for (const r of recs) c[r.verdict] = (c[r.verdict] ?? 0) + 1
  return (
    [
      c.PASS ? `✅ ${c.PASS}` : '',
      c.FAIL ? `❌ ${c.FAIL}` : '',
      c.TIMEOUT ? `⏰ ${c.TIMEOUT}` : '',
      c.STUCK ? `💥 ${c.STUCK}` : '',
      c.NAVFAIL ? `🧭 ${c.NAVFAIL}` : '',
      c.SKIP ? `⏭️ ${c.SKIP}` : '',
    ]
      .filter(Boolean)
      .join('  ') || '（无）'
  )
}

export function buildReports(state: RunState): { report: string; diagnosis: string; summary: string } {
  const root = state.root
  const meta = state.meta
  const outDir = join(root, 'reports', meta.runId)
  mkdirSync(outDir, { recursive: true })
  const recs = state.all()
  const failed = recs.filter(r => r.verdict !== 'PASS' && r.verdict !== 'SKIP')
  const skipped = recs.filter(r => r.verdict === 'SKIP')

  // ── report.md（用户视角）───────────────────────────────────────────────
  const tiers = [...new Set(recs.map(r => r.tier))]
  const lines: string[] = []
  lines.push(`# AtlasCode 用户视角 E2E 测试报告（${meta.runId}）`)
  lines.push('')
  lines.push(`- **执行窗口**：${meta.startedAt} → ${nowIso()}（CST 对照见 artifacts）`)
  lines.push(
    `- **对象**：@atlasharness/atlascode v${meta.version}（git ${meta.repoRev.slice(0, 8)}）`,
  )
  lines.push(
    `- **环境**：网关 ${meta.gateway} / 模型 ${meta.model} / fullHome=${meta.fullHome}`,
  )
  lines.push(`- **总体**：${verdictSummary(recs)}（共 ${recs.length} case）`)
  lines.push('')
  lines.push('## 分 tier 结果')
  for (const t of tiers) {
    const tr = recs.filter(r => r.tier === t)
    lines.push(`### ${t} — ${verdictSummary(tr)}`)
    lines.push('| case | 结果 | 耗时 | 用户可见症状 / 说明 |')
    lines.push('|------|------|------|---------------------|')
    for (const r of tr) {
      const note = (r.note ?? '').replace(/\|/g, '/').slice(0, 120)
      lines.push(
        `| ${r.id} | ${VERDICT_ICON[r.verdict]} ${r.verdict} | ${fmtMs(r.ms)} | ${note} |`,
      )
    }
    lines.push('')
  }
  lines.push('## 失败汇总（按用户影响排序）')
  if (failed.length === 0) {
    lines.push('无失败 case。')
  } else {
    // 用户影响：core > medium > long > short > slash（基本功能优先）
    const impact: Record<string, number> = { core: 0, medium: 1, long: 2, short: 3, slash: 4, soak: 5 }
    const sorted = [...failed].sort(
      (a, b) => (impact[a.tier] ?? 9) - (impact[b.tier] ?? 9) || a.ms - b.ms,
    )
    for (const r of sorted) {
      lines.push(
        `- **${r.id}**（${r.tier}）${VERDICT_ICON[r.verdict]} ${r.verdict}：${(r.note ?? '').slice(0, 200)}`,
      )
    }
  }
  if (skipped.length > 0) {
    lines.push('')
    lines.push(`## 门控跳过（${skipped.length}）`)
    for (const r of skipped) lines.push(`- ${r.id}：${r.note ?? 'GATE'}`)
  }
  lines.push('')
  lines.push('## 判据与复跑')
  lines.push('- marker 判据：「回复且仅回复标记词：X」→ X 在剥净转录中 ≥2 次（输入回显 + assistant 渲染）；弱模型（Qwen38-27B）下该指令遵循实测可靠。')
  lines.push('- 工具/编码任务只信磁盘 ground truth（文件存在 / 测试 exit 0 / git log），不信模型自述。')
  lines.push('- 复跑：`bun run user-e2e/run.ts --tier <tier>`（指定才跑，非必测）；断点：`--resume <runId>`。')
  lines.push('')

  // ── diagnosis.md（定位）────────────────────────────────────────────────
  const d: string[] = []
  d.push(`# AtlasCode E2E 问题定位报告（${meta.runId}）`)
  d.push('')
  d.push(`> 生成于 ${nowIso()}；证据在 \`user-e2e/artifacts/${meta.runId}/\`（PTY 转录 / stream-json / 计时）。`)
  d.push('')
  d.push('## 失败逐条定位')
  if (failed.length === 0) {
    d.push('无失败 case，无定位条目。')
  }
  const layers: Record<string, CaseRec[]> = {}
  for (const r of failed) {
    const c = classify(r)
    ;(layers[c.layer] ??= []).push(r)
  }
  const layerOrder: LayerResult['layer'][] = ['L1', 'L2', 'L3', 'L4', 'UNRESOLVED']
  for (const L of layerOrder) {
    const rs = layers[L]
    if (!rs) continue
    const titleMap: Record<string, string> = {
      L1: 'L1 — TUI 渲染 / 消息队列 / 输入面',
      L2: 'L2 — engine loop（queryAgentLoop / 终止判定）',
      L3: 'L3 — modelprovider（角色池 / 端点装载 / healthCheck）',
      L4: 'L4 — IFF 网关（空响应 0/0 形态）',
      UNRESOLVED: '未决 / 门控',
    }
    d.push(`### ${titleMap[L]}（${rs.length}）`)
    for (const r of rs) {
      const c = classify(r)
      d.push(`#### ${r.id} — ${c.title}`)
      d.push(`- 依据：${c.rationale}`)
      if (c.suspects.length) d.push(`- 嫌疑代码区：\n${c.suspects.map(s => `  - ${s}`).join('\n')}`)
      if (r.evidence) {
        d.push(`- 证据：${JSON.stringify(r.evidence).slice(0, 600)}`)
      }
      if (r.drivers) {
        for (const [k, v] of Object.entries(r.drivers)) {
          if (v.tail) d.push(`- [${k} 尾屏]\n` + '```\n' + v.tail + '\n```')
          if (v.stderrTail)
            d.push(`- [${k} stderr 尾]\n` + '```\n' + v.stderrTail.slice(-400) + '\n```')
        }
      }
      d.push('')
    }
  }

  d.push('## IFF 监控交叉对照（§2-F4 / §7②）')
  d.push('- 用户 IFF 监控的 `Qwen38-27B-TXT 200 0/0 — — 1ms` 行须先分类：**健康探针/`/v1/models` 类的 0/0 1ms 属正常**（方案 §2-F1/F4）；只有与失败 case 时间戳重叠的 **chat 回合** 0-token 才计 L4 信号。')
  d.push('- 对照表模板（晨起人工补网关日志后填）：')
  d.push('')
  d.push('| 失败 case | 时刻(UTC) | 监控时段 0/0 行是否重叠 | 判读 |')
  d.push('|----------|-----------|--------------------------|------|')
  for (const r of failed) {
    d.push(`| ${r.id} | ${r.ts} | （待补） | （待补） |`)
  }
  d.push('')
  d.push('## 已知残口 vs 新故障')
  d.push('- 与 `docs/product-status.md` `[ATLAS-HOLD]` 残口表逐条对照（IFF 网关 56 行/31 文件换值项、②档占位值等）：本报告的 L3/L4 条目中，凡命中已知残口者标「已知」，其余标「新故障」。')
  d.push('')
  d.push('## 下一轮修复清单（P0/P1/P2）')
  const p0: string[] = []
  const p1: string[] = []
  const p2: string[] = []
  for (const r of failed) {
    const c = classify(r)
    if (r.tier === 'core' || c.layer === 'L2') p0.push(`${r.id}（${c.layer}：${c.title}）`)
    else if (r.verdict === 'FAIL' || r.verdict === 'STUCK' || r.verdict === 'NAVFAIL') p1.push(`${r.id}（${c.layer}：${c.title}）`)
    else p2.push(`${r.id}（${c.title}）`)
  }
  d.push(`- **P0（核心 loop / 基本功能不可用）**：${p0.length ? p0.join('；') : '无'}`)
  d.push(`- **P1（功能面损坏）**：${p1.length ? p1.join('；') : '无'}`)
  d.push(`- **P2（超时/体验/未决）**：${p2.length ? p2.join('；') : '无'}`)
  d.push('')
  d.push('> 注：本报告只定位不改码；修复按 P0 → P1 顺序进入下一轮功能补齐。')
  d.push('')

  // ── summary.json（机器可读，供下轮 diff 核销）──────────────────────────
  const summary = JSON.stringify(
    {
      runId: meta.runId,
      generatedAt: nowIso(),
      totals: recs.reduce((acc, r) => {
        acc[r.verdict] = (acc[r.verdict] ?? 0) + 1
        return acc
      }, {} as Record<string, number>),
      cases: recs.map(r => ({
        id: r.id,
        tier: r.tier,
        verdict: r.verdict,
        ms: r.ms,
        layer: failed.includes(r) ? classify(r).layer : undefined,
        note: (r.note ?? '').slice(0, 200),
      })),
    },
    null,
    2,
  )

  const reportPath = join(outDir, 'report.md')
  const diagnosisPath = join(outDir, 'diagnosis.md')
  const summaryPath = join(outDir, 'summary.json')
  writeFileSync(reportPath, lines.join('\n'))
  writeFileSync(diagnosisPath, d.join('\n'))
  writeFileSync(summaryPath, summary)
  return { report: reportPath, diagnosis: diagnosisPath, summary: summaryPath }
}
