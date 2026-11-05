# 0.1.84 f4 收口复核 — 2026-11-02

## 结论

**发布事实已核对；K5 完整契约存在未核销硬缺口，不作无条件全闭环确认。** Main/e2e 的发布与生产 lane PASS 是其已发生的流程记录；本复核不改写发布历史，也不追认降低原硬判据。

## 全局特性列表

| 特性 | 满足度 | 根因 | 处置 | 推导链 |
|---|---|---|---|---|
| 发布引用 | 满足 | f4本次命令核HEAD/origin/master/v0.1.84 deref均为9b62ee5b2ab265a8b203f9b86155634f9df03881 | 保留已发布事实 | git rev-parse三方同值 |
| release/gate源面对齐 | 满足 | 9438d91..9b62ee5仅CHANGELOG53行与package版本，共2文件 | 无src/tests后改 | git diff --stat新鲜核对 |
| registry元数据 | 满足 | npmjs version/latest=0.1.84，gitHead匹配；sha1 a8ca2d085f604dfe5680cad07fbd8ae4ff119f03；integrity sha512-Jf6oZTcL6LbMUSsEC9iLtvlHAWOKOWQo9C1jSHpAB8LkrzyC1/pelQvMQQsQ+Uki+fN+J1O45F2iJR6FHiu/9Q==；unpackedSize17974850 | 与报告交叉对齐 | f4 npm view实取；未重下tgz，不能称f4独立复算包字节 |
| 判别/CI/工具层实现 | 条件满足 | e2e报告197/0、CI5308/0、headless三轮hardFail=0；f4本轮未重跑这些测试 | 引用为e2e独立证据，不当f4自跑结论 | r-20261102-gate-084.md与prodlane-084.md |
| 测的=发布的字节证据 | 满足（e2e证据） | 报告gate/npm CLI cmp全等17966930B/17918599c/sha256 3f1bcd8c…eaf7 | 沿实测，不固定8910差 | e2e生产报告§③；f4未自行重算CLI |
| @PDF实际模型消费（K5-8、F活桥） | 缺口 | provider请求四要素0/3；params.ts toOpenAIMessages无attachment分支，旧normalizer不是活请求链 | 原hard判据未满足，不能以既有非回归自行降为non-hard；待修复或明确用户契约裁定 | 工单§1F/§2硬要求 → gate报告§⑦及重大登记Gap A承认不可达 |
| PDF页图/已知页marker视觉读取 | 缺口 | 本轮追加复核：engine Read pages已构造JPEG meta-user，但pipeline丢弃newMessages；TUI另有原生resize依赖。原“sharp缺包→engine页图断链”归因撤回，header-only不能证明媒体构造失败 | 0185按双入口修复交付并硬验收；不把pdftoppm出JPEG当达线 | readTool.ts:970–990→toolExecution.ts:553–605→toolOrchestration.ts:72–79→loop.ts:610–622；新鲜隔离探针复证 |
| 判据变更授权 | 缺口（截至本复核） | 当前可见消息只有团队将provider断言降non-hard及待用户排波裁定，未见用户明确豁免原hard判据 | 已向Main/e2e请求准确依据；发布历史与契约满足分开 | 2026-11-02信号e1bf2173/a654e11c |
| 后续K6准备 | 条件满足 | 用户“继续”与既定auto-advance授权支持默认方向；但前波契约争议未闭合 | 可整理K6原28条/源码入口，不发下一波实施或gate信号；不把“继续”推断为Gap插波裁定 | 严格串行+已规划版本自动推进 |

## 判据差异与处置边界

1. 工单§1F明确“活桥硬判据：真实TUI @file提交→实际engine/provider请求至少可见path+上述指令”，§2明确必需覆盖缺席=GATE-OPEN。旧normalizer非活链路说明根因调查前提错误，不会使用户结果要求自动失效。
2. 既有缺口不等于本波回归，可以单独标注来源；但“非回归”不能替代“已满足硬契约”。K5-7内存引用化、既有JSONL附件过滤可分别满足，不推出K5-8指令达线。
3. **追加因果勘误（同日独立复核）**：此前“依赖+tool_result图片序列化双修”的充分性判断撤回。engine pages实际返回独立`newMessages`，未把页图嵌进header型tool_result；执行、批次、query均无交付，是真断点。隔离探针实际调用executeToolUse/runToolBatch，两处都丢补充；同一image meta-user直接过params则得到image_url。`toolResultContentToString`的嵌图→'[image]'限制真实但属另一条路径，不能当本pages支的已证根因。TUI pages仍有resize调用，其原生依赖风险单独验证。full-PDF document无映射也不随此修复自动核销。详见0185工单§0；f4未进行产品落码。
4. Main为用户单点报告方。f4已通知Main准确报“发布完成、K5端到端仍缺口”，并请求如有用户判据变更裁定提供原话。f4不回退/撤包，不替Main发布，不要求e2e绕权限。

## 下一步

- Main/e2e澄清原hard判据的处置与裁定依据；无豁免则保持契约缺口，安排修复方案/验收，不能将084无条件核销。
- **同日接续记录**：Main随后报告其决策包后的用户答“继续”，按推荐A执行0185最小A+B补闭环、K6顺延0186；f4据其单点用户上下文报告出`docs/2026-11-02-p0-wave-0185-ticket.md`，不声称独立见证别的session原话，不追认084降级。0185为前波修复接续，K6不并行开工；剩余版本映射由Main同步总计划，不丢既定末波。
- K6源码初始入口已定位：`src/tui/vim/{motions,transitions,operators}.ts`、`hooks/useVimInput.ts`、`components/{Markdown,MarkdownTable,TextInput,BaseTextInput}.tsx`、`ink/{wrapAnsi,selection}.ts`、`screens/REPL.tsx`、`commands/sandbox-toggle/sandbox-toggle.tsx`。当前仅路径及部分源码调查，尚无K6详细工单/自审/开工声明。

## 0.1.85 复核收口（2026-11-03 f4，覆盖上文「缺口」行的当前状态）

| 特性 | 满足度 | 根因 | 处置 | 推导链 |
|---|---|---|---|---|
| 发布引用 | 满足 | HEAD/origin/master/`v0.1.85^{commit}` 三方 = `2bd81c0b…`；release commit 仅 package.json 1 行翻号（src/tests 零触碰） | 保留 | f4 新鲜 git rev-parse + `git diff --stat 98d45c8..HEAD -- src tests` 空 |
| registry 元数据 | 满足 | npmjs 0.1.85 latest；shasum `ef07c949…`/integrity `sha512-OVCw…`/unpacked 17,978,538/gitHead `2bd81c0b…` 与 Main/e2e 报告逐值同 | 与两报告交叉对齐 | f4 `npm view @0.1.85` 实取（未重下 tgz，SRI 复算归 e2e） |
| 原 084 §1F 硬契约 | **满足（085 证据核销）** | C85-A 四要素 / C85-B 交付链 / C85-C 页图 / C85-D 落盘 / C85-E 硬探针：e2e fixed GREEN ↔ 基线（9b62ee5）真实行为 RED 判别成立（bridge 10/10、headless 18/18、lifecycle resume-only 0；基线同探针 bridge hardFail=4/headless=3/lifecycle 4+3） | 原 hard 判据以 085 端到端证据补闭合；084 历史 GATE-PASS 不改写，勘误留档 | r-20261102-gate-085.md（判别双面/基线 RED 节）+ r-20261103-prodlane-085.md（npm 真包三支 hard 探针重跑） |
| Δ8910B 之谜 | 满足 | 定因 = Main worktree 无本地 node_modules → bundler `// ../../node_modules/` 注释前缀 ×1485×6B；归一化后字节级全等 | canonical = 17,970,618B，gate/npm sha256 `e5b03d28…f40df` 恒等直证；不套常数 | gate-085 ② + prodlane-085 ④ |
| R-085-1（compact→quit→resume 组合缝） | 缺口（登记，非本波回归） | C85-D compact 重建 = 请求构建时投影，未持久化为边界后 attachment 记录；resume 收集器无可扫对象 | 工单命名链外组合，登记不核销；候补 0.1.86 K6 工单面（Main 收口单已报用户待裁定，P-804s 同型）；不借 085 核销 | gate-085 重大登记节（run2-021/R4-021 双 run JSONL 结构直证） |
| Skill 文本旁支 | 条件满足 | 通用 newMessages 交付使技能正文首次实际到达模型 = 已登记行为变化；contextModifier/allowedTools/model 仍不消费 | 按 085 工单 §1-B 边界执行，K①-K③ 测试在场 | Main §6.3 + e2e 判别 |
| 排波状态 | 条件满足 | 0185 五段闭环终态（gate GATE-PASS → release `2bd81c0` → 生产 lane PASS → 收口单信号） | f4 复核通过；下一波 K6=0.1.86 详细工单随后发出；0187（三总纲）按序在 0186 之后 | 本文件 + 0185 工单 + 0187 工单（终版） |

**复核结论：0.1.85 原 hard 契约补闭合成立（e2e 双面判别 + npm 真包重跑证据在案）；唯一登记面 R-085-1 为窄组合缝候补 K6，非无条件全绿亦非回归。084 与 085 两份 gate/prodlane 报告的历史判定均不改写。**

### 归因勘误归属确认（工单 0185 §6.6）

084 报告面「sharp 缺包 + tool_result 双修」归因勘误已由 f4 落于本文件上文「追加因果勘误」段（2026-11-02）；085 工单 §0.2 为工单面同源记录。归属闭环，无双写漂移（两处措辞一致、工单面为执行口径、本文件为复核口径）。

## 0.1.86 f4 复核收口（2026-11-03）

**判定：条件收口。** 28 件中 27 件 + R-085-1 修法 A 实质闭环（review 补环审计锚点/一致性/信任边界全实证 + e2e 补跑 Markdown 活探针 GREEN 补登）；**K6-8 中断路径活面 RED 未闭合 → 登记 R-086-1，按治理规则 3 显式 defer 至 0.1.87 插入接线补件**。

| 特性 | 满足度 | 根因 | 处置 | 推导链 |
|---|---|---|---|---|
| 发布/生产一致性 | 满足 | SRI 四值/npm cli.js 17,978,597B cmp 字节级全等 gate 银行 build/翻号 0.1.86/PONG-086 | 保留 | prodlane-086 + review 审计逐值实证 |
| 28 件判别 | 27/28 满足 | face 120/0↔base 30/22 + Markdown 活探针补跑 GREEN（bold 续行 17/17） | ⑤ 行已按 gate 报告「③⑤ 补登面」修订为条件满足 | gate-086 + supplement-086-f1 |
| K6-8 活面（R-086-1） | **未闭合** | `getLastInteractionTime`/`updateLastInteractionTime` 自 78624e4（2026-09-29）即 stub `()=>({})` → 修法交互支 `{} > num` 恒 false 恒放行；单元 6/6 为注入值测试拦不住接线；姊妹 idle_notification 同根因死（既有潜伏） | **显式 defer 0.1.87**：bootstrapState 交互时间三 stub 落真实现 + K6-8 PTY 门重验 + idle_notification 顺修；不静默降 soft、不借波核销、不强回滚 0.1.86 | supplement-086-f1 定因链（D-8 字节级） |
| 审计环 | 闭环 | 沟通矩阵固化后首例补环：F1 抓到 ⑤ 枚举-执行漂移 → 补跑一绿一红；F3 已修（98d16b7 f4 实核通过） | 0187 起波前审计按矩阵步 1 执行 | 工单 §7 + release-governance.md 矩阵 |

**流程缺口登记（2 条，不抹除）**：① 0.1.86 工单波前未送 review 审计（矩阵固化前）；② Main 提前启动 0187 任务 F 落码（早于 f4 双信号；0187 审计已闭环 + auto-advance 在案故不叫停，已偏离登记）。两者均随矩阵固化闭环防复发。

### R-086-1 依赖面达成（2026-11-03 追记）

gate-087 E′①② GREEN 实核采信（插入件 I 三 stub 真实现 dist 直证 + K6-8 v2 探针 abort 直证 GREEN + idle_notification 双轮 GREEN）→ 0.1.86 条件收口之 defer 依赖面达成。**R-086-1 终态收口随 0.1.87 release + 生产 lane 落定**（规则 3「闭环 + 发那版」语义）；0.1.87 因 R-087-1 打回插修，该落定点相应顺延，defer 契约本身（显式命名 + 写进下一版）已满足不再变更。

## 0.1.87 f4 终复核收口（2026-11-04）

**判定：五段闭环终态成立。** R-086-1 同步终态收口（0.1.87 已发布 = 规则 3「闭环 + 发那版」落定）。

| 特性 | 满足度 | 证据（f4 直核） |
|---|---|---|
| 发布引用 | 满足 | release `e1d6901`（仅 CHANGELOG+package.json 1 行）/ tag `v0.1.87` deref 恒等 / npm gitHead `e1d6901` / HEAD=origin=`2963e7c`（仅 docs §8 收口记录后置，0186 同型） |
| registry | 满足 | npmjs 0.1.87：shasum `cf5d2466…`/unpacked 18,044,816 与 e2e 报告逐值同（SRI 复算归 e2e） |
| 波本体 | 满足 | 三总纲（doctor/optimism/opdev）+ Task F 源检查更新 + 插入件 I（R-086-1 接线补件）/II（R-087-1 产方合形）/III（R-087-2 undici）全落地；gate GATE-PASS 终态（两次 GATE-OPEN 均打回插修后销项）+ 生产 lane PASS（r-20261104-prodlane-087：npm 包 E′ 探针 4/4×2 + 路由交付 6 次真 msprof 调用） |
| R-086-1 | **终态收口** | 0.1.87 发布 + npm 包 K6-8/idle_notification 探针 4/4×2 GREEN（插入件 I 直证） |
| 登记不排（随收口单呈用户） | — | R-087-3（Step 0 措辞硬化候补，adherence 2/8）/ R-087-2-FAMILY（--external 未声明 13 项）/ D4 环境性族 / contextModifier 支呈裁 / 流程偏离知会（0187 提前落码 ×2） |
