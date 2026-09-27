/**
 * backends 族组合接线（C 桶 ③ shell·swarm 波 S-E2c backends 族；§8.66）。
 *
 * port.ts 接缝 ② 的显式装配语句（PRT-2：接线调用 = 组合根装配语句，非模块
 * 顶层自注册；见 port.ts 头注登记）：把 registry/detection 真实现 4 面接入
 * setBackendModule，teammateLayoutManager（fail-fast requireBackendModule）
 * 与 teamHelpers（null 缺省 getBackendModule）消费面随之激活。
 *
 * 调用方 = 组合根（bootstrap / TUI 组合面）+ 测试 setup（各 test face
 * beforeEach）；本文件零模块级副作用（不自动接线，PRT-2 零副作用纪律）。
 * 幂等：重复调用 = last-wins（测试重装配面）。
 *
 * 域内依赖环核查：本文件 → registry / detection / port 单向；registry 动态
 * import 两 backend 类（ensureBackendsRegistered 函数体内），零循环。
 */
import { isInsideTmux } from './detection'
import { setBackendModule } from './port'
import {
  detectAndGetBackend,
  ensureBackendsRegistered,
  getBackendByType,
} from './registry'

/**
 * 把 backends 族真实现接入 port 注入窗（幂等，last-wins）。
 * 测试 teardown 用 resetBackendModule() 复位（port 门面导出）。
 */
export function wireBackends(): void {
  setBackendModule({
    detectAndGetBackend,
    getBackendByType,
    ensureBackendsRegistered,
    isInsideTmux,
  })
}
