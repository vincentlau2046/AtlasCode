/**
 * Port: sessionMemory（Port 5）
 *
 * 实现波次: E 波 S-7d d1 契约落地（§8.49 item 9；A 波占位「实现待 C 波」
 * 经 E 波 session 域规划改判 d1 随迁——状态机本体进 engine，port 契约
 * 同波就绪）
 * 状态: 契约就绪，壳侧实现 + compose 注入 = E-wave-end 前向接缝
 *
 * engine 拥有 session memory 阈值状态机（engine/session/sessionMemory.ts），
 * 文件 I/O 面（路径解析 + isFsInaccessible→null 降级 + 原子写）归 shell：
 * 壳实现本 port，经 setSessionMemoryPort（engine/session 门面）注入。
 * 零消费者 = 前向登记（H6 防空洞：接缝已声明非遗漏）。
 */
export type SessionMemoryPort = {
  /**
   * 读当前 session memory 文件内容。
   * 语义（旧 getSessionMemoryContent 逐字）：文件不存在/不可访问 → null
   * （isFsInaccessible 判定归实现方）；其余 I/O 错误 → 抛出。
   */
  load(): Promise<string | null>
  /**
   * 写 session memory 内容（实现方负责原子写 + 目录创建）。
   * 旧仓写面在主 sessionMemory.ts（fs 直写），本 port 将其收敛为壳职责。
   */
  save(content: string): Promise<void>
}
