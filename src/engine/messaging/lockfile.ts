/**
 * messaging 域 — proper-lockfile 惰性访问器（E-7 S-7e d1，§8.50）。
 *
 * 旧仓来源（a8af45b）：src/utils/lockfile.ts 43L 随迁（mailbox 写锁面；
 * lock/lockSync/unlock/check 四导出签名逐字）。
 *
 * 随迁 delta 登记（H6 前向接缝，复审勿当遗漏重提）：
 *   - 旧 `require('proper-lockfile')` 惰性访问器 → `createRequire(import.meta.url)`：
 *     新仓 type:module ESM，Node ESM 目标无裸 require（Bun 环境有 require
 *     shim 但统一走 Node 正确路径）；惰性加载成本属性逐字保留——proper-
 *     lockfile 依赖 graceful-fs（首次 require monkey-patch 全部 fs 方法
 *     ~8ms），仍只在首次 lock 调用时发生，静态 import 不拉进启动路径
 *     （`--help` 等无锁场景零成本）。
 *   - 新仓新增依赖 proper-lockfile@^4.1.2（对齐旧仓版本；bun.lock 已同步）。
 *   - 旧文件 eslint-disable @typescript-eslint/no-require-imports 注释删
 *     （新仓 eslint 配置未启用该规则，unused-disable 隐患规避）。
 */

import { createRequire } from 'node:module'
import type { CheckOptions, LockOptions, UnlockOptions } from 'proper-lockfile'

type Lockfile = typeof import('proper-lockfile')

let _lockfile: Lockfile | undefined

function getLockfile(): Lockfile {
  if (!_lockfile) {
    _lockfile = createRequire(import.meta.url)('proper-lockfile') as Lockfile
  }
  return _lockfile
}

export function lock(
  file: string,
  options?: LockOptions,
): Promise<() => Promise<void>> {
  return getLockfile().lock(file, options)
}

export function lockSync(file: string, options?: LockOptions): () => void {
  return getLockfile().lockSync(file, options)
}

export function unlock(file: string, options?: UnlockOptions): Promise<void> {
  return getLockfile().unlock(file, options)
}

export function check(file: string, options?: CheckOptions): Promise<boolean> {
  return getLockfile().check(file, options)
}
