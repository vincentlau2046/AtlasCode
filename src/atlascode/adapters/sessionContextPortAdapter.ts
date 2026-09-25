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
