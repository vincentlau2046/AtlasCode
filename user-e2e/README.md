# user-e2e：AtlasCode 用户视角全量测试（独立维护 · 指定才跑 · 非必测）

**定位**：用户视角 e2e 测试套件（slash 命令全遍历 + 短/中/长程任务），
时长长（全量 ~4-6h），**不属于开发必测**——不进 `bun test`、不进 CI、
不注册 `package.json` scripts，只有显式指定才跑。全部输入输出收敛在本目录内，
不污染其他目录（真实 `~/.atlas` 零写）。

设计文档：`docs/superpowers/specs/2026-10-01-user-e2e-harness-design.md`。

## 触发方式

```bash
# 全量（T0 门控 → core → slash → short → medium → long+soak）
bun run user-e2e/run.ts --tier all

# 单 tier / 组合
bun run user-e2e/run.ts --tier core          # ~15min 快速回归（报障复现面）
bun run user-e2e/run.ts --tier slash,medium

# 断点续跑（per-case checkpoint）
bun run user-e2e/run.ts --resume <runId>

# 完整复制 ~/.atlas（含插件面，默认裁剪以保证确定性）
bun run user-e2e/run.ts --full-home
```

## tier 一览

| tier | 内容 | 判据 |
|------|------|------|
| T0 gate | 网关探针 + settings 装载 + 真 LLM 单轮 | 三项；LLM 未放行 → 后续 LLM 面 SKIP(GATE) |
| T1 core | 4 轮 marker 对话 / headless --resume 多轮 / 工具回合 / **流式中排队输入** | marker ≥2（回显+渲染）+ 磁盘 ground truth |
| T2 slash | 注册表全量命令遍历（单一真源，live dump；danger 面独立 session） | 分类断言（local 快面 / LLM 回合完成 / auth 优雅降级） |
| T3 short | 短任务 ×4（PTY+headless 双跑） | marker + 磁盘 |
| T4 medium | fixture 迷你 git 仓修 bug / 加功能 ×2 | `node test/run.js` exit 0（只信磁盘不信自述） |
| T5 long | 多步长任务（工具预算 25）+ soak 连续 10 轮 | 磁盘 + git log + 逐轮时延曲线 |

## 输出

- `reports/<runId>/report.md` — 用户侧完整测试报告
- `reports/<runId>/diagnosis.md` — 问题定位报告（L1 TUI 队列 / L2 engine loop /
  L3 modelprovider / L4 IFF 网关 分层 + 嫌疑代码区 + P0/P1/P2 修复清单 +
  IFF 监控 0/0 行交叉对照表）
- `reports/<runId>/summary.json` — 机器可读总表（下轮 diff 核销）
- `artifacts/<runId>/` — 原始留痕（PTY 转录 / checkpoint.jsonl / 计时）

## 隔离保证

- 工作区：`workspaces/<runId>/<case>/`（每 case 独立，跑完即弃）
- HOME：`home/<runId>/`（沙箱；settings 复制件，默认裁剪插件/MCP 面）
- 真实 `~/.atlas` 只读（仅复制 settings.json），零写
