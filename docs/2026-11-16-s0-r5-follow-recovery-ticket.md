# S0-R5 工单——follow 恢复协议两缺口（② rewrite 误判 corruptData + ③ resumeCursor 零消费）

> 状态：`draft → Atlas-reveiw 审计 → f4 双信号`。f4 工单（2026-11-16）。
> 上游：登记档 docs/2026-11-16-s0-r5-follow-recovery-registration.md @2ef06607（消费侧 e2e P1 实测发现 + f4 活码实核吻合）；0.1.120 串行在前。

## §0 发现定位（f4 活码实核，登记档全采）

| # | 级别 | 发现 | 实核锚 |
|---|---|---|---|
| ② | 缺陷级 | 同 inode 变大 rewrite → corruptData 硬终流（应 resetRequired）——follow.ts:420 守卫 `st.ino !== anchorIno \|\| st.sizeBytes < offset` 单向查，size > offset 同 inode rewrite 漏过 → :425 旧 offset 尾读半行垃圾 → :393 unparseable → :463 corruptData closed | 订阅建立窗口内任何 rewrite 同形（baseline 先于 rewrite）；违 S0 总约 §4 |
| ③ | 契约-实现缺口 | resumeCursor 唯一现形 = webSessionV0.ts:87 契约 schema，runtime/follow 零接线——任意 cursor 一律 fresh baseline 静默续接 | 违 S0 总约 §3.2（须显式 resetRequired）；消费侧 HTTP 透传缝 @71c2208 已备 |

## §1 波定义

0.1.121 候：② 不连续判定面扩形（corruptData 收窄真损坏）+ ③ resumeCursor 接线（cursorExpired 分态兑现）→ e2e gate（格 1-4 + 消费侧探针矩阵五腿）→ 段 L → 生产 lane → 单信号 Atlasweb-F4。

## §2 修形纪律面（lock-face 必答前置）

- **修形点**：follow.ts 域内（增量读/守卫/baseline 面）+ readonlyRuntime resumeCursor 接线 + web 契约映射面；engine/session 域零触碰预期（lock-face 实核确认）。
- **② 判定面扩形三选一呈批**：(a) 内容面锚（baseline 采样时记 size+mtime+首尾哈希，尾读前比对——rewrite 必变内容锚）；(b) mtime+size 组合判别（同 inode 但 mtime 变于 baseline 后且非纯 append 形 → 重采样）；(c) 尾读垃圾即重采样（unparseable 时先做一次身份重采样复核再定 corruptData——保守兜底形）。f4 预倾向 (c)（最小守卫面扩形 + corruptData 收窄至「重采样后仍身份连续且真损坏」，假阳归零）；lock-face 终裁。
- **③ 分态定形呈批**：有效 cursor（ledger 在案且身份连续）→ 续接；cursorExpired（ledger 无此 cursor/身份不连续）→ **显式 resetRequired 分态 + 新 baseline**；契约错误面零扩形（resetRequired 既有分态）。
- 订阅窗口形（② 附加观察）并入 ② 同一判定面，禁单独补丁。

## §3 判据格（预注册框架，lock-face 细化）

| # | 格 |
|---|---|
| 1 | ② 格：消费探针矩阵复跑——rewrite→更小（resetRequired ✓ 回归）/ rewrite→更大（**resetRequired ✓ 修形目标**）/ 窗口内 rewrite（resetRequired ✓）/ 真损坏 fixture（corruptData ✓ 收窄不误吞）/ 正常 append（增量续接零触碰） |
| 2 | ③ 格：有效 cursor 续接（零重放零丢段）/ 过期 cursor → resetRequired 显式分态（禁静默 fresh baseline）/ 非法 cursor → 契约形拒 |
| 3 | 四面回归格：list/replay/search 零触碰 + follow 既有分态族（notFound/resourceLimit/ioUnavailable/cancelled）零变化 |
| 4 | canon 恰合 + 消费侧对表（透传缝 @71c2208 落地即生效腿） |

## §4 流程

本工单 → Atlas-reveiw 审计 → f4 双信号 → lock-face（② 三选一 + ③ 分态定形呈批）→ Main 落码 → e2e gate → 段 L 0.1.121 → 生产 lane → 单信号 Atlasweb-F4。

## §5 衔接注记

- 登记池「message 级复合 cursor」（S0-R4 ⑨）与 ③ 分页形同域——**候本波 lock-face 一并裁定**（并入或维持独立登记，呈批书表态）。
- 消费侧 G2 格 D 四面 + P0/P1 全绿不受本波影响（修形为分态收敛非面变更）；格 I 待用户授权独立推进。
