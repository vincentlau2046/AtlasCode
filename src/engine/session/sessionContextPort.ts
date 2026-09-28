/**
 * session 域 — Port 1（SessionContextPort）注入窗口（S-E2 A7，§8.52）。
 *
 * 镜像 Port 5 窗口先例（sessionMemory.ts:123-132 同款 set/get 双函数 +
 * 模块级持有 + 未注入 null 缺省）：port 契约（engine/ports/sessionContext.ts，
 * S-7d d2 落）此前零注入口（grep 全仓无 setSessionContextPort，H6 前向接缝
 * 「壳侧实现 + compose 注入 = E-wave-end」本项兑现）。
 *
 * 缺省 null = 未注入（消费方自判，同 Port 5 getSessionMemoryPort 口径）；
 * 壳实现（组合根最小真实现，atlascode/adapters/sessionContextPortAdapter.ts）
 * 经组合根 setSessionContextPort 注入；D 波/CLI 波可整换真实现（同窗口）。
 */
import type { SessionContextPort } from '../ports/sessionContext'

let _sessionContextPort: SessionContextPort | null = null

/** 组合根 / 测试覆写（整换；未注入 = null 缺省）。 */
export function setSessionContextPort(port: SessionContextPort): void {
  _sessionContextPort = port
}

export function getSessionContextPort(): SessionContextPort | null {
  return _sessionContextPort
}

/**
 * 测试复位 / 卸载（teardown 出口；组合根重接线经 setSessionContextPort。
 * 单进程连跑跨文件泄漏守卫——compose 注入的壳实现进程内不自动失效）。
 */
export function resetSessionContextPort(): void {
  _sessionContextPort = null
}
