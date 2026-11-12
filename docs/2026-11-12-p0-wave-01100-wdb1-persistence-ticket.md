# 0.1.100 W-D-B-1 持久化面工单（序 6）——team file schema + member registry + durable inbox/task store

> 状态：`draft → 波前审视 → Atlas-reveiw 审计 → f4 双信号`。f4 工单（2026-11-12）。
> 上游：0.1.99 五段闭环终态（S1a 全闭，序 4 ✅）；序 5 已核销（0.1.88 R-087-2-FAMILY aab9b62c「Gap B 核销」——charter §10 行陈旧，本次销项）。
> 依据：W-D 团队协作设计稿 §105 行 3 + 0.1.93 工单 §21/§89 F1 裁定（Form A 零持久 → durable 归 W-D-B-1）。

## §0 波前审视（活码实核 @ master 7bb1c66e，f4 2026-11-12）

| 面 | 现状 | 缺口定性 |
|---|---|---|
| team file | **Form A 零持久在位**：teamCreateTool Form A 门 ON 不落盘（teamCreateTool.ts:261-267 注记「durable 面恢复时随 TeamServicesFile 回填」）；teamDeletePrompt 文案仍写「Removes the team directory」= 与零持久现况的文案漂移面 | durable 化本波核心；文案漂移顺带修 |
| member registry | 成员花名册居 lead teamContext 内存（Form A 零持久注释自证）；headless 引擎 lane teamContext 落 teamServices 内存 store（A1 单源错配家族根因面） | 进程退出 = 花名册失存；resume relink 无基座 |
| inbox | mailbox 内存 store + `~/.atlas/teams/<name>/inboxes/*.json` 文件面并存（TeamDelete 清面 rm inboxes）；tmux 车道同 inbox 文件（C-1 未收敛面延续） | durable inbox = 文件面为基座 or 内存+flush，lock-face 定形 |
| task store | taskState（abort/isIdle/shutdownRequested）内存；teams tasks 面 TEAMS-TASKS-ZERO-DIFF 判据在 e2e | durable task store 范围 lock-face 裁定 |
| schema 遗产 | 0.1.36 swarm TeamFile schema 遗产关系未清（设计稿锁面隐藏面⑤并入本波 schema 面） | schema 演进/resume relink = 独立 gate 风险域（设计稿 §105 原注） |

## §1 波定义

- **波名**：W-D-B-1 持久化面。**版本**：0.1.100。
- **范围**：① team file schema 定形（含 0.1.36 TeamFile 遗产归一）+ Form A durable 化（写入回读者配套，消孤儿破口）；② member registry durable 面（resume relink 基座）；③ durable inbox 定形（含 tmux 双车道同源约束）；④ durable task store 范围裁定。
- **非目标**：AgentCreate 工具/spawn 触发点（= 卷 4 契约插桩后 W-D-B-2）；UDS；TUI 面。
- **性质**：③能力波（设计密集——schema 演进 + resume relink 独立 gate，设计稿 §105 原判）。

## §2 Global Constraints

1. **零持久现况为默认回落**：durable 面全加性——Form A 门语义不变（OFF 仍零写盘），ON 也不得破坏现网行为（atlascode 默认身份字节级不变格承 0.1.99）。
2. **孤儿破口禁令延续**（0.1.93 F1）：有写入必有回读者 + 孤儿清理面，禁写不读。
3. **单源纪律**：schema 单源 mailbox.ts 同族（结构化消息面单一事实源）；team file schema 单源新文件；禁双副本（W-D-B tui/utils 双副本教训）。
4. **判别源双源化域级纪律延续**（A1 §13）：持久层读写点禁裸单源 lane 判据。
5. row F 预注册；Atlas-reveiw 波前审计；判据面随 lock-face 冻结先于落码。

## §3 工作段

- **段 D lock-face（设计核心，必答）**：① schema 形（team file 字段集 + 版本字段 + 演进策略——0.1.36 遗产归一或弃置定谳）；② durable 触发时机（写入时点/flush 频率/崩溃窗口语义）；③ member registry relink 形（lead 重启后成员重挂接 vs 重建，半挂接态 fail-visible）；④ durable inbox 载体（文件面基座 vs 内存+flush）+ tmux 双车道同源；⑤ task store 范围（全量 vs 最小集）；⑥ TeamDelete/TeamCreate 与持久面交互（清面语义扩展）。
- **段 I 落码** + **段 G gate**（前滚 standing 0.1.99 面 + 本波判据：durable 往返格〔写→读→relink〕+ 孤儿清理格 + schema 演进格〔旧文件读入〕+ 崩溃窗口格 + tmux 双车道同源格 + atlascode 默认恒等格）+ canon 净域。
- **段 L**：release 0.1.100（OIDC 视确认态；gitcode 双平台例行步）。

## §4 Review Focus（Atlas-reveiw 焦点建议）

1. 加性回落完整性：Form A OFF 语义 + atlascode 默认身份零行为差是否可被实现形破坏（0.1.99 provider 槽注入面交互）。
2. schema 演进策略：版本字段缺失旧文件的行为（拒读 vs 降级 vs 迁移）。
3. resume relink 半挂接态（成员文件在/进程不在）fail-visible 完整性。
4. durable inbox 与 mailbox 单源纪律交互（双副本风险回归面）。
5. 崩溃窗口语义（写一半 = partial state）定形。

## §5 流程

本工单 → Atlas-reveiw 审计 → f4 双信号 → Main 段 D lock-face → 段 I → 段 G → 段 L → f4 收口。row F 全程。
