/**
 * 品牌串单一事实源（VERSION / PRODUCT_NAME / PACKAGE_NAME / REPOSITORY_URL +
 * buildUserAgent）——工单 docs/2026-10-04-http-useragent-fix.md §1（A-2 待办落掉）。
 *
 * 层边界：shared 是唯一叶子域（DEP-1 不 import 任何内部模块）。LLM 出站 UA 的
 * 版本段须在此自带「process.argv[1] 上行走定位最近 package.json」同款算法
 * （与 engine/session/paths.ts getVersion / cli/parse.ts resolveCliVersion
 * 同款）；三处版本读复制的去漂移归工单 §3 后续波，本轮 header 主修复不阻塞。
 * 核（modelprovider）经 shared 门面取 buildUserAgent 出站 UA（DEP-3 allow=[shared]），
 * 不引 tui/engine，层边界干净。
 */
/* eslint-disable custom-rules/no-sync-fs -- 版本读沿用 engine/session/paths.ts 同款
   模块级同步 IIFE（process.argv[1] 上行走定位 package.json，两态一致）；sync→async
   改写违「行为零改动」纪律 + 会破坏模块级缓存语义，归工单 §3 去漂移 / W-opt 波再议 */
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const PRODUCT_NAME = 'AtlasCode'
export const PACKAGE_NAME = '@atlasharness/atlascode'
export const REPOSITORY_URL = 'https://github.com/vincentlau2046/AtlasCode'

// 模块级缓存（与 paths.ts 同款，防 async 上下文 define bug）。路径算法 =
// process.argv[1] 上行走定位最近 package.json 读 version（dev 源树 / npm 安装
// 两态一致）；'0.0.0' 回落（明示未知，不假成功）。
const VERSION: string = (() => {
  try {
    let d = dirname(realpathSync(process.argv[1] ?? ''))
    for (;;) {
      const pkgPath = join(d, 'package.json')
      if (existsSync(pkgPath)) {
        const v = (JSON.parse(readFileSync(pkgPath, 'utf8')) as {
          version?: string
        }).version
        if (typeof v === 'string' && v) return v
      }
      const parent = dirname(d)
      if (parent === d) break
      d = parent
    }
  } catch {
    // 落空回落明示未知
  }
  return '0.0.0'
})()

export function getVersion(): string {
  return VERSION
}

/** LLM 出站 User-Agent 品牌串（与 tui/utils/http.ts `AtlasCode/<v> (... +repo)` 语义对齐）。 */
export function buildUserAgent(): string {
  return `${PRODUCT_NAME}/${getVersion()} (+${REPOSITORY_URL})`
}
