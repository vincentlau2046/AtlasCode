/**
 * cli（CLI 公共域）S-C4（§8.71.1.4）— session 4 站点 · session 列表/日志面
 * （旧仓 getLastSessionLog 消费面「CLI list 面，归 CLI 波」落点 +
 * print.ts --continue 最新会话枚举前向接缝回填）。
 *
 * 落面（经 engine 根门面消费 session 域：getProjectDir + loadTranscriptFile
 * + extractFirstPrompt）：
 *   - findLatestSessionId(projectDir)：--continue 最新会话枚举（mtime 最新
 *    .jsonl，纯 fs 不解析 = 快路径；S-C3 print.ts 前向接缝核销）
 *   - listSessionLogs(projectDir)：session 列表面（新 loader 可读 LogOption
 *    子集：firstPrompt/customTitle/tag/summary/messageCount/created·
 *    modified/gitBranch）
 *
 * 裁登记（H6 防空洞，复审勿当遗漏重提）：
 *   - agent-name/color/setting/mode/pr-link 5 张 entry map = 新仓 load.ts
 *    分发「未知/已裁 type 跳过」容错裁面（磁盘 entry 仍在、读面不承载）→
 *    列表面只供新 loader 可读字段；TUI 波 #152 /resume 列表面若需 5 map
 *    字段，session 域 loader 补全时再议（本波不补，登记防「以为已全」）；
 *   - --from-pr PR 关联枚举（旧仓 PR 搜索面）= TUI 波 / 壳波前向接缝
 *    （本波只落目录枚举，PR 关联查询不随迁）；
 *   - listSessionLogs 全量解析每个 .jsonl（O(会话数 × 文件大小)）= 列表
 *    小 N 场景面（CLI 消费）；大目录高频列表 = TUI 波元数据缓存快路径
 *    登记（旧仓 metadata 缓存面未随迁，load.ts 裁面 ① 同源）。
 */
import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import { extractFirstPrompt, loadTranscriptFile } from '../engine'
import type { SessionLogEntry } from './sessionListTypes'

/** 目录枚举容错：缺目录 / 权限错 → 空（列表面不因缺目录抛崩）。 */
async function listSessionFiles(projectDir: string): Promise<string[]> {
  let entries: string[]
  try {
    entries = await readdir(projectDir)
  } catch {
    return []
  }
  return entries.filter(e => e.endsWith('.jsonl'))
}

/**
 * --continue 最新会话枚举（session 站点 ①）：projectDir 下 mtime 最新的
 * .jsonl（纯 stat，不解析文件内容）。无会话文件 / 目录缺失 → null。
 */
export async function findLatestSessionId(
  projectDir: string,
): Promise<string | null> {
  const files = await listSessionFiles(projectDir)
  let latestId: string | null = null
  let latestMtimeMs = 0
  for (const file of files) {
    let mtimeMs: number
    try {
      mtimeMs = (await stat(join(projectDir, file))).mtimeMs
    } catch {
      continue
    }
    if (mtimeMs > latestMtimeMs) {
      latestMtimeMs = mtimeMs
      latestId = file.slice(0, -'.jsonl'.length)
    }
  }
  return latestId
}

/**
 * session 列表面（session 站点 ④ · 旧 getLastSessionLog CLI list 面）：
 * 目录全量 .jsonl 逐个 loadTranscriptFile → 新 loader 可读字段子集
 * （裁登记见头注）。created/modified = 文件 mtime（旧 LogOption 同口径）；
 * gitBranch = 叶消息戳（缺省 undefined）。
 */
export async function listSessionLogs(
  projectDir: string,
): Promise<SessionLogEntry[]> {
  const files = await listSessionFiles(projectDir)
  const out: SessionLogEntry[] = []
  for (const file of files) {
    const filePath = join(projectDir, file)
    let statInfo: Awaited<ReturnType<typeof stat>>
    try {
      statInfo = await stat(filePath)
    } catch {
      continue
    }
    let loaded: Awaited<ReturnType<typeof loadTranscriptFile>>
    try {
      loaded = await loadTranscriptFile(filePath)
    } catch {
      // 单文件坏不炸列表面（旧容错语义）
      continue
    }
    const sessionId = file.slice(0, -'.jsonl'.length)
    const leafUuid = [...loaded.leafUuids].pop()
    const leafMessage = leafUuid ? loaded.messages.get(leafUuid) : undefined
    const entry: SessionLogEntry = {
      sessionId,
      firstPrompt: extractFirstPrompt([...loaded.messages.values()]),
      messageCount: loaded.messages.size,
      created: new Date(statInfo.mtimeMs),
      modified: new Date(statInfo.mtimeMs),
      gitBranch: leafMessage?.gitBranch,
    }
    // key 语义（load.ts L1085-1138 逐字）：summaries = leafUuid 键；
    // customTitles / tags = sessionId 键
    const title = loaded.customTitles.get(sessionId)
    if (title) entry.customTitle = title
    const tag = loaded.tags.get(sessionId)
    if (tag) entry.tag = tag
    if (leafUuid) {
      const summary = loaded.summaries.get(leafUuid)
      if (summary) entry.summary = summary
    }
    out.push(entry)
  }
  out.sort((a, b) => b.modified.getTime() - a.modified.getTime())
  return out
}

export type { SessionLogEntry }
