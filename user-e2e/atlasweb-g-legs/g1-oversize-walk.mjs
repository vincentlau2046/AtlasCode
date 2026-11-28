// G1（格 1 GREEN）：sess-oversize（6MiB > 4MiB 帽）→ 分页行进全史装载。
// = red l1 v2 基座 + 行进面观察增补（route 仅延迟带 pageToken 请求 = 加宽行进窗，内容零改）。
// 020f3cb 新面：[data-paging-progress]（role=status "Loading earlier history…"）内 span[data-paging-loaded]=已装数。
// W-FC-3 修正（工单 docs/2026-11-29-wfc3-g1-discriminator-ticket.md @4438e18f
// §3 候选 A，零版号 test-side）：GREEN 计测面改 scrollUnion v3 权威口径
// （g3 oversize 权威形同源：o01..o40 集恒等 + noDup）——`toHaveCount(40)` 降为
// RED-face 标注块（判别专用非计测；口径二分纪律见同目录 README）。
import { spawnServer, pw, finish, instrumentPagingDelay, scrollUnion } from './lib.mjs'

const G = '/home/vince/.claude/jobs/09264df0/tmp/f6/green'
const checks = []
const srv = await spawnServer(`${G}/scope`, `${G}/out/g1-server.log`)
const { chromium, expect } = pw()
const b = await chromium.launch()
try {
  const page = await (await b.newContext()).newPage()
  await instrumentPagingDelay(page, 600)
  await page.goto(srv.redeemUrl, { waitUntil: 'domcontentloaded' })
  await page.goto(srv.baseUrl + '/', { waitUntil: 'domcontentloaded' })
  const row = page.locator('button[data-session-id="sess-oversize"]')
  await row.waitFor({ state: 'visible', timeout: 20_000 })
  await row.click()

  // 判据 A：行进面在场（paging-walk 中间态显性）+ 已装数递增记录
  let progressSeen = false
  const loadedVals = []
  for (let i = 0; i < 100; i++) {
    const n = await page.locator('[data-paging-progress]').count()
    if (n > 0) {
      progressSeen = true
      const v = await page.locator('[data-paging-loaded]').first().textContent().catch(() => null)
      if (v !== null && !loadedVals.includes(v)) loadedVals.push(v)
    }
    if (await page.locator('[data-conn-status][data-conn-status="live"]').count() > 0) break
    await page.waitForTimeout(100)
  }
  const status = await page.locator('[data-conn-status]').first().getAttribute('data-conn-status')
  checks.push({ ok: progressSeen, name: 'paging-walk-progress-face-observed', detail: `seen=${progressSeen} loadedVals=[${loadedVals.join(',')}] status=${status}` })
  const progressGone = await page.locator('[data-paging-progress]').count()
  checks.push({ ok: progressGone === 0 && status === 'live', name: 'walk-completes-to-live-no-residual-progress', detail: `progressResidual=${progressGone} status=${status}` })

  // 判据 B：非 error 态（red 轮此格 RED：error 态 0/40）
  await page.waitForTimeout(1500)
  const errCount = await page.locator('[data-conn-error]').count()
  const errText = errCount > 0 ? await page.locator('[data-conn-error]').first().textContent() : '(none)'
  checks.push({ ok: errCount === 0, name: 'oversize-no-error-face', detail: `errCount=${errCount} status=${status} err="${(errText || '').trim()}"` })

  // 判据 C（GREEN 计测权威面 = scrollUnion v3 口径，g3 oversize 权威形同源）：
  // 行进全史 union 装载计测 = o01..o40 集恒等 + noDup；live DOM 单点 count 是
  // 虚拟滚动渲染窗 artifact，不得作 GREEN 计测断言（二分纪律见同目录 README）。
  const union = await scrollUnion(page)
  const want = Array.from({ length: 40 }, (_, i) => `o${String(i + 1).padStart(2, '0')}`)
  const exact = union.ids.length === 40 && want.every(id => union.ids.includes(id)) && new Set(union.ids).size === 40
  checks.push({ ok: union.indexed && exact, name: 'oversize-walked-full-history-union', detail: `union=${union.ids.length}/40 maxIndex=${union.maxIndex} indexed=${union.indexed} noDup=${new Set(union.ids).size === union.ids.length}` })

  // ── RED-face 标注块（判别专用，非 GREEN 计测，不 gate checks）─────────────
  // 旧判据误用形（第三例登记面）：expect(...).toHaveCount(40) 曾作 GREEN 断言
  // → 虚拟滚动渲染窗（~23 行/窗）下结构性不可达 → GREEN 轮伪 RED（rejudge §6
  // 登记①，链见 README 三例链）。
  // 口径定义：live count ≠ 40，不钉具体观测值（第三例观测 12/40 仅为例证，
  // 观测值随窗态漂移）。判别信号 = error-face（判据 B）∧ 行进面变形；
  // live count 单独无判别力——GREEN 轮 count≠40 而 error-face 缺席 = 纯
  // 渲染窗 artifact，非判别信号。本块仅记录观测，不参与 checks 判定；
  // 超时窗 2s（观测探针形，非旧 GREEN 断言 30s 等待门）。
  let liveCount = -1
  try {
    await expect(page.locator('[data-transcript] [data-message-id]')).toHaveCount(40, { timeout: 2_000 })
    liveCount = 40
  } catch { liveCount = await page.locator('[data-transcript] [data-message-id]').count() }
  console.log(`[red-face-annotation] liveCount=${liveCount}（RED-face 判别位非计测：count ≠ 40，不钉具体观测值——第三例观测 12/40；GREEN 计测 = 判据 C scrollUnion 权威面）`)
} finally {
  await b.close()
  srv.stop()
}
finish(checks, 'green')
