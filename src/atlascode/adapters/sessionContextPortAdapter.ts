/**
 * atlascode 组合根适配器 — Port 1（SessionContextPort）壳实现（S-E2 A7，§8.52）。
 *
 * 组合根最小真实现（防 H6 空洞）：holder 持当前 SessionSnapshot，
 * get 返回快照引用（view 语义——port 契约注：set 按字段写回，不做深拷贝；
 * 调用方 f 就地改写 prev 或返回新快照，本适配器不做拷贝）；set 以
 * f(prev) 结果替换持有引用。
 *
 * 缺省快照 = 最小全新 ToolPermissionContext（mode 'default' 空规则族，
 * 同 permission-gate-wiring 测试 ctx() 形）+ 空 mcp 面 + effort 缺省档位
 * 'medium' + advisorModel undefined + 空 tasks。零消费者不变（D 波/CLI 波
 * 注真实现经同一 setSessionContextPort 窗口整换；壳 = 组合根最小真实现）。
 *
 * 派生/裁面登记（S-E2 审视 A 路 NOTE-2/3）：
 *   - effortValue 'medium' = 旧仓 AppStateStore.ts:554 `effortValue: undefined`
 *     → wire 层回落 Atlas 缺省 'medium'（effort.ts:167 doc「the wire layer
 *     then falls back to the Atlas default 'medium'」）的**预解析形**（旧初值
 *     undefined + 消费时回落，本壳预解析为终值，无显式 effort 场景语义等价）。
 *   - mcp 裁面：旧 AppState.mcp 6 字段（clients/tools/commands/resources/
 *     snapshotSequence/pluginReconnectKey，AppStateStore.ts:163-172），本
 *     SessionSnapshot 契约面仅 tools + clients（新仓 SessionSnapshot 型定义），
 *     裁 4 字段——零消费者下无害，未来消费方需 commands/resources 时经同一
 *     窗口扩 SessionSnapshot 形（非本壳改动）。
 *
 * compose.ts 经 setSessionContextPort(createSessionContextPort()) 注入
 * （engine/session 门面窗口，Port 5 窗口 sessionMemory.ts:123-132 镜像先例）。
 */
import type { SessionContextPort, SessionSnapshot } from '../../engine'

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

export function createSessionContextPort(): SessionContextPort {
  let snapshot = defaultSessionSnapshot()
  return {
    get: () => snapshot,
    set: (f: (prev: SessionSnapshot) => SessionSnapshot) => {
      snapshot = f(snapshot)
    },
  }
}
