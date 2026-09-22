/**
 * 懒加载 schema 工厂（跨域纯叶子，C-Deep 切片 3 T5 下沉）
 *
 * 旧仓来源（a8af45b）: src/utils/lazySchema.ts — 零依赖 memoize 工厂。
 * permissions 域 PermissionRule.ts（zod schema 延迟到首调构造，避免模块 init
 * 期构建）消费；跨域纯叶子 → shared 下沉。
 */

/**
 * 返回一个 memoize 工厂函数：首调时才构造值，之后恒返回缓存。
 * 用于把 Zod schema 构造从模块 init 期推迟到首次访问。
 */
export function lazySchema<T>(factory: () => T): () => T {
  let cached: T | undefined
  return () => (cached ??= factory())
}
