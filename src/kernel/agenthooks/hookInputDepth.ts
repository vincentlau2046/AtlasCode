/**
 * K3-A6（0.1.82，上游 299/300 对齐）：hook 输入深嵌套防护。
 *
 * 上游语义：插件 hook/workflow 脚本拒收嵌套超过上限的值，且报错**带上限名**；
 * 修前深嵌套工具输入在 jsonStringify 上依赖平台栈深（本机实测 JSC ~30000
 * 层内不炸、100000 层 RangeError）——executeHooksOutsideREPL 的 catch 静默
 * return [] = 全部钩子被跳过（299），主 executeHooks 只报泛化 RangeError、
 * 无上限名（300）。
 *
 * 实现：**迭代显式栈**遍历（递归实现在深嵌套输入上会先于检查自身爆栈）；
 * WeakSet 环防护——cyclic 输入终止且不误报深嵌套（circular 结构错误由
 * jsonStringify 的既有 try/catch 兜底转错误结果）。数组嵌套计入深度。
 *
 * 边界（工单自决项，上游 300 同值）：最深节点深度 ≤28000 收纳、>28000
 * 层拒收（数组/对象每层 containment 计 1）。
 */

/** hook 输入最大嵌套层数（超过即拒收，错误报此名）。 */
export const MAX_HOOK_INPUT_NESTING_DEPTH = 28_000

/**
 * 判定值嵌套深度是否超过 MAX_HOOK_INPUT_NESTING_DEPTH。
 * O(n) 单遍；浅输入（正常面）开销可忽略。
 */
export function exceedsMaxNestingDepth(value: unknown): boolean {
  const stack: Array<[unknown, number]> = [[value, 0]]
  const visited = new WeakSet<object>()
  while (stack.length > 0) {
    const [v, depth] = stack.pop()!
    if (depth > MAX_HOOK_INPUT_NESTING_DEPTH) return true
    if (v === null || typeof v !== 'object') continue
    if (visited.has(v)) continue
    visited.add(v)
    // K3-A7（0.1.82）：枚举 getter 安全——Object.values 会触发 enumerable
    // getter，抛错时不可判定深度 ≠ 拒收（该键由序列化面物化回退只拒该键）。
    let children: unknown[]
    try {
      children = Array.isArray(v)
        ? v
        : Object.values(v as Record<string, unknown>)
    } catch {
      continue
    }
    for (const child of children) {
      stack.push([child, depth + 1])
    }
  }
  return false
}
