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

/** 注入真状态端口（组合根启动期恰一次；重复注入 = 覆盖，测试期重注合法）。 */
export function setKernelBootstrapState(port: KernelBootstrapStatePort): void {
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
  _noopSeam = seam
}

const DEFAULT_NOOP_SEAM: KernelBootstrapNoopSeam = {
  addSlowOperation() {},
  waitForScrollIdle() {},
  setLastAPIRequest() {},
  setLastAPIRequestMessages() {},
}

/** no-op 缝读取门：缺省空实现合法（与真状态缺省语义相反，逐件写死）。 */
export function getKernelBootstrapNoopSeam(): KernelBootstrapNoopSeam {
  return _noopSeam ?? DEFAULT_NOOP_SEAM
}

/** 测试隔离辅助：清空注入槽（生产组合根禁用）。 */
export function resetKernelBootstrapStateForTests(): void {
  _statePort = null
  _noopSeam = null
}
