# Changelog

本文件是 AtlasCode 的版本变更日志（repo 内真实落点；产品内 `releaseNotes.ts`
启动时抓取本文件缓存展示，见 `src/tui/utils/releaseNotes.ts`）。
版本纪律：`0.1.x` 内自主递进，跨 `0.2`/`1.0` 需产品裁定。

## v0.1.9

user-e2e 第 2 轮「最后 1 英里」修复（R1/R2/R4/R5 落，R3 记录根因 defer）：

- **R1（P0）静默终止**：空内容响应（网关 0/0 / 模型空输出）此前被 loop 当「正常
  终止」——无 assistant 落盘、无错误面，用户只见 spinner 停（斗兽棋第 3 轮 90s
  无 assistant、0 落盘；core-3 同源）。修：`queryOneRound` 空内容判定（无非空 text
  块且无 tool_use 块）+ 1 次有界重试（signal 感知）；`AgentLoopResult.emptyTerminated`
  标识 → REPL 末轮空终止出可见 warning 行。turn 异常原为 unhandled rejection
  （REPL try/finally 无 catch）→ 补 catch 出可见 error 行 + logError 留痕。判别单测
  7 例（engine-loop-empty-response）。
- **R2（P1）thinking 块活回合渲染**：transcript 有 THINK 但 pty 0 标记——
  `Message.tsx` case "thinking" 在 live 支 early-return null 使折叠行不可达。移除该
  early return → 活回合 thinking 块落折叠行（∴ Thinking ⌃O，可展开）。工具进度行
  既有机制（GroupedToolUseContent 动画 dot）已覆盖。
- **R4（P2）TUI flag 形启动面**：`atlas --dangerously-skip-permissions` 等 leading-flag
  形此前落 cli 公共域交互支前向缝（launchRepl 未落盘）exit 1 死胡同（`code` 子命令
  形可用、flag 形死）。修：非 headless 的 leading-flag 形前向 TUI main()（旧仓全
  commander 面超集）；headless（-p/--print）留 cli 公共域不动。
- **R5（P2）探测轮纪律**：弱模型首回合常先 ls / node 探测 2 轮再写盘。# Doing tasks
  段补「工作区为空 / 目标文件不存在时直接创建，不先花回合探测环境」。
- **R3（P2）jsonl 双写 — 记录根因，defer 不修**：主 session 有**两套发散 transcript
  写者**（engine loop `projectInstance()` + REPL `useLogMessages` tui 本地
  `new Project()`），各带独立去重 Set 缓存，双 append 同一 session 文件。根因 +
  修复方向（收敛单写者 / 删一写者 + 判别单测）+ 风险见
  `docs/r3-jsonl-double-write-root-cause.md`。归专项波（持久化关键路径，非发布列车
  内投机改造）。round-3「session 单行」信号在 R3 修前不达标（如实记录）。

发布：GitHub master + tag v0.1.9；npm `@atlasharness/atlascode@0.1.9`。四件套绿
tsc 0 / lint 0e·0w / build 17.53MB / 全量 3254/0（基线 3247 + 7 新增）。

## v0.1.8

- 修复 P0-1 TUI 车道空回合（用户主诉，斗兽棋确定性复现）：TUI 车道
  （bin TUI 支 + launcher 薄壳）挂 ui/main 前漏 wire 壳组合根
  （8 域装配含 hooks bootstrap）→ 首轮工具执行 pre-hook 抛「hooks
  bootstrap 未注入」reject 整个 agent loop → LLM 已成功返 tool_use 但
  0 assistant 落盘 = 空回合。两 TUI 入口挂 ui/main 前 wire 组合根根治；
  headless 支不受影响（0.1.7 已 wire）。

## v0.1.1

- 修复 `--version` 显示：版本占位 `0.0.0` 闭核，改运行时包根自识别
  （`resolveCliVersion` 从 process.argv[1] 上行走 package.json 单一事实源，
  dev 态命中 repo 包根 / npm 全局安装命中 node_modules 包根）。
- 首发 0.1.0 发布面补丁（npm 通道 `@atlasharness/atlascode` 真机自动更新闭环
  0.1.0 → 0.1.1 验真通过）。

## v0.1.0

- 首发版（G-α）：
  - CLI：`atlascode`（bin = `atlas`）headless 面（`-p/--print`、stream-json、
    mcp / auto-mode / update 子命令族）。
  - 自动更新双通道：git 安装根 pull+bun+build / npm 全局安装
    `install -g @atlasharness/atlascode@latest`（`atlas update`，
    `--check` 仅查版）。
  - 模型车道 = OpenAI 协议静态键（`OPENAI_AUTH_TOKEN`/`OPENAI_API_KEY` +
    settings.json `providers`/`modelRoles` 角色池）。
  - WebSearch 客户端化：bing SERP 无 key 默认 + tavily 可选
    （`WEB_SEARCH_PROVIDER`/`WEB_SEARCH_ENDPOINT`/`TAVILY_API_KEY`，
    无 ATLAS_ 前缀；settings.json `search.tavilyApiKey`）。
  - 统一 node 运行器（bun 仅构建，bin shebang = node）。
