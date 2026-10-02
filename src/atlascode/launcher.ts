#!/usr/bin/env bun
/* eslint-disable custom-rules/no-process-exit -- W4 全量 lint 复原（§8.74.21）：CLI/壳合法进程出口点（exit 分发层/关闭工具/对话框退出动作），登记延后（exit 助手收敛 W-opt 波再议） */
/**
 * TUI 启动入口（real entry; ui/main 只 re-export main()）
 *
 * §8.72 TUI 壳波 Slice D（task #152/#165）：旧仓 src/launcher.ts 5 行 C-7
 * 同形（交接面 ./main.js → ./ui/main.js，品牌面 AtlasHarness → AtlasCode）。
 * 动 import = 旧仓时序保真（闭包图懒加载，交接后只触 tui/main 全闭包）。
 * S-C1 裁定核销：TUI 默认启动支归本薄壳（`bun run src/atlascode/launcher.ts`），
 * 不经 bin（bin 走 cli 域 parse，-p headless 经新 runHeadless）。
 */
process.stderr.write("[AtlasCode] starting TUI...\n");
// P0-1 修（TUI 车道空回合）：挂 ui/main 前先 wire 壳组合根（compose
// getCoreDependencies 8 域装配含 ⑤ hooks bootstrap）。旧薄壳只挂 ui/main 不接线
// → hooks 域 bootstrap 未设 → 首轮工具执行 pre-hook 抛「hooks bootstrap 未注入」
// reject 整个 agent loop（round_end 永不发射 / record 永不执行）→ 空回合。
// 与 bin cli.ts TUI 支同款：先 import+wire compose 再 import+run ui/main（懒单例
// 幂等；tui 域 init 的 setEndpointConfigSource 晚于本接线 = 后写者胜，模型池不变）。
import("./compose.js").then(async (compose) => {
  compose.getCoreDependencies();
  const m = await import("./ui/main.js");
  return m.main();
}).catch(e => {
  process.stderr.write("[AtlasCode] FATAL: " + (e?.message || e) + "\n");
  process.exit(1);
});
