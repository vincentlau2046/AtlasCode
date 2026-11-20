# S1 set-once 守卫调用点穷尽清单（B0 验收件 · 条件③）

> 执行出口实施波 S1（呈批书 @196ee806 + f4 批复六条件 @a62925c0）。
> 扫描口径：`grep -rn` 全 src + tests + e2e 面（2026-11-21 @S1 落码工作树）；
> 机器判扫描腿常驻 tests/unit/injection-setonce.test.ts（源级锁形）。

## 受守卫槽位（3）

| setter | 本体 | 产品调用点 | 测试/探针调用点 |
|---|---|---|---|
| `setKernelBootstrapState` | src/kernel/state/injection.ts | src/atlascode/compose.ts:235（headless 组合根）、src/tui/factory.ts（TUI 组合根） | tests/unit/kernel-state-seam.test.ts 等（直接注入，未 armed 车道） |
| `setKernelBootstrapNoopSeam` | 同上 | compose.ts:236、factory.ts 同点 | 同上 |
| `setSessionEnv` | src/engine/session/env.ts:82（Partial spread 合并） | src/atlascode/compose.ts:316（headless 组合根 ⑨） | engine-session 族测试（直接注入） |

## 结论（条件③确证）

**无非组合根的运行时 setSessionEnv 调用者**：src 面唯一产品调用点 =
compose.ts 组合根 ⑨（S-E2 注真值）；TUI 车道 factory.ts 不调 setSessionEnv
（TUI 产品运行 session 域走域缺省——现行为，非本波变更面）。源级扫描腿
（injection-setonce.test.ts）把「src 内 env.ts + compose.ts 外零调用者」
锁成机器判，未来运行时调用者进场即红。

## arming 点（呈批书预注册形落地）

- **compose.ts `getCoreDependencies()`**（headless 单例门）：装配前
  `armKernelInjectionGuard()`（幂等）。
- **tui/factory.ts `getCoreDependencies()`**（TUI 单例门）：同形。
- 落地细化登记：arming 落**单例门**（lazy accessor）而非
  `createCoreDependencies()` 本体——后者是测试直装配面
  （loop-deps-compose.test.ts 单文件 8 次调用），arming 入本体 = 测试车道
  全灭；单例门 = 产品进程唯一组合入口，语义与呈批书「双车道组合根
  装配期恰一次」一致。armed 态对守卫槽的语义：各槽至多一次注入（门自身
  装配即首注），二次 = 硬错；armed 态 reset 缝 = 硬错（条件④单向不可逆）。

## 测试车道适配（S1 落码伴随件，行为面 = 测试隔离非产品）

以下文件原经产品单例门装配 + teardown 复位；armed 单向不可逆下
「门装配 → reset 缝」= 硬错，故切**直装配**（createCoreDependencies，
未 armed 车道，装配产物同链）：

- tests/func/atlascode-tui-live-gelu.test.ts（2 处）
- tests/func/atlascode-skill-auto-trigger.test.ts（2 处）
- tests/func/atlascode-gelu-probe.test.ts（1 处）
- tests/func/atlascode-tui-pty-probe.test.ts（1 处）
- tests/func/compose-hooks-bootstrap.test.ts（1 处）
- tests/func/b6-func-smoke.test.ts（1 处）

- tests/unit/arch-reorg-closure-0177.test.ts 单实例腿重排形：直装配
  新实例断言（未 armed）先行，armed 单例门同一性断言收尾（gate 触达即
  进程内终态——armed 无退路，直装配先行避免消费位顶撞）。原
  「resetCoreDependencies → 新实例」腿在产品模式 = 二次注入硬错（恰为
  守卫目标行为），同一性不变式语义保留。

## 残余登记

1. **TUI 车道 sessionEnv 槽**：armed 后未消费（factory 不注入），首个
   运行时 setSessionEnv 调用者在 TUI 车道会成功一次——由源级扫描腿封死
   进场路径（src 面零调用者机器判），残余为理论缝。
2. **跨车道同进程**：armed 后另一车道单例门再装配 = 消费位顶撞硬错。
   现产品拓扑 headless/TUI 分进程（launcher.ts vs TUI 入口），无双车道
   同进程消费者；若未来出现（如 bridge 进程内双装配），守卫即红——属
   预期 fail-closed 面，非缺陷。
