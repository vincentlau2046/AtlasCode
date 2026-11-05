const REPO = '/home/vince/projects/AtlasCode/worktrees/worktree-gate-080-final'
const w = await import(`${REPO}/src/modelprovider/streamIdleWatchdog.ts`)
// 形状 A：async iterator 对象（产品代表性 = SDK Stream 形状，return() 可结算）
let n = 0
const stalledObj: AsyncIterator<number> = {
  next: () => (n++ === 0 ? Promise.resolve({ value: 1, done: false }) : new Promise(() => {})),
  return: () => { console.log('  [A] return() called'); return Promise.resolve({ value: undefined, done: true }) },
}
let threw = false
try {
  for await (const _ of w.withStreamIdleWatchdog({ [Symbol.asyncIterator]: () => stalledObj } as AsyncIterable<number>, 30)) { /* consume */ }
} catch (e: any) { threw = e instanceof w.StreamIdleTimeoutError }
console.log(`[A] iterator-object stall threw=${threw} (expect true)`)
// 形状 B：async generator 挂起在 await 中（return() 按规范永不结算）
async function* stalledGen(): AsyncGenerator<number> { yield 1; await new Promise(() => {}) }
let threwB = false
let returned = false
const t = setTimeout(() => { if (!threwB) console.log('[B] generator stall: STILL HUNG at +5s (finally await return() 挂起实证)'); process.exit(3) }, 5000)
try {
  for await (const _ of w.withStreamIdleWatchdog(stalledGen(), 30)) { /* consume */ }
} catch (e: any) { threwB = e instanceof w.StreamIdleTimeoutError; returned = true }
clearTimeout(t)
console.log(`[B] generator stall threw=${threwB} (false = throw 被 finally 吞)`)
process.exit(0)
