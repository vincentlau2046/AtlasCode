# S0-R5 登记档——follow 恢复协议两缺口（消费侧 e2e P1 实测发现；候选波）

> 状态：收口（0.1.122 B2 批量补记：所属波已完结并发布）

> f4 登记档（2026-11-16）。来源：Atlasweb-F4 消费面 e2e P1 实测（0.1.119 消费面，atlasweb-e2e-test 真实进程定谳）。工单成稿于波启动时。
> 排期候选：0.1.121 候（0.1.120 gate/段 L/生产 lane 串行在后，不抢）。

## §1 缺口②（缺陷级）：同 inode 变大 rewrite → corruptData 硬终流（应为 resetRequired）

- **f4 实核吻合**：follow.ts:420 不连续守卫 = `st.ino !== anchorIno || st.sizeBytes < offset`——同 inode truncate+write 变大 rewrite（ino 不变、size > offset）漏过守卫 → :425 旧 offset 起尾读 → 新文件旧 offset 后字节成半行垃圾 → :393 `unparseable complete record` → :463 `corruptData` closed 硬终态。
- **违总约**：S0 总约 §4——replace/truncate 应走 resetRequired 路径（「identity discontinuity」），corruptData 保留给真损坏。现形 = 身份不连续被误判数据损坏 + 流不可恢复（closed 终态）。
- **附加观察（消费侧）**：订阅建立窗口内（首个轮询周期前）任何 rewrite 均呈 corruptData 形——baseline 采样早于 rewrite，同守卫缺口。
- 消费侧不可修（engine 内部）；探针矩阵两侧对照在案（更小 → resetRequired ✓ / 更大 → corruptData ✗）。

## §2 缺口③（契约-实现缺口）：resumeCursor 契约面在、实现零消费

- **f4 实核吻合**：`resumeCursor` 唯一现形 = 契约 schema webSessionV0.ts:87；runtime JS/follow.d.ts 全无接线——任意 cursor 一律 fresh baseline（静默续接形）。
- **违总约**：S0 总约 §3.2——gap/reconnect/过期 cursor 须**显式 resetRequired 后新 baseline，不静默续接**；cursor ledger 已发 cursor 但断线携 cursor 重入无恢复语义（cursorExpired 分态缺席）。
- 消费侧已落 HTTP 透传缝（?cursor= → sessionHost.resumeCursor，@71c2208）——上游落地即生效。

## §3 候选形（波启动时 lock-face 定形，禁预答终形）

- ②：不连续判定面扩形——同 inode 变大 rewrite 的身份判别（内容面锚/mtime+size 组合/重采样比对形三选一呈批）；订阅窗口 rewrite 形并入同一判定；corruptData 收窄至真损坏（合法 JSONL 而身份连续）。
- ③：resumeCursor 接线——cursorExpired 分态兑现（过期/不连续 → resetRequired 显式分态 + 新 baseline；有效 → 续接），ledger 对表面。
- 两件同波单 lock-face（同域 follow 恢复协议）；gate 格含消费侧探针矩阵两形复跑（更小/更大/窗口内 rewrite/cursor 过期/cursor 有效五腿）。

## §4 队列

- 0.1.121 候，0.1.120 串行在后；与登记池既有件（S0-R3 §11 F1/F2 已落、pre-parse record 计数、message 级 cursor）异域不合并——follow 域独立波。
- 消费侧现状：格 D 四面 + E2E P0/P1 全绿（37/0 + e2e 35/35），G2 余格 I 待用户授权——本波不影响其既有绿面。
