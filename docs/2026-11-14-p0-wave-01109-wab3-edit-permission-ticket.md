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
| 1 | **root-cause 定谳格**：三候选面逐一定谳，reqlog/transcript wire 直证 + 最小重放复现腿在案 |
| 2 | **直通格**：acceptEdits 模式下既有文件 Edit（已 Read）直通；同 prompt T01 复验腿 atlas ≤2 恢复循环完成、零 node 绕行、同终值 |
| 3 | **负断言格（安全面）**：default 模式 read-first 门行为字节级不变（回归测试）；deny 规则/ask 类错误/stale-edit 门 diff 零触碰 |
| 4 | **审批流回归格**：T12 TUI 交互腿复跑 GREEN（审批对话框零触碰直证） |
| 5 | **canon 前滚恰合格**：`FORCE_COLOR=3 CI=true bun test --isolate ./tests/` 净域恰合 |
| 6 | **大文件面格**：Read 截断（isPartialView）→ Edit 拒行为按定谳面处置后保持防 stale-edit 语义（CC 同形对表） |

## §4 Review Focus（Atlas-reveiw 焦点建议）

1. 修形①不得把 read-first 门整体拆除（stale-edit 防护域，0.1.102 教训相邻面）——直通语义限定面是否足够窄。
2. root-cause 三候选面定谳判据是否可证伪（防先答后找证据）。
3. headless/TUI 双车道行为一致性（T01 headless 腿修形后 TUI 交互腿不回归）。
4. 错误文案修形的对齐上游面（文案属产品面还是共享面——S3 归位后文件落点）。
5. T01 复验判据「≤2 恢复循环」的口径钉死（回合 vs 工具调用计数）。

## §5 流程

本工单 → Atlas-reveiw 审计 → f4 双信号 → root-cause 腿（e2e 主跑 + Main 定因协助）→ lock-face 呈定谳+修形形态 → f4 批复 → Main 落码 → e2e gate → Main release（段 L 硬门）→ 生产 lane T01 复验腿 → f4 收口。
