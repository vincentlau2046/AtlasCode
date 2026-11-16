# S0-R3 工单——engine 载体安全硬化（消费侧安全发现三件；真实数据 G2 阻塞面）

> 状态：`draft → Atlas-reveiw 审计 → f4 双信号`。f4 工单（2026-11-16）。
> 上游：S0-R2 段 I 采认（§8 @8ef0d74e）+ GATE-PASS（§9 @dfda805c，段 L 进行中）；消费侧 Atlasweb-F4 docs/upstream-pairing.md「Security review findings gating real-data G2」三发现 + Main 码面核实（2026-11-16）。

## §0 发现定位（f4 活码实核 2026-11-16）

| # | 级别 | 发现 | f4 实核 |
|---|---|---|---|
| ① | HIGH | 环式 metadata DoS——buildConversationChain 本体有 seen 环检测（load.ts:326-336），发现指向 metadata 合并面（load.ts:980 interleave / scanPreBoundaryMetadata 一带） | chain walk 守卫在案 ✓；**metadata 面环入口未定位**——真实环入口（summary 链/leafUuid 引用/自引用 metadata 行？）须工单段 0 侦查精确定位，**不预确认亦不凭 326 守卫驳回** |
| ② | HIGH | CWE-367 TOCTOU——load.ts:1061 `stat(filePath)` → :1081 `readFile(filePath)`（stat-then-path-reopen 窗）；sessionStoreAdapter validated-fd 校验后 loader 按路径重开同模式 | **码面吻合** ✓（f4 实读两锚）；既有缓解 = R-3 双采样三元组守卫（§5.8-3，窗口收窄非闭合）；修向 = 描述符读链（open→fstat→全 fd 读→读毕复核），结构性闭合 |
| ③ | MEDIUM | 解析资源界预解析未强制——resourceLimit 全部 src/atlascode/web 层抛出（engine/session 零命中）；全文件 loader（:521/:1081 readFile 整文件）预解析无尺寸/记录界 | **码面吻合** ✓——此即 **§5.8-4 登记残余面兑现**（≤64MiB 文件内单行全量驻留内存，当时登记「G2 格 D/E 观测项，届时独立 lock-face 扩形再裁」）——消费侧实测升格为真实数据 G2 阻塞，**登记项按预登记路径转正为必改** |

## §1 波定义

0.1.118 候：S0-R3 安全硬化三件（① 环入口定位 + 界面修复；② loader 描述符读链；③ 预解析资源界强制）→ e2e gate（格 1-5 + 消费侧回归腿对表）→ 段 L → 生产 lane → 单信号回 Atlasweb-F4（G2 真实数据解阻）。

## §2 修形纪律面（lock-face 必答前置）

- **load.ts 第二修形点裁定呈批**：② fd 读链与 ③ 预解析界均触 loadTranscriptFile 本体——S0-R 时「唯一修形点 = precompactSkip opts」（§7.3 钉死形）与 §5.8-4「readonly.ts 侧 post-parse 形，不动 load.ts」裁定面临扩形。lock-face 须呈批：修形点扩形边界（opts 加性面只准哪几件、缺省臂逐字节恒等守卫如何保持）+ 旧 CLI 恒等证明扩形（fixture 回放对表复跑）。
- ① 环入口定位先于修形定形（段 0 侦查报告入呈批书，禁先修后定位）。
- 消费侧回归腿接口对表三件入格：超大记录 → resourceLimit（零半投影）；环链 → corruptData（零 hang/零 OOM）；② ABA 窗闭合（fd ino 复核 → ioUnavailable/resetRequired 分态）。

## §3 判据格（预注册框架，lock-face 细化）

| # | 格 |
|---|---|
| 1 | 环链格：① 定位的环入口构造恶意 fixture → corruptData/有界拒（零 hang/零 OOM/零失控内存）；正常链（含 compact/preserved/fork）回归零触碰 |
| 2 | TOCTOU 格：② fd 读链 + 读毕 ino/size 复核；持 fd 期间 rename/替换 → 不连续分态（replay=ioUnavailable retryable / follow=resetRequired），零半旧半新交付；R-3 双采样守卫回归零触碰 |
| 3 | 资源界格：③ 预解析强制——超大记录（<64MiB 文件内单行 >maxRecordBytes）→ resourceLimit 预解析拦截（零全量驻留）；既有尺寸门/投影界回归零触碰 |
| 4 | 旧 CLI 恒等格：缺省臂逐字节恒等 + fixture 回放对表复跑（五形 fixture 扩环链/超大记录两形） |
| 5 | 载体面回归：S0-R2 格 1-5 判据件复跑零回退（载体 bundle 结构断言/导入纯度/隔离） |
| 6 | canon 恰合 + 消费侧三腿接口对表（Atlasweb-F4 声明形） |

## §4 流程

本工单 → Atlas-reveiw 审计 → f4 双信号 → lock-face（①环入口定位报告 + ②③修形点扩形呈批）→ Main 落码 → e2e gate → 段 L 0.1.118 候 → 生产 lane → 单信号回 Atlasweb-F4。**与 0.1.117 段 L 串行不抢**（0.1.117 先发布；消费侧 G2 真实数据腿等 0.1.118）。

## §5 衔接注记

- §5.8-4 登记残余面（G2 格 D/E 观测项）由本波转正销项——「观测项转必改」预登记路径首例。
- 消费侧 docs/upstream-pairing.md 三发现为格 6 对表基线；修复后其「Security review findings gating real-data G2」节由消费侧复核销项。

## §6 Atlas-reveiw 审计闭环（2026-11-16，通过——1 必改级 + 3 必改钉；@301fb630 全锚实核）

1. **锚核验吻合**（四读取点全量：stat :1061 / readTranscriptForLoad :1066 内部重开 / scanPreBoundaryMetadata :1074 独立重开 / readFile :1081）；「观测项转必改」预登记路径治理形 ✓；与 0.1.117 串行 ✓。
2. **焦点① 定位纪律 ✓ + 定位报告完备性三判据（必改钉 3，入段 0 呈批书要求）**：(a) 环入口可达性论证（真实数据构造形：summary 链自引用/leafUuid 循环/metadata 行引用已见 uuid）；(b) 现有 :326 守卫不覆盖该面的机理说明（防假定位）；(c) **定位不出环入口 = 「环入口不可达」亦合法定谳**（附论证呈批，禁为销发现强造修形）。
3. **必改级——②③缺省臂作用域分账（lock-face 显式裁定二选一，禁不声明混用）**：两修形均触 CLI/Web 共享面，格 4「缺省臂逐字节恒等」与格 2/3 新行为存在未调停冲突——(a) 缺省臂维持旧形（fd 分态/资源界仅 Web 授权面生效，恒等格严格成立）；(b) 缺省臂同享新行为 + 恒等格显式豁免声明「异常分态面非恒等域」（错误优于静默污染论）。**f4 注记：两形皆可，呈批书须带 Main 推荐形 + 理由（行为可见面/gate 覆盖面/失败模式对表），f4 lock-face 终裁**。③ 界数值单源 = web/limits.ts（S0 §4.4 表），loader 经 opts 接收禁第二常量（副本教训族）。
4. **必改钉 1——fd 链覆盖完备性（格 2 扩）**：函数内**全部**路径型读取统一单 fd（open→fstat→全 fd 读→读毕 ino/size 复核），禁逐点零散替换——只闭 readFile 一点则 metadata 扫描支（:1074 独立重开）窗口仍在（预压缩跳过分支正是元数据面）。
5. **必改钉 2——R-3 双采样守卫与 fd 链关系定谳（lock-face 二选一，禁默换）**：(a) 守卫等价重形（双采样三元组改由 fd fstat 序列承载，语义等价断言）；(b) 叠加保留（fd 链 + 原双采样纵深并存）。消费者 pairing 记录的安全缓解描述须同步真形。
6. **格框架采记**：格 2 扩四点覆盖 + 守卫关系定谳；格 3 作用域分账 + 数值单源；格 4 恒等精确化（异常分态面归属）；消费侧三腿对表 ✓；「零半旧半新交付」关键断言在格；pairing Security findings 节由消费侧复核销项 ✓。**双信号②即发 Main（lock-face 呈批，本节在案）**。

## §7 f4 预裁（2026-11-16，Main 证据补报 + f4 活码实核；约束 lock-face 呈批书内容）

1. **调用点清点采认**：loadTranscriptFile src 内真消费点恰 2——readonly.ts:34（web 载体车道，force-full → 直落 :1081 无界整读 = 发现③真目标路径，f4 实读吻合）+ conversationRecovery.ts:355（TUI 默认臂零 opts，f4 实读吻合）；scanner.ts:7 头注 151MB session 工程事实实锚 ✓。
2. **缺省臂作用域分账 = A 采认（终裁）**：默认臂行为逐字节恒等，界经 opts 加性传入，web 适配层（sessionStoreAdapter）显式 opts-in；界值单源 src/atlascode/web/limits.ts，opts 缺省 = 不设界（undefined 语义）。理由采认：(a) 默认臂硬界破 TUI 107-151MB 合法 session resume = 不可接受回归面；(b) 威胁模型分账——发现③暴露面 = web 载体不可信路径经 replay API，TUI 本地车道文件为用户自有 transcript；(c) 与 §2 预钉 opts 加性/缺省臂恒等守卫一致。格 4 恒等格严格域 = 默认臂；格 2/3 新行为域 = opts-in 授权面。
3. **双采样守卫关系 = 叠加保留（b）终裁**：fd 链闭合 loadTranscriptFile **函数内**四点窗；但 **adapter 校验 → loader open 之间的交接窗**仍为路径面——adapter/replay 层双采样三元组守卫正覆盖该窗，两者互补非冗余（结构性互补，非可选）。缓解描述真形：pairing 记录更新为「fd 链（函数内四点）+ 交接窗双采样守卫（叠加纵深）」，消费侧 pairing 同步义务在单信号通知体列明。
4. **resolve() 环修采认（§6-2 方向定形）**：visited Set + 环判 gap 返 null（头注 gap 语义闭合，最小修形）；格 1 恶意 fixture = A/B 互环 + 存活 C.parentUuid=A 触发 resolve 形（段 0 三步链直译）。
5. 呈批书按本节预裁 + §6 必改钉成稿（fd 四点统一单 fd 签名收形由 Main 呈批细化）；批复后落码。

## §8 fd 链签名收形定形（2026-11-16，f4；Main §2-前置交付件裁定）

1. **总形采认 + 一处作用域钉死（关键）**：四点收形（:1061 fd.stat / :1066 scanner 加性 fd 参所有权归 caller / :1074 私有签名直改 + **autoClose:false 必钉采认** / :1081 fd.readFile）技术形全准——但「opts/env 门后唯一 fd 开点」**无条件开 fd 与 §7-2 分账 A 冲突**：默认臂若走 fd 链，rename-during-read 场景失败模式由「半旧半新静默交付」变「ino 复核报错」= 默认臂行为变，违反审计必改级 (a)「fd 分态仅授权面生效、恒等格严格成立」。**钉死：fd 链作用域 = opts 在场支**——任何 opts 传入（precompactSkip/maxBytes）即走 fd 链（open→fstat→四点全 fd→读毕 ino/size 复核）；**零 opts 默认臂保持既有 stat+readFile 路径形逐字节恒等含失败模式**（CLI 车道 = 用户自有文件威胁面，A 分账理由 (b)）。TUI 零 opts 调用恒走默认臂 = 恒等域；web readonly.ts:34 恒传 opts = fd 链域。`fs.open` 计数断言随作用域修正：opts 支 ==1 / 默认臂 ==0（路径形）。
2. **maxBytes 加性 opts 采认**：undefined = 不设界；检查点 = fstat 后立即、scanner 分叉前（授权支内 force-full 与分块两臂同受界，与发现③「载入前预解析尺寸界」定位一致）；超界抛 `TranscriptTooLargeError` 域内定型错，sessionStoreAdapter catch 映射 resourceLimit（消费回归腿①接口缝）——**映射层 message 安全化钉死（无盘路径/stack 入 web 错误，contract 错误面纪律）**。
3. **异常面采认**：fd.open 失败（ENOENT 等）原样上抛与现语义等价；close 仅 caller 所权支 finally；scanner 缺省臂自开自关形保留（attribution.ts/SDK 消费面零适配恒等）。
4. **格面外登记采认**：load.ts:521 readFile 属 loadTranscriptFromFile .json 旧格式 fallback 支（:471 .jsonl 恒委托 loadTranscriptFile，web replay 不触）——登记不动，f4 实锚 :471/:521 吻合。
5. **格面修正式**：格 2 fd 单开断言 = 授权支 fs.open 计数 ==1；格 4 恒等域断言 = 零 opts 默认臂既有 fixture 全量输出+失败模式恒等（fd 链零触碰默认臂）；格 3 maxBytes 腿 = opts-in 授权支。呈批书按本节成稿即批复落码。

## §9 PR #1 复核采认（2026-11-16，f4；PR head 197ce4f2，base master @bb759d6d，MERGEABLE）

1. **总判采认：PR 技术面符合 §7/§8 锁面判据**——全量 diff 逐项对表：fd 链作用域 = opts 在场支（`useFdChain = precompactSkip ?? maxBytes` 判据形吻合 §8-1 钉死形）；四点单 fd（stat→fd.stat / readTranscriptForLoad 加性 fd 参 caller 所权 / scanPreBoundaryMetadata 签名 + autoClose:false / readFile→fd.readFile）✓；maxBytes 检查点 = fstat 后 scanner 分叉前 ✓；`TranscriptTooLargeError`（message 安全化零盘路径/stack）+ `TranscriptChangedDuringReadError` 双域错贯穿 swallow-catch ✓；读毕 ino/size 复核 + finally close ✓；零 opts 默认臂 stat+readFile 路径形恒等（含失败模式，格 4 恒等域）✓；resolve() visited Set + 环→gap null ✓（格 1 测试 A/B 互环 + 存活 C 直译 §7-4 形）；.json fallback 零触碰 ✓；双采样守卫 = 叠加保留（b）✓。
2. **旗标 a 消除**：Bun `FileHandle.createReadStream` + `autoClose:false` 兼容性 f4 直证（fd 读面正确且调用后保持开放）——e2e gate 仍按 Main 建议补 node PTY 侧运行时腿实证。
3. **旗标 b 留 gate 对表**：格 2 单测已断言 ino/size 复核存在性；真实 rename-race 交付分态（replay=ioUnavailable retryable / follow=resetRequired）覆盖在 e2e gate 格 2 判定。
4. **canon 判读（f4 独立）**：PR 分支主 checkout 跑 = **6088 pass / 0 fail / 499 files 全绿零 skip**（= ca761a91 基线 6084 + 本波 4 新测试恰合）；tmp worktree 同 commit = 6080 pass / 8 skip / 0 fail——8 skip 定谳 = **位置依赖**（cwd 门控测试在 tmp worktree 触发跳过），非代码诱发（同 commit 两跑 0 fail、总数恰合）。消费侧所报 23,382/1 fail = `bun test tests/` 相对过滤扫 worktrees/ 旧副本（#294 族既有噪声，worktrees/atlas-family-p0 删除候裁在案），**非 canon 口径，不作为判定基准**。
5. **披露偏差采认**：web 错误映射落点 = runtime loadProjection 缝 + follow baseline 缝（sessionStoreAdapter 不在 loader 调用路径）——呈批书申报形，映射语义（resourceLimit / ioUnavailable retryable）吻合格面，采认。
6. **流程推进**：本节在案 → Atlas-reveiw PR 复核 → e2e gate（格 1-5 + 消费侧三腿接口对表）→ 段 L 0.1.118 候（前置 = GATE-PASS + f4 采认双在案）→ 生产 lane → 单信号回 Atlasweb-F4（G2 真实数据解阻）。角色注记：PR 由 AtlasWeb-F4 直接落码（用户裁定），gate/merge/release 归 Main 链。
