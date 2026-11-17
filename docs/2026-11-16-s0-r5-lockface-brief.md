# S0-R5 lock-face 呈批书——follow 恢复协议两缺口修形

> 状态：收口（0.1.122 B2 批量补记：所属波已完结并发布）

> 呈批：Main lane（2026-11-16）。批复范围 = Atlas-reveiw 审计 §12
> （@739e464a，通过）+ 工单 §2（@9758ebd1）。双信号②已到。
> 上游：登记档 @2ef06607（消费侧 e2e P1 实测发现）。

## §1 Main 码面实核（lock-face 必答——四锚全实核吻合，行号随 0.1.120 微漂）

| 锚 | 实核 |
|---|---|
| ② 守卫单向查 | `src/atlascode/web/follow.ts:418` `if (st.ino !== anchorIno \|\| st.sizeBytes < offset)` —— size **>** offset 同 inode rewrite 漏过，:421 注释自证「不连续（truncate/atomic replace/compact）」意图面仅覆盖 shrink 族 |
| ② 终流链 | :463 `setTerminal(errorEvent('corruptData', r.corrupt))` ← ingestLines :392-397 `'unparseable complete record'`（旧 offset 尾读半行/垃圾 → JSON.parse 失败 → 硬终态，无重采样复核） |
| resetRequired 面 | issueBaseline :265+ 发 `kind: 'resetRequired'`（:16 头注：**非终态**）+ 新 generation/baseline——③ 分态复用既有形，契约错误面零扩形 |
| ③ 契约-实现缺口 | 契约 `webSessionV0.ts:87` resumeCursor optional（:177 CursorExpiredErrorSchema 已备）；runtime `readonlyRuntime.ts:165` FollowSessionRequest **无 resumeCursor 字段**；follow.ts FollowDeps 零消费——任意 cursor 一律 fresh baseline 静默续接，实核吻合登记档 |
| cursor ledger | `cursorLedger.ts` verify 三因 `unknown/expired/mismatch` 已备；`CursorBinding = {productId, scopeId, sessionId, baselineId, generation, revision}`——**无字节 offset/ino 字段**（③ 机制钉 binding 加性的落点） |

修形面确认：follow.ts + readonlyRuntime.ts（FollowSessionRequest 扩面 + followSession 接线）+ cursorLedger.ts（binding 加性）+ web 桥映射面（entry.ts 协议→runtime 透传）；engine/session 域零触碰（follow.ts 既有 `engine/session/readonly` 只读 import 边保持原样）。

## §2 焦点②修形终裁——(c) 尾读垃圾重采样兜底形（审计终裁采纳 + 3 定形钉）

**裁 (c)**：unparseable complete record 触发面唯一（钉 2）→ 先做**单次**身份重采样复核（全量重读 ≤ maxTranscriptBytes，钉 3 成本上界；禁重采样循环）→ **3-way 分类**（钉 1）：

1. 重采样后内容与既有投影 **prefix 异**（消息集不连续）→ `resetRequired` + 新 baseline（既有分态）；
2. 重采样后**全量可解析且 prefix 同**（垃圾为瞬态撕裂/半行竞态）→ 瞬态自愈，续接正常轮询（零终态）；
3. 重采样后**仍 unparseable** → `corruptData` 真损坏（终态收窄至此）。

- 钉 2：触发面唯一 = unparseable complete record；oversize 仍走既有 resourceLimit（:458/:431 不动）。
- 钉 3：单次重采样成本上界 ≤ maxTranscriptBytes（复用 baseline 装载路径既有有界读）。
- **假阴残余表态（§12-2 终裁登记不叠加）**：rewrite 产出合法 JSONL → 静默错流不设防——(c) 已把误判后果从「不可恢复硬终流」收敛为「可恢复分态」，内容锚叠加 O(file) 逐轮询不值；候消费侧实测反弹再议。
- 订阅窗口形并入 ② 同一判定面（工单 §2 附加观察），零单独补丁。

## §3 焦点③接线形——cursor token 绑字节 offset + ino 锚（§12-3 机制钉采纳）

- **binding 加性**：CursorBinding 扩 `{byteOffset: number, ino: number}`（加性面，既有五字段不动）；token 保持 opaque + **内部版本化**（token payload 版本字段 v1，升级 wire 不 breaking）。
- **续接形（零丢段零重放）**：followSession 携 resumeCursor → `ledger.verify` 三因判定：
  - **ok** → 内部全量 parse 至 `binding.byteOffset` 重建投影态（**不发 baseline 事件**——消费侧已持 projection，重发即重放违零重放）→ `offset = binding.byteOffset`、`anchorIno = binding.ino` → 进入既有轮询循环；断连窗 append 从 transcript 文件本身恢复（机制源 = 文件本身，§12 机制钉原文）。resume 起点即过 ② 同一判定面（offset 越界/ino 错配 → resetRequired 同形）。
  - **fail（unknown/expired/mismatch 三因统一）** → `resetRequired` **显式分态** + 新 baseline（既有形）——禁静默 fresh baseline（违 §3.2 缺口即本波销项本体）；message 分因可辨（三因 message 文本透传）。
  - capacity/TTL 淘汰 = cursorExpired 语义（既有 onActiveEvict/resetRequired 面 + verify expired 臂已备，零新机制）。
- **message 级 cursor 表态（§12-4 终裁采纳）**：独立登记 + 扩展位预留（binding 版本化字段即可容纳），**不并入本波**——并入 = 单波双语义扩形。

## §4 判据格（工单 §3 + §12-5 补腿 6 条）

| 格 | 腿 |
|---|---|
| 格 1（②） | rewrite→更小 resetRequired ✓（回归）/ rewrite→更大 resetRequired ✓（**修形目标**）/ 窗口内 rewrite resetRequired ✓ / 真损坏 fixture corruptData ✓（收窄不误吞）/ 正常 append 增量续接零触碰；**+腿 6** 瞬态撕裂行自愈零终态 / **+腿 7** 重采样分类两腿直证（prefix-同自愈腿 + prefix-异 resetRequired 腿 = 假阳归零可证伪形）/ **+腿 8** 重采样撞 maxTranscriptBytes → resourceLimit 归属（禁 corruptData 冒名） |
| 格 2（③） | 有效 cursor 续接零重放零丢段 / **三因各一腿**（unknown/expired/mismatch → resetRequired 显式分态 + 分因 message 可辨）/ **零丢段腿**：断连窗 append N 条 → 携 cursor 重入 N 条全达 / 非法 cursor → 契约形拒（CursorExpiredErrorSchema 面） |
| 格 3 | list/replay/search 零触碰 + follow 既有分态族（notFound/resourceLimit/ioUnavailable/cancelled）零变化 |
| 格 4 | canon 恰合 + 消费侧对表（透传缝 @71c2208 落地即生效腿） |

## §5 段 I 切片

- S1：② 重采样兜底（follow.ts 域内，判定面扩形 + 3-way 分类）+ 判据测试（格 1 八腿）。
- S2：③ cursor 接线（cursorLedger binding 加性 + readonlyRuntime resumeCursor + follow resume 支）+ 判据测试（格 2 六腿）。
- S3：web 桥映射面透传 + 格 3 回归 + 格 4 对表。

流程：本呈批书 → f4 批复 → 落码 → e2e gate → 段 L 0.1.121 → 生产 lane → 单信号 Atlasweb-F4。
