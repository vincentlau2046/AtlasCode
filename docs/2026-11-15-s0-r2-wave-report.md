# S0-R R-2 波报告（replay/follow 订阅机 + limits 全表 + cursor ledger）

日期：2026-11-15。工单 `docs/2026-11-15-atlasweb-s0-upstream-delivery-ticket.md` §4
+ 呈批书 `docs/2026-11-15-s0-ur-lockface-brief.md` §7.3-§7.5（f4 批复 @f1f1099d；
f4 §5.6 R-2 继续批准候披露）。序列：R-1（251d08c2）→ **本波 R-2** → R-3。

## 落码面

| 文件 | 内容 |
|---|---|
| `src/atlascode/web/follow.ts`（新） | FollowSubscription：poll 循环 + 事件队列 + lease + 终态优先序 + cursor 签发 + 增量尾读解析 + 半行保持 + reBaseline resetRequired 链 + interruptible sleep |
| `src/atlascode/web/cursorLedger.ts`（新） | opaque token 账本（issue/pin/unpin/verify 三态拒/LRU 淘未 pin 先 + onActiveEvict 回调/payload 界） |
| `src/atlascode/web/projection.ts`（新） | 中立投影（text/activity 块型）+ `computeLeafUuids`（load.ts:1187-1226 同规则镜像，增量路径复用）+ `projectConversation`（CLI 同规则链重建） |
| `src/atlascode/web/limits.ts` | §4.4 全表常量（pageSize/search/record/parse/projection/订阅/并发读/pending/时序类/ledger，DEFAULT+HARD 对 + 时序类 HARD_MIN） |
| `src/atlascode/web/sessionStoreAdapter.ts` | 接口扩 `statTranscript`（O(1) lstat 三元组）/`readTranscriptTail`（offset 起增量）/`resolveTranscriptPath`；实现抽 `openValidated` 共安全链（containment→lstat 锚→O_NOFOLLOW→S_ISREG→ino TOCTOU→size 界）+ `readFromFd`（64KiB chunk + abort 边界） |
| `src/atlascode/web/readonlyRuntime.ts` | `replaySession`（stat 尺寸界先于 loadFull + loadTranscriptFull force-full + projectConversation）/`followSession`（订阅槽 maxSubscriptions）/`limits: ResolvedLimits` 全表解析 / 并发读计数 / 实例级 CursorLedger / close 关停活跃订阅（closeDeadline race） |
| `src/engine/index.ts` | session 块尾补 `type ReadonlyTranscriptLoad` 导出（projection 消费） |

## 关键设计（呈批书钉死形落点）

- **采样序**：baseline = `resolveTranscriptPath`（adapter 同安全链）→
  `loadTranscriptFull`（§7.3 唯一修形复用形）→ stat 三元组锚定 offset/ino/mtime。
- **零重解析**：稳定文件 repeat poll = `statTranscript` O(1) 三元组守卫，
  ino/size/mtime 全同 → 零 read/零 parse/零事件（func 测试以尾读计数 spy 断言 0）。
- **不连续**：ino 变或 size < offset → `resetRequired` + 新 generation/baselineId
  + 重投影（旧消息不再采纳）。
- **半行**：无换行尾部 = pendingPartial 保持，不当完整记录；补全后 replacement。
- **corruptData**：非法完整行（JSON.parse 失败）→ 终态 error，不无限等待。
- **终态恰一**：rank 制 closed(4) > error(cancelled)(3) > 其余 error(2)；高可覆低；
  resetRequired 非终态。abort → error{code:'cancelled'}（contract ErrorEvent 联合，
  非独立 closed 变体）。
- **pending 界**：超界丢旧数据事件保最新 replacement；单事件超 maxProjectionBytes
  → resourceLimit 终态（不返回半投影）。
- **lease**：idle 超时 closed('lease expired')；消费 next()/renewLease() 重置；
  终态后 renewLease 拒 false。

## 验证

- 新测试 2 文件 21 件全绿：
  - `tests/unit/web-session-runtime-limits.test.ts` 9 件（冻结值全表/runtime
    limits 缺省解析/validateBoundedInt 判别/配置面界内界外）
  - `tests/func/web-session-runtime-follow.test.ts` 12 件（replay 投影 contract 形/
    baseline→replacement 增量/envelope schema/零重解析计数/半行/corruptData/
    resetRequired 新 generation/abort cancelled/lease 超时/订阅上限+释放/close 幂等）
- R-1 生命周期 18 件回归绿（fake adapter 补 statTranscript/readTranscriptTail/
  resolveTranscriptPath 三方法）。
- `npx tsc --noEmit` 0；`eslint src/` + 新测试文件 0。
- canon（CI=true FORCE_COLOR=3 bun test --isolate ./tests/）：
  **6020 pass / 0 fail / 494 文件**（R-1 基线 5999/0/492，Δ+21/+2 与预注册
  两文件恰合，无 skip 增量）。

## 预注册实数披露（f4 §5.6 纪律）

预注册「+2 文件 ~16 测试」→ 实数 **21**（canon Δ+21/+2 恰合，+5 加严方向）。
理由：lease 超时/
订阅槽释放/close 幂等三面各独立成件（预注册估计按合件计）；limits 判别面
NaN/Infinity/小数/负值逐值断言展开为循环内多断言（单文件 9 件非拆分虚胖——
每件独立 describe/test）。方向全为加严，无口径松弛。

## 偏离与裁定记录

1. **abort 终态编码**：呈批书 §7.5 终态优先序含 cancelled；contract 无独立
   cancelled 事件 kind（ErrorEvent error.code 联合含 cancelled）。落码取
   `error{code:'cancelled'}`，rank 3 语义保留。裁定：contract 形优先。
2. **limits 校验时点**：factory 构造时即校验（R-1 fs adapter maxTranscriptBytes
   同先例），非 start 时。§4.2「start 才验授权配置」指 scope 授权面，limits 为
   纯值校验面。
3. **`bun run check` 现状**：无 stdin 运行 exit 1（CLI prompt 校验错误，导入链
   全载后到达 argv 解析——非本波红；本波 src 变更均为类型级 + 新模块）。

## 后续

- R-3：`./web-session-runtime` 出口（package.json exports + build 脚本 + d.ts）
  + tests/func/web-session-runtime-fs.test.ts + web-session-runtime-pack.test.ts。
- U+R 合流段 G（e2e）/段 L（0.1.115+0.1.116 或 f4 另裁）。
