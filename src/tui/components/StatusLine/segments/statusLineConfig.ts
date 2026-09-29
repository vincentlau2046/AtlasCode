// statusline.json 读取 + schema 校验 + 降级 + 原子写
// 17-TUI设计方案 §9.1.1 / §9.4 安全红线
//
// 路径：~/.atlas/statusline.json（用 getConfigDirName()，仓内规范）
// 仅用户级（§9.9.3 安全红线：绝不支持项目级覆盖，禁 env 重定向路径）
// 故障自愈：解析/校验失败 → 降级为默认 segment 集合，绝不影响其他功能
// 落盘：主进程原子写（tmp+rename），失败保留旧配置

import { z } from 'zod'
import { readFileSync, existsSync, writeFileSync, renameSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { getConfigDirName } from '../../../utils/configDir.js'
import {
  DEFAULT_SIMPLE_LINE1,
  DEFAULT_DETAILED_LINE1,
  DEFAULT_DETAILED_LINE2,
  type SegmentConfig,
  type StatusLineJsonConfig,
} from './types.js'

// ── Schema（§9.4 安全红线：收紧，白名单 segment type） ────────────

const SEGMENT_TYPES = [
  'model', 'permission-mode', 'git-branch', 'git-files', 'git-combined', 'context-bar', 'tok-s',
  'session-duration',
  'tools-count', 'thinking-level', 'context-absolute',
  'cost', 'tokens-in', 'tokens-out', 'cwd', 'control-link',
] as const

const segmentConfigSchema = z.object({
  type: z.enum(SEGMENT_TYPES),
  label: z.string().max(50).optional(),
  color: z.string().max(20).optional(),
})

const statusLineJsonSchema = z.object({
  simple: z.object({
    line1: z.array(segmentConfigSchema).max(10),
  }).optional(),
  detailed: z.object({
    line1: z.array(segmentConfigSchema).max(10),
    line2: z.array(segmentConfigSchema).max(10),
  }).optional(),
})

// ── 路径解析（仅用户级，§9.9.3 安全红线） ──────────────────────────

export function getStatusLineJsonPath(): string {
  // 禁 env 重定向路径（§9.9.3：显示配置无运行时覆盖入口）
  // 仅从 getConfigDirName() 解析（仓内规范：.atlas）
  return join(homedir(), getConfigDirName(), 'statusline.json')
}

// ── 默认配置（故障自愈降级用） ──────────────────────────────────────

export function getDefaultConfig(): StatusLineJsonConfig {
  return {
    simple: { line1: DEFAULT_SIMPLE_LINE1 },
    detailed: {
      line1: DEFAULT_DETAILED_LINE1,
      line2: DEFAULT_DETAILED_LINE2,
    },
  }
}

// ── 读取 + 校验 + 降级 ─────────────────────────────────────────────

export interface LoadResult {
  config: StatusLineJsonConfig
  /** true = 从文件加载成功；false = 降级为默认 */
  degraded: boolean
  /** 降级原因（degraded=true 时有值） */
  reason?: string
}

let cachedConfig: LoadResult | null = null
let lastLoadTs = 0
const LOAD_COOLDOWN_MS = 5000  // 校验失败后 5s 内不重复读盘

/**
 * 读取并校验 statusline.json。
 * - 文件不存在 → 返回默认配置（degraded=false，这是正常首次使用）
 * - 解析/校验失败 → 返回默认配置（degraded=true，故障自愈）
 * - 成功 → 返回用户配置（degraded=false）
 *
 * 启动时读一次；/statusline 写后主动调 invalidateStatusLineConfig() 刷新。
 * 5s 轮询兜底（§9.1.1 热载策略）。
 */
export function loadStatusLineConfig(): LoadResult {
  // 缓存冷却：避免频繁读盘
  if (cachedConfig && Date.now() - lastLoadTs < LOAD_COOLDOWN_MS) {
    return cachedConfig
  }

  const path = getStatusLineJsonPath()
  let result: LoadResult

  if (!existsSync(path)) {
    // 文件不存在：正常首次使用，不算降级
    result = { config: getDefaultConfig(), degraded: false }
  } else {
    try {
      const raw = readFileSync(path, 'utf-8')
      const parsed = JSON.parse(raw)
      const validated = statusLineJsonSchema.parse(parsed)
      result = { config: validated as StatusLineJsonConfig, degraded: false }
    } catch (err) {
      // 解析/校验失败：故障自愈降级
      result = {
        config: getDefaultConfig(),
        degraded: true,
        reason: err instanceof Error ? err.message : String(err),
      }
    }
  }

  cachedConfig = result
  lastLoadTs = Date.now()
  return result
}

/** 获取当前有效配置的 simple line1 */
export function getSimpleLine1(): SegmentConfig[] {
  return loadStatusLineConfig().config.simple?.line1 ?? DEFAULT_SIMPLE_LINE1
}

/** 获取当前有效配置的 detailed line1 */
export function getDetailedLine1(): SegmentConfig[] {
  return loadStatusLineConfig().config.detailed?.line1 ?? DEFAULT_DETAILED_LINE1
}

/** 获取当前有效配置的 detailed line2 */
export function getDetailedLine2(): SegmentConfig[] {
  return loadStatusLineConfig().config.detailed?.line2 ?? DEFAULT_DETAILED_LINE2
}

/** /statusline 写后主动刷新缓存 */
export function invalidateStatusLineConfig(): void {
  cachedConfig = null
  lastLoadTs = 0
}

// ── 原子写（§9.9.3：主进程落盘，tmp+rename） ───────────────────────

/**
 * 原子写入 statusline.json（主进程调用，agent 不直接写）。
 * 策略：写 tmp 文件 → rename 覆盖（POSIX 原子）。
 * 失败时保留旧文件不变。
 */
export function saveStatusLineConfig(config: StatusLineJsonConfig): void {
  const path = getStatusLineJsonPath()
  const dir = join(homedir(), getConfigDirName())

  // 确保目录存在
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const tmpPath = path + '.tmp'
  const data = JSON.stringify(config, null, 2) + '\n'

  try {
    writeFileSync(tmpPath, data, 'utf-8')
    renameSync(tmpPath, path)
    // 写成功后刷新缓存
    invalidateStatusLineConfig()
  } catch (err) {
    // 写失败：清理 tmp 文件，保留旧配置
    try {
      if (existsSync(tmpPath)) {
        const { unlinkSync } = require('fs')
        unlinkSync(tmpPath)
      }
    } catch {
      // 清理失败也忽略
    }
    throw new Error(
      `Failed to save statusline.json: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

/** 校验外部 JSON 字符串是否符合 schema（/statusline agent 产出校验用） */
export function validateStatusLineJson(raw: string): {
  ok: boolean
  config?: StatusLineJsonConfig
  error?: string
} {
  try {
    const parsed = JSON.parse(raw)
    const validated = statusLineJsonSchema.parse(parsed)
    return { ok: true, config: validated as StatusLineJsonConfig }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/** 测试用：重置缓存 */
export function resetStatusLineConfigCache(): void {
  cachedConfig = null
  lastLoadTs = 0
}
