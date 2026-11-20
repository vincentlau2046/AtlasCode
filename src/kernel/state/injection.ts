/**
 * 0.1.106 S3b 切片 1 —— bootstrapState 缝注入槽（lock-face 必答②）。
 *
 * 注入拓扑三 lane（lock-face 必答④，禁只写 tui 桥）：
 *   ① TUI 车道：src/tui/factory.ts（组合根）注入真实现包装
 *   ② headless 车道：src/atlascode/compose.ts（全仓唯一装配点，与既有
 *     setBootstrapStatePort 基项同点，保持单源）
 *   ③ probe 车道：e2e/生产 lane 探针以缺省 NoopSeam 运行（合法）；真状态
 *     消费探针显式注入 stub，未注入路径断言 fail-fast 抛错
 */
import type {
  KernelBootstrapNoopSeam,
  KernelBootstrapStatePort,
} from './ports.js'

let _statePort: KernelBootstrapStatePort | null = null
let _noopSeam: KernelBootstrapNoopSeam | null = null

// 执行出口实施波 S1 —— set-once 守卫（B0 合同 §7；呈批书
// docs/2026-11-21-execution-outlet-wave-lockface-brief.md §2 S1，f4 批复
// 条件③④ @a62925c0）。守卫逻辑单文件收敛（合同预注册形）：armed 态三槽
// （bootstrapState / noopSeam / sessionEnv）各至多一次注入，二次 = 硬错；
// armed 态 reset 缝 = 硬错且槽不被清（单向不可逆——「reset 解除 armed」
// 形不采：注入→reset 解除→再注入 = 静默顶替绕行向量）。未 armed（测试 /
// probe 车道）现语义逐字不变。arming 点 = 双车道组合根单例门
// （compose.ts / tui/factory.ts getCoreDependencies，装配期恰一次、幂等）。
let _armed = false
const _consumed: Record<'bootstrapState' | 'noopSeam' | 'sessionEnv', boolean> = {
  bootstrapState: false,
  noopSeam: false,
  sessionEnv: false,
}

export type KernelInjectionSlot = 'bootstrapState' | 'noopSeam' | 'sessionEnv'

/** 产品组合根单例门 arming（幂等；调用本身非注入）。 */
export function armKernelInjectionGuard(): void {
  _armed = true
}

/** 守卫认领原语：armed 时槽已消费 = 硬错，未消费则记账；未 armed = no-op。 */
export function claimKernelInjectionSlot(slot: KernelInjectionSlot): void {
  if (!_armed) return
  if (_consumed[slot]) {
    throw new Error(
      `set-once 守卫：${slot} 二次注入 = 硬错（B0 合同 §7；产品模式静默覆盖语义不可达）`,
    )
  }
  _consumed[slot] = true
}

/** armed 态查询（env.ts resetSessionEnv 消费——守卫逻辑仍单文件）。 */
export function isKernelInjectionArmed(): boolean {
  return _armed
}

/** 注入真状态端口（组合根启动期恰一次；重复注入 = 覆盖，测试期重注合法）。 */
export function setKernelBootstrapState(port: KernelBootstrapStatePort): void {
  claimKernelInjectionSlot('bootstrapState')
  _statePort = port
}

/** 真状态读取门：未注入 = 显式抛错（fail-fast，硬约束 B——真状态禁缺省）。 */
export function getKernelBootstrapState(): KernelBootstrapStatePort {
  if (!_statePort) {
    throw new Error(
      'KernelBootstrapStatePort 未注入：真状态成员无缺省（S3b lock-face 必答② fail-fast；组合根须 setKernelBootstrapState）',
    )
  }
  return _statePort
}

/** no-op 缝注入（可选；不注入 = DEFAULT_NOOP_SEAM 空实现，合法）。 */
export function setKernelBootstrapNoopSeam(seam: KernelBootstrapNoopSeam): void {
  claimKernelInjectionSlot('noopSeam')
  _noopSeam = seam
}

const DEFAULT_NOOP_SEAM: KernelBootstrapNoopSeam = {
  addSlowOperation() {},
  waitForScrollIdle() {},
  setLastAPIRequest() {},
  setLastAPIRequestMessages() {},
  // 切片 2：接口签名按消费点原形保真；缺省空实现吞参（无消费者）。
}

/** no-op 缝读取门：缺省空实现合法（与真状态缺省语义相反，逐件写死）。 */
export function getKernelBootstrapNoopSeam(): KernelBootstrapNoopSeam {
  return _noopSeam ?? DEFAULT_NOOP_SEAM
}

/** 测试隔离辅助：清空注入槽（生产组合根禁用；armed 态 = 硬错，批复条件④）。 */
export function resetKernelBootstrapStateForTests(): void {
  if (_armed) {
    throw new Error(
      'set-once 守卫：armed 态 resetKernelBootstrapStateForTests = 硬错（单向不可逆；注入→reset 解除→再注入 = 静默顶替绕行向量）',
    )
  }
  _statePort = null
  _noopSeam = null
}
