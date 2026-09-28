/**
 * atlascode/state — AppState 真实现（D 波 S-E2d 提交 2，B13 setAppState 置换）
 *
 * 旧仓 ground truth：QueryEngineConfig getAppState/setAppState（utils/
 * queryContext.ts:94-107 字段面逐字：getAppState: () => AppState /
 * setAppState: (f: (prev) => AppState) => void）= 旧 state/AppStateStore
 * React functional-update 的替换面（charter Port 1；新仓型面契约 =
 * engine/ports/sessionContext.ts SessionContextPort，S-7d d2 零消费者
 * 前向登记，本实现经组合根 setSessionContextPort 注入激活）。
 *
 * 新仓无 React/TUI → EngineState<SessionSnapshot> 串行 apply 队列置换
 * React 批处理（engine/state，R3a M3a.3 原型 9/9 转正；co-located
 * tests/unit/engine-state.test.ts 锁 100 并发零丢失不变量）：
 *   - AppState.set(f) = awaitable 形（Promise<void>，updater 抛错 reject
 *     该调用方不卡队列——EngineState 头注 2026-09-23 review 修）
 *   - AppState.port（SessionContextPort 契约面）set = fire-and-forget 形
 *     （旧仓 React setState ground truth：异步提交，中间态可观测）
 *
 * 与 S-E2 A7 壳（adapters/sessionContextPortAdapter.ts 闭包 holder）关系：
 * 本模块经 strangler 整换该壳（compose ⑩ 注入置换 + atlascode 门面导出
 * 置换 → 适配器零引用删除）。闭包 holder 为同步直 apply（无提交边界）；
 * 本实现 = 旧仓 React ground truth 语义（异步串行提交，f 看最新 committed
 * prev，每次 apply 即提交不批处理合并——M3a.3 不变量）。
 *
 * 派生/裁面继承（S-E2 审视 A 路 NOTE-2/3，自适配器头注原样承接）：
 *   - effortValue 'medium' = 旧仓 AppStateStore.ts:554 `effortValue:
 *     undefined` → wire 层回落 Atlas 缺省 'medium'（effort.ts:167 doc）
 *     的**预解析形**（旧初值 undefined + 消费时回落，本实现预解析为终值，
 *     无显式 effort 场景语义等价）。
 *   - mcp 裁面：旧 AppState.mcp 5 字段（clients/tools/commands/resources/
 *     pluginReconnectKey，AppStateStore.ts:163-172；snapshotSequence 属
 *     fileHistory 块 :498，非 mcp 成员——S-E3 审视 minor-1 计数订正），
 *     本 SessionSnapshot 契约面仅 tools + clients（新仓型面定义）；未来
 *     消费方需 commands/resources 时经同一窗口扩 SessionSnapshot 形。
 */
import {
  EngineState,
  type SessionContextPort,
  type SessionSnapshot,
  type StateUpdater,
} from '../../engine'

/** 缺省快照 = 最小全新 TPC（mode 'default' 空规则族，同 permission-gate-
 * wiring 测试 ctx() 形）+ 空 mcp 面 + effort 缺省档位 'medium' +
 * advisorModel undefined + 空 tasks（承 S-E2 A7 壳缺省面逐字）。 */
function defaultSessionSnapshot(): SessionSnapshot {
  return {
    toolPermissionContext: {
      mode: 'default',
      additionalWorkingDirectories: new Map(),
      alwaysAllowRules: {},
      alwaysDenyRules: {},
      alwaysAskRules: {},
      isBypassPermissionsModeAvailable: false,
    },
    mcp: { tools: [], clients: [] },
    effortValue: 'medium',
    advisorModel: undefined,
    tasks: {},
  }
}

/**
 * AppState（charter Port 1 替换面；旧 QueryEngineConfig getAppState/
 * setAppState 语义）。get = 最新 committed 快照（set 是 async，未 await 的
 * set 尚未提交）；set = 串行 functional-update（f 恒看最新 committed prev，
 * 每次 apply 即提交，不批处理合并——M3a.3 不变量）。
 */
export interface AppState {
  get(): SessionSnapshot
  set(f: StateUpdater<SessionSnapshot>): Promise<void>
  /** Port 1 契约面（engine/ports/sessionContext.ts；set fire-and-forget）。 */
  port: SessionContextPort
}

/** 组合根唯一构造点（compose ⑩ 消费；initial 缺省 = defaultSessionSnapshot）。 */
export function createAppState(initial?: SessionSnapshot): AppState {
  const store = new EngineState<SessionSnapshot>(
    initial ?? defaultSessionSnapshot(),
  )
  const port: SessionContextPort = {
    get: () => store.get(),
    set: f => {
      void store.set(f)
    },
  }
  return {
    get: () => store.get(),
    set: f => store.set(f),
    port,
  }
}
