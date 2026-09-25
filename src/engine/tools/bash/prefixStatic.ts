/**
 * engine/tools/bash — prefixStatic（§8.53 S-T1，范围内发现 + 裁断登记）
 *
 * 旧仓 `src/utils/shell/prefix.ts` 332L（Haiku/fast LLM 前缀提取器）**不随迁**：
 *   - 生产消费点 = 零：bashPermissions L1791 `fn === real` 判别证明真 fn 生产态
 *     从不被 await（生产路径 = suggestionForExactCommand 本地静态计算；LLM 路径
 *     仅测试注入接缝触发——「Skip the Haiku call — the UI computes the prefix
 *     locally」，注入时调 fake 非真 fn）。
 *   - 跨域边太重：modelProvider（core 域，组合根注入先例）+ growthbook（E-7
 *     已裁先例）+ chalk + lru-cache 四边，为一条生产死路径拖入不成立。
 * 前向接缝：LLM 路径随 auto-mode 波（C 桶 ②）/ provider 接线（D 波壳）重引入；
 * 届时本文件替换为真实现（export 面不变，调用点零改动，H6 预声明接缝）。
 *
 * 静态语义 = 旧 LLM 提取器的非 LLM 面逐字：preCheck 短路（如 isHelpCommand →
 * 命令自身即前缀）；未命中 preCheck → commandPrefix: null（消费方回落
 * exact-command 建议 = 旧生产态行为）。memoize 面：旧 memoizeWithLRU（LRU 200 +
 * 拒绝逐出守卫）→ 静态路径永不拒绝，Map 值缓存等价 + 同形 `.cache` 面
 * （clear/get/delete/size/has，命令 L535-537 clearCommandPrefixCaches 消费）。
 */

export type CommandPrefixResult = {
  /** The detected command prefix, or null if no prefix could be determined */
  commandPrefix: string | null
}

export type CommandSubcommandPrefixResult = CommandPrefixResult & {
  subcommandPrefixes: Map<string, CommandPrefixResult>
}

export type PrefixExtractorConfig = {
  /** Tool name for logging and warning messages（静态实现不消费，delta 登记） */
  toolName: string
  /** The policy spec containing examples for Haiku（静态实现不消费，delta 登记） */
  policySpec: string
  /** Analytics event name for logging（静态实现不消费，delta 登记） */
  eventName: string
  /**
   * Query source identifier（旧型 = constants/querySource QuerySource 联合；
   * 静态实现不消费 → 放宽 string，delta 登记）
   */
  querySource: string
  /** Optional pre-check function that can short-circuit the (LLM) call */
  preCheck?: (command: string) => CommandPrefixResult | null
}

/** 与旧 memoizeWithLRU 返回面同形的缓存面（命令只消费 clear）。 */
type PrefixCache<T> = {
  clear: () => void
  get: (key: string) => T | undefined
  delete: (key: string) => boolean
  size: () => number
  has: (key: string) => boolean
}

export type CommandPrefixExtractor = {
  (
    command: string,
    abortSignal: AbortSignal,
    isNonInteractiveSession: boolean,
  ): Promise<CommandPrefixResult | null>
  cache: PrefixCache<CommandPrefixResult>
}

export type SubcommandPrefixExtractor = {
  (
    command: string,
    abortSignal: AbortSignal,
    isNonInteractiveSession: boolean,
  ): Promise<CommandSubcommandPrefixResult | null>
  cache: PrefixCache<CommandSubcommandPrefixResult>
}

export function createCommandPrefixExtractor(
  config: PrefixExtractorConfig,
): CommandPrefixExtractor {
  const { preCheck } = config
  const cache = new Map<string, CommandPrefixResult>()

  const fn: CommandPrefixExtractor = (
    command,
    _abortSignal,
    _isNonInteractiveSession,
  ) => {
    if (!cache.has(command)) {
      // 静态路径：preCheck 短路；无 LLM（裁断登记）→ null = 「无前缀」
      cache.set(command, preCheck?.(command) ?? { commandPrefix: null })
    }
    return Promise.resolve(cache.get(command))
  }
  fn.cache = {
    clear: () => cache.clear(),
    get: key => cache.get(key),
    delete: key => cache.delete(key),
    size: () => cache.size,
    has: key => cache.has(key),
  }
  return fn
}

/** 逐字旧仓 getCommandSubcommandPrefixImpl（memoize 外壳改静态值缓存）。 */
async function getCommandSubcommandPrefixImpl(
  command: string,
  abortSignal: AbortSignal,
  isNonInteractiveSession: boolean,
  getPrefix: CommandPrefixExtractor,
  splitCommandFn: (command: string) => string[] | Promise<string[]>,
): Promise<CommandSubcommandPrefixResult | null> {
  const subcommands = await splitCommandFn(command)

  const [fullCommandPrefix, ...subcommandPrefixesResults] = await Promise.all([
    getPrefix(command, abortSignal, isNonInteractiveSession),
    ...subcommands.map(async subcommand => ({
      subcommand,
      prefix: await getPrefix(subcommand, abortSignal, isNonInteractiveSession),
    })),
  ])

  if (!fullCommandPrefix) {
    return null
  }

  const subcommandPrefixes = subcommandPrefixesResults.reduce(
    (acc, { subcommand, prefix }) => {
      if (prefix) {
        acc.set(subcommand, prefix)
      }
      return acc
    },
    new Map<string, CommandPrefixResult>(),
  )

  return {
    ...fullCommandPrefix,
    subcommandPrefixes,
  }
}

export function createSubcommandPrefixExtractor(
  getPrefix: CommandPrefixExtractor,
  splitCommand: (command: string) => string[] | Promise<string[]>,
): SubcommandPrefixExtractor {
  // 旧 memoizeWithLRU 缓存 PROMISE（并发同 key 去重 + null 结果不逐出）→
  // 静态路径：inflight promise 缓存 + 终值面（.cache 表面）双 Map
  const inflight = new Map<
    string,
    Promise<CommandSubcommandPrefixResult | null>
  >()
  const cache = new Map<string, CommandSubcommandPrefixResult | null>()

  const fn: SubcommandPrefixExtractor = (command, abortSignal, nonInteractive) => {
    const existing = inflight.get(command)
    if (existing) return existing
    const promise = getCommandSubcommandPrefixImpl(
      command,
      abortSignal,
      nonInteractive,
      getPrefix,
      splitCommand,
    ).then(result => {
      inflight.delete(command)
      cache.set(command, result) // null 亦缓存（旧 LRU 成功不逐出语义逐字）
      return result
    })
    inflight.set(command, promise)
    void promise.catch(() => undefined) // 静态路径不可拒绝（防御面）
    return promise
  }
  fn.cache = {
    clear: () => {
      inflight.clear()
      cache.clear()
    },
    get: key => cache.get(key),
    delete: key => cache.delete(key),
    size: () => cache.size,
    has: key => cache.has(key),
  }
  return fn
}
