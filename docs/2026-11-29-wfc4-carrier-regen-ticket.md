# W-FC-4 工单——⑦ carrier json 构建面再生核修形（`npm pack` 路径 prepublishOnly 缺口，0.1.132 候）

> 出处：排程单 §1 W-FC-4 挂账 ⑦（W-FC-1 收口 ㊁ 登记：0.1.131 包内
> `dist/atlasweb-carrier.json` 陈旧一代，零运行时消费）。波前 §0 已根因
> 复现直证（§0-2）。落码归 Main；e2e 判据 + 段 L 载体对账自洽腿；双门 =
> Atlasweb-F4 审视 + Atlas-reveiw 审计。

## §0 活码重核（2026-11-29 @ AtlasCode `19538207`）

| 面点 | 实勘 |
|---|---|
| ⑦ 缺陷直证（registry 制品级） | 0.1.131 tgz（registry 直拉）内 `dist/atlasweb-carrier.json` = `0.1.130/5710d056/0fd96bfa` 陈旧一代；**同 tgz `dist/web-session-runtime/index.js` 含 W-FC-1 修形标记（`ledger pressure` 在场）= bundles 新鲜**——同制品内元数据件与 bundles 状态分裂 |
| 根因复现（波前决定性实验） | 本机根目录 `npm pack`（scripts on，exit 0，ignore-scripts=false 直证）产物 tgz **同病理**（bundles 新鲜 + json 陈旧）——**`npm pack` 不跑 `prepublishOnly`**（pack 生命周期 = prepare/prepack/postpack；prepublishOnly 仅 `npm publish` 触发）；段 L 打包路径（pack → publish tgz 形）静默跳过 emitter |
| 盘面内部不一致现值 | 本检出 dist/：`web-session-runtime/index.js` sha256 = `9bbb766a…`（= SRI v0.1.131 申报值）+ execution `b14e2ea5…`（0.1.131 值）∥ `atlasweb-carrier.json` = 0.1.130/5710d056/0fd96bfa——**emitter 仅挂 prepublishOnly（package.json:50，0.1.126 接线 658f55cd），构建步（`bun run build` 族）与 pack 直 tar 路径均不再生** |
| 历史对照 | 0.1.129/0.1.130 包内自洽本版值（彼时段 L 链 emitter 覆盖）∥ 0.1.131（micro 快径）陈旧——缺口非接线缺席，乃**钩子位错**（regen 依赖 prepublishOnly 单点，pack 路径零覆盖）；0.1.131 段 L 执行命令形候 Main 执行记录对表（格 1） |
| 消费面定性 | 零运行时消费维持（cli/runtime 零引用，0.1.126 fileCount 注记先例同形）；但 `dist/atlasweb-carrier.json` = AtlasWeb 消费侧装配验真锚（emitter 头注 §3-1 预注册形）——**测的=发布的字节自洽面**要求制品内元数据与 bundles 逐字一致，陈旧即锚失真 |
| files/构型 | `files: ["dist"]`（全 dist 打包）；emitter fail-closed 语义既有（bundle 缺失 exit 1，头注明示） |

## §1 格与范围

- **格 1（根因定谳对表）**：Main 0.1.131 段 L 执行记录核——发布命令形
  （pack → publish tgz 直证或等效）与 §0-2 复现机制对表，登记形落判定单
  （不溯及，勘定即可）。
- **格 2（修形，审计必改 1 覆盖链显文形）**：`prepack` 钩子接线
  emitter——`"prepack": "bun run build:atlasweb-carrier"`；emitter 既有
  fail-closed 语义保持。**覆盖链显文（防「publish 也会再生成」误读）**：
  prepack 覆盖 = `npm pack` 全部 + `npm publish` 源形（审计 npm 11.19.1
  实测：pack 触发 prepack→prepare→postpack 且 **prepublishOnly 不触发**，
  publish 源形触发 prepublishOnly→prepack→prepare→postpack）；**本仓段 L
  实发 = `npm publish <tgz>`——tgz 直发形 npm 不执行包内钩子**（发布物已
  封装，再生成唯一时机 = pack 步）→ 覆盖链 = **所有 tgz 由 `npm pack`
  产出**（工具钉 npm、scripts on、禁 `--ignore-scripts`；bun pm pack
  语义未验证不采）→ prepack 再生成烘入；tgz 直发零钩子但物已新鲜；残余
  路径（工具变更/手工 tar）由格 3 + §2-4 registry 自洽腿 fail-closed
  兜底（路径无关）。
- **格 3（判据）**：pack 产物 carrier json 自洽 = `version` == package.json
  版本 ∧ 两 sha256 == dist bundles 实算逐字；0.1.132 段 L 后 registry tgz
  同判（e2e 载体对账新增**自洽腿**，常态化登记）。
- **格 4（零回归，审计必改 2 Δ 账完备形）**：src/packages 零触（修形仅
  package.json scripts）→ cli/runtime/execution sha 恒等预期（SRI 对照：
  cli `62bbc6cf…` 恒等 + runtime/execution = SRI v0.1.131 值 `9bbb766a…`/
  `b14e2ea5…` 恒等）。0.1.132 tgz vs 0.1.131 Δ 账预注册（完备五面）：
  ① manifest **两处**变 = version 行 + scripts 新增 prepack 行；
  ② carrier json **三值**变 = version + runtimeSha256 `5710d056→9bbb766a`
  + executionSha256 `0fd96bfa→b14e2ea5`（product 恒等；即自洽修复观测
  签名；两 hex 与版本串等长 → json 文件字节数恒等）；
  ③ fileCount 134 恒等；④ exports 4 subpath 零新增；⑤ unpackedSize Δ =
  manifest 增量 ~+58B 量级。镜像 name-only 纪律不变。
- **非目标（防扩格）**：emitter 语义重写（fail-closed 已足）；publish 流程
  文书化约定（人约定非结构保证）；AtlasWeb 侧任何变更；⑧ 重连面。

## §2 判据格（RED 先行）

1. **RED（审计建议 1 谓词形 + 对象树钉）**：判别谓词 = json 存在 ∧
   `version` == package.json 版本 ∧ 两 sha256 == dist bundles 实算。
   RED 基线在案（§0-2 复现），独立复跑 admit 两形：① 陈旧形（现值盘面）；
   ② 缺失形（干净树重建 bundle 后未跑 emitter）。**对象树钉** = 折入版树
   + dist 状态/重建序列说明随 e2e 判定单登记，防「先跑 emitter 再复跑」
   基线蒸发（W-FC-2 双树 archive 教训同族）。
2. **GREEN**：修形后 `npm pack` 产物 json 自洽（格 3 两断言全真）；
   `npm publish --dry-run` 同判。
3. **载体 Δ**：0.1.132 tgz vs 0.1.131 tgz = 恰格 4 五面预注册账（manifest
   两处 + json 三值 + fileCount/exports/unpackedSize 三钉），零他变。
4. **段 L 自洽腿**：registry 直拉 0.1.132 tgz → json version/sha 与包内
   bundles 实算逐字（格 3 常态化首跑）。

## §3 修形定形（落码归 Main）

- **候选 A（采）**：`prepack` 接线 emitter（格 2 原文）——结构保证，
  pack/publish 双路径覆盖，零源码触面。**自洽边界显文（审计建议 2）**：
  prepack 自洽 = 制品**内部**自洽，非 vs 源码新鲜性保障——dist 新鲜性
  仍由段 L staging build 时序 + T6 build-vs-rebuild 对账承载
  （prepublishOnly 全建链不变；pack 前不强制 build 为既有面，0.1.130
  build-publish 时序教训在案）。
- **候选 B（弃）**：emitter 折入 `build` 族——`bun run build` 单跑可覆盖
  盘面，但 pack 直 tar 路径（不 build 先）仍裸奔；非全路径。
- **候选 C（弃）**：段 L 流程约定补 emitter 步——人约定非结构保证，
  fail-open 残留（0.1.131 即约定失守实证）；弃。

## §4 信号面

双门齐 → 双信号（Main 落码格 2 / e2e 判据 §2 四格）→ gate → **0.1.132
段 L**（package.json scripts 变 = 打包面；L4 带内余量，授权非跳门）→ 锚
实勘（f4，确定性重建含 prepack 再生核）→ T6 载体对账（含格 4 Δ 账 +
格 3 自洽腿）→ 收口。

## §5 审视记录（f4 逐点，2026-11-29）

- **自决 1（拆波）**：③ tsc 清零域勘正 = **AtlasWeb 2080 件**（2072 出处
  = viewport 根修工单 §6-4 AtlasWeb 预验 @020f3cb，`bunx -p
  typescript@5.9.3 tsc --noEmit -p tsconfig.json`；排程原划「AtlasCode
  全仓」系转写勘误——W-FC-2 域勘正同形第二例；AtlasCode 本仓 typecheck
  现值 0 错直证）→ 拆 **W-FC-5** 独立波（版本钉判据形 + 候 AtlasWeb
  0.1.5 若触 bundle 面），排程单随件勘正。本波 = ⑦ 单件。
- **自决 2（版本面）**：package.json scripts 变 = 打包面 → 0.1.132 候
  （L4 带内第 1 版；授权非跳门）。
- **自决 3（RED 基线）**：根因复现即 RED 基线（§0-2 波前直证在案）——
  e2e 独立复跑确认形，非从零构造。
- **自决 4（自洽腿常态化）**：格 3 段 L 自洽核入 e2e 载体对账标准腿
  （fileCount 注记先例同形），防复发面结构化。
- **自决 5（定性分立）**：零运行时消费（不阻定性）与测的=发布字节自洽面
  （修复必要性）分立登记——元数据锚失真即修，不因零消费降格。
- **自决 6（双门）**：本波照走双门（泛化纪律）；gate 形 = 构建面判据
  （npm pack 产物 + 载体 Δ 账），非源码级 RED/GREEN 全套（触面仅
  package.json）。
- **报裁项：无**（六项全自决闭环）。

## §6 验收件

RED 确认 + GREEN 判定单（e2e，四格）+ 0.1.132 段 L 全链（bump/tag/直发/
round-trip/SRI）+ 锚实勘（f4）+ T6 载体对账（Δ 账 + 自洽腿）+ 排程单 §5
翻转 + 挂账 ⑦ 销项注记。

## §7 审计采记（Atlas-reveiw 回票 @38a89c81，2026-11-29 折入）

- **总判**：方向 PASS + 必改 2 + 建议 2 + 注记 3；活码七面复证全过：
  ① registry 0.1.131 制品分裂 EXACT（本机 tgz sha256 `ef1a63ba…` = SRI
  主面逐字；包内 json 陈旧 ∥ `ledger pressure` ×1 在场、134 members）；
  ② **根因实证**（npm 11.19.1 实测：pack 触发 prepack→prepare→postpack
  且 prepublishOnly 不触发；publish 源形触发
  prepublishOnly→prepack→prepare→postpack）；③ 盘面不一致 EXACT（cli
  `62bbc6cf…` 新增直证）；④ 658f55cd 接线出处逐字（0.1.126 release
  commit，prepublishOnly 第 5 步）；⑤ 消费面零引用维持；⑥ files=["dist"]
  + dist/ 在 .gitignore:2（untracked fail-open 成立）+ emitter
  fail-closed 源码直证；⑦ 仓内工具面 pack/publish 零使用 = prepack
  fail-closed（无 dist 树 pack 即 exit 1）无在仓消费者可破（零回归
  佐证新增）。
- **必改 1（已折 §1 格 2）**：覆盖链显文——prepack 覆盖 = npm pack 全部
  + publish 源形；**段 L 实发 tgz 直发零钩子** → 覆盖链 = 所有 tgz 由
  npm pack 产出（工具钉 npm/scripts on/禁 --ignore-scripts；bun pm pack
  不采）+ registry 自洽腿路径无关兜底。
- **必改 2（已折 §1 格 4/§2-3）**：Δ 账完备化五面（manifest 两处/json
  三值〔三值变即自洽修复观测签名，字节数恒等〕/fileCount 134/exports
  4 subpath/unpackedSize ~+58B）。
- **建议 1（已折 §2-1）**：RED 谓词形 + 两形 admit（陈旧形/缺失形）+
  对象树钉（折入版树 + dist 状态/重建序列说明）防基线蒸发（W-FC-2 双树
  archive 教训同族）。
- **建议 2（已折 §3 候选 A）**：自洽边界显文——内部自洽 ≠ 源码新鲜性，
  新鲜性由段 L staging build 时序 + T6 build-vs-rebuild 对账承载。
- **注记**：① 排程单 §2/§3/§4 拆波扫全——本折入版随件先行（条件形→
  确定形 + W-FC-5 入并行面/预注记）；② §0 锚 @19538207 = code 面锚
  （HEAD 前两 docs commits），面等效非阻；③ gate 形归 e2e 判定单记录
  （0.1.130 先例），自决 6 提案面无异议。
- 处置留痕毕 → 审计点核候；判词侧另线在途，双门齐才双信号。

## §8 判词侧审视（Atlasweb-F4，2026-11-29 @折入版 01589353）

**审视 PASS——双门齐**（审计方向 PASS 全折 + 本 §8，含折入保真点核 §8-3）。

### §8-1 独立实勘（十锚，判词侧 job/活码直证）

| # | 锚 | 实勘 | 判 |
|---|---|---|---|
| 1 | registry 制品分裂直证 | root 冻结件 `atlasharness-atlascode-0.1.131.tgz`（sha256 `ef1a63ba0926e88b…` 起首）判词侧拆验（job `wfc4/un131`）：包内 json = `0.1.130/5710d056/0fd96bfa` 陈旧一代 ∥ `dist/web-session-runtime/index.js` 含 W-FC-1 修形标记 `ledger pressure` ×1 = bundles 新鲜——同制品分裂我方直证 | ✓ |
| 2 | 根因复现（RED 腿） | **判词侧独立 `npm pack` 复现**（job `wfc4/`，`--pack-destination` 重定向防覆盖冻结件）：产物 tgz 包内 json = 陈旧 `0.1.130` 三值，与盘面 `dist/atlasweb-carrier.json` `diff` = **IDENTICAL**——§0-2 由承认形升级为判词侧直证（emitter 未随 pack 触发） | ✓ |
| 3 | 盘面内部不一致现值 | dist bundles `9bbb766a…`/`b14e2ea5…`（= SRI v0.1.131 申报值）∥ json `0.1.130/5710d056/0fd96bfa`——判词侧直算 | ✓ |
| 4 | 接线静态直证 | package.json `:50` prepublishOnly 五步含 `build:atlasweb-carrier` ∥ **零 `prepack` 键**；`:49` `build:atlasweb-carrier` script 在场——候选 A「引用既有 script」前提成立 | ✓ |
| 5 | 658f55cd 接线出处 | 0.1.126 release commit（prepublishOnly 第 5 步接线）——前期波档核对在案 | ✓ |
| 6 | emitter 语义 | `scripts/emit-atlasweb-carrier.ts` 头注 §3-1 预注册形（f4 批复 @63fc4615）+ fail-closed（bundle 缺失 exit 1）+ 四字段 `{product, version, runtimeSha256, executionSha256}`——与格 3 判据形逐字合 | ✓ |
| 7 | 2072 出处域勘正（自决 1） | **AtlasWeb 仓** `docs/2026-11-27-viewport-rootfix-ticket.md:109` = §6-4 AtlasWeb 预验 @020f3cb `2072 pre-existing errors`（TS7026×774/TS5097×396/TS2307×234…）逐字 + `:110` tsc 清零立项——排程原划「AtlasCode 全仓」系转写勘误成立；**AtlasCode 本仓 tsc 判词侧独立实跑 = exit 0（零错）直证** | ✓ |
| 8 | 排程单拆波随件 | `docs/2026-11-28-debt-pool-schedule.md:15` W-FC-4=⑦ 逐字 + `:16` W-FC-5=③（AtlasWeb 2080 件 @3391e6b）+ `:25` 域勘正后 AtlasCode 载体版需求 = 仅 W-FC-4 | ✓ |
| 9 | 段 L tgz 直发形（格 2 关键新增事实） | 「`npm publish <tgz>` 直发形 npm 不执行包内钩子」= Main 执行程序面陈述——判词侧以 npm 生命周期语义侧面合（tarball publish 无源树 lifecycle）；**格 1 执行记录对表候 gate 登记**（§8-4-2） | ✓（承认形，格 1 候） |
| 10 | untracked fail-open 面 | `.gitignore:2` = `dist/`——dist 不入库，prepack 缺位下无 dist 树 pack 产物裸奔面成立（审计 ⑥ 同径） | ✓ |

### §8-2 裁定

1. **必改 1 成立**：覆盖链显文正形——段 L tgz 直发零钩子 → 覆盖链 = 所有 tgz 由 `npm pack` 产出（工具钉 npm/scripts on）+ registry 自洽腿路径无关兜底（fail-closed 家族同形：终判不依赖执行纪律）。
2. **必改 2 成立**：Δ 账五面完备（manifest 两处/json 三值/fileCount 134/exports 4/unpackedSize ~+58B）；「json 字节数恒等」推断成立（两 hex 等长 + 版本串 0.1.130→0.1.132 等长 → 文件定长）。
3. **建议 1/2 成立**：RED 谓词形 + 两形 admit + 对象树钉（W-FC-2 双树 archive 教训同族）；自洽边界显文（内部自洽 ≠ 源码新鲜性，新鲜性 = 段 L staging build 时序 + T6 build-vs-rebuild 对账——0.1.130 build-publish 时序教训在案）。
4. **注记 ①②③ 成立**：排程随件扫全 / §0 锚 @19538207 = code 面锚等效（38a89c81→01589353 零 code 触面，docs only）/ gate 形记录面。
5. **六自决维持成立**；格 3 判据与 emitter 输出形逐字合（锚 6）；候选 A 前提直证（锚 4）。
6. **补充裁定（正面副作用显文，登记）**：prepack 接线后 i) 无 dist 树 pack = emitter fail-closed exit 1 → **pack 路径 fail-closed 化**（与审计 ⑦「仓内 pack 零消费者」合向，零回归）；ii) publish 源形 prepublishOnly→prepack 双跑 emitter = 幂等（同输入同输出），非阻。

### §8-3 折入保真点核（吸收审计「点核候」）

逐项对表：必改 1 → §1 格 2 覆盖链显文 ✓；必改 2 → §1 格 4 五面 Δ 账 + §2-3 ✓；建议 1 → §2-1 谓词形/两形 admit/对象树钉 ✓；建议 2 → §3 候选 A 自洽边界显文 ✓；注记 ① → 排程单随件 ✓；注记 ② → §0 锚等效 ✓；注记 ③ → gate 形记录面 ✓。**折入版与审计回票意图逐项保真，无余项无漂移。**

### §8-4 精化注记（2，gate/对账时随件）

1. **载体 Δ 对账基线指名形**（W-FC-2 格 8 方法论自用）：格 4/§2-3 的 Δ 账基线 = **registry 实发 0.1.131 tgz**（判词侧在盘冻结件，sha256 `ef1a63ba…`）；build/ 同版隔离件若入账须注明 post-落码 属性——多代基线先立定性表，防基线歧义。
2. **格 1 对表范围显文**：执行记录对表对象 = 0.1.131 段 L 实际发布命令形（pack 与 publish 两条命令或等效单命令，含 `--pack-destination`/工作目录），登记形落 gate 判定单即可，不溯及历史版本。

### §8-5 判定

**双门齐 → §4 信号链候发**：双信号（Main 落码格 2 / e2e 判据 §2 四格）→ gate → 0.1.132 段 L（L4 带内第 1 版；授权非跳门）→ 锚实勘（f4，确定性重建含 prepack 再生核）→ T6 载体对账（Δ 账五面 + 格 3 自洽腿）→ 收口（排程 §5 翻转 + 挂账 ⑦ 销项）。W-FC-5 后链维持（工单候出稿照旧双门）。
