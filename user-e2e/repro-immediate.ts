/**
 * B1 判别回归（配置命令立即生效，immediate 门）：
 * 修前 shouldInferenceConfigCommandBeImmediate() 读 growthbook 死 stub
 * atlas_immediate_model_command 恒 false → /model /fast /effort busy 时排队。
 * 修后（0.1.18 7083a10）= return true。
 *
 * 用法：bun run user-e2e/repro-immediate.ts
 */
const B = '/home/vince/projects/AtlasCode/src'

async function main() {
  const { shouldInferenceConfigCommandBeImmediate } = await import(`${B}/tui/utils/immediateCommand.js`)

  let pass = 0
  let fail = 0
  const got = shouldInferenceConfigCommandBeImmediate()
  const ok = got === true
  console.log(`[${ok ? 'PASS' : 'FAIL'}] shouldInferenceConfigCommandBeImmediate() = ${got} (期望 true，修前 false)`)
  ok ? pass++ : fail++

  // /model /fast /effort 的 immediate getter 都走这个门；此处直接验门本身。
  console.log(`\n=== Probe B1 结果: ${pass} pass / ${fail} fail ===`)
  console.log('（B2 busy 态立即生效为 pty 判别，需 gateway，见 repro-slash-model.ts）')
  process.exit(fail === 0 ? 0 : 1)
}

main().catch(e => {
  console.error('Probe B1 异常:', e)
  process.exit(2)
})