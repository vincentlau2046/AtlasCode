# 0.1.109 W-AB3 工单——件 B Edit 权限面修形（acceptEdits 既有文件直通，CC 形对齐）

> 状态：`draft → Atlas-reveiw 审计 → f4 双信号`。f4 工单（2026-11-14）。
> 上游：W-AB2 §6 用户逐件裁定件 B = **修形①对齐 CC 直通**（@92b82924）——acceptEdits 下既有文件 Edit 放行；deny/ask 规则与审批对话框零触碰；root-cause 腿先行。
> 证据面：W-AB1 T01 直证级（同模型同 prompt 同旗标，smoke+batch 双跑复现：atlas Edit 拒→node 脚本绕行→max-turns(20) 烧尽 vs cc 直通 25–27s 完成）。

## §0 波前审视（f4 2026-11-14，活码重核）

### 0.1 活码锚

- **read-first 门**：`src/tui/tools/FileEditTool/FileEditTool.ts:271-283`——validateInput 内 `readFileState.get(fullFilePath)` 缺失或 `isPartialView` 时返回 `behavior:'ask'` + errorCode 6（"File has not been read yet. Read it first before writing to it."）。**该门在 validateInput 内先行，与 permission mode 无关**——acceptEdits 只作用于 checkPermissions 面（`FileEditTool.ts:124-131` → `checkWritePermissionForTool`，filesystem.ts:1252）。
- **headless ask 面**：`src/cli/parse.ts:271`（permissionPrompts=none → dontAsk）。A 组 T01 腿 = headless npm 安装品形。
- **stale-edit 门**：同文件 :286-304（"File has been modified since read"，errorCode 7）——**本波零触碰**。
- **CC 形参照**：CC 同有 read-first 门且文案同源，但同任务一循环恢复（Read→Edit 直通）——差异不在门存在性，在**拒链如何到达模型/模型为何不恢复**。

### 0.2 root-cause 腿（判据前置，定谳后才落修形）

消费 W-AB1 观测库 T01 atlas reqlog（×30/×40 两腿）+ cc transcript，对 Edit 拒链 wire 形态逐帧定谳，三候选面：

1. **① 包装形态面**：atlas 拒链以 permission-deny 包装（非纯 tool_result 错误文案）到达模型 → 模型解读为硬权限墙 → node 绕行（cc 同门同文案以普通工具错误到达 → 模型自然 Read 恢复）。
2. **② Read→Edit 链断面**：Read 后 readFileState 键不对齐（expandPath 归一路径 vs Read 工具落键路径）或 isPartialView 误标 → 模型照指引 Read 后 Edit 仍拒 → 死循环转绕行。
3. **③ 消息指引面**：文案/附加 meta 不足以引导恢复（CC 文案或含更强指引）。

定谳手段 = reqlog body 直证法（权威，屏面不可靠教训在档）+ 复现腿（seeded HOME 下 Read→Edit 双步最小重放）。

### 0.3 修形①形态（随 root-cause 定谳二选一，禁预答）

- 定谳 ①/③ → 修形 = 拒链包装/文案修形 + **acceptEdits 模式下既有文件 Edit 直通语义**（CC 形对齐：acceptEdits 视 Read 前置为模型自恢复职责，门降级为指引性错误而非 ask）。
- 定谳 ② → 修形 = readFileState 链修（键归一/isPartialView 语义），mode 语义不动。
- **禁项**（任何定谳下恒成立）：deny 规则匹配面零触碰；ask 类错误（目录拒绝/ipynb/过大/同串）零触碰；stale-edit 门零触碰；default/bypassPermissions/dontAsk 模式行为零变。

## §1 波定义

0.1.109 单波：root-cause 腿（e2e 观测库消费 + 最小重放复现腿）→ lock-face 呈定谳与修形形态（f4 批复）→ Main 落码 → e2e gate → Main release → 生产 lane T01 复验腿。

## §2 Global Constraints

1. 零写真实 ~/.atlas/~/.claude；探针 designated-only seeded；npm --registry npmjs.org。
2. row F 全程；Atlas-reveiw 审计先于双信号；段 L 硬门（GATE-PASS + f4 采认双在案）。
3. 定谳面改动 lock-face 复核后才落码（判据面冻结于批复先于落码纪律）。

## §3 判据格（预注册）

| # | 格 |
|---|---|
| 1 | **root-cause 定谳格**：三候选面逐一定谳，reqlog/transcript wire 直证 + 最小重放复现腿在案；定谳记录含**每候选证伪证据面**（排除式，非仅证实胜者）；候选②直接证据 = Read 成功后 readFileState 键/isPartialView **实体检查**（debug/reqlog 落点），Edit 拒续发的间接推断不足定谳；最小重放腿须双 outcome（复现拒 + 修形模拟过）方闭合 |
| 2 | **直通格（窄义，审计必改 1 钉死）**：修形语义 = **(a) 已 Read 者 acceptEdits 下零阻 + 未 Read 者降级为指引性可恢复错误（tool_error 形，模型 Read 后重试即过）**；**(b) 未 Read 直接放行 = 禁采**（拆 stale-edit 基线建立机制且比 CC 形更宽；若定谳后降级指引仍死循环 = 模型不自恢复属 M 面，按 A/B 系列纪律不收计划、呈用户另裁）；同 prompt T01 复验腿：恢复循环计数锚 = reqlog 工具调用序列，恢复循环 = 拒后 Read→Edit 往返对（禁 turn 粒度），**主断言 = 恰 1**（CC 同形直证），≤2 = 容差上界；「同终值」= 产物文件与 CC 腿终态字节对比；「零 node 绕行」= 全程 Bash 调用面零现 |
| 3 | **负断言格（安全面）**：default 模式 read-first 门行为字节级不变（回归测试）；deny 规则/ask 类错误/stale-edit 门 diff 零触碰（含 :286-304 content-compare fallback 细化面——full read 内容未变放行，定谳②分支若动 readFileState/isPartialView 语义须联动回归两门共读面） |
| 4 | **审批流回归格**：T12 TUI 交互腿复跑 GREEN（审批对话框零触碰直证） |
| 4b | **TUI acceptEdits 腿（审计吸收 3 补缺）**：TUI + acceptEdits 交互腿——未读 Edit → 指引性错误上屏 + Read 后重试通过（双车道一致性另一侧实证，防单侧） |
| 5 | **canon 前滚恰合格**：`FORCE_COLOR=3 CI=true bun test --isolate ./tests/` 净域恰合 |
| 6 | **大文件面格**：Read 截断（isPartialView）→ Edit 拒行为按定谳面处置后保持防 stale-edit 语义（CC 同形对表；errorCode 编号保留，下游按 code 判别面不破） |

## §4 Review Focus（Atlas-reveiw 焦点建议）

1. 修形①不得把 read-first 门整体拆除（stale-edit 防护域，0.1.102 教训相邻面）——直通语义限定面是否足够窄。
2. root-cause 三候选面定谳判据是否可证伪（防先答后找证据）。
3. headless/TUI 双车道行为一致性（T01 headless 腿修形后 TUI 交互腿不回归）。
4. 错误文案修形的对齐上游面（文案属产品面还是共享面——S3 归位后文件落点）。
5. T01 复验判据「≤2 恢复循环」的口径钉死（回合 vs 工具调用计数）。

## §5 流程

本工单 → Atlas-reveiw 审计 → f4 双信号 → root-cause 腿（e2e 主跑 + Main 定因协助）→ lock-face 呈定谳+修形形态 → f4 批复 → Main 落码 → e2e gate → Main release（段 L 硬门）→ 生产 lane T01 复验腿 → f4 收口。

## §6 Atlas-reveiw 审计闭环（2026-11-14，通过 + 1 必改级钉死 + 4 吸收，@0c4556d6 全锚实核）

1. **必改级 1——「放行/直通」语义窄义钉死（lock-face 必钉）**：两读中 **(b) 未 Read 直接放行禁采**（拆 stale-edit 基线机制且比 CC 形更宽——CC 保留门且一循环恢复 = CC 形是「可恢复错误」非「无门」）；窄义 = 已 Read 零阻 + 未 Read 降级指引性可恢复错误（§0.3 表述已合，格 2 已统一）。**mode-scoping 两点登记 lock-face**：① 禁项冻 default 零变为保守正取，但 CC error-not-ask 形是全模式恒等——登记「acceptEdits-only scoping = CC 近似非恒等」偏差面防对齐误判；② T01 旗标车道实录（--permission-mode acceptEdits vs --permission-prompts none→dontAsk 折叠，parse.ts ?? 链谁生效）——修形 mode-scoping 判错车道则全波白落。**机制补证**：审计实锚 parse.ts ?? 链——headless 下 validateInput 'ask' 无提示通道可达 → 折 deny 信封 → 模型收 permission-wall，候选①先验机制级支撑（禁先答后找结构不变）。
2. **吸收 2（定谳格强化）**：格 1 增排除式证伪记录 + 候选②实体检查 + 重放双 outcome（已并入格 1）。
3. **吸收 3（TUI 腿补缺）**：补格 4b TUI acceptEdits 交互腿（已并入）。
4. **吸收 4（文案锚同步）**：文案落点 tui/tools/FileEditTool 壳域无跨域；errorCode 6 文案字面 = 格 3/探针既有断言锚 → 文案修形 = 判据/探针字面锚 row F 预注册同步；errorCode 编号保留；CC 文案取现行形（目标 = 恢复引导强度）lock-face 定。
5. **吸收 5（口径钉死）**：恢复循环 = reqlog 工具调用序列锚、拒后 Read→Edit 往返对、主断言恰 1（已并入格 2）。
6. **定谳②分支附加**：readFileState/isPartialView 语义若动 → :286-304 content-compare fallback 联动回归入格 3 处置表（两门共读同一 readFileState）。

**审计结论：通过——吸收后发双信号。**

## §7 root-cause 定谳（2026-11-14，e2e 报告 r-20261114-wab3-rootcause.md，f4 采认）

**总定谳：候选 ② 成立 = Read→Edit readFileState 装配链断（headless 专有）**；①③ 排除式证伪闭合。

1. **格 1 闭合**：① 证伪（拒链 = InputValidationError 普通 tool 错误形非 deny 信封——toolExecution.ts:502；模型两度照指引 Read 重试，未视作硬墙）；② 成立（运行时实体检查 `READSTATE-EDITGATE ctxHasField=false val=undefined` → fix 腿 `ctxHasField=true val=Map`）；③ 证伪（文案与 CC 同源逐字，死因在照做后仍被拒）。
2. **最小重放双 outcome**：A 现状 dist 形 Read×3→拒×3 死循环；B 修形模拟（makeCtx 注入共享单例 Map）Glob→Read→Edit 一次通过零拒环。
3. **旗标车道实录（lock-face 必答闭合）**：T01 双腿 `--permission-mode acceptEdits --permission-prompts none` 双旗标同传，parse.ts:269-272 ?? 链 explicit acceptEdits 胜出、dontAsk 未生效。
4. **修形形态裁定（f4，随定谳）**：走 §0.3 **②分支 = readFileState 链修**（makeCtx 注入 + type 扩面）；门语义/mode 语义零动——**acceptEdits 门降级直通形（①/③支修形）本定谳下不需要**。审计必改 1 窄义 (a)（已 Read 零阻 + 未 Read 指引性可恢复错误）仍为语义框——②支修形恰兑现该框（ Outcome B 零拒环一次通过，未触 M 面出口条款）。
5. **登记两面向 lock-face**：① dedup 回归面 +1——链修后 readTool dedup 恢复激活（file_unchanged stub），gate 加 dedup 行为回归格（K5-5 allow_large 禁 dedup 对表）；② 格 2 复验腿判读修正——修形后主形 = 零拒环一次通过（优于「恰 1」），「未读降级指引」路径另行判。
6. harness 事故三起自愈（bun --cwd/env -i/TDZ）已记报告 §6。

## §8 段 D lock-face 批复（2026-11-14，f4：**通过，按呈批形落码**）

1. **②支主修形三件套批准**：print.ts run 级单例 `createFileStateCacheWithSizeLimit(100)`（mcp.ts:43 先例同参）+ makeCtx 工厂双调共享实例（run 级外提 = 落码关键细节确认）+ sdkTypes SdkToolUseContext 可选成员扩面。零门体触碰确认。
2. **cli→tui type import 注记**：type-only 面可接受（壳→壳非 kernel 边界）；S3 归位波 re-home 候选登记（若 FileStateCache 型面日后入 kernel/shared 单源，随波迁移）。
3. **①/③支销项条款确认**：②支链修后门存在性 = CC 形（可恢复错误非无门）；格 2 复验主断言恰 1 达成 → ①支销项；>2 则按格 2 但书呈用户另裁。resume 边界（进程内 map，--resume 后首 Edit 须 Read = CC 同形）不修确认。
4. **波及面采认**：dedup 激活（killswitch 在场）+ Write stale 门复活 + NotebookEdit 同族复活 = headless 对齐 TUI 已有行为 = CC parity 方向；**gate 判据增负腿：ATLAS_DISABLE_READ_DEDUP=1 时 dedup 关闭直证**（killswitch 活性防退化）。三工具未 Read 首犯拒链形态不变确认。
5. **格 3 两面界定批准**：(a) TUI 双模式零变 diff 直证 + (b) headless 未 Read errorCode 6 拒链字节级判别单测；已 Read 场景门过 = 格 2(a) 预期效果非回归；errorCode 5/6/7/8 全保留；stale-edit 门 content-compare fallback 零触碰照落。
6. **swarm/inProcessRunner.ts:1567 同族缺口登记本波外**确认（防波膨胀；候后续小波，makeCtx 家族第五例域级注记已入档）。
7. 落码清单（print.ts + sdkTypes.ts + 判别单测）与流程（段 I → 四件套+canon → e2e gate 格 1-6 → 段 L 0.1.109）确认。

## §8b 段 I 改形批复（2026-11-14，f4：**通过，语义等价成立**）

eslint boundaries DEP-3 拦截 cli→tui（4 error）——预注册形 type import 违反域洁净。改形两处替代批准：

1. **型面**：`SdkToolUseContext.readFileState?: ReadFileState`（engine duck 型，engine 根门面 re-export，TodoWriteTodosPort 同通道先例）——f4 活码验证：filesToolInput.ts:116 接口 + :131 引擎消费面即此型 + :28 头注「Map 即满足 duck」自证。cli→engine allow 在场零配置变更。
2. **实例面**：cli 域内 bounded duck cache（Map 插入序 LRU，READ_FILE_STATE_CACHE_SIZE=100 同容量语义，~15 行无依赖）替代 tui FileStateCache 实体。语义等价论证采认：引擎四工具消费契约 = get/set duck；键 = expandPath 归一双侧同源；headless lane 无 normalize 可观察差；容量语义保留。
3. **§8 注记 2 就此消解**：cli→tui type import 不存在，S3 re-home 候选撤销（改形后零跨域依赖，优于原形）。
4. tui FileStateCache 实体不动（TUI/MCP lane 零触碰不变）；判别单测同步改形（unit 源断言 + func 链腿 cache 构造 cli 域实例）。当前 src 旧形两文件回退至新形批准。

## §9 段 I 终态采认（2026-11-14，Main 知会；落码 7ca5c8e0 双 remote 对齐）

终态形态 = §8b 新形全兑现：src/cli/headlessFileStateCache.ts（cli 域 bounded duck cache）+ engine/index.ts FileState/ReadFileState re-export + sdkTypes readFileState?: ReadFileState + print.ts run 级单实例注入；旧形 tui import 清零（print.ts/sdkTypes.ts 零引用）。四件套全绿：tsc 0 / eslint 0w（boundaries 4 error 清零实证）/ build 18.21MB / canon 5913 pass 0 fail 479 files（基线 5902 + 本波 11 测 +2 文件恰合）。判别测试 11/11 GREEN（unit 5 腿含 §8b 形态断言+cli→tui 清零负断言；func 6 腿含格 2(a)/3(b)+dedup 三腿+Write stale 门）。e2e gate 在途，候 GATE-PASS 后段 L 0.1.109。

## §10 gate GATE-PASS + 段 L release（2026-11-14；报告 r-20261114-wab3-gate.md）

1. **GATE-PASS 采认**：格 1-6 + dedup 负腿全 GREEN——格 2a 零拒环直通；格 2b g2b-hard 硬化腿（Edit-first 荣誉→拒6 恰 1→Read→Edit 成，恢复对恰 1，零绕行；方法论：强制序判据腿须内建硬化措辞）；格 3 触面直证（cli 域 3 文件 + engine/index.ts re-export +5，门体字节级零触碰）；格 4 T12 回归 GREEN（g4w Write 形重落，首跑 echo 形被 auto-approve 腿形偏差已录）；格 4b TUI acceptEdits 全链上屏零回归；格 5 canon 5913/0/479 双侧恰合 Δ=0；格 6 语义保持形 + **e2e 勘误采认**（isPartialView 全 src 仅 TUI memory-attachment 缓存面写入 attachments.ts:1620/REPL.tsx:3600，「截断读→Edit 必拒」非产品语义，任一 lane 皆然）；dedup 负腿 GREEN（allow_large 禁 dedup 面 code 实锚 :532 注记）。
2. **方法论入册**：① reqlog body 含全量历史回放，朴素遍历重计假象——body-diff 逐轮去重为唯一可信实序源；② 强制序判据腿硬化措辞。
3. **段 L 硬门合规（f4 确认）**：GATE-PASS 报告 + f4 采认 §9 双在案齐备 → release 47e02730（bump+CHANGELOG）/ tag v0.1.109 / 双 remote ALIGNED / npm publish 成功 / SRI 四值留档 docs/sri/v0.1.109.md @0848395f（cli.js 18,208,274 B / sha256 ea1ba503… registry tgz 与本地 build 字节级同值）。build-publish 时序附则照例。
4. 生产 lane T01 复验腿在途（对表 g2b-hard 恢复链形）；候回执后五段闭环终态。

## §11 生产 lane ⑦ PASS = W-AB3 五段闭环终态（2026-11-14，e2e 回执）

npm --registry npmjs.org 装 0.1.109 至 seeded prefix——cli.js sha256 ea1ba503…06a0397 与 SRI 留档 registry tgz 解包值**字节恒等**；g2b-hard 同形腿生产 bin 复验逐环同构（Edit→拒6 恰 1→Read→Edit 成，零 node 绕行）。**五段闭环终态：root-cause（候选② readFileState 装配链断）→ lock-face §8/§8b → 段 I 7ca5c8e0 → gate GATE-PASS → 段 L 47e02730 → 生产 lane PASS**。W-AB3 = W-AB2 改进计划首件落码波闭环（件 B 修形①以②支链修兑现：零权限语义触碰）。
