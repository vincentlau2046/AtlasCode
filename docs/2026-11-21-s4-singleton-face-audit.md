# S4 单例面穷尽清单（B0 验收件② · 合同 §7）

> 执行出口实施波 S4（呈批书 @196ee806 + f4 批复六条件 @a62925c0 + f4 S4 五件
> 清单）。扫描口径：全 src + tests + e2e 面 grep（2026-11-21 @S4 落码工作树）；
> 机器判扫描腿常驻 tests/unit/web-execution-v0.test.ts 格 C（条件① 扩腿三件）。

## 组合根单例面（合同 §7「恰一次注入」消费点）

| 车道 | 单例门 | 位置 | arming | execution 装配 |
|---|---|---|---|---|
| headless | `getCoreDependencies()` | src/atlascode/compose.ts（lazy accessor，`_coreDeps` 缓存） | `armKernelInjectionGuard()`（S1） | `createExecutionComposition()`（S4，cache miss 路径内） |
| TUI | `getCoreDependencies()` | src/tui/factory.ts（`_coreDeps` 缓存） | 同形（S1） | 同形（S4） |
| 测试直装配 | `createCoreDependencies()` | compose.ts / factory.ts 本体 | 不 armed（测试车道） | 同样装配 execution 成员（开关 off 无副作用） |

- 单例门 = 产品进程唯一组合入口；execution 装配在门内 cache-miss 路径 =
  进程内恰一次（合同 §7 实例隔离）。重复触达走缓存，不重建 kernel/outlet。
- `createExecutionComposition` src 面唯一消费点 = 双车道组合根两文件
  （`createExecutionKernel` 扫描腿：本体 + executionComposition.ts 外零）。

## 执行出口 import 面（条件① 扩腿，符号级机器判）

| 符号/模块 | src 面允许集 | 扫描腿 |
|---|---|---|
| `createExecutionOutlet` / `ExecutionOutletOptions` | entry.ts、kernel/execution/executionOutlet.ts、kernel/execution/executionComposition.ts | web-execution-v0 格 C |
| `createExecutionKernel` | executionKernel.ts、kernel/execution/executionComposition.ts | 同上（扩腿） |
| `webExecutionV0` / `WebExecutionCommandSchema` | entry.ts、executionOutlet.ts、executionKernel.ts、webExecutionV0.ts | 同上（扩腿） |
| `kernel/execution/executionKernel` 直接 import（绕 composition） | executionKernel.ts 本体 + kernel/execution/executionComposition.ts | 上行第三腿同构 |

> 层位注记（DEP-3，两步试位终态）：组合根助手落码首形置于
> `src/kernel/execution/composition.ts` 被 boundaries lint 拦截（kernel 域
> import 壳域 outlet）→ 移壳侧 `src/atlascode/web/executionComposition.ts`
> 再撞 tui 车道（tui allow 面无 atlascode 边，且该边为壳反向依赖不宜开）
> → 终态三件套（kernel + outlet + composition）齐落 `src/kernel/execution/`：
> tui/atlascode 双壳 allow 面均含 kernel，零新 DEP 边，装配语义不变
> （S2 出口终锚路径由 atlascode/web/executionOutlet.ts 就地归位
> kernel/execution/executionOutlet.ts，entry.ts 具名导出面不变）。

## 能力开关与身份（f4 五件清单④）

- 开关读门：`ATLAS_WEB_EXECUTION_ENABLED === '1'` 显式 opt-in；缺省/他值 =
  off（fail-closed）。settings 键面未开（B0 只锁默认拒绝，§5「设置不得静默
  变更批准策略」）——键面候选 f4 裁定后另切片。
- actorId：`'atlas-local-ambient'`（服务端 ambient 身份占位；远端连接身份
  随 bridge 车道后续切片替换注入）。§5「客户端自报即拒」由 decide payload
  strictObject schema 层强制（判别腿在 web-execution-v0 格 A）。
- runTurn 真体：**未接线**（落地细化附注，f4 S4 预读同意）——显式抛错
  fail-closed，绝不静默假执行；开关 off 时不可达。

## 残余登记

1. ~~wire follow.resume 有效路径响应形~~ **已销（f4 S4 修正裁定落码）**：
   命令响应 = 完整三态 `ExecutionReplay`（与 `followResume` 原语同形归一，
   不并存两形）；baseline 空语义（执行流基线为空，内容基线经只读 replay
   面重读）已明示于协议文件 d.ts/comment + 格 B 判别腿。
2. **runTurn 引擎真体**：session 回合执行 → runner 缝映射 = 后续切片
   （B 波前须落，产品能力开启前置条件）。
3. **bridge 车道**：远端连接身份（actorId 真源）随 bridge 实装切片——
   f4 裁定加 B1 门：`'atlas-local-ambient'` 占位可留 S4，B1 候选验收前
   须落真源（绑定打开链接/连接身份，§5 服务端产纪律），占位不进 B1
   验收腿。
4. **S4 修正锚（f4 裁定）pack 面**：`./web-session-runtime/execution`
   subpath（自 entry.ts 构建、zod 内联自包含零 npm runtime dependencies）
   + pack 契约 execution bundle 三腿（存在/自包含/导出
   createExecutionOutlet）+ prepublishOnly 扩链；atlaswebCarrier 元数据 +
   SRI 增记 execution bundle 输入摘要归段 L 发布序列（镜像纪律不受影响）。
