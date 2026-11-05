/**
 * A1 判别回归（auto-mode fast 池开放，模型门）：
 * 修前 AUTO_MODE_ROLES = ['premium','small']（fast 被 2026-09-19 裁定排除），
 * fast 池里的模型 modelSupportsAutoMode() = false。
 * 修后（0.1.18 f69399e）= ['premium','fast','small']，fast 池模型应为 true。
 *
 * 判别信号制造：bun 进程不加载 ~/.atlas/settings.json（getRoleModels 走 settings
 * 分支时 premium/small 为空），故三角色都用 ATLAS_<ROLE>_MODEL env 注入——
 * getRoleModels 的 env 分支（refs=[normalizeRef(envModel)]）是同一判定链，
 * 且完全自包含、不依赖配置文件加载。
 */
process.env.ATLAS_PREMIUM_MODEL = 'iff/glm-premium-probe'
process.env.ATLAS_FAST_MODEL = 'iff/glm-fast-probe'
process.env.ATLAS_SMALL_MODEL = 'iff/glm-small-probe'

const B = '/home/vince/projects/AtlasCode/src'

async function main() {
  const { modelSupportsAutoMode } = await import(`${B}/tui/utils/betas.js`)
  const { isModelInLocalModelPools } = await import(`${B}/tui/utils/model/modelAllowlist.js`)

  const cases: Array<[model: string, label: string, expect: boolean]> = [
    // 核心判别：fast 池（env 注入）专属模型，修前 false → 修后 true
    ['iff/glm-fast-probe', 'fast(A1 判别)', true],
    ['glm-fast-probe', 'fast(去 provider)', true],
    // 回归不破：premium / small 仍在池内应 true
    ['iff/glm-premium-probe', 'premium(回归不破)', true],
    ['iff/glm-small-probe', 'small(回归不破)', true],
    // 负样本：不进任何池的模型应 false（fail-closed 面）
    ['iff/glm-not-in-any-pool', '非池模型(负样本)', false],
  ]

  let pass = 0
  let fail = 0
  for (const [model, label, expect] of cases) {
    const got = modelSupportsAutoMode(model)
    const ok = got === expect
    console.log(`[${ok ? 'PASS' : 'FAIL'}] modelSupportsAutoMode(${model}) [${label}] = ${got} (期望 ${expect})`)
    ok ? pass++ : fail++
  }

  // 同源判定 isModelInLocalModelPools：fast 注入模型必须命中本地池
  const poolHit = isModelInLocalModelPools('glm-fast-probe')
  console.log(`[${poolHit ? 'PASS' : 'FAIL'}] isModelInLocalModelPools('glm-fast-probe') = ${poolHit} (期望 true)`)
  poolHit ? pass++ : fail++

  console.log(`\n=== Probe A 结果: ${pass} pass / ${fail} fail ===`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch(e => {
  console.error('Probe A 异常:', e)
  process.exit(2)
})