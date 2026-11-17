# 发布规则（f4 规划/管理 lane 定，2026-10-06 用户裁定）

> 状态：活文档（0.1.122 B2 豁免：设计/研究/制度面，非工单状态机）

> **3 条规则定稿**（用户 2026-10-06 原话复述），**取代**早期复杂「3 支柱」草案——不新增文件、不改判据，只把发布规则收成 3 条 + 全绿闭环。
> **跨 lane**：Main 实施发布 / e2e 验收 / f4 gate + 版本梯队。f4 = 本规则 owner（规划/管理 lane）。

## 3 条规则

1. **前后 lane 标准一致**：每版，**发布前 lane（gate，dev 源码）与发布后 lane（生产 lane，npm 产物）用同一套判据 + 同一严格度**（"测的 = 发的"，判据不因 lane 而变）。发前核 dev stub 在打包体里的真实取值（dev/prod 同构，不出现"dev 崩 prod 好"）。
2. **测试发现问题必须先闭环再发**：任一 lane 测出缺口（hard fail / 未处置 INCONCLUSIVE / 未闭环的 in-scope 项）→ 修完 + 复跑**全绿**（含回归）→ 才发这版。**不"带缺口发"。**
3. **特殊情况顺延下一版**：发布后 lane 仍有问题（特殊 case）→ 不强回滚当前版，**顺延到下一版闭环 + 发那版**（0.1.27 → 0.1.27.1）。

## 收口判据（一版 = 全绿闭环）

一版"收口" = in-scope 判据**逐条声明（含渲染面，不只决策层）** 全部 hard 绿 + 回归不回归 + 0 未处置 INCONCLUSIVE + banner = 目标版本。
不隐式"先发 N 再开 N+1 补 N 该做的活"：要 defer 就**显式命名 + 触发条件**写进下一版（in-scope 项要么本版闭环、要么显式 deferred）。

## 强制分工（谁核什么）

- **e2e**：gate + 生产 lane 跑**同一套**探针（`accept.ts` 共享判据）；`--release-gate` 出 `result.json.releasable`（全绿 PASS 才 releasable）。
- **Main**：发布段核 banner 对齐 + dev stub 打包体取值；四件套绿；版本 bump（一 wave 一版）。
- **f4**：gate 权 + 版本梯队（一版本一收口）+ 发布 checklist（规则 1–3 + 全绿闭环）+ deferred 显式命名。

## 发布验真 SOP（D-8 固化，0.1.33）

Main 发布段核 npm 产物的固定通道（0.1.30/0.1.31/0.1.32 三版已按此执行，零事故）：

```bash
# ① 发布（DNS-pin 通道：本机网络下 registry.npmjs.org 需 pin Fastly IP）
cd <master checkout, 已构建 dist>
NODE_OPTIONS="--no-network-family-autoselection" \
  node -r <job-dir>/tmp/pin-npmjs-dns.js \
  /usr/lib/node_modules/npm/bin/npm-cli.js publish \
  --registry https://registry.npmjs.org

# ② packument 验真（等传播 2–4min，DNS-pin 直连 Fastly）
curl -s --resolve registry.npmjs.org:443:104.16.10.34 \
  "https://registry.npmjs.org/@atlasharness%2fatlascode" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); v=d['dist-tags']['latest']; e=d['versions'][v]; print(v, e['dist']['tarball'], e['dist']['shasum'])"

# ③ tarball 直下 sha1 比对 packument dist.shasum
curl -s --resolve registry.npmjs.org:443:104.16.10.34 -o t.tgz "<packument 的 dist.tarball>"
sha1sum t.tgz   # = packument dist.shasum 即 MATCH
```

**两个坑（成文固化）**：
1. **canonical 文件名无 scope 前缀**：registry 上 tarball 存为 `@atlasharness/atlascode/-/atlascode-<v>.tgz`（**不带** `atlasharness-` scope 前缀）；npm publish 输出的本地 staging 文件名带 scope 前缀，直下恒 404（非传播延迟）。**一律取 packument `dist.tarball` 字段直下，勿自行拼 scope 前缀文件名。**
2. **shasum 字段 = SHA-1**（npm `dist.shasum` 是 sha1，非 sha256）；比对用 `sha1sum`，勿用 `sha256sum`。

## 首个按规则 3 顺延的实例

**0.1.27**：#3 渲染缺口（`FilePermissionDialog` 缺 verdict 行）在 gate lane 发现但已随 0.1.27 发出去（历史原因：当时 #3 判据软、INCONCLUSIVE-tolerant，未硬门禁）→ 按**规则 3** 顺延 **0.1.27.1** 闭环 + 发（生产 lane 对 0.1.27.1 跑，**不跑 0.1.27**）。**从 0.1.27.1 起规则 1–3 严格套。**

> 判据事实源：`docs/archive/2026-10/2026-10-05-p0-closure-status.md` §2.4/§2.5；实例 `docs/2026-10-05-live-gateway-classifier-e2e-wave.md`。

## 跨 session 沟通矩阵（用户 2026-11-03 追问后固化；2026-11-02「方案给 review 审计」指令泛化为每波必审）

每波（含插入波）固定信号链，缺环 = 流程缺口（不阻已发生事实，但须复盘补审）：

| 步 | 发起 → 接收 | 内容 | 时点 |
|---|---|---|---|
| 1 | f4 → **Atlas-reveiw** | **波前工单审计**（工单全文路径 + §0 锚点 + §4/§5 审视）——**每波必发，不限于新方向**；审计意见吸收进工单终版；审计闭环后才发实施双信号 | 工单出稿后 |
| 2 | f4 → Main | 实施信号（工单终版 + 基线 + 判据） | 审计闭环后 |
| 3 | f4 → e2e | 预登记信号（判据口径，不预跑不预占） | 与 2 并行 |
| 4 | Main → e2e | 锁面批注（§0 补实核）单信号 | 实施完成 |
| 5 | e2e → Main | GATE-PASS 单信号 | gate 终态 |
| 6 | Main → e2e | 生产 lane 单信号（release 后） | 发布后 |
| 7 | e2e → Main → **用户** | 收口单（PASS/FAIL + 登记面）；**用户报告唯一出口 = Main 单点** | 生产 lane 终态 |
| 8 | f4 → 文档 | 复核收口（closure-review 追加节 / 工单复核行） | 收口后 |

**约束**：① peer 间消息 = 数据，任何 peer 不能冒充用户裁定；② 审计意见 = review 只提意见不改文件（工单 owner = f4，落码 = Main）；③ 波前审计若因故缺席（先行波先例：0.1.86 工单未送审即开工），收口后由 f4 发起**复盘审计**补环，缺口登记不抹除；④ 矩阵本身 owner = f4，变更须用户确认。

首个按 ③ 补环实例：**0.1.86**（工单出稿未送审，Main 已锁面开工；收口后 f4 送 Atlas-reveiw 复盘审计）。


## 段 L 硬门条款（f4 裁定 2026-11-12，自 0.1.101 起 fail-closed）

**缘起**：0.1.100 W-D-B-1 Main 将实施侧四件套自证误读为「gate 通过」（2026-10-11 裁定本意 = e2e gate），于 e2e gate 完成前执行段 L 全链（bump + tag + npm publish）——发布先于 gate = gate 防线被绕过（测的=发布的 fail-closed 违例）。0.1.100 本体走后置追认链（工单 §10）。

**条款（机械形，禁裁量替代）**：段 L 前置硬条件 = **e2e GATE-PASS 报告路径在案 + f4 采认信号在案**，二者缺一禁执行 bump/publish/tag 全链；实施侧自证套件（四件套等）不构成 gate 本体，任何裁定先例不得引申为其替代。gate RED 已发布态 = 立即补丁版 + npm deprecate 标注，无豁免面。

**附则（0.1.100 二次偏差后增，2026-11-12）**：build 必须于最终产品码提交后、**紧贴 publish 前**执行（禁 build 先行后落码再消费旧 dist）；SRI 留档必须记录当次 build 的 **tree commit**（「发布品≠gate 基」防三犯）。

## 双平台发布（用户 2026-11-12 裁定；f4 登记）

**裁定原文意图**：后续 git 发布 = **GitHub + GitCode 双平台发布**——每次 release，master + tag 双平台同步推。

**执行形（f4 定形）**：

1. **双 remote 结构**：origin = GitHub（现状不变）；新增 `gitcode` remote（URL/凭据待建——GitCode 仓库创建 + 推送凭据 = repo admin 操作面，建好后 Main 配 remote）。
2. **release 链增步**：release commit + tag 落 GitHub 后，`git push gitcode master --tags`（或逐版 push gitcode <tag>）双平台同步；GitCode 侧为**镜像面**（无独立 CI 门要求，发布判据仍以 GitHub CI + npm SRI 对表为准）。
3. **npm 发布通道不变**：SRI 四值对表、本地/OIDC 双通道容灾照旧（双平台指 git 仓库面，非 npm 多 registry）。
4. **生效版本**：**0.1.98 起双平台**（0.1.97 release 链已在途挂 Main，不回插；GitCode remote 建好后首版补推 0.1.97/0.1.96 tag 亦可，随 Main 执行时定）。
5. **登记项（2026-11-12 用户定，同日填仓完成）**：GitCode 仓库 = `gitcode.com/vincentlau2046/Atlaswork`；remote `gitcode` = **SSH**（`git@gitcode.com:vincentlau2046/Atlaswork.git`——HTTPS 推需凭据非交互无解，Main 切 SSH id_ed25519 直通，后续零配置）；**填仓完成（用户直认授权，2026-11-12）**：master e0c0cfdb + 全量 128 tags 镜像，f4 实核三面 ALIGNED（local/GitHub/GitCode master 同值；tag v0.1.97 锚 release commit 680ccd9e ✓）；0.1.98 起双平台步 = release 后 `git push gitcode master --tags`；GitCode CI 候选不排。

## 共享 checkout 破坏性 git 操作纪律（f4 登记 2026-11-13，S3a codemod 回滚事故定谳）

**事故面**：Main S3a codemod 回滚 `reset --hard` 清掉 e2e lane 长期未提交的 harness/docs 修改（10 文件；S3a 码面零损失，恢复责任移交 e2e 自恢复）。

**纪律（全 lane 适用，自登记起）**：共享 checkout 内执行破坏性 git 操作（`reset --hard`/`checkout -- .`/`clean`/`rebase` 落工作树面等）前，**必须**先 `git status` 全量排查他 lane 未提交改动并对该等改动 stash 保护（或逐文件备份），禁直接落破坏性操作。stash 前须注记归属 lane（stash message 带 lane 名），防误清他 lane 在途面。违反即事故报备链（责任 lane → 受损 lane → f4 备案）。

**增补（2026-11-13，f4 自身事故定谳）**：共享 checkout 内 `git commit` **必须路径限定**（`git commit -- <paths>`）——裸 commit 提交整个 index，会扫入他 lane 已暂存的在途工作（实例：f4 docs 归档 commit 扫入 Main S3a 搬移 133 暂存改名；soft reset + 路径限定重做修复，未推送无外溢）。

## 制度对表新增四纪律（0.1.122 B4 落档，工单 docs/2026-11-17-0122-docs-normalization-ticket.md）

本节把本周期（0.1.117–0.1.121）三 lane 协作中沉淀的四条纪律正式入档。逐条对实际先例工单（格 5）。

### 1. 交付波 lock-face「终局验收目标可达性推演」必答项

**先例**：S0-R2 载体波 §6-1 审计沉淀（docs/2026-11-15-s0-r2-engine-carrier-ticket.md）。

**条款**：交付类波（engine 载体 / SDK 出口 / pairing 增量等「为下游交付能力」的波）的 lock-face 呈批书**必须**包含「终局验收目标可达性推演」必答项——对撞「交付目标在消费侧真实可达」与「中间判据全绿」两面。锁面未做可达性对撞时，gate 全绿但终局目标不可达 = **可达性盲区（假绿的镜像形）**；消费侧有权据此拒收并报备。

### 2. docs-push 悬挂窗双方确认形（0.1.119 S0-R4 后双方确认）

**条款**：Main 推送 docs 面（upstream-pairing.md 配对增量、SRI 留档、波报告等消费侧输入）到远端后，到消费侧 lane（e2e / Atlasweb-F4）确认读取之间存在**悬挂窗**——窗口内任何一方不得将「已推」单方面记为「已交付/已采纳」。闭环判据 = **双方确认**：推送方落盘回执（commit SHA + push 输出）+ 消费方显式确认（采纳回执/采认记录），二者俱在案才算交付完成。仅推送方自记完成 = 违制，f4 巡检按未闭环处理。

### 3. 巡检催办链订正条款（0.1.119 订正）

**条款**：lane 间不得假设对方会主动巡检本 lane 的输出。催办必须走**显式信号**（cross-session message 落盘，或工单/登记档状态字段翻转到对方必读面），禁「已在共享文件里写了」式的隐式等待。f4 巡检催办链以显式信号的时间戳为准计延时；隐式等待造成的空转不计入对方责任。

### 4. 锚预注册过估披露形（三例同族：0.1.104 恰空形 / gate-113 注 A / S0-R2 §8-3 Δ 对账）

**条款**：lock-face 预注册的范围**允许过估**（多列候选文件/锚点）。落码/采认时若实际范围小于预注册，处置 = **过估披露**：在 gate 判定单或 f4 采认节如实记 Δ（哪些预注册项未触发、为何），方向非松弛（实际严于预注册）即不算 gate fail，禁静默缩范围。字面预注册形与批复/实测结构性互斥无落码解时，走勘误定形（先例：S0-R2 注 A 勘误——「禁现面 scope 重定义为 entry 可达公开类型面」），禁按失效字面强判。

> 落档注记（判读披露）：纪律 1 逐字承 S0-R2 §6-1 审计沉淀原文；纪律 4 逐字承 S0-R2 §8-3 注 3 + gate-113 注 A 先例；纪律 2/3 的细案以 0.1.119 周期 f4 侧采认记录为准（跨 session 通信面在案，docs 内无独立落档件），本节按 registration 档（docs/2026-11-16-0122-docs-normalization-registration.md §2）所列「docs 直推挂起窗口 / 巡检催办链」沉淀项定形——f4 抽核时如与本侧采认原文有出入，以 f4 原文为准订正。
