# P0 封口方案：A4 classifier 2 句 e2e 强制（e2e 基建波 + #3 产品波）

> 状态：**spec（f4 出，2026-10-05 用户拍板修订版，待落地；2026-10-06 根因定因后重构 §4/§5/§6，现为本地草案）**。
> **用户拍板（2026-10-05，两条）**：① **#3 危险句经「分类器拦截→ASK 产品路径」强制**（非 e2e 拒绝上限回退口径）→ 需开**产品波**；② **live-gateway e2e 基建波现在开**（e2e 侧实施）。
> 性质拆分：**波 A = e2e 测试基建（零 src/，不占产品版本号，类 0.1.17，现在开）** + **波 C = 产品波（src/，占一个 0.1.x 号，Main 实施）**。P0 封口（Option B 全 6 句绿）= 波 A（#4 绿）+ 波 C（#3 可达）+ e2e 复验 #3 现形后达成。
> **用户裁定 #5（2026-10-05 根因定因后，本 spec §4 据此重构）**：0.1.27 = **metadata 崩修 + 波 C 合并**（同一列车）。根因 = `getPromptCache1h*` dev stub 返 `{}` → `should1hCacheTTL` `allowlist.some` 崩 → 分类器 `unavailable:true` 恒 deny → **#3+#4 两句共同被挡**（非仅 #3；**非 engine 门路由，架构波已证伪**）。崩修 = `src/tui/services/api/metadata.ts` 1 处防御（Main lane）；合 `d64467c`（波 C 拦截→ASK）同 0.1.27。崩修后 e2e 复验 S-024N/O 全 6 句绿 → 封 P0。**BR-8 品牌波仍 0.1.28（不动）**。
> 判据事实源：`docs/2026-10-05-p0-closure-status.md` §2.4/§3（Option B 裁定链）；本文件给机制 + 白盒 + 两波分工 + 时序；**根因一手 = `user-e2e/reports/r-20261005-2330-a4f-278-classifier-rootcause-definitive.md` + f4 白盒 + `dist/cli.js:123455`（prod 证）**。

---

## 1. 缺口（P0 封口 = 全 6 句 A4 e2e 绿）

P0 封口的 6 句 A4「why」句式（`permissionVerdict.ts:50` `verdictLine`），0.1.26 后 4/6 已 e2e 绿（生产 lane PASS，2026-10-05）：

| # | 句 | 判据面 | 状态 |
|---|---|---|---|
| 1 | rule(ask/deny) `Rule "<v>" from <src> requires confirmation.` | ASK 弹框 verdict 行 | ✅ 0.1.24/0.1.25 |
| 2 | rule(allow) `Allowed by rule "<v>" (<src>).` | 成功卡 | ✅ 0.1.26（R2 数据侧） |
| 3 | **classifier 危险** `Auto mode: classifier flagged this as dangerous.` | ASK 弹框 verdict 行 | ⏳ **0.1.27（metadata 崩修 + 波 C 拦截→ASK）** |
| 4 | **classifier 自动放行** `Auto-approved by classifier: <reason>.` | 成功卡 | ⏳ **0.1.27（metadata 崩修 + 波 A 种子）** |
| 5 | mode `<modeLabel> mode requires confirmation for <tool>.` | ASK 弹框 verdict 行 | ✅ 0.1.26 |
| 6 | bypass `Bypass mode — all commands allowed.` | 成功卡 | ✅ 0.1.26 |

剩余空洞 = classifier 2 句（#3/#4）。**两句共同前置 = metadata 崩修**（分类器恒崩 → `unavailable:true` 恒 deny → 两句都到不了分类器产出，见 §4 C.0）。**用户拍板：#3 走产品波（波 C）、#4 走 e2e 基建（波 A），本 spec 一并覆盖 P0 封口全路径；用户裁定 #5 = metadata 崩修 + 波 C 合并 0.1.27。**

---

## 2. 白盒机制（spec 依据，跟到一手来源）

### 2.1 分类器调用链（默认单阶段 tool_use 路径）

`auto` 模式 + `feature('TRANSCRIPT_CLASSIFIER')`(ON_BY_DEFAULT) + 无命中规则 → `permissions.ts:649` `classifyYoloAction`（`yoloClassifier.ts:926`）。**默认 = 单阶段 tool_use**（两阶段 XML 走 GrowthBook，默认 off）。请求经 `sideQuery`（`sideQuery.ts:115`）→ `modelprovider.buildOpenAIParams` → 网关 8999（OpenAI SDK，deepseek-v4-pro）。请求特征（**识别面**）：`tools:[classify_result]`（`YOLO_CLASSIFIER_TOOL_NAME='classify_result'`，`yoloClassifier.ts:208`）+ `tool_choice:{type:'tool',name:'classify_result'}`（`:1068`）+ `temperature:0` + `querySource:'auto_mode'`；model 恒 = 主循环模型（`getClassifierModel()`→`getMainLoopModel()`，`:1225`）。响应解析：`extractToolUseBlock(content,'classify_result')` + `parseClassifierResponse(block, schema)`，schema=`{thinking,shouldBlock,reason}`（`:199-206`）；`shouldBlock` 判拦截/放行。

### 2.2 识别面（分类器调用 vs 主循环调用）

`fault-proxy.ts` **已缓冲请求体**（`fault-proxy.ts:104-107`），当前仅用 `body.length` 记 log，未解析体。扩展点：解析 `body.tool_choice?.name`（或 `body.tools[].function.name`）——**分类器调用** `tool_choice.name==='classify_result'`（主循环永不发此内部工具）；**主循环**无此工具。⇒ 代理可**只脚本化分类器调用、其余原样转发 8999**（主循环仍 live）。这是「真会话 + 确定性分类器」的关键。

### 2.3 两句各自的可达路径（白盒结论，用户拍板据此拆两波）

- **#4 自动放行**（`shouldBlock:false`）→ `behavior:'allow'` + `decisionReason:{type:'classifier'}`（`permissions.ts:770-778`）→ `useCanUseTool.tsx:47 setYoloClassifierApproval(toolUseID, reason)` → 成功卡 `UserToolSuccessMessage.tsx:123` 渲染 `Auto-approved by classifier: <reason>.`。**e2e 基建直接可强制**（脚本 `shouldBlock:false`）。
- **#3 危险**（`shouldBlock:true`）：⚠️ **平铺拦截是 `behavior:'deny'`**（`permissions.ts:755-763`，产 `buildYoloRejectionMessage` 拒绝文案，**不进 ASK 弹框**）。A4 危险句**只在 ASK 弹框**（`BashPermissionRequest.tsx:427`，`verdictLine(...,classifierAutoApproved=false)`）渲染。当前**唯一可达的「ASK 带 classifier decisionReason」面 = 拒绝上限回退**（`handleDenialLimitExceeded` `permissions.ts:836`，`DENIAL_LIMITS.maxConsecutive=3` `denialTracking.ts:12` → 3 连拦触发 → ASK 弹框）。
  - **用户拍板**：拒绝上限回退**不算** #3 的正当 e2e 口径 → **#3 需产品波（波 C）把「拦截」改成「ASK 弹框」，让危险句成为一等可达句**（steerable-trust：分类器 objection 现形给用户裁决，而非静默 deny 或事后回退）。

---

## 3. 波 A：live-gateway e2e 基建（**现在开** · e2e 侧 · 零 src/ · 不占产品号）

> 目标：#4 自动放行 e2e 绿 + 沉淀「分类器调用脚本化」基建（供波 C 落地后 e2e 验 #3）。

### A. `user-e2e/loop-robustness/fault-proxy.ts` 扩展（脚本化 LLM 响应：分类器 + 主循环工具选择）

加性扩展 `FaultPlan`（不动既有 500/drop/empty/delay 注障语义）。**用户拍板全确定性 → 代理须脚本化两处 LLM 输出**（分类器判定 + 主循环工具选择），而非仅分类器（修正 spec 早期「只脚本化分类器、主循环仍 live」表述）：

```ts
export interface ClassifierScript {       // classify_result 调用脚本化
  toolName?: string                       // 识别面，默认 'classify_result'
  shouldBlock: boolean
  reason: string                          // → decisionReason.reason
  thinking?: string                       // schema 必填，占位
}
export interface MainLoopScript {         // 主循环 chat.completions 工具选择脚本化
  toolName: string                        // e.g. 'Write'
  arguments: Record<string, unknown>      // e.g. {file_path:'/tmp/...', content:'hello'}
  count?: number                          // 前 N 次主循环调用注入此 tool_use；缺省=1
}
export interface FaultPlan { /* …既有 */ classifier?: ClassifierScript; mainLoop?: MainLoopScript }
```

代理 `end` 处理器（`fault-proxy.ts:106`）转发前插入分叉：解析 body →
- 若是 **分类器调用**（`tool_choice.function.name==='classify_result'` 或 `tools[].function.name==='classify_result'`，e2e 已实施 `detectClassifier`）且 `plan.classifier` 存在 → 回 `scriptedClassifierCompletion`（`tool_calls` 携 `classify_result {thinking,shouldBlock,reason}`，`shouldBlock`/`reason` 来自 `plan.classifier`），不转发。
- 若是 **主循环调用**（非分类器）且 `plan.mainLoop` 存在且在 count 内 → 回脚本化 `tool_calls:[{function:{name:plan.mainLoop.toolName, arguments: JSON.stringify(plan.mainLoop.arguments)}}]`（让 agent 确定性发起该 tool_use），不转发。超出 count 的主循环调用按既有 plan（nominal=转发 8999 live / 注障）。
- 否则按既有 plan（nominal=转发 8999 / 500/drop/empty/delay 注障）。

分类器脚本体（OpenAI chat.completion，`tool_calls[].function.arguments` 为 **JSON 字符串**，schema `yoloClassifier.ts:199`）：

```json
{ "id":"scripted-classifier","object":"chat.completion","model":"injected-classifier",
  "choices":[{"index":0,"message":{"role":"assistant","content":null,
    "tool_calls":[{"id":"call_cls_0","type":"function",
      "function":{"name":"classify_result","arguments":"{\"thinking\":\"…\",\"shouldBlock\":<bool>,\"reason\":\"<reason>\"}"}}]},
    "finish_reason":"tool_calls"}],
  "usage":{"prompt_tokens":0,"completion_tokens":0,"total_tokens":0} }
```

### B. `user-e2e/tui-diff/accept.ts` A4F 探针 + 种子设计（全确定性，用户 2026-10-05 拍板）

1. **新 seed `cls`**：起 `startFaultProxy({port:8998, target:'http://127.0.0.1:8999', plan:{kind:'nominal', classifier:{shouldBlock:false, reason:"<mock 安全理由>"}, mainLoopScript:<见 B.2>}})` + 沙箱 `settings.providers.iff.baseURL=http://127.0.0.1:8998/v1`。

2. **S-024O（#4 自动放行）= 全确定性种子**（用户拍板「全确定」）：
   - **种子工具 = FileWrite（wire name `Write`，input `{file_path, content}`）写 CWD 外 `/tmp/atlas-a4f-cls-safe.txt`**。白盒已证（e2e 发现 + f4 复核）：① **Bash 永不进分类器**（`BashTool.ts:107 toAutoClassifierInput:()=>''` → `actionCompact===''` 短路返 "no classifier-relevant input"，无 LLM 调用）→ Bash 种子（旧 spec `touch`）**作废**；② FileWrite `toAutoClassifierInput=${file_path}: ${content}`（非空）+ CWD 外写 acceptEdits 返 `ask`（非 `allow`，`permissions.ts:578-629` acceptEdits fast-path 不命中）→ **落分类器**。
   - **全确定性 = fault-proxy 同时脚本化两处 LLM 输出**（修正 spec 早期「主循环仍 8999 live」表述）：① **主循环第 1 次 chat.completions** → 注入固定 `tool_calls:[{function:{name:'Write', arguments: JSON.stringify({file_path:'/tmp/atlas-a4f-cls-safe.txt', content:'hello'})}}]`（让 agent 确定性地发起 Write→/tmp，而非 live 模型自由选 Bash echo / 拒绝 CWD 外写）；② **classify_result 调用** → 注入 `shouldBlock:false, reason:"<mock 安全理由>"`。**产品码 100% 真实**（引擎执行 Write + `classifyYoloAction` 解析 + 权限分支 `permissions.ts:770-778` allow + `useCanUseTool.tsx:47 setYoloClassifierApproval` + UI 成功卡），仅两处 LLM 输出被脚本化（= 本波要消除的非确定性）。
   - `A4-classifier-approved` 探针 `softTriggers` 删 `false`（转 hard），断言 `/Auto-?approved\s+by\s+classifier\s*:/`。S-024O 由是**构建性绿**（非 flaky 重跑到绿）。
   - **主循环脚本化识别面**：第 1 次（或前 N 次，按场景）非 `classify_result` 的 chat.completions → 注入 Write tool_use；后续主循环调用可放行 live（或继续脚本化，按场景需要）。识别须稳健（避免误命中分类器调用）——实施时白盒核 `tools`/`tool_choice` 区分。

3. **S-024N（#3 危险）**：本波**留 INCONCLUSIVE**（产品波 C 未落，平铺仍 deny 不进弹框）；保留实跑留证。**波 C 落地后**：S-024N 改主循环脚本「连发 3 个会被分类器拦的 tool_use」+ classify_result `shouldBlock:true` → 拦截经波 C 进 ASK 弹框 → `A4-classifier-dangerous` 探针转 hard，断言 `/classifier\s+flagged\s+this\s+as\s+dangerous/`。

4. 既有 4 硬句（a4rallow/a4bypass/A4-mode/a1danger）不动（0.1.26 已绿，回归核用）。

### C. 波 A gate

- **gate = #4（`A4-classifier-approved`）e2e 绿** + 控制面（auto seed 现形）全 ✅ + S-A 不回归 + 4 既有硬句不回归。
- #3 不在本波 gate（等波 C）。

---

## 4. 0.1.27 = metadata 崩修 + 波 C（src/ · Main 实施 · 占一个 0.1.x 号）

> 目标：P0 封口（全 6 句 A4 绿）前置 = ① **堵分类器 prod 恒崩**（metadata 崩修，#3+#4 共同前置）② **波 C 让 #3 危险句成为一等可达 ASK 面**（steerable-trust）。**用户裁定 #5（2026-10-05 根因定因后）= 两者合并 0.1.27**（BR-8 品牌波仍 0.1.28）。

### C.0 根因（e2e 定因 2026-10-05 + f4 白盒 + dist 证）：分类器 prod 恒崩

- **现象**：A4 分类器 2 句（#3 危险 / #4 自动放行）**全**不可达——分类器在 e2e 车道**从不 fire**（proxy log 无 `classifier=inject`），恒 fail-closed deny。**不止 #3，#4 也被挡**（崩点在分类器产出之前，`shouldBlock:false` 也到不了）。
- **根因**：`getPromptCache1hAllowlist`/`getPromptCache1hEligible` dev stub（`src/tui/bootstrapState.ts:156-157`）返 `{}`（**非 null**）→ `should1hCacheTTL`（`src/tui/services/api/metadata.ts:136-166`）两处 `=== null` 守卫**全不触发**（`{}` ≠ null）→ `userEligible={}` 为 truthy 绕过 `:145 if(!userEligible) return false` 早退 → `allowlist={}` 到 `:160 allowlist.some(...)` → **`TypeError: allowlist.some is not a function`**。
- **崩点传播链**：`yoloClassifier.ts:947 buildClaudeMdMessage → :417 getCacheControl({querySource:'auto_mode'}) → metadata.ts:114 should1hCacheTTL → :160 崩` → catch（`:870` / `:1167`）→ `unavailable:true`（**分类器没到 LLM 调用就被崩断**，故 proxy 无 classifier 记录）。**落回形态（e2e 23:30 诊断口径，gate 等价、修法不变）**：交互 TUI 面 `unavailable` → 落回普通 ASK 弹框（未批 = deny 等价，`classifyYoloAction` throw → TUI canUseTool ask 支）；headless / `unavailable` 支 = fail-closed 硬 deny。两路都**产不出** `decisionReason:{type:'classifier'}` → #3/#4 句均不可达（§1 表）。
- **架构波证伪**：早先「engine 门 `loopPermissionBridge.ts:83` 快路径 `if(!verdict.ask) return verdict` 短路分类器」假说被 e2e 微诊断推翻——engine 门对 CWD-外 FileWrite（auto 模式、无规则命中）返 `{allowed:false, ask:true}` → 路由 TUI canUseTool → 分类器**应** fire；真因 = 上述 metadata 崩（分类器 self-crash），**非路由缺口**。∴ 「架构波（engine 门路由）」缩为 **metadata 1 处防御修**。
- **prod P0**：`dist/cli.js:123455`（`getPromptCache1hAllowlist = () => ({})`、`getPromptCache1hEligible = () => ({})`）+ 崩点 `:272449`/`:272456` 证实 **npm 0.1.26 已带此崩**（auto-mode 分类器 prod 全断）。

### C.1 metadata 崩修（1 处防御 · 加性 · 零行为副作用）

`src/tui/services/api/metadata.ts` `should1hCacheTTL` 加两守卫：
- `:140` 后：`if (typeof userEligible !== 'boolean') userEligible = false`（stub 返 `{}` → 归 false → `:145` 早退返 false，**根本不进崩点**）。
- `:149-156` 后：`if (!Array.isArray(allowlist)) allowlist = []`（非数组回落空表，`.some` 不崩；纵深防御）。
= 关闭已坏的 1h-TTL 特性 + 堵崩（该特性在此 build 本就 GrowthBook stub 死，1h TTL 恒不生效，修后行为等价于「特性关」）。**红线外**（`services/api`，非 TUI 四红线目录 `src/engine/query/` + `src/tui/utils/permissions/` 主路径；属产品崩修）。

### C.2 波 C：「分类器拦截→ASK」判定体（`d64467c`，已在 master 未发）

`src/tui/utils/permissions/permissions.ts` 的 shouldBlock 支（`:752-782`）：auto 模式分类器拦截时，由 `behavior:'deny'`（静默拒绝）改为 **`behavior:'ask'` + `decisionReason:{type:'classifier',classifier:'auto-mode',reason}`** → ASK 弹框现形 + `verdictLine` 渲染 `Auto mode: classifier flagged this as dangerous.`（用户可覆盖放行或拒绝）。
- **headless / `shouldAvoidPermissionPrompts`**：无法弹框时**仍 deny**（对齐既有 `transcriptTooLong`/`unavailable` 分支 headless 兜底，`permissions.ts:688-713`）；铁闸门 fail-closed 语义不变。
- **拒绝上限回退**（`:836`）零改动（`DENIAL_LIMITS.maxConsecutive=3` 上限面仍升级面，单测 C-4/C-5 钉死）。
- **判定体独立评审（安全相关）已过**：f4 白盒核 7 例判别单测（`tests/unit/tui-classifier-intercept-ask.test.ts` C-1..C-7 RED→GREEN）+ 安全姿态 + denial-limit。master 口径四件套 3526/0/245（d64467c 2 文件 +282/−2）。
- **安全影响**：auto 模式分类器拦截由「硬 deny」变「用户可覆盖的 ASK」= 最小放宽（**仅 available 时**；unavailable/headless 仍 fail-closed 硬 deny，f4 默认推荐，用户 2026-10-05 已选此路径）。**低影响备记（不预启）= 保持 deny 但在拒绝面加 A4「why」verdict 行（`buildYoloRejectionMessage` 邻加 `verdictLine`），#3 句现形但不改安全姿态**——若用户在意 auto 安全门强度可切此路。

### C.3 版本 / 时序（用户裁定 #5，2026-10-05）

- **0.1.27 = metadata 崩修（C.1）+ 波 C（C.2）合并**（同一列车，占一个 0.1.x 号，四件套 + 回归 + 发布，一 wave 一版）。**BR-8 品牌波仍 0.1.28**（brand session 已同步 `634d9b5`，不动）。
- 红线：metadata 崩修 + 波 C 均**产品行为波**（非 TUI 差异化四红线约束的 P0a/P0b/P1a 投影面）；判定体改动（波 C）须独立评审（安全相关，已 C.2）。
- **崩修是 #3+#4 共同前置**：不崩修，波 A 种子（#4）+ 波 C 拦截（#3）都到不了分类器产出 → **修后 e2e 复验 S-024N/O 全 6 句绿才封 P0**（§5）。

---

## 5. P0 封口时序（Option B：全 6 句绿）

1. **波 A**（e2e 基建，**已就绪**，e2e 侧）：#4 全确定性种子 + 分类器脚本化基建（`ClassifierScript`/`MainLoopScript`/`detectClassifier` + accept.ts `cls` seed，e2e 已实施）。
2. **0.1.27 = metadata 崩修 + 波 C**（产品，Main 实施，**拉前于 BR-8**）：① metadata 崩修（#3+#4 共同前置，C.1）② 波 C 拦截→ASK（#3 一等可达，C.2，`d64467c` 合列车）。四件套 + 发布 + prod dist 崩点核验。
3. **e2e 复跑 A4F（对 Main 新 0.1.27 commit，探针 `a4cls`/`a4clsa` 转 hard 是跑时动作）**：崩修后分类器真 fire → 脚本 `shouldBlock:false`（#4 绿）+ 波 C 拦截 + `shouldBlock:true`（#3 绿）+ 4 既有硬句 + 控制面（S-024K）+ S-A（P0a 单跑）不回归 → **全 6 句 A4 e2e 绿 → 封 P0（Option B 满足，0.1.27 达成）**。BR-8 品牌波 = 0.1.28。

---

## 6. 前置 / 风险 / 漂移 / 待用户

- **前置①：网关 8999 UP**。**全确定性模式下主循环工具选择被脚本化（第 1 次 Write tool_use），但 Write 执行后的后续主循环调用仍转发 8999 live**（e.g. agent 收到 Write 成功后的总结回复）→ 网关仍须 UP；且会话启动须 live 模型能完成首轮握手（即便第 1 个 chat.completions 被脚本化，请求仍经代理透传到 gateway 鉴权面）。跑前核 `atlascode-gateway-status`。
- **前置②（已解，白盒钉死）**：种子工具 = **FileWrite 写 CWD 外 `/tmp/...`**（非 Bash——`BashTool.toAutoClassifierInput:()=>''` 永不进分类器；非 CWD 内写——acceptEdits fast-path `permissions.ts:578-629` 会 `allow` 跳过分类器）。FileWrite `toAutoClassifierInput` 非空 + CWD 外 acceptEdits 返 `ask` → 落 `classifyYoloAction`。**主循环工具选择脚本化**（fault-proxy 注入 Write tool_use）消除「live 模型改用 Bash echo / 拒绝 CWD 外写」的非确定性。
- **前置③（根因定因 2026-10-05，e2e 23:30 + f4 白盒 + dist 证）**：**metadata 崩修 = 分类器 fire 的硬前置**（§4 C.0）。`getPromptCache1h*` dev stub 返 `{}` → `should1hCacheTTL` 崩 → 分类器 `unavailable` → #3+#4 共同不可达。**崩修未落 → 波 A（#4）+ 波 C（#3）种子都到不了分类器产出**；崩修 + 波 C 合 0.1.27（用户裁定 #5）→ 崩修后 e2e 复验才可能全 6 句绿。**prod P0 附记**：此崩已随 npm 0.1.26 发布（`dist/cli.js:123455` + `:272449/:272456`）→ 崩修顺带修 prod auto-mode 分类器全断（Main 发布后核 dist）。
- **漂移①：两阶段 XML 分类器**（GB 门，默认 off）。若上线，mock（tool_use 形）失配，需另 spec。
- **漂移②：识别面依赖**（`tool_choice.function.name==='classify_result'`）。分类器工具名/请求形改 → mock + 识别重对齐（已钉 §2 + e2e `detectClassifier` 已实施）。
- **漂移③：波 C 改动后** `decisionReason` 形状 / 弹框接线可能微调，S-024N 探针措辞须随波 C 落地版回填。
- **漂移④：主循环脚本化识别面**。须稳健区分「主循环 chat.completions」与「分类器 chat.completions」（后者 `tool_choice.function.name==='classify_result'`）；主循环脚本化的 count 须覆盖到产 Write tool_use 的那次调用，否则 live 模型可能抢先发 Bash。实施时白盒核代理分叉顺序（先判分类器、再判主循环 count）。
- **待用户**：
  1. **波 C 安全确认（已定，2026-10-05）**：拦截→ASK = auto 模式分类器拦截变「用户可覆盖」（最小放宽）= 用户已选此路径（f4 默认推荐，§4 C.2：仅 available 时；unavailable/headless 仍 fail-closed 硬 deny）。**低影响备记（不预启）**：若在意 auto 安全门强度 → 切 deny 面加 why 行（#3 现形但不改安全姿态）。
- **已定（2026-10-05 用户，5 项）**：① #3 走拦截→ASK 产品路径（非 e2e 回退）✓ ② e2e 基建波现在开（e2e 侧）✓ ③ **波 C 版本时序 = 拉前 → 波 C = 0.1.27（P0 封口优先），BR-8 品牌波 → 0.1.28**（brand 已同步 `634d9b5`）✓ ④ **波 A 种子 = 全确定性**（fault-proxy 脚本化主循环工具选择 + 分类器判定）✓ ⑤ **0.1.27 = metadata 崩修 + 波 C 合并**（裁定 #5，根因定因后；BR-8 仍 0.1.28 不动）✓。
- **spec 落地时序 = 待用户逐行审完 spec 再落 master**（用户 2026-10-05 拍板；本文件现为本地草案，e2e/brand 按当前定稿版消费 §3/§4，落 master 后随波 A/波 C 列车 push）。

---

## 附：关键一手来源

- 分类器：`src/tui/utils/permissions/yoloClassifier.ts`（`:199` schema / `:208` 工具名 / `:947` buildClaudeMdMessage 调用 / `:417` getCacheControl 崩入口 / `:863/:1160` catch→`unavailable` / `:1225` getClassifierModel）；`src/tui/utils/sideQuery.ts:115`。
- **根因（metadata 崩，2026-10-05 定因）**：`src/tui/bootstrapState.ts:156-157`（`getPromptCache1hAllowlist`/`getPromptCache1hEligible` dev stub 返 `{}`）→ `src/tui/services/api/metadata.ts:136-166 should1hCacheTTL`（`:160 allowlist.some` 崩点，C.1 加 `typeof`/`Array.isArray` 防御）；**prod 证** `dist/cli.js:123455`（stub）+ `:272449/:272456`（崩点）；**e2e 定因报告** `user-e2e/reports/r-20261005-2330-a4f-278-classifier-rootcause-definitive.md`。
- 判定产出处：`src/tui/utils/permissions/permissions.ts`（`:505` 门 / `:649` classifyYoloAction / `:755-778` 产 `decisionReason:{type:'classifier'}`（deny）/ `:836` 拒绝上限回退）；`denialTracking.ts:12`（maxConsecutive=3）。
- UI 渲染：`permissionVerdict.ts:50`；`BashPermissionRequest.tsx:427` / `PowerShellPermissionRequest.tsx:203`（ASK verdict 行）；`UserToolSuccessMessage.tsx:123`（自动放行句）；`useCanUseTool.tsx:47`（`setYoloClassifierApproval`）；`messages.ts:277 buildYoloRejectionMessage`（deny 面文案）。
- 基建：`user-e2e/loop-robustness/fault-proxy.ts`（已缓冲 body）；`user-e2e/tui-diff/accept.ts`（A4F S-024N/O，当前 softTriggers=false→INCONCLUSIVE）。
- 裁定链：`docs/2026-10-05-p0-closure-status.md` §2.4/§3（Option B + 本次拍板）。
