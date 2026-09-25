/**
 * atlascode 组合根适配器 — Port 5（SessionMemoryPort）壳实现（S-E2 A6，§8.52）。
 *
 * 旧仓写面（services/SessionMemory/sessionMemory.ts setupSessionMemoryFile
 * 195-202 + sessionMemoryUtils getSessionMemoryContent 109-121）经 port 契约
 * 收敛于此壳实现，compose.ts 经 setSessionMemoryPort 注入：
 *   - 路径 = join(getProjectDir(env.getOriginalCwd()), env.getSessionId(),
 *     'session-memory', 'summary.md')（旧 getSessionMemoryPath 逐字形态；
 *     旧 getCwd() → 新仓冻结 getOriginalCwd，A-1 值 delta 裁定）
 *   - load = readFile utf-8，isFsInaccessible → null，其余 I/O 错误 → 抛出
 *     （旧 getSessionMemoryContent 逐字）
 *   - save = mkdir(0o700) + writeFile(0o600)（旧仓逐字 mode）
 *
 * 保真登记（复审勿当遗漏重提）：
 *   - port 契约「原子写」= 旧仓 plain writeFile 先例（无 tmp+rename；旧仓
 *     sessionMemory.ts:195-202 实证），mode 0o600/0o700 逐字。
 *   - mkdir recursive = 登记 delta：旧仓非 recursive mkdir 依赖父目录
 *     （`<projectDir>/<sessionId>/` transcript 目录）已存在；壳实现自足化
 *     （session record 写面未必先物化），recursive 兜底。
 *   - 路径每次调用重算（旧仓 getSessionMemoryPath() 同口径）：session 中途
 *     switchSession 后写面跟随新 session id。
 *
 * env = session 域 SessionEnv 注入窗口（S-E2 A5 注 bootstrap 真值；域缺省
 * 自包含值亦可独立驱动本适配器单测）。
 */
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { SessionMemoryPort } from '../../engine'
import { getProjectDir, getSessionEnv } from '../../engine'
import { isFsInaccessible } from '../../shared'

/** 当前 session memory 文件路径（旧 getSessionMemoryPath 逐字形态）。 */
function sessionMemoryPath(): string {
  const env = getSessionEnv()
  return join(
    getProjectDir(env.getOriginalCwd()),
    env.getSessionId(),
    'session-memory',
    'summary.md',
  )
}

export function createSessionMemoryPort(): SessionMemoryPort {
  return {
    async load(): Promise<string | null> {
      try {
        return await readFile(sessionMemoryPath(), 'utf-8')
      } catch (e: unknown) {
        if (isFsInaccessible(e)) return null
        throw e
      }
    },
    async save(content: string): Promise<void> {
      const dir = dirname(sessionMemoryPath())
      await mkdir(dir, { mode: 0o700, recursive: true })
      await writeFile(sessionMemoryPath(), content, {
        encoding: 'utf-8',
        mode: 0o600,
      })
    },
  }
}
