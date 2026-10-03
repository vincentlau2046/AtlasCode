import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'

// loop-robustness 缺口①（#262）：headless 车道崩溃兜底「接线 + 行为面 crash
// 存活」活探针。spawn 真 headless 入口（src/atlascode/cli.ts → binMain headless
// 支首段装兜底），设 ATLAS_TEST_CRASH_BACKSTOP=1 让入口装兜底后立即 emit 一个受控
// uncaught：兜底已接 → 被 log + 存活（process.exit 0，stderr 含探针）；未接（回退）
// → Node 默认 FATAL 崩（exit!=0 / 探针缺失）。
//
// 编号对照（peer atlas-user-e2e）：本 = FINDINGS 缺口#2（headless），②（回合级
// 恢复）另起 func 活探针（turnrecover），勿混。
const PROBE = 'atlas crash-backstop live probe'

function bunBin(): string {
  // bun test 下 process.execPath = bun 可执行文件；否则回退 PATH 的 bun。
  return process.execPath.includes('bun') ? process.execPath : 'bun'
}

describe('crash-backstop wiring（headless 支 binMain 装兜底，func 活探针）', () => {
  test('headless 支装兜底 → 受控 uncaught 被 log + 存活（exit 0）', () => {
    const r = spawnSync(bunBin(), ['src/atlascode/cli.ts', '-p'], {
      cwd: process.cwd(),
      env: { ...process.env, ATLAS_TEST_CRASH_BACKSTOP: '1' },
      encoding: 'utf8',
      timeout: 20_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    // 兜底已接：探针被 log 到 stderr + 进程受控 exit 0（非 Node FATAL 崩）。
    expect(r.status).toBe(0)
    expect(r.stderr ?? '').toContain(PROBE)
  })
})
