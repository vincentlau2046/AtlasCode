/**
 * engine/config — settings 深度合并（§8.27 E-3 S-3b，旧仓 lodash-es/mergeWith 自实现）
 *
 * 新仓无 lodash 依赖（package.json 零 lodash）→ 按 lodash merge/mergeWith 语义
 * 裁剪实现 settings 场景子集（防「以为已全」登记）：
 *   - 遍历 source 自有键；customizer 先行（返回值非 undefined = 采用，
 *     undefined = 回落默认合并）——与 lodash 一致：customizer 在 undefined
 *     判定**之前**调用（写回删键语义依赖此顺序，见 settings.ts 头注）
 *   - 默认合并：双方均为 plain object → 递归；否则 source 覆盖（含 null）
 *   - srcValue === undefined：customizer 已跑完仍无定制 → 不动 target
 *     （lodash 同语义：undefined 源值不写入）
 *   - 裁剪：class 实例/Date/Map/Set 深合并（lodash 处理，settings 场景
 *     纯 JSON 数据不出现）；symbol 键（JSON 数据无 symbol 键）
 */

/** 合并定制器（lodash MergeWithCustomizer 形状；settings 场景 4 参足够）。 */
export type MergeCustomizer = (
  objValue: unknown,
  srcValue: unknown,
  key: string,
  object: Record<string, unknown>,
) => unknown

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * lodash mergeWith 语义子集：把 source 合并进 target（mutate target 并返回）。
 * 纯函数式无状态（不依赖 lodash 的 stack/circular 处理——settings JSON 无环）。
 */
export function mergeWith<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>,
  customizer?: MergeCustomizer,
): T {
  for (const key of Object.keys(source)) {
    const srcValue = (source as Record<string, unknown>)[key]
    const objValue = (target as Record<string, unknown>)[key]
    if (customizer) {
      const customized = customizer(
        objValue,
        srcValue,
        key,
        target as Record<string, unknown>,
      )
      if (customized !== undefined) {
        ;(target as Record<string, unknown>)[key] = customized
        continue
      }
    }
    if (srcValue === undefined) continue
    if (isPlainObject(objValue) && isPlainObject(srcValue)) {
      mergeWith(
        objValue as Record<string, unknown>,
        srcValue,
        customizer,
      )
    } else {
      ;(target as Record<string, unknown>)[key] = srcValue
    }
  }
  return target
}

/** 保序去重（lodash uniq 语义子集：SameValueZero，对象按引用）。 */
function uniq<T>(arr: readonly T[]): T[] {
  const seen = new Set<T>()
  const out: T[] = []
  for (const x of arr) {
    if (!seen.has(x)) {
      seen.add(x)
      out.push(x)
    }
  }
  return out
}

/**
 * settings 读侧合并定制器（旧仓 settingsMergeCustomizer 逐字语义）：
 * 数组 = 拼接 + 去重（target 序在前）；其余返回 undefined 让默认合并接管。
 * 导出供单测 + loadManagedFileSettings/loadSettingsFromDisk 消费。
 */
export function settingsMergeCustomizer(
  objValue: unknown,
  srcValue: unknown,
): unknown {
  if (Array.isArray(objValue) && Array.isArray(srcValue)) {
    return uniq([...(objValue as unknown[]), ...(srcValue as unknown[])])
  }
  return undefined
}
