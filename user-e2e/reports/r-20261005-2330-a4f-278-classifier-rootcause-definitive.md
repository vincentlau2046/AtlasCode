# A4 分类器 e2e 不可达 —— 决定性根因（推翻「架构不可达」+「engine 门短路」两版结论）

- **结论**：分类器（yolo LLM）在 e2e 车道不可达 = **dev-build 产品 bug**（`should1hCacheTTL` 对非数组 allowlist 崩溃），**非**架构问题，**非** engine 门短路。
- **P0 封口判定**：小版本 bug 修（1 行防御）+ e2e 复验，**不需要** f4 原计划的架构波。
- **被测体**：master d64467c（dev source-direct，harness 直起 src）；S-024O（cls seed，Write→/tmp，shouldBlock:false）。
- **证据**：4 段诊断链（临时 src/ 诊断，跑完已 revert，master src/ 已回 d64467c 干净）+ 诊断 log `$CLAUDE_JOB_DIR/tmp/engine-gate-diag.log`。

---

## 4 段诊断链（决定性）

| # | 阶段（位置） | 观测 | 含义 |
|---|---|---|---|
| 1 | **engine 门**（`loopPermissionBridge.ts:82`） | `{allowed:false, ask:true}` reason=`workingDir`（"requested permissions to write to /tmp/...") | **f4 的 (B) 正确**：engine 门**不短路**，返 `ask` 落 TUI。我此前「engine 门快路径短路分类器」结论**错误**。 |
| 2 | **TUI auto-mode 支入口**（`permissions.ts:505`） | `resultBehavior=ask, tpcMode=auto, transcriptClassifier=true, isAutoModeActive=true, autoBlockEntered=true` | auto-mode 分类器支**真进入**（tpcMode=auto 生效，TRANSCRIPT_CLASSIFIER 默认开）。 |
| 3 | **分类器调用点**（`permissions.ts:671`） | `formatActionForClassifier` 返 TranscriptEntry（对象，符合契约）；`classifyYoloAction` 被调用 | 分类器**真被调**（非被 allowlist/acceptEdits fast-path 跳过）。 |
| 4 | **classifyYoloAction 抛错** | `TypeError: allowlist.some is not a function ('allowlist.some' is undefined)` @ `should1hCacheTTL(metadata.ts:160)` ← `getCacheControl(metadata.ts:114)` ← `buildClaudeMdMessage(yoloClassifier.ts:417)` | **分类器在 LLM 调用前同步崩溃**（~1ms，无 network）→ 抛错上抛 → TUI canUseTool 落回弹框（ask-reject，非分类器句）。 |

**proxy 侧佐证**（fault-proxy REQ 诊断，harness 已加）：S-024O 全程 `tool_choice=none toolsHasClassifyResult=false`，**无任何 classify_result REQ** —— 与「分类器抛错、从未发起 LLM 调用」完全自洽。

---

## 根因（精确）

`should1hCacheTTL`（`src/tui/services/api/metadata.ts:136-166`）：

```ts
let allowlist = getPromptCache1hAllowlist()   // dev-build stub → 返 {}（非数组）
if (allowlist === null) { ... allowlist = config.allowlist ?? [] }  // {} === null 为 false → 跳过
return querySource !== undefined && allowlist.some(pattern => ...)  // ({}).some → TypeError
```

- `getPromptCache1hAllowlist`（`src/tui/bootstrapState.ts:156`）是 **dev-build stub**：`(() => ({}))` → 调用返 **`{}`（空对象，非数组、非 null、非 undefined）**。
- guard `=== null` 漏接 `{}` → `allowlist` 保持 `{}` → `({}).some(...)` **TypeError**。
- 触发条件：① dev/source-direct build（stub 生效）；② TUI CWD 作用域内有 ATLAS.md/CLAUDE.md（`getCachedClaudeMdContent()` 非 null，`buildClaudeMdMessage` 走到 :417 调 `getCacheControl`）。二者同时满足 → 崩。
- 同族 stub `getPromptCache1hEligible`（bootstrapState.ts:157）返 `{}`：`!{}` 为 false（对象 truthy）→ 不早退，故走到 allowlist 支才炸（userEligible 支侥幸安全）。

**为何 prod 不现、e2e 现**：prod bundle 的 bootstrapState 是真实实现（`getPromptCache1hAllowlist` 返真数组），`should1hCacheTTL` 不崩；e2e 走 dev source-direct（stub 返 `{}`）才崩。

---

## 修（Main，1 行防御，非架构波）

`should1hCacheTTL`（metadata.ts:149-160）对非数组 allowlist 兜底（stub/真实双境安全，兼硬 prod）：

```ts
let allowlist = getPromptCache1hAllowlist()
if (!Array.isArray(allowlist)) {          // ← 改 === null 为 Array.isArray 兜底
  const config = getFeatureValue_CACHED_MAY_BE_STALE<{ allowlist?: string[] }>(
    'atlas_prompt_cache_1h_config', {})
  allowlist = config.allowlist ?? []
  setPromptCache1hAllowlist(allowlist)
}
```

（或在 `return` 处 `Array.isArray(allowlist) && allowlist.some(...)`。）

---

## P0 封口 / 版本影响

- **推翻两版旧结论**：① 「分类器架构不可达（engine 门不跑 yolo）」② 「engine 门快路径短路」。均错——engine 门正确返 ask、TUI auto-mode 支正确进入，唯一卡点 = dev stub 让 `should1hCacheTTL` 崩。
- **f4 原计划「架构波（engine 门路由 auto-mode 工具到 TUI 分类器）」大概率不必要**：路由本就正确，bug 在分类器的 cache-control 支（stub 崩溃）。架构波 spec 可砍或缩到本 1 行修。
- **P0 封口路径**：Main 落 1 行防御修（可 versionless 或折 0.1.27）→ e2e 复验 S-024N/O（分类器真 fire）→ #3 危险句 / #4 放行句现形 → 全 6 句 A4 绿。
- **e2e 侧**：波 A 基建（fault-proxy classify_result 注入 + mainLoop 脚本化 + S-024N/O 种子）已就绪，Main 修后 #4 即绿、S-024N 转 hard。
- **诊断卫生**：临时 src/ 诊断（loopPermissionBridge.ts + permissions.ts）已 `git checkout` 回 d64467c（master src/ 干净，`git diff --stat` 空）；fault-proxy REQ 诊断（harness，user-e2e/）保留（零 src/ 影响，可复用）。
