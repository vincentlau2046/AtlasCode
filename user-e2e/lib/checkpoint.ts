/**
 * user-e2e 运行状态与 checkpoint（方案 §4：per-case checkpoint，
 * 任何时刻中断 reports/ 里都有已完成面的报告）。
 */
import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { nowIso } from './util'

export type Verdict = 'PASS' | 'FAIL' | 'TIMEOUT' | 'STUCK' | 'SKIP'

export interface CaseRec {
  id: string
  tier: string
  verdict: Verdict
  ms: number
  ts: string
  note?: string
  evidence?: Record<string, unknown>
  drivers?: Record<
    string,
    {
      verdict: Verdict
      ok: boolean
      ms?: number
      detail?: string
      log?: string
      tail?: string
      zeroContent?: boolean
      toolUses?: string[]
      sessionId?: string
      stderrTail?: string
    }
  >
}

export interface RunMeta {
  runId: string
  startedAt: string
  repoRoot: string
  repoRev: string
  version: string
  gateway: string
  model: string
  fullHome: boolean
  env: Record<string, string>
}

export class RunState {
  private recs: CaseRec[] = []
  private file: string

  constructor(
    public root: string,
    public meta: RunMeta,
    resume = false,
  ) {
    const dir = join(root, 'artifacts', meta.runId)
    mkdirSync(dir, { recursive: true })
    this.file = join(dir, 'checkpoint.jsonl')
    if (resume && existsSync(this.file)) {
      for (const line of readFileSync(this.file, 'utf8').split('\n')) {
        if (line.trim()) this.recs.push(JSON.parse(line))
      }
    }
  }

  rec(r: Omit<CaseRec, 'ts'>): CaseRec {
    const full: CaseRec = { ...r, ts: nowIso() }
    this.recs.push(full)
    appendFileSync(this.file, JSON.stringify(full) + '\n')
    return full
  }

  all(): CaseRec[] {
    return this.recs
  }

  byId(id: string): CaseRec | undefined {
    return this.recs.find(r => r.id === id)
  }

  /** 断点续跑：已跑过的 case id 集 */
  doneIds(): Set<string> {
    return new Set(this.recs.map(r => r.id))
  }
}
