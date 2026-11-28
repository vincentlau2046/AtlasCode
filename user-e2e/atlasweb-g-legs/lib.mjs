// GREEN 轮共用件：harness 复用（F6_APP 环境变量选新锚安装面）+ scrollUnion。
export { spawnServer, pw, finish } from '../../red/legs/harness.mjs'

/** union-of-scroll：滚动收集 data-index→id 全并（大会话权威测量面，RED v2 教训）。
 * v3 增补（GREEN 轮 g4 首跑教训）：步长按 scrollHeight 自适应——巨型文本行会话
 * （~100KB/行）scrollHeight 达 ~10^6 px，固定小步长 × 护栏轮数只扫头部切片
 * （f001..f016 形伪影）；步长 = max(400, scrollHeight/50)，护栏 200 轮 = 全程覆盖。 */
export async function scrollUnion(page) {
  return page.evaluate(async () => {
    const el = document.querySelector('[data-transcript]')
    if (!el) return { ids: [], maxIndex: -1, indexed: false, order: null }
    const seen = new Map()
    const sweep = () => {
      for (const row of el.querySelectorAll('[data-message-id]')) {
        const id = row.getAttribute('data-message-id')
        const idx = row.getAttribute('data-index')
        if (!seen.has(id)) seen.set(id, idx === null ? null : Number(idx))
      }
    }
    const step = Math.max(400, Math.ceil(el.scrollHeight / 50))
    el.scrollTop = 0
    await new Promise(r => setTimeout(r, 250))
    let prev = -1
    for (let guard = 0; guard < 200; guard++) {
      sweep()
      el.scrollTop += step
      await new Promise(r => setTimeout(r, 120))
      if (el.scrollTop === prev) break
      prev = el.scrollTop
    }
    sweep()
    const indexed = [...seen.values()].some(v => v !== null)
    let order = null
    if (indexed) {
      order = [...seen.entries()].filter(e => e[1] !== null).map(e => [e[1], e[0]])
        .sort((a, b) => a[0] - b[0]).map(e => e[1])
    }
    return { ids: [...seen.keys()], maxIndex: Math.max(-1, ...[...seen.values()].filter(v => v !== null)), indexed, order }
  })
}

/** route 仪器化：分页请求（带 pageToken）延迟 delayMs——仅加宽行进窗，不改内容。 */
export async function instrumentPagingDelay(page, delayMs) {
  await page.route('**/sessions/*/replay*', async route => {
    const url = new URL(route.request().url())
    if (url.searchParams.has('pageToken')) {
      await new Promise(r => setTimeout(r, delayMs))
    }
    await route.continue()
  })
}
