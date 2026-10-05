# Changelog

本文件是 AtlasCode 的版本变更日志（repo 内真实落点；产品内 `releaseNotes.ts`
启动时抓取本文件缓存展示，见 `src/tui/utils/releaseNotes.ts`）。
版本纪律：`0.1.x` 内自主递进，跨 `0.2`/`1.0` 需产品裁定。

## v0.1.31

BR-1 identity 扩常量 + BR-2 theme 暖金（品牌序列 0.1.31；Main 实施 worktree-0.1.31，
`15c54bb` BR-1 + `3d21afe` BR-2）：

- **BR-1 identity 4 扩常量 + 品牌触面单一事实源**（`src/shared/identity.ts` +
  门面 re-export）：`PRODUCT_FAMILY='Atlas'` / `PRODUCT_BRAND='AtlasCode'` /
  `FEEDBACK_CHANNEL` / `ACCENT_HUE='compute'`；6 文件品牌触面 import-ization
  （errorMessaging 4 字面量 / commitAttribution / mcp client / REPL / main /
  dispatch）+ `shared-identity-useragent` 判别单测扩块 10/10。
- **BR-2 theme 6 套品牌色 橙→暖金**（18 行锚点替换，3 键 × 6 主题：
  brand / brandShimmer / briefLabelAssistant）：dark 系 `rgb(255,184,0)`
  （darkAnsi `ansi:yellowBright` + shimmer `ansi:yellow` / darkDalton 同色）+
  light 系 amber-700 `#B45309`（浅底 AA 5.02:1）；Anthropic 橙
  （`rgb(215,119,87)` / `rgb(255,153,51)` / `ansi:redBright`）品牌键零残留；
  clawd_body/clawd_background 键边界不越界（残 4 处随 0.1.32，tracker 记）；
  `theme-brand-warm-gold` 判别单测 4/4。
- **token/对比度记录**：`docs/assets/brand-system-spec.md`（12.11 AAA /
  5.02 AA / ansi 1.07 定因）。
- **e2e 前 gate 4/4 PASS**（e2e 单信号，artifact `THEMES-1791240450679-mksx`，
  报告 `r-20261006-0705-brand-br12.md`；探针④软面 INCONCLUSIVE 定因：ANSI
  16-color 降级下品牌 SGR 形不可唯一断言 → 断言回落单测② 4/4 + truecolor
  SGR 指纹 dark=`38;2;255;184;0`×1 / light=`38;2;180;83;9`×1 实捕）。
- 四件套：tsc 0 / lint 0e·0w / build ~17.58MB / 全量 3540/0·248
  （detached verify worktree，+5 测试/+1 文件 vs 0.1.30 基线）。

## v0.1.30

BR-4 用户可见面全量收口（品牌序列 0.1.30；Main 实施 worktree-0.1.30，
`ff817ba` 实施 + `f76f133` 测试逐字断言随切）：

- **用户可见字面量 AtlasHarness→AtlasCode 全量替换**（111 处 / 40 文件 +
  swarm 混合 2 处）：启动屏 LogoV2 四组件（编译产物字面替换，AH_ART 不碰）/
  错误消息 / 权限弹框 ×22 / 更新安装 / REPL·模型·MCP / 提交签名
  [AtlasCode] / insights / swarm / Shell / 桌面 / WebFetch 面。
- **保留（禁改 keep-set）**：ascend/** 迁移溯源 37 + mdm 注册表 4
  （`Policies\AtlasHarness` 冻结外部依赖）+ 历史注释族（engine/session·
  configDir·commitAttribution·releaseNotes·launcher·preapproved×2·
  mdm/settings·Feedback G-3·PermissionRule·cli/setup）+
  ascend-official.manifest.yaml（机器面 manifest，记 0.1.33 D-8）。
  品牌 gate：keep-set 外用户可见字面量 = 0（审计 49 残留全在 keep-set）。
- **e2e 前 gate R2 6/6 PASS**（e2e 单信号，post-implementation 基线
  f2d4156≡ff817ba 内容；R1 1/6 为 pre-implementation 基线 4b35bcf 假阴，
  已核销）。
- 四件套：tsc 0 / lint 0e·0w / build 17.58MB / 全量 3535/0·247
  （detached verify worktree，0.1.28/0.1.29 基线持平）。

## v0.1.29

BR-8 UA 品牌串标准化（品牌序列 0.1.29，用户 2026-10-06 裁定实施移交 Main；
brand 移交 patch 落地，`6e74ddc`）：

- **UA 五面品牌+版本+repo 三段定式（无字面 `+`，spec §10.3）**：
  `shared/identity` 单一事实源 —— `buildUserAgent` 去 `+`；新增
  `buildWebFetchUserAgent`（`Atlas-User (AtlasCode/<v>; repo)`），tui ④
  `getWebFetchUserAgent` 与 engine ⑤ `WEB_FETCH_USER_AGENT` 共用 builder
  （零分叉，delta ⑥ 版本段补齐）；`http.ts` ②③④ import 化（MACRO.VERSION
  硬编码串 → shared 出处）。
- **判别单测**：`shared-identity-useragent` 扩 `buildWebFetchUserAgent` +
  五面无字面 `+` 断言（5/5）。品牌 gate：`grep -rnF '+https://github' src/`=0
  且 `'+${REPOSITORY_URL}'`=0。
- **e2e 前 gate 5/5 PASS**（e2e 单信号，artifact `UA-1791235800327-786n`，
  报告 `r-20261006-1913`：UA 五变体 fault-proxy 捕获 / WebFetch 版本段 /
  grep gate / 硬句 6/6 / 控制面 PASS）。
- 四件套：tsc 0 / lint 0 / build 17.58MB / 全量 3535/0·247（0.1.28 基线 +1）。

## v0.1.28

P0 封口 patch（全 6 句 A4 e2e 绿 = P0 封口 Option B 达成；用户裁定 #6 原定
0.1.27.1 4 段 patch，npm 工具链拒 4 段版（semver 严格校验 null + npm 11 把
`0.1.27.1` clean 成 `0.1.2-7.1` prerelease 拒发）→ 用户 2026-10-06 改裁
**0.1.28**，native semver）：

- **D-279-r1 渲染层缺口修**（`6ff4e2b`，源 `dc0b37f`）：
  `FilePermissionDialog.tsx`（Write/Edit/Notebook/SedEdit 均收敛的共享面）此前漏
  P0a verdict 行（「为何在问你」一行），A4 分类器危险句
  「Auto mode: classifier flagged this as dangerous.」在文件面永不现形 →
  A4 #3（a4cls）不可达（hard-red）。修 = 镜像 BashPermissionRequest /
  PowerShellPermissionRequest：`useAppState` 活读 `toolPermissionContext` +
  `verdictLine`（读 `permissionResult.decisionReason` + `tpc.mode` + `tool.name`
  + `classifierAutoApproved`），非 null 渲 dimColor 一行。零新数据、判定层零改动
  （红线：permissions.ts 主判定流不动，纯渲染层加性）。判别单测
  `file-permission-dialog-verdict`（纯面 3 + Ink 渲染面 2；修前 RED / 修后 GREEN）。
- **P0 封口**：修后 e2e S-024N/O 全 6 句 A4 绿（#3 危险句弹框现形
  `Verdict: Auto mode: classifier flagged this as dangerous.` + wire
  `classifier=inject shouldBlock=true`；#4 成功卡 `Auto-approved by classifier:`）
  + 控制面 + S-A（P0a）零回归 → releasable=true（gate f4 PASS）。
  本版本仅含 D-279-r1（一 wave 一版，不并其他项）。

## v0.1.27

#279 波 C 分类器拦截支 deny→ask + P0 崩修（auto-mode 分类器链复活，P0 封口
前置；一波一版 = metadata 崩修 + 波 C 合并，用户裁定 #5）：

- **波 C：分类器拦截支 deny→ask**（`d64467c`）：auto-mode yolo 分类器
  `shouldBlock:true` 拦截支从 `behavior:'deny'` 改 `behavior:'ask'` +
  `decisionReason:{type:'classifier'}` → ASK 弹框现形，A4 危险句
  「Auto mode: classifier flagged this as dangerous.」一等可达
  （steerable-trust：拦截现 objection 给用户裁决）。安全姿态按 spec §4 C.2：
  available 拦截→ASK；unavailable/headless/shouldAvoidPermissionPrompts
  → 仍 fail-closed 硬 deny（headless 不变量保留）。判别单测
  `tui-classifier-intercept-ask` 7/7（C-1 前红→GREEN）。
- **P0 崩修：prompt-cache-1h 非数组/非布尔兜底**（`1b47c39`）：
  bootstrapState dev stub `getPromptCache1hAllowlist/Eligible` 曾返 `{}`
  （非数组/非 null/非布尔），`metadata.ts should1hCacheTTL` 只守 `=== null`
  漏接 → `getCacheControl({querySource:'auto_mode'})` 在 auto-mode 分类器链
  上抛 `TypeError: allowlist.some is not a function`，分类器功能死（回落
  人工弹框）。修 = 双守卫（`!Array.isArray(allowlist)` 回落 GrowthBook
  `config/[]`；`typeof userEligible!=='boolean'`→false）+ stub 改返 null
  （未接线哨兵）。加性、零行为副作用、离 TUI 红线条。判别单测
  `metadata-prompt-cache-1h` 3/3（零网络零模型）。
- **dist 崩点核验**：build 后 `dist/cli.js` stub 已返 null（:123455）、
  双守卫在位（:272450 userEligible / :272457 Array.isArray）、
  `allowlist.some`（:272462）经守保护不再崩——stub 仍留但已防御。

四件套绿（detached verify worktree 全量 3529/0·246，tsc 0 / lint 0e·0w /
build 17.58MB）。P0 封口（全 6 句 A4 绿 = live-gateway 分类器 e2e）待 e2e
A4F 复验 S-024N/O（probes→hard）闭环后收口（Option B）；BR-8 品牌波顺延
0.1.28。

## v0.1.26

#278 A4 可解释审批全可达波（P0 改进波，e2e A4F gate 全绿闭环：4 硬句全绿
a4rallow/a4bypass/A4-mode/a1danger + classifier 2 句 INCONCLUSIVE（预期）+
控制×7 + S-A 回归不回归，f4 gate 放行）：

- **A4-mode P0 缺陷修**（`f04182d`，item 1）：default 模式无规则 Bash 弹窗
  的「为什么」verdict 行断裂——blocked 路径（工作目录外/输出重定向，
  shared isPathAllowed 无 decisionReason）verdictLine 恒 null 永不渲染。
  修 = engine bash 两 drop 支（validateCommandPaths/validateOutputRedirections
  blocked 支）合成 `{type:'other'}` decisionReason（主循环判定零改动，仅加性
  携带）。
- **allow 面 verdict 行**（`92f49e8` + R1 早退门 `548eb8c` + R2 数据侧
  `f61deca`，item 2，e2e A4F R1/R2 两轮 gate 钉死的完整可达链）：
  auto-allow（rule-allow 2b / bypass 2a）确定性快路径不经 canUseTool →
  成功卡三 allow 句（Allowed by rule "…" / Bypass mode – all commands
  allowed / Auto-approved by classifier: …）无数据源、无渲染点。修 =
  成功卡加 verdictLine 可解释面 + allowVerdicts 数据面（by toolUseID
  挂载读即删）+ `hasSuccessCardMarker` 早退门（skip 但有 marker 行 →
  放行 marker-only 渲染，P0a 早退语义不回归）+ GateVerdict 加性
  decisionReason 字段 + 交互桥快路径 `setAllowVerdict`（engine 门确定性
  allow 携带判定原因，跨域 cast 单点 base 7 变体 ⊆ TUI 11 变体）。
- **BASH_CLASSIFIER no-op 根因登记**（`33a88bf`，item 4 重裁）：bash
  prompt-rule 分类器 = ANT-ONLY stub（isClassifierPermissionsEnabled
  恒 false）→ flip 默认开零分类结果，改 no-op 根因 doc + 判别单测钉
  verdictLine 纯函数面；classifier 2 句（a4cls/a4clsa）= 唯一真分类器
  auto-mode yolo（TRANSCRIPT_CLASSIFIER 门，live LLM）活模型可达时渲染，
  PTY 不可强制 = INCONCLUSIVE（B1 口径，非代码缺陷）。
- **判别单测**：`tui-bashtool-checkpermissions` 9/9 +
  `permission-verdict-line` 27/27（含 hasSuccessCardMarker 4 判别）+
  `loop-permission-bridge` B-5/B-6（快路径 setAllowVerdict 置位/guard）；
  四件套绿（worktree 全量 3519/0·244）。

P0 封口（全 6 句 live-gateway 分类器 e2e）推迟专波（f4 开波追踪）；
BR-8 品牌波顺延 0.1.27。

## v0.1.25

#265 P0 安全修（TUI 车道 Bash 权限面两处缺口，独立 P0 patch 先于 BR-8 品牌车，
f4 裁定列车归属）：

- **`>` 输出重定向只读守卫**（`69407b8`，#265 S1）：`isReadOnlyCommand`
  同族 includes 守卫补 `>`——输出重定向（`>`/`>>`/`>&`/`&>`）带写副作用，
  旧匹配 `echo`/`git status` 等只读前缀被 `bashToolHasPermission` step 7
  自动放行（写文件零审批）。`<` 输入重定向只读不写不守卫；引号内 `>` 判
  非只读 = fail-safe 方向（多弹框不多放行）。
- **Bash checkPermissions 模式门控委托 engine**（`41649ec`，#265 S2）：
  W2-2b 裁定① 的恒-allow stub 实证为安全洞——gate 1c 拿到 `allow` 后 step 3
  只转 passthrough → TUI 车道任何 Bash 命令在 default/plan 等模式静默放行、
  审批卡永不弹（= 0.1.24 残留 A1×3 INCONCLUSIVE 根因；auto 模式同洞绕过
  AutoModeConfirm）。修订为模式门控委托：非 auto 一线接线 engine
  `bashToolHasPermission`（单一事实源，非 auto 支不触 speculative 缓存）；
  auto 返 passthrough（弹窗层 TUI classifier/AutoModeConfirm 权威，tui
  缓存单源存续）。单点替换 engine gate + TUI 弹窗复检两消费面。
- **判别单测**：`tui-bashtool-checkpermissions`（7 测）+ `core-face` S1
  6 断言；四件套绿（worktree 全量 3507/0·244）。

发布后 7 项 e2e 重验（A4×5+A1×3，f4 触发终审，A4F harness 自 INCONCLUSIVE
翻 PASS 作触发器）归 0.1.25 终审项。

## v0.1.24

P0a 审批行为定稿（§4b A 波）+ P0b 持续监控收敛（B 波）+ P1a 全量回退（C 波）
（e2e §4b gate：P0 S-A/B/C PASS hardFail=0 + 31 探针 23 PASS / 0 FAIL /
8 INCONCLUSIVE，f4 放行发布）：

- **C 波 P1a 全量回退**（`626e378`）：移除 P1a 五页侧边抽屉（SidePanel 15
  文件 + /sidebar 命令 + 3 接线注册点）；kitty 协议/事件层 6 例单测保留，
  迁 parse-keypress 名下（键位行为不随抽屉删除）。P1a v2 独立波重新设计。
- **A2 No 不退出**（`a556da2`）：审批卡显式 No → buildReject 不 abort
  （会话不终止，继续当前回合）；Esc/中断改路由 onAbort 语义对齐。
- **A1 always 规则 session 域化 + 危险前缀护栏**（`410d7bc`+`f30bf37`）：
  always-allow 规则不再写全局规则文件——域化到当前 session（sidecar：
  resume 恢复 / 新 session 重置 / 写失败显式上报）；危险前缀（`rm -rf /`、
  mkfs、dd 裸盘覆写等）不进 always 快车道，仍走确认。
- **A3+A4 automode 确认门 + verdict 句式定稿**（`dc8e78a`）：审批 4 表面
  （Bash/PowerShell/File 对话框/ShowInIDE）的 automode 选项先过 4 行确认
  视图（Entering automode / auto-approved by safety classifier /
  Switch back: Shift+Tab / 1 Confirm 2 Cancel），Confirm 才执行
  applyAutoModePermissionOption（shift+tab 手切不加门）；verdict 行定稿
  6 句 canonical 英文句式（rule / classifier 危险 / classifier 自动放行 /
  mode·other / bypass + 加性 toolName/classifierAutoApproved 参数）。
- **A5 statusline 授权模式标签三态**（`5867cfd`）：default / automode
  enabled / bypass enabled（shortTitle 仅 statusline 消费；Config 屏与
  A4 verdict 的 title 原文案不动）。
- **B1 回退信任线折入 model 段**（`4dcd56e`）：role 回退发生时 model 段
  尾部黄 `↦ {to}`（spec 形 `⚡ deepseek-v4-pro ↦ fast`），独立
  role-fallback 段删除（旧 statusline.json 条目走 schema 降级自愈）。
- **B2 autoCompact 熔断预警折入 context-bar 段**（`fbee6de`）：用量进
  autoCompact 阈值预警区（且 autoCompact 启用）时上下文条尾部黄 `▲`；
  色阶改 cyan→黄 70%→红 90%；独立 auto-compact-warning 段删除。

## v0.1.23

P0a 回归修 + loop-robustness #271 #4/#5（e2e P0 回归门禁打回 0.1.21/0.1.22
P1a 侧抽屉引入的审批卡死回归；#271 两缺口同车，e2e 复合验收 4/4 全绿后发布）：

- **P0a 回归修（红线③ 键位不打仗）**（`3968a81`）：P1a 侧抽屉 1-5 键在
  模态（权限弹框/模型选择）激活时抢先消费、饿死模态 ink 数字选 → 审批批准
  卡死（e2e P0 S-A hardFail=4，0.1.21/0.1.22 引入）。根因 = 本地 'SidePanel'
  context 恒入 useKeybinding 匹配栈（isActive 仅控 activeContexts 注册，
  本地 context 不受控）+ open* handler 无模态门。修 = 双 cede 面：键位面
  （`sidePanelHandlers` 工厂 deps.isModalActive，模态 overlay 激活全 9
  handler 透传，模态拥有键位）+ 渲染面（模态激活抽屉不渲染/不挤占，双底栏
  重叠同修；布局态留 store，模态关闭原页复原零丢失）。无模态保留 spec 门禁①
  1-5 一键开页（判别单测护住）。
- **loop-robustness #271 #4 连接重置不重试**（`ff33357`）：openai SDK
  APIConnectionError 顶层 message 是固定文案 "Connection error."（无 errno
  子串），连接期 errno（ECONNRESET 等）在 error.cause.code 上 → 旧重试门只查
  顶层 message/code 判「不可重试」→ drop 断连直接穿越给用户。修 = 重试门
  检索面扩展（SDK 连接错误类名 APIConnectionError + cause 链 code/message
  并入 haystack，同 gatewayUnreachableRemediationHint 已覆盖的 #4 盲区同款
  面）；#260 生成超时 fail-fast 语义不回归（APITimeoutError 族仍不重试，
  门入口先拦）。e2e droprecover 判据：recovered（proxyCalls=7，pre-fix 基线
  1 整任务死）。
- **loop-robustness #271 #5 空 0-0 占位符绕过空检测**（`ca810e8`）：网关
  0/0 占位响应（usage 0/0）经 OpenAI 协议映射后无真实内容块，provider 合成
  占位 text 块供渲染面可见——旧空判定把占位块当非空 text → 空判定/R1 有界
  重试/emptyTerminated 用户可见提示全不触发（末轮当正常终止，静默穿越）。
  修 = 单一定义常量 `PROVIDER_EMPTY_CONTENT_PLACEHOLDER`（两处合成点收敛）
  + engine loop 空判定排除占位块（占位+实内容共存时实内容仍算非空，防过度
  修）→ 0/0 占位走 R1 有界重试 + emptyTerminated 用户可见路径。e2e
  emptyretry 判据：recovered（proxyCalls=10，pre-fix 基线 2 假 success）。
- **四件套**：tsc 0 / lint 0e·0w / build 17.58MB / 全量 17286 pass·0
  fail·1180 文件（superset 口径含嵌套 worktree 测试扫入，同 0.1.19-0.1.22
  先例）。

## v0.1.22

P1a 验收 R1 缺陷修补发（0.1.21 随车 P1a 含两缺陷经 b8 lane 验收 R1 打回，npm
版本不可撤回，本版补发两修；R2 验收 PASS 后触发补发）：

- **R1 缺陷① `/sidebar` 命令漏注册已修**：P1a 命令文件
  `src/tui/commands/sidebar/index.ts` 已建但 `src/tui/commands.ts` 主注册表漏
  import + `COMMANDS` 数组登记，`/sidebar` 落入 skill 派发报「Unknown skll」。
  补 import（:41）+ 注册（:231）（`27df1ed`）。
- **R1 缺陷② Kitty 终端 ctrl+shift 族死键（协议级真缺陷）已修**：ink
  parse-keypress 的 CSI-u（Kitty 键盘协议）分支误用 XTerm modifyOtherKeys 的
  1-based modifier 解码；Kitty 协议是 0-based 位掩码（shift=1/alt=2/ctrl=4/
  super=8），真 kitty 终端 `Ctrl+Shift+D` 发 `\x1b[100;5u`（1+4），旧解码解成
  ctrl-only（shift 静默丢失），ctrl+shift 族绑定在 kitty 协议终端永不触发。
  新增 `decodeKittyModifier`（0-based，modifier 字段缺省=0 无修饰键，:480 + :653）；
  modifyOtherKeys 1-based 路径不变（`\x1b[27;6;100~` 仍正确解码）。
  ⚠️ **探针编码注记**：修后 `\x1b[100;6u` = alt+ctrl（Kitty 正确语义），不再触发
  ctrl+shift+d；harness/探针应改 `\x1b[100;5u`（kitty 0-based）或
  `\x1b[27;6;100~`（xterm 1-based，6=ctrl+shift，不变）。
- **Diff 页空态可观测**：clean worktree（git diff 空、无 hunk）时 Diff 页显式标
  「工作树干净 —— 无未提交改动（git diff 空）· 当前档 unified/side-by-side」
  （`DiffPage.tsx:24-28`），空树切档亦可验（验收探针/人工核均适用）。
  键链判别单测 9 例（`tests/unit/sidepanel-sbs-keychain.test.ts`：协议层 5 /
  事件层 1 / 匹配层 3，含双协议 kitty+xterm 编码 + ctrl-only 与无 SidePanel
  上下文负例）（`d4341a1`）。

四件套绿：tsc 0 / lint 0e·0w / build 17.58MB / 全量 13782 pass·0 fail·939 文件
（master superset 口径，同 0.1.21）。

## v0.1.21

P1a 多页面侧抽屉 + #272 LLM 出站 UA 品牌串（spec `docs/tui-differentiation-spec.md`
§4 P1a；验收 b8 lane `accept.ts P1a --repo <worktree>`）：

- **P1a 多页面侧抽屉**（消息流旁 40% split 布局，非覆盖）：5 页 =
  `1 Diff / 2 Plan / 3 Activity / 4 Decisions / 5 Budget`；←→ 循环切页
  （wrap-around）、Esc 关、`ctrl+shift+d` 仅 Diff 页切 unified ↔ side-by-side
  （双列 diff 渲染为纯新增组件）。抽屉关闭时全部 SidePanel 键位透传
  （return false），既有键位零改动。命令面 `/sidebar [page]`（空/无效参数
  回落 Diff 页）。数据面全只读投影：Diff=git 工作树 diff（useDiffData）、
  Plan=getPlan+任务清单、Activity=消息流 tool_use/tool_result 末 12 条、
  Decisions=新增 ring buffer（cap 50，useCanUseTool 判定点**加性**记录，
  engine 主循环零改动）、Budget=模型角色 + 上下文余量 + 会话累计。
  信任线直达（门禁③）：回退预警段「· 5 谁在答」/ autoCompact 熔断段
  「· 5 还剩」→ 预算页 tab 键 5。
- **#272 LLM 出站 UA 品牌串**：openai SDK 客户端此前无自定义 UA（出站头
  是 SDK 默认 `OpenAI/JS`）。新增 `src/shared/identity.ts`（buildUserAgent
  = `AtlasCode/<v> (+repo)`，getVersion 沿 process.argv[1] 上行走读
  package.json）+ modelprovider 两处 `new OpenAI` 加 defaultHeaders
  User-Agent；层边界干净（shared 叶子域，不引 tui/engine）。

四件套绿：tsc 0 / lint 0e·0w / build 17.58MB / 全量 3465 pass·0 fail·237
文件（+29 判别单测：store 9 / decisionLog 5 / handlers 6 / projection 9）。

## v0.1.20

P0b 信任透明层三验收门禁（spec `docs/tui-differentiation-spec.md` §4 P0b；验收
b8 lane `accept.ts P0b` S-B 熔断 soft + S-C 网关 hard×3）：

- **① 水平回退发生可见**（信任线「已从 X 回退到 Y」）：`queryWithRoleFallback`
  成功侧加性返回 `servedRole`（实际应答 role）/ `fallbackUsed`（spec §1 L29 钉死
  形状，非回调；消费者零签名变更）+ 独立纯 leaf `roleFallbackStore`（primary 成功
  清除 / fallback 成功记录）；新 StatusLine 通道 B segment `role-fallback`（无回退
  null / 有回退 warning 黄「已从 {from} 回退到 {to}」）默认可见（紧随 model）。
- **② autoCompact 熔断预警**（statusline「将自动压缩，可 /rewind 回退」）：新
  segment `auto-compact-warning`——上下文用量进入 autoCompact 阈值预警区（阈值 − 20k
  缓冲）且 autoCompact 启用时提示（给用户撤销点），数据经 `src/engine` 门面
  model-string 形（calculateTokenWarningState + isAutoCompactEnabled）。
- **③ 网关不可达给方向不给 mood**：纯 leaf `gatewayUnreachableRemediationHint`
  （SDK 连接失败族 + 网络层 errno，含 `error.cause.code` ECONNRESET 链盲区）→ REPL
  错误行附「IFF 不可达：已切人工确认 —— /doctor 排查」（S-C 三锚点）；超时/abort/
  拿到 HTTP 状态的错误 → null（零行为变更）。

四件套绿：tsc 0 / lint 0e·0w / build 17.56MB / 全量 3436 pass·0 fail·233 文件（+25 判别单测）。

## v0.1.19

P0a 可解释审批波（spec `docs/tui-differentiation-spec.md` §4-P0a；验收单 b8
lane `user-e2e/tui-diff/PLAN.md` §3）：审批卡默认可见「为什么」一行（零新数据
零边界——不碰 `src/engine/query/`、`src/tui/utils/permissions/` 主路径）：

- **verdict 一行纯面**（`src/tui/components/permissions/permissionVerdict.ts`
  新）：对 `PermissionDecisionReason` 判别联合的只读投影。verdict 三态（spec §1
  钉死）：rule 命中 → `Verdict: hit <behavior> rule "<rule>" from <source>`；
  auto-mode → `Verdict: <classifier> classifier says: <reason>`；mode/other →
  `Verdict: no rule matched — <Mode> mode asks you`。数值置信度不出现（真实
  shape 无此字段，bash classifier 的 high|medium|low 是 ANT-only stub）。
- **ask 面弹框默认可见 verdict 行**（BashPermissionRequest +
  PowerShellPermissionRequest）：弹框打开即显示「为何在问你」，无需展开。
- **allow 面成功卡 verdict 行 + 用户批准标记**（`src/tui/utils/userApprovals.ts`
  新 + UserToolSuccessMessage）：手动批准 → `✓ Allowed · your decision`（挂载读取
  + 立即删除防 Map 无界增长，classifierApprovals 同模式）；auto-mode classifier
  放行 → `Allowed by auto mode classifier: <reason>`（仅 auto/plan 模式，
  useCanUseTool 门 classifier==='auto-mode'）。
- **allow 面批准标记行对无结果渲染器工具存活**（b8 第 4 轮 cardAllow 修）：
  `successCardRenderMode(renderedMessage, userApproved)` 纯判定（full/marker/skip）
  ——TUI-lane Bash 桥接适配器无 `renderToolResultMessage` 成员时，原
  `renderedMessage === null` 早退把已 `setUserApproval` 的批准标记行一并跳过；
  修后 marker 形仅渲染标记行，未批准工具零行为变更。

四件套：tsc 0 / lint 0e·0w / build cli.js 17.55MB / 全量 3411/0·230。b8 PTY
验收 PASS（hardFail=0，ticket `P0a-1791086138730-9de6`）。

## v0.1.18

TUI 工单 A1+B+C+A2（issule-analyst 2026-10-04，`docs/2026-10-04-config-skill-automode-implement.md`；
= 用户 3 PR 同一件事）四子决策全落盘：

- **A1 auto mode 三角色全开放**：`AUTO_MODE_ROLES` = premium/fast/small
  （2026-10-04 用户终版裁定，推翻 2026-09-19「fast 不进默认放行清单」——
  快速/轻量模型同样预信任跑安全分类器；betas.ts 两处陈旧注释同步修正）。
- **B 配置命令 busy 态立即生效**：local-jsx 命令 `immediate` 缺省翻 true
  （`cmd.immediate ?? true`，显式 `immediate: false` 可 opt-out）——/autocompact
  + 只读展示命令（/cost /usage /stats /memory /session /context）busy 态不再
  排队等整回合结束；`shouldInferenceConfigCommandBeImmediate()` 恒 true
  （原 growthbook 死 stub gate 是死码，整删）。
- **C 交互式安装轻量自动激活**：新 `refreshActivePluginsLightweight`
  （数据面 swap：clearAllCaches + loadAllPlugins + commands/agents 重读 +
  AppState plugins 面更新 + needsRefresh:false）；/plugin 菜单 install /
  enable / disable / uninstall / marketplace 增删完成后自动激活，新装插件
  skills/commands/agents 立即可用（无需 /reload-plugins）。前向缝登记：
  新插件 hooks / MCP / LSP 三面仍属全量刷新域；成功消息面去 /reload-plugins
  尾缀（config/MCP 域消息保留）。
- **A2 权限弹框第 4 选项 = auto mode**：文件族弹框（FileEdit/FileWrite/
  Filesystem/NotebookEdit 均委托 FilePermissionDialog，一处 canonical 选项）
  + Bash + PowerShell 内联面统一加「Auto mode」第 4 选项（共享 helper
  `autoModePermissionOption.ts`，工单点名复用）。裁定：选中 = 切 session
  到 auto（`transitionPermissionMode` + setAppState 发布）+ 经既有
  `ToolUseConfirm.recheckPermission()` re-dispatch **当前这 1 个** pending
  请求（不重收 accept/reject、不重放历史队列）：非危险/规则已覆盖 →
  auto 放行关框，危险工具 → 留框按 auto 态再问。门控关或已在 auto 时选项
  隐藏；render→点击间 gate 翻关走竞态兜底（仅原样 re-dispatch）。
  Fallback/WebFetch/Skill/AskUserQuestion 弹框不在工单点名面内，未扩。
  判别单测 `tests/unit/auto-mode-permission-option.test.ts` 5 件
  （mock.module 全导出面 spread + gate 两函数覆写；弹框面活判别归 PTY 探针）。

## v0.1.17

loop-robustness 优化波（#262，用户裁定 #1 优先）——headless / 长任务车道健壮性
三缺口全落盘（peer atlas-user-e2e 故障注入面 code-verified gaps）：

- **#262 缺口① headless 车道全局崩溃兜底**：headless/CLI 车道缺进程级
  uncaughtException/unhandledRejection 兜底 → 未捕获异常直接崩进程丢任务。
  修 = 新 React-free leaf `src/cli/crashBackstop.ts` registerGlobalCrashBackstop
  （幂等双 handler，log-to-stderr + survive），经 cli 门面导出，headless 分支
  binMain 挂载（先于 getCoreDependencies）。判别单测 5 件（含 func 活探针
  spawnSync）。
- **#262 缺口② 回合级有界恢复（E-1b-full 错误恢复纵切核销）**：loop 无 turn
  级错误恢复，provider 3 次内重试被 5xx 风暴耗净 → 回合级丢任务。修 = 新原语
  `src/engine/query/turnRecovery.ts` withTurnRecovery（默认 maxRetries=13 →
  42 LLM 调用跨 40 次 5xx 风暴窗口；重试谓词复用 modelprovider
  shouldRetryModelError 单一事实源——5xx/429/连接可重试，400/客户端请求超时
  （#260 fail-fast）/abort 不放大；首试恒跑保 R1 空响应 abort=1 次调用语义），
  queryOneRound 两挂点包 withTurnRecovery。env 可调
  ATLAS_TURN_RECOVER_ENABLED / _MAX / _BACKOFF_MS / _BACKOFF_CAP_MS。判别单测
  10 件（mutation-red）。
- **#262 缺口③ llmTimeoutMs 死键 + headless 源缝未接（用户 #260「改 settings
  没用」主诉）**：provider 超时构造期一次性快照 + headless 从不注 settings 源缝
  → settings.json llmTimeoutMs 恒 600s 死键（live 铁证：8000+15s 延迟仍跑 35s，
  env=8000 则 8s 中止）。修 = provider 加可选活态 timeoutResolver（getTimeoutMs
  每请求现读，直构测试面零变更，4 请求点全切）+ getModelProvider 单例注活态
  resolver（与 TUI 提示面 getCurrentLlmTimeoutMs 同源，两车道不分裂）+
  headless createCoreDependencies 补注 setLlmTimeoutSettingsSource（typeof 守卫
  + try/catch 早位降级，同 WebSearch 键面纪律）。判别单测 4 件（mutation-red）。

发布：GitHub master + tag v0.1.17；npm `@atlasharness/atlascode@0.1.17`。
四件套绿 tsc 0 / lint 0e·0w / build 17.55MB / 全量 3390/0（228 文件）。
post-fix gate（peer atlas-user-e2e 故障注入面）：① 静态 grep 崩溃兜底注册 /
② turnrecover --expect post proxyCalls≥40 / ③ LT1 探针 tui-longtask +
settings-lane（llmTimeoutMs=8000+15s 延迟须 8s 中止）。

## v0.1.16

主循环 LLM 超时 P0（斗兽棋回合死「Request timed out」）+ G2 残余验收缺口修波：

- **#260 P0 主循环 LLM 请求超时**：根因链 = 主循环 chat() 非流式 + 缺省
  120s 超时（用户 profile 未设 ATLAS_LLM_TIMEOUT）→ 27B 慢模型 xhigh
  effort 长生成 > 120s → SDK 超时 → 旧重试门 /timeout/ 命中 → 3 次整段
  重生成（观察值 ≈4m5s）→ 回合死。修 = ① 缺省 120s→600s（国产慢模型
  基线，用户裁定；上限 30min 不变）② settings.json 新键 llmTimeoutMs
  （env ATLAS_LLM_TIMEOUT 恒胜；autoCompactWindow settings 源缝先例）
  ③ 生成超时 fail-fast 重试门（SDK 超时类族不重试——重发再等一个超时窗
  零收益；连接期 ECONN/429/5xx 旧语义保留）④ REPL 错误行 remediation
  提示面（超时附修复旋钮，非超时错误行原句不变）。判别单测 17 件。
- **#261 G2 残余（#259 验收缺口，issule-analyst P1）：SkillTool 两车道
  根锚定 getProjectRoot→process.cwd**：0.1.15 S4 回归 Skill(summarize-
  numbers) 仍 Unknown skill——两车道 SkillTool（+AgentTool 同族 1 站点）
  技能目录面写死 getProjectRoot()（上探 .git），非 git 工作区 / git 子
  目录里 ws/.atlas/skills 在下游漏扫。修 = 4+1 站点改 process.cwd()
  （主 init 一致，git 项目零变化）。判别单测 3 件（func 真 fs + chdir
  仓内 ws 场景：外层 .git 标记目录 + ws 下游 .atlas/skills）。
- docs(tui)：TUI 差异化 spec v2 落仓（atlascode-b8 设计/验收分工面）。

发布：GitHub master + tag v0.1.16；npm `@atlasharness/atlascode@0.1.16`。
四件套绿 tsc 0 / lint 0e·0w / build 17.55MB / 全量 3371/0（224 文件）。

## v0.1.15

TUI 对比轮（atlas vs Claude 基线，约束：不降级）G1/G2 修波：

- **G1（#258）改文件 diff 默认可见**：根因 = engine 工具管线丢弃工具
  原生 Output（只透传 mapToolResult 的 LLM 侧 block）→ TUI
  UserToolSuccessMessage 因 `!message.toolUseResult` 恒 return null →
  默认转录 Edit/Write 只见工具名行、无 diff/行数（Claude 基线 = 内联
  diff `Added/Removed N lines` + hunk）。修 = 4 挂点零 TUI 改动
  （engine toolUseResult 挂法复原旧仓 addToolResult 语义）：成功支挂
  res.data / catch 支挂错误串（旧仓 detailedError 挂法：与 block
  content 内文同串）/ 早退支不挂（登记），toolOrchestration 透传 +
  loop resultMessages 挂入 → Edit 内联 diff / Write 行数默认渲染。
  isHumanTurn 谓词消费面（attachments walk / REPL lastMsgIsHuman）
  语义随之收敛回旧仓（工具结果消息不再误计为 human turn）。
- **G2（#259）项目级 skill `.atlas/skills/` 默认可发现**：根因 = 项目
  skill 扫描门控在 `isSettingSourceEnabled('projectSettings')`（恒
  false——projectSettings 不在 ALLOWED_SETTING_SOURCES）→ `.atlas/skills`
  从不被发现 → Skill 工具 by-name 调用 = Unknown skill（模型手读
  SKILL.md 回落）。裁定（最小范围 = skills only）：项目 skill 发现面
  （engine + tui 双车道装载器：`.atlas/skills` 目录链 + `--add-dir` 面 +
  addSkillDirectories 动态发现）与 project settings 源解耦、默认开
  （只读 markdown，风险类 = Claude 现状）；新 kill switch
  `ATLAS_DISABLE_PROJECT_SKILLS`（先例 ATLAS_DISABLE_POLICY_SKILLS，
  单开关管三发现面）；`.atlas/settings.json`（RCE 面）仍排除（设置源
  不变），legacy commands-as-skills 项目层仍源门（前向接缝登记）。
- chore(repo)：worktree 开发工作流守卫（.gitignore node_modules 符号
  链接 + worktrees/ 顶层；用户裁定 2026-10-03）。

发布：GitHub master + tag v0.1.15；npm `@atlasharness/atlascode@0.1.15`。
四件套绿 tsc 0 / lint 0e·0w / build 17.54MB / 全量 3351/0（221 文件）。

## v0.1.14

#250 issule-analyst 专项收口：concern 2（`/autocompact` 命令）+ concern 3
（spinner 早显）。自动压缩阈值首次成为用户可配面（settings 持久化 + env
覆写 + 运行时 DI 注入，三车道单一事实源）：

- **concern 3（spinner 早显）**：spinner 状态行 timer + token 计数原共用
  30s 门 → timer 1s / tokens 5s 双门（`spinnerGates.ts` 纯函数 + 8 件判别
  单测；计时门先亮，`totalTokens>0` 值门保留防 0 计数闪帧）。真 token 计数
  接法裁定不接（getTokenCounter 本仓 OTel no-op，真 usage 是 session 面非
  turn 面，留前向缝记 #250）。
- **concern 2（/autocompact 命令，5 切片）**：
  - engine 档位面：`autoCompactWindow` 纯 resolver（auto/off/window/pct 四档
    + 越界 guard）+ settings 源注入缝 + env⊕settings 合并纯函数（**env 胜
    settings**：`ATLAS_AUTOCOMPACT_PCT_OVERRIDE` / `ATLAS_AUTO_COMPACT_WINDOW`
    / `DISABLE_*` 压同名 settings 档位；禁用面三源 OR）。
  - settings 新键 `autoCompactWindow`（zod 判别联合，结构单源 = engine 类型，
    engine 保 React-free 红线）+ 宿主 contextHostWiring 档位源接线。
  - `/autocompact` local-jsx 命令：无参 = 选择器（auto / 预设 100k·128k·200k·256k
    / 自定义 Nk·P% 输入框 / off），双写持久化（settings.json + AppState
    覆写，ThemePicker 先例）；**参数直用形 `/autocompact 128k`** 免选择器
    直落档（纯解析 `parseAutoCompactTierArg`；未识别参数用法回执不误写）。
  - agentLoopDeps 注入：`mergeAutoCompactOverrides(env, 档位)` 单点合并后注入
    AutoCompactDeps（pctOverride/windowOverride/enabled）——UI 阈值车道与
    loop 触发车道同源，防劈叉。
- meta（peer 第 4 轮 5be3c17）：user-e2e S1-S4 感知面回归 + 全量终局探针
  （随 0.1.13 列车 push，本 tag 入档）。

发布：GitHub master + tag v0.1.14；npm `@atlasharness/atlascode@0.1.14`。
四件套绿 tsc 0 / lint 0e·0w / build 17.53MB / 全量 3341/0（220 文件）。

## v0.1.13

S5 NL 自动触发波（用户 2026-09-30 裁定「自己规划」）+ S1/S3 回归收口 +
#240 debug 面。NL 自动触发核心面（catalog 注入 + 模型自判）已随 0.1.12 S1
whenToUse 修复就位；本波补「目录跨会话一致 + 死 stub 清理 + e2e 验收面」：

- **S5-1（R4 S1 根因收口）**：`skill_listing` 附件此前被 jsonl 持久化的
  `isLoggableMessage` 车道丢弃 → resume 后 skill 目录不复活（sentSkillNames
  resume 锁失效，自动触发线索跨会话不一致）。修 = 双车道放行 `skill_listing`
  + `?.` 对齐 + 复活 `conversationRecovery` 的 resume 锁（suppressNextSkillListing）；
  判别单测 `tests/unit/skill-listing-loggable.test.ts`（8 件，mutation-red）。
- **S5-3（死 stub 清理）**：`skillSearch` 7 文件全 `: any` 占位（翻开
  EXPERIMENTAL_SKILL_SEARCH 即 TypeError），裁删 + 全门控站点 + `skill_discovery`
  附件族 + `executeRemoteSkill` 孤儿；DiscoverSkills 前向缝保留。行为零变更。
- **S5-4（e2e 自动触发验真面）**：新增 live-gateway 门控探针
  `tests/func/atlascode-skill-auto-trigger.test.ts`——catalog（含 whenToUse，
  匹配 + distractor 双技能）+ NL 任务（不点名 id 仅描述工作）→ 断言模型自动
  触发对技能（tier-aware：native `Skill` tool_use 回显 或 assistant 文本点名
  特异 id）；网关不可达 skip-clean。本地实测 native 路命中。
- **S1 回归收口（P1）**：0.1.12 S1 的 whenToUse 双形式归一未覆盖 TUI 域两
  车道，`when-to-use` 连字符形式在 skill 目录 + 插件命令两车道仍漏 → 补全
  （两车道均接受 `when-to-use` / `when_to_use`）。
- **S3 回归收口（P0）**：JSX 内 `//` 行注释被解析器当除法致渲染崩溃（第 4 轮
  回归 P0）→ 改 `{/* */}` 块注释。
- **#240（cli-debug 基线）**：headless `--debug` 基线 lifecycle 面常路径真输出
  （此前 flag 注册但实现被裁）。
- meta（S5-2 裁定，非代码）：DSH catalog 工程增量（sha256 条目去重 / 全量原地
  替换 + initial/update 双框 / `/name` gesture 正则）逐项核 AtlasCode 既有面后
  判「不采」——`/name` 已被 slash-command 路径覆盖、全量原地替换与追加式 jsonl
  架构冲突、digest 仅同名 description 变更检测的低频边际收益；记录备查不重提。

发布：GitHub master + tag v0.1.13；npm `@atlasharness/atlascode@0.1.13`。
四件套绿 tsc 0 / lint 0e·0w / build 17.52MB / 全量 3307/0（218 文件）。

## v0.1.12

0.1.10 后用户实测反馈感知面修波（5 项分级，用户逐项 sign-off；S1–S4
落地，S5 归产品决策暂缓）：

- **S1（P1）whenToUse 键名双形式接受（自动触发线索降级修）**：
  skill frontmatter 解析仅读下划线 `when_to_use`，连字符 `when-to-use`
  （与 allowed-tools / disable-model-invocation 等兄弟键约定一致）整
  字段静默丢失 → 模型「何时用此 skill」唯一线索缺失 → 自动触发能力
  降级（用户「skill 没自动加载」主诉命中项）。修 = 双形式归一接受：
  连字符优先 + 下划线兼容（bundled ascend 技能现用形式回归保护）。
- **S2（P2）thinking 折叠支一句话预览**：折叠态此前只输出静态
  "∴ Thinking" 标记（内容 0 字）。修 = label 后渲染首个非空行（trim +
  80 字截断，dim italic），保留 CtrlOToExpand；提取逻辑落纯函数
  `thinkingPreview.ts`（判别单测 6 例），编译态 .tsx 最小插入。
- **S3（P2）文件名提示完成后持久可见（用户收窄范围）**：折叠组完成
  后最后一个文件名提示被 `isActiveGroup` 门控整行消失。修 = 解除门控
  （按 `displayedHint` 存在性渲染；数据源全程在）。用户明确不做截断
  全列表方案。
- **S4（P3）单条描述上限 env 可配**：engine + tui 双车道各一份
  `MAX_LISTING_DESC_CHARS = 250` 硬编码。修 = 双车道同 env
  `SKILL_LISTING_MAX_DESC_CHARS`（正整数覆盖；默认 250 不变 = 零行为
  变更，总预算仍受 getCharBudget 治理；提默认值归用户决策）。
- **S5（P3，暂缓）**：NL 自动触发（skillSearch 7 文件全 stub +
  EXPERIMENTAL_SKILL_SEARCH 非默认开）= 从零实现，产品决策项，归后续
  波；匹配质量依赖 S1 whenToUse 修复（已在本波兑现）。
- meta 全面性信息结论（供知悉，非修复项）：skill frontmatter 解析
  16 字段，模型可见仅 3（name/description/whenToUse）；version 解析
  为死数据；allowed-tools 不注入模型可见（仅调用期预授权）；paths
  条件激活模型无感知（UI-only attachment）。

发布：GitHub master + tag v0.1.12；npm `@atlasharness/atlascode@0.1.12`。
四件套绿 tsc 0 / lint 0e·0w / build 17.53MB / 全量 3277/0（基线 3262 + 15
新增，214 文件）。

## v0.1.11

R7（jsonl 双写收敛，P2，持久化专项波）——双写者双去重 Set 收敛为 engine 域
单一事实源（根因文档 0.1.9 判定 defer 项，本波开工闭环）：

- **R7（= R3，P2）jsonl 双写收敛（会话去重 Set 单一事实源）**：
  根因（`docs/r3-jsonl-double-write-root-cause.md`）：主 session 双写者
  （engine loop sink / REPL useLogMessages）各带**独立去重 Set 缓存**，对
  同一 session 文件双 append（"每个事件写两遍"）。修 = 根因文档修复方向 ①
  （写层 dedup 收敛到共享 Set）：① engine `engine/session/load.ts`
  `_sessionMessagesCache` 升格会话去重 Set 单一事实源，新增
  `primeSessionMessages`（--resume 挂载面预置，契约 = 仅在缓存为空时预置，
  防陈旧盘快照覆写活缓存丢未 flush UUID）+ `hasSessionMessagesCache`
  （预置守卫），双门面导出；② tui `sessionStorage.ts` 裁本地 lodash
  memoize 独立 Set 实例，`getSessionMessages` / `clearSessionMessagesCache`
  委托 engine 域缓存，`getLastSessionLog` 预置改经 prime 面 + 守卫
  （旧 `.cache.has/.set` 语义保留）。四接缝（engine 预过滤·写层 /
  tui 预过滤·写层）命中同一 Set（per session），双写于写层消解。
  判别单测 4 例（mutation-red 已核销：回退 tui 委托后 3 红——func 双写
  2 行 / tui 清不掉 engine 缓存 / tui 读面不见 engine prime uuid）：
  `tests/unit/session-dedup-shared.test.ts`（3，无盘）+
  `tests/func/session-double-write.test.ts`（1，真盘，生产时序复刻，
  session 文件 uuid 各单行）。
- **排期**：cli-debug P3（#240，`--debug` flag 注册但实现被裁）归下一
  小修波（裁定 = 实现最小 debug 面或删 flag），非阻塞。

发布：GitHub master + tag v0.1.11；npm `@atlasharness/atlascode@0.1.11`。
四件套绿 tsc 0 / lint 0e·0w / build 17.53MB / 全量 3262/0（基线 3258 + 4
新增，212 文件）。

## v0.1.10

user-e2e 第 3 轮终测 R6（P0，收尾主项）——TUI 工具车道 ToolUseContext 桥
（R7 = R3 jsonl 双写维持 defer，根因文档不变）：

- **R6（P0）TUI tool.call 缺完整 ToolUseContext 桥（getAppState 族崩溃）**：
  engine `executeToolUse` 给 `tool.call`/`validateInput` 第 2 参传最小 context
  `{ signal, checkPermission }`，而 TUI 工具按 ToolUseContext 消费全活面 →
  TUI 车道 TypeError（`getAppState is not a function` / `undefined is not an
  object`）→ 回合错误终止（R1 错误面如实显示）→ 0 任务执行 / 0 落盘（斗兽棋
  TUI 断点、core-3 FAIL 单根因；headless 车道正常 = 断点在 TUI 装配面，
  P0-1 同族）。修：`PipelineDeps`/`AgentLoopDeps` 新增 `toolContext?: object`
  槽（engine React-free 红线：型 = object，跨域面单点 = TUI 装配）；
  `executeToolUse` 合并 `{ ...toolContext, signal, checkPermission }`
  （engine 运行字段优先——F1 子代理门透传契约仍权威）透传 call +
  validateInput 双接缝（旧仓双处传全量 toolUseContext 语义复原）；TUI
  `buildAgentLoopParams` 注入活 `toolUseContext`（REPL + 子 loop 族
  runAgent/forkedAgent/execAgentHook/LocalMainSessionTask 全覆盖）；
  headless 零注入 = 窄 spine 行为零改动（`engine/loopDeps.ts`/`cli/print.ts`
  零 toolContext 面）。四工具崩溃族单点修复：Write（getAppState +
  readFileState）/ TaskCreate（setAppState）/ WebFetch（getAppState）/
  WebSearch（runWebSearch `ctx.abortController.signal` 缺位）。判别单测 4 例
  （engine-loop-tool-context 3：桥合并对象/engine 字段优先/窄 spine 键集合
  封闭 + loop→pipeline 接缝透传；repl-loop-deps R-6 1：装配同引用活态桥）。
- **R7（= R3，P2）jsonl 双写 — 维持 defer**：根因（两套发散 transcript 写者
  + 独立去重 Set）与修复方向（收敛单写者 / 删一写者 + 判别单测）见
  `docs/r3-jsonl-double-write-root-cause.md`；归专项波（持久化关键路径，
  非发布列车内投机改造）。

发布：GitHub master + tag v0.1.10；npm `@atlasharness/atlascode@0.1.10`。
四件套绿 tsc 0 / lint 0e·0w / build 17.53MB / 全量 3258/0（基线 3254 + 4 新增，
210 文件）。

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
