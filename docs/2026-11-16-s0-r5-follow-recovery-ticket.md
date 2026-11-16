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

## §12 Atlas-reveiw 审计闭环（2026-11-16，通过——(c) 成立附 3 定形钉 + ② 机制钉必答 + 假阴残余登记 1 + 格补腿 6 条；@9758ebd1+@2ef06607 全锚实核）

1. **焦点① 采认 + (c) 终裁**：(b) 结构性不足直证（stat 三面全同不可判 append vs rewrite）/(a) 仍需兜底且 O(file) 逐轮询——(c) = 最小完备形终裁。**3 定形钉采认钉死**：钉 1 = 重采样后 3-way 分类（prefix 异→resetRequired / 全量可解析且 prefix 同→续接瞬态自愈 / 仍 unparseable→corruptData 真损坏；禁重采样循环单次即终态）；钉 2 = 触发面唯一（unparseable complete record；oversize 走既有 resourceLimit）；钉 3 = 成本上界单次重采样 ≤ maxTranscriptBytes。
2. **假阴残余裁定（f4 终裁 = 登记不叠加）**：rewrite 产出合法 JSONL → 静默错流不设防——(c) 已把误判后果从「不可恢复硬终流」收敛为「可恢复分态」，残余触发面工程概率极低；内容锚叠加逐轮询 O(file) 成本不值。呈批书表态登记，候消费侧实测反弹再议。
3. **焦点② 机制钉采认（必答，lock-face 核心新增）**：cursor token 绑 **字节 offset + ino 锚**（binding 加性面）——续接 = 该 offset 起尾读且过 ② 同一判定面（断连窗事件从 transcript 文件本身恢复 = 零丢段零重放机制源）；**三分态钉** = ledger verify 三因 unknown/expired/mismatch 统一 → resetRequired 显式分态（message 分因可辨），禁静默 fresh baseline；capacity/TTL 淘汰 = cursorExpired 语义（bounded 机械已在）；token opaque + 内部版本化。
4. **焦点③ 裁定（f4 终裁 = 维持独立登记）**：message 级 cursor 改粒度语义（token 键位/恢复源），并入 = 单波双语义扩形；③ 落地预留 token 内部版本化字段 + binding 可扩展位，升级 wire 不 breaking。呈批书表态「独立登记 + 扩展位预留」。
5. **格补腿采认**：格 1 +腿 6（瞬态撕裂行自愈零终态）/腿 7（重采样分类两腿直证 = 假阳归零可证伪形）/腿 8（重采样撞 maxTranscriptBytes → resourceLimit 归属，禁 corruptData 冒名）；格 2 + 三因各一腿 + 零丢段腿（断连窗 append N 条 → 携 cursor 重入 N 条全达）。
6. **流程推进**：审计通过 + 本节在案 → **双信号②发 Main**（lock-face 呈批书按 §12 成文）→ 落码 → gate → 段 L 0.1.121 → 生产 lane → 单信号 Atlasweb-F4。0.1.122 docs-only 另案不审 ✓。
