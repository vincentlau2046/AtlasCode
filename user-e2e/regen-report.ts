/**
 * user-e2e 报告重建（不重跑）：从 artifacts/<runId>/checkpoint.jsonl
 * 重建 reports/<runId>/{report.md, diagnosis.md, summary.json}。
 * 用法：bun run user-e2e/regen-report.ts <runId>
 * （run 中断/被 2h 窗口截断时随时重建已完成面报告；指定才跑，非必测。）
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RunState } from './lib/checkpoint'
import { buildReports } from './lib/report'

const ROOT = import.meta.dir
const REPO = join(ROOT, '..')
const runId = process.argv[2]
if (!runId) {
  console.error('usage: bun run user-e2e/regen-report.ts <runId>')
  process.exit(1)
}

const state = new RunState(ROOT, {
  runId,
  startedAt: '（regen）',
  repoRoot: REPO,
  repoRev: (() => {
    try {
      return execSync('git rev-parse --short HEAD', { cwd: REPO }).toString().trim()
    } catch {
      return '(unknown)'
    }
  })(),
  version: JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).version,
  gateway: process.env.ATLAS_E2E_GATEWAY ?? '127.0.0.1:8999',
  model: 'iff/Qwen38-27B-TXT（settings modelRoles 池头）',
  fullHome: false,
  env: { regen: '1' },
}, true)

const paths = buildReports(state)
console.log(
  `regen ${runId}: ${state.all().length} records →\n  ${paths.report}\n  ${paths.diagnosis}\n  ${paths.summary}`,
)
