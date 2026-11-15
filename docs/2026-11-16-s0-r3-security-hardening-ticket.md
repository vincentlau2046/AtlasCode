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
