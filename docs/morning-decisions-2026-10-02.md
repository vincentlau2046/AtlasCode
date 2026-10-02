# 晨起决策清单（2026-10-02，0.1.7 发布列车随附）

> 夜间自动实施产物。已闭环项 = 0.1.7 已含；待决策项 = 需你裁定或需专项波。
> 证据锚：user-e2e/reports/r-20261001-1606/verdict-report.md（§7 修正后清单）
> + r-20261001-2230（T9 conv tier fabrication 佐证）。

## A. 待决策项（按建议优先级）

1. **P0-2 渲染滞后 45-100s（1606 N5）** — 64 slash case STUCK 的真因面：
   命令/回合后屏幕 45-100s 无输出、输入排队，滞后结束批量冲刷（session 未死，
   探针最终回显）。§7 改归因 = 渲染滞后性能问题（非 turn-busy 旗标），嫌疑
   engine loop 消息处理 / ink reconcile。**未修**（需 live 性能剖析 +
   真机计时，非过夜可裁）。建议：开专项性能波（用户主诉「界面无响应」直接面）。
2. **P0-1 TUI 空回合（1606 N1 / T9）— ✅ 已修（0.1.8）** — 原假设（弱模型把
   tool call 发成 TEXT 需 loop 级救援）**订正为接线缺口**：systematic-debugging
   斗兽棋确定性复现（dev 车道 PTY + ATLAS_P0_TRACE 取证）钉死真根因 = **TUI 车道
   挂 ui/main 前未 wire 壳组合根**（`cli.ts` TUI 支 + `launcher.ts` 薄壳只 mount
   `ui/main` 不调 `getCoreDependencies`）→ 8 域装配（含 ⑤ hooks bootstrap
   `setHooksBootstrapEnv`）未设 → 首轮工具执行 `preToolUse` 抛「hooks bootstrap
   未注入」→ 经 `executeToolUse`（pre-hook 无 try/catch）传播 reject 整个 agent
   loop（`round_end` 永不发射 / `transcript.record` 永不执行）→ LLM 已成功返
   tool_use 但 0 assistant 落盘 = 空回合。headless 支 0.1.7 已 wire（cli/hooksWiring.ts）
   故 headless 正常、仅 TUI 车道炸。修 = `cli.ts` TUI 支 + `launcher.ts` 挂 TUI 前
   `getCoreDependencies()`（懒单例幂等；tui 域 init 的 setEndpointConfigSource 晚于
   本调用=后写者胜，#202/#203 模型池行为不变）。验真：斗兽棋 PTY 空回合（0 assistant）
   → 修复后多轮 agent loop（8 assistant + 8 thinking + tool_result 落盘 + TUI 渲染
   Bash/AskUserQuestion）。原「文本工具调用救援」loop 波不开了（非本根因）。
3. **logging port 定案（charter C-4）** — 本轮 0.1.7 在 cli 域落了真 writer
   （cli/debugSink，headless 面 --debug 三 flag 真消费；实测 186 行日志）；
   engine/shared 域维持 no-op 占位。TUI 域 debug.ts 为完整实现。**决策**：
   是否开 logging port 波统一三面（shared no-op → port 注入，TUI/cli 实现体）。
4. **N2 bypass 语义（1606 §3 修正）— 已实测重界定**：
   2026-10-02 dev 车道 IFF 活测 3 组：
   (a) `--tools Read` + bypass：Write 被拒、模型转 Bash 亦被拒、文件未落盘
       → **--tools 限制性白名单在 bypass 下仍生效**（N2「bypass 忽略白名单」
       的原假设不成立，无安全缺口）。
   (b) 对照：纯 bypass（无 --tools）→ Write 亦被拒、文件未落盘
       （模型自述「需要权限」）。**新发现（归 N10，待专项）**：headless 车道
       `--dangerously-skip-permissions` 疑似未真达 bypassPermissions 模式
       （print.ts `shouldAvoidPermissionPrompts: !hasPromptRoute`=true 下
       ask→auto-deny 支 / 或 loopDeps 构建器 mode 未落）——根因未定界，
       非本小修波范围。**决策**：是否开 headless bypass 车道专项（安全姿态
       修正，量级小但涉权限门，建议单独波 + 判别单测）。
   原「bypass 忽略权限规则」项据此核销（白名单生效 = 无需加固）。
5. **CachedMCModulePort 未注（M5 S8 裁定，H6 前向接缝）** — 默认 stub 全关
   = 旧仓 any-stub 逐字等价。**决策**：真 cached-MC 何时落地（注 setCachedMCModulePort）。
6. **注入防线 e2e 常规化** — 0.1.7 落 headless 注入防线块 + TUI 注入行
   flag→refuse 升级；建议把 sec-prompt-inject-file/user 两 case 纳入
   e2e 常规回归（e2e 会话域），防止回退。

## B. 已闭环项（0.1.7 已含，无需动作）

| 项 | 1606 §7 编号 | 0.1.7 落点 |
|---|---|---|
| headless 注入防线（原「完全无防线」） | 项 3 | `cli/headlessPrompt.ts` HEADLESS_INJECTION_GUARD 块 |
| append-system-prompt 替换→合并（N11） | 项 4 | `resolveHeadlessSystemPrompt`（append-only = base+append；--system-prompt 仍整替） |
| TUI 工具调用纪律声明（P0-1 产品侧缓解） | 项 1 | `tui/constants/prompts.ts` getSimpleSystemSection（headless 同措辞） |
| TUI 注入行 flag-only → refuse+flag | 项 3 | `tui/constants/prompts.ts` 注入行升级 |
| --debug/--debug-to-stderr/--debug-file 真消费（N9-debug） | 项 6 | `cli/debugSink.ts`（headless 真 sink，charter C-4 不动）+ runHeadless 接线 |
| settings 非原子写（P2 项 5） | 项 5 | **现码已核销**（settings.ts 走 writeFileSyncAndFlush_DEPRECATED = 原子 tmp+rename+fsync；报告锚点陈旧，零改动） |
| **P0 回归：headless「hooks bootstrap 未注入」** | 0.1.7 实施期新发现 | `cli/hooksWiring.ts`（hooks 三窗口 cli 域侧接线，壳 compose ⑤ 步等价）+ runHeadless 入口 + cli allow 面扩 executor |

**P0 hooks 回归定性**：根因 = hooks 域三窗口（bootstrap-env/shell-port/
config-provider）此前仅 TUI 壳组合根（atlascode/compose.ts ⑤ 步）注入，
headless 车道（cli 域）不经壳组合根 → 用户 HOME 存在 hooks 配置时 runHooks
fail-fast（error_during_execution num_turns=0）。潜伏期 = hooks fail-fast
引入（C-Deep T6 6c32910）起；e2e 沙箱 HOME（空 hooks 配置）走短路支不触达
→ 历轮 e2e 假 PASS，用户面真炸。0.1.7 修后实测：`-p` 真 LLM 回合
result=OK / subtype=success / num_turns=1（IFF Qwen38-27B-TXT 网关）。

## C. 0.1.7 发布状态

- GitHub：master + tag v0.1.7 推送（见发布列车记录）
- npm：`@atlasharness/atlascode@0.1.7`（--registry npmjs.org 直发）
- 建议验证序列（生产 lane）：`atlas update` → 0.1.7 → 重跑 T9 conv tier
  （R4 磁盘 ground truth 观测，P0-1 缓解效果）+ cli-debug case 重跑
  （--debug 面真输出）+ sec-inject 双 case 重跑（防线效果定性）。

## D. 已知 delta（仅记录，不待决策）

- engine addNotification duck 裁 `color` 字段（M5 S8 裁定）：error 通知
  丢红色色标（罕见错误路径 delta，引擎 React-free 红线下的结构子集取舍）。
