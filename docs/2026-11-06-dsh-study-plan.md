# W-opt 国产轨 · DSH 模块研读计划（f4 零码分析步）— 2026-11-06

- 触发：0.1.89 收口后按用户 2026-10-23/11-05 持续授权自动推进（P0 对齐轨 0.1.80–0.1.89 全闭环 → P1 W-opt 开波）
- 事实源：本机 `~/projects/deepseek-harness`（**HEAD 09d38feb8a = dsh-v0.1.0-rc.8 + 1 examples 提交 @ 2026-08-25**，55 包；工作树仅 1 处 notes 修改非本轨）；路线图 `docs/roadmap-domestic-and-residuals.md` §1（2026-09-29）
- 角色：f4 = 研读/映射/工单（零码）；落码 = Main；gate = e2e。不委派 subagent，全主线程。

## 0. 目标与产出

对 DSH v0.1.0-rc.8 重做研读（原「已核验」口径 = 2026-09-29，须按 rc.8 现状刷新），逐模块产出：
① DSH 侧模块真实形态（包路径 + 关键接口 + 行为要点，引源码行号）；② AtlasCode 同域现状对照；③ 国产替代方案（供应链可审计 + 行为不弱于旧仓 + 优于「刚好够」的 3-dep 转写）；④ 判别单测要求（禁空洞替换）。
终产物 = 首个替代波工单（走标准矩阵：Atlas-reveiw 审计 → 双信号 → 五段闭环）。

## 1. 8 模块映射（roadmap §1 既有口径，按 rc.8 包清单刷新）

| # | AtlasCode 域 | DSH 包（已核验路径） | 研读要点 |
|---|---|---|---|
| 1 | 上下文压缩 compaction | `packages/compaction`（+`spill`?） | 压缩触发/分层策略/恢复语义 vs AtlasCode compact.ts |
| 2 | 沙箱 sandbox | `packages/sandbox` + `sandbox-policy` + `e2b` | 策略模型/落地机制 vs AtlasCode 沙箱面 |
| 3 | 子代理编排 | `packages/subagent`（~4659L） | 编排/生命周期/转发 vs AtlasCode AgentTool/runAgent |
| 4 | 定时任务 | `packages/schedule`（~2003L） | 调度模型/持久化 vs AtlasCode jobs/cron 面 |
| 5 | 会话检索 | `packages/session-query` | 检索接口 vs AtlasCode session 面 |
| 6 | 插件市场 | `packages/boot` + `core`（「一切皆插件」Cordis） | 市场模型/装载 vs AtlasCode plugins/skill |
| 7 | 代码执行 | `packages/code-runtime` | 执行模型/隔离 vs AtlasCode 工具执行 |
| 8 | 权限守卫 | `packages/guard` + `core/agent` | 策略判定点 vs AtlasCode 权限 hooks |
| — | 依赖面收敛（附加项） | pnpm workspace + boundaries | 供应链审计面 |

## 2. 研读顺序与节奏

**序 = 按替代价值/风险比**：① compaction（0.1.85/086 登记残面同域，收益直接）→ ② subagent（编排是当前单线依赖面最大件）→ ③ sandbox → ④ code-runtime → ⑤ guard → ⑥ schedule → ⑦ session-query → ⑧ plugin market（boot+core 体量最大，押后）。
- 每模块一轮 = 读 DSH 源码（关键文件逐个，引行号）→ 对照 AtlasCode 现状 → 模块映射笔记落 `docs/2026-11-06-dsh-study-notes.md`（逐模块追加）。
- 全 8 模块笔记齐 → 汇总取舍（哪些先入首波）→ 首波工单（波前审视新规照走）。

## 3. 边界

- 本步纯研读零码；不动 AtlasCode 产品码、不动 DSH checkout。
- PI Agent 参考源本机无 checkout：仍缺，须核验后补，不臆造（roadmap 口径维持）。
- 0.1.89 后遗留登记池（500-storm E-1b-full / Option 1 候补 / @ant×2 / K6 锚 / D4 族）不混入本轨。
- W-D 跨 session D1–D5 裁定材料另行准备，与 W-opt 并行不混。

## 4. 状态

- [x] DSH checkout 状态实核（rc.8 + 1，55 包）
- [x] 本计划落盘
- [ ] 模块① compaction 研读
- [ ] 模块② subagent 研读
- [ ] 模块③–⑧ 研读
- [ ] 汇总取舍 → 首波工单
