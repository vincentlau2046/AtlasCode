# W-D-A 基座定谳步前置：2.1.319 agent-teams 契约插桩记录 — 2026-11-08 f4（零码）

- 方法：2.1.319 linux-x64 bun 二进制 strings/偏移提取（同 0.1.90 前例）；二进制 `~/.claude/jobs/9d1c80df/tmp/cc318/x319/package/claude`（340MB），strings 抽取 `tmp/cc319.strings`（594,853 行，job 清理失效需另存）
- 目的：W-D-A 工单基座定谳步（设计稿 §8①④）硬前置——「2.1.319 工具契约直证前 W-D-B 不锁工具面」；本记录同时供 W-D-A spawn 触发点工具面裁定

## 直证三事实

| # | 事实 | 证据 |
|---|---|---|
| F1 | **2.1.319 无 `AgentCreate` 工具**（字面 0 命中，全 bundle） | `AgentCreate` 二进制 0 命中；研究文档 §3.1「核心工具 = TeamCreate / AgentCreate / SendMessage / TaskCreate…」来自官方文档面，**实装未含 AgentCreate**——研究文档勘误（见下） |
| F2 | **成员拉起 = 既有 spawn 类工具扩参形**：存在输入含 `launchSwarm` / `teammateCount` 的工具（minified var `tc`）+ 输入含 `name` / `team_name` / `mode` 的工具（`ft`）；schema strip 表 `XJo=new Map([[tc,["launchSwarm","teammateCount"]],[ft,["name","team_name","mode"]]])` | 契合 Atlas-reveiw ⑥ 担忧方向：上游实装走「既有工具扩参」而非独立 AgentCreate——**基座定谳方向 = 既有 Agent/Task 工具扩参**（W-D-A 工单锁面必答，倾向已明） |
| F3 | **生命周期态机 + idle/wake + durable 投递语义在位**：agent 状态集 `agent-live / agent-stopped / agent-evicted / agent-stopped-by-user`；`[wakeRouter] dispatch for …`（idle→消息到达→唤醒分发循环）；`delivered_to_agent` / `Failed to deliver queued message to agent: …`（队列投递失败面） | W-D-A idle/wake 支（S-E2d 裁除后须重建）上游同构参照；`agent-stopped-by-user`/`evicted` 二态 = graceful shutdown vs 击杀区分（我们 R3 killWhen 先例对应） |

## 对既有文档的勘误/联动

1. **研究文档勘误**（`docs/2026-11-07-wd-team-orchestration-research.md` §3.1）：AgentCreate 非实装工具；核心面 = TeamCreate/TeamDelete/SendMessage/TaskCreate 族 + spawn 工具扩参（launchSwarm/teammateCount）。
2. **设计稿 §8④ 解锁条件部分满足**：2.1.319 契约插桩已做（本记录）；spawn 触发点工具面裁定输入就绪（F2 扩参形倾向 + F1 无 AgentCreate）——W-D-A 工单可锁面。
3. `tc`/`ft` minified 变量与具体工具名对应（Task/SendMessage?）= W-D-A 工单落码前可再一轮定向解引（偏移提取上下文），非阻塞。

## 处置

- F1–F3 作为 W-D-A 工单 §0 锚（下波 0.1.93 = 纲要 §10 序 3）；工单起草归本 session 下一步。
- strings 资产转存：`tmp/cc319.strings` 复制至 `~/projects/claude-code-sourcemap/` 同款工作区留档（防 job 清理）。
