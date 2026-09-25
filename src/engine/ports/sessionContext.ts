/**
 * Port: sessionContext（Port 1，归消费方，经 index re-export）
 *
 * 实现波次: E 波 S-7d d2 契约落地（§8.49 item 3；A 波占位「实现待 C 波」
 * 经 E 波 session 域规划改判 d2 真契约）
 * 状态: 契约就绪，壳实现 + compose 注入已落（S-E2 A7，§8.52）；D 波/CLI 波
 * 经同一窗口整换真实现 + 激活消费者
 *
 * QueryEngineConfig getAppState/setAppState 替换面（charter Port 1）；
 * 当前零消费者 = 前向登记（H6 防空洞：接缝已声明非遗漏）。快照字段
 * 对象引用 = view 语义（charter 注：唯一实现细节——set 按字段写回，
 * 不做深拷贝；get 返回当前快照引用）。
 *
 * 类型面（§8.49 d2 核验：全存在，无新增）：
 *   - ToolPermissionContext / TaskState / MCPServerConnection ← shared
 *     （types-session 契约冻结面）
 *   - Tool / EffortValue ← shared（types 契约冻结面）
 */
import type {
  EffortValue,
  MCPServerConnection,
  TaskState,
  Tool,
  ToolPermissionContext,
} from '../../shared'

export interface SessionSnapshot {
  toolPermissionContext: ToolPermissionContext
  mcp: { tools: Tool[]; clients: MCPServerConnection[] }
  effortValue: EffortValue
  advisorModel: string | undefined
  tasks: Record<string, TaskState>
}

export interface SessionContextPort {
  get(): SessionSnapshot
  set(f: (prev: SessionSnapshot) => SessionSnapshot): void
}
