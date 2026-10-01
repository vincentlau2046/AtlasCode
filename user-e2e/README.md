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
| T2 slash | 注册表全量命令遍历（单一真源，live dump；danger 面独立 session） | **picker 导航三段式**（渲染→↓→Esc恢复）/ local 快面 / LLM 回合完成 / auth 优雅降级 |
| T3 short | 短任务 ×10（PTY+headless 双跑）：marker/multiturn/filewrite/tool-read + **工具触发族 5**（FileEdit/Bash/Grep/Glob/Agent）+ **worktree 隔离** | marker + 磁盘 + **toolExpect**（stream-json tool_use 断言） |
| T4 medium | fixture 迷你 git 仓修 bug / 加功能 ×2 | `node test/run.js` exit 0（只信磁盘不信自述） |
| T5 long | 多步长任务（工具预算 25）+ soak 连续 10 轮 | 磁盘 + git log + 逐轮时延曲线 |
| T6 int | **交互 UI** ×10（独立 session）：权限 dialog Allow/Deny / vim 编辑 / bash 模式 / plan 模式 / Ctrl-C 中断 / Ctrl-R 历史搜索 / 会话导航 / TUI resume / **配置往返存活** | 交互功能断言（picker 渲染+导航+恢复 / dialog+选择 / 模式切换往返 / 配置持久化） |
| T7 sec | **安全/质量** ×8：沙箱越权拦截 / 文件注入抵御 / 用户注入抵御 / 工具白名单(--allowed-tools) / 工具黑名单(--disallowed) / 系统prompt跨compact / append-prompt跨resume / --disable-slash-commands | 安全不变量（被拦/不盲从/限制生效/完整性存活） |
| T8 cli | **CLI flag 冒烟** ×7：--continue / --bare / --debug / --model / --output-style / **--output-format text** / **--output-format json** | flag 接线不崩 + 出回合 + 格式契约 |

### verdict 语义

| verdict | 含义 | 图标 |
|---------|------|------|
| PASS | 断言通过 | ✅ |
| FAIL | 断言失败（磁盘/model/toolExpect 证伪） | ❌ |
| TIMEOUT | 超时（模型慢/回合长） | ⏰ |
| STUCK | session 失联/输入面死（渲染冻结签名） | 💥 |
| **NAVFAIL** | **picker/dialog 渲染但交互导航坏**（选不中/Esc关不掉/选择后崩）— L1 细分 | 🧭 |
| SKIP | 门控未放行（非产品故障） | ⏭️ |

### 方案 A-G 变更日志（2026-10-01，已实施 + build-check 通过）

- **A（sweep picker 导航）**：local-jsx 交互命令（esc=true 族，21 条）从「探输入框活」升级为三段式
  （panelExpect 渲染断言 → ↓ 方向键导航 → Esc dismiss → 探针恢复）；失败记 NAVFAIL（与 STUCK 区分）。
  panelExpect 优先取 slash-meta `panelExpect` 字段，否则查 PANEL_EXPECT 表。
- **B（T6 interactive tier）**：新增 9 case 覆盖权限/模式/快捷键/搜索/会话（方案 B 清单）。
- **C（工具触发族）**：short 加 5 case（FileEdit/Bash/Grep/Glob/Agent），headless 断 toolExpect。
- **G（verdict 校准）**：Verdict 加 NAVFAIL；classify.ts NAVFAIL→L1（CustomSelect/键绑定嫌疑）；
  report.md/diagnosis.md/summary.json 全链路支持。
- **D（resilience）**：用户审核留下一轮，只做稳定子集（空池/未知命令/未知 skill/凭据缺）。
- **H（安全/质量 T7）**：8 case — 沙箱越权 / 文件注入 / 用户注入 / 工具白黑名单 / 系统 prompt 跨 compact·resume / --disable-slash。
- **I（CLI flag T8）**：7 case — --continue/--bare/--debug/--model/--output-style/--output-format text/json。
- **B1/B6/B8（追加盲区）**：int-config-roundtrip（配置往返）+ short-worktree（worktree 隔离）+ cli-output-text/json（格式契约）。
- 评估文档：`reports/coverage-eval-20261001.md`（覆盖率矩阵 + 缺口分析 + 方案详情 + 盲区二次审视）。
- **验证状态**：`bun build` + `node --check` 通过（1846 模块，SYNTAX-OK，含 T7+T8+B1/B6/B8）。**待 main 优化完后重跑全量测试 + 定位**（用户分工：我只做用例方案优化）。

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
