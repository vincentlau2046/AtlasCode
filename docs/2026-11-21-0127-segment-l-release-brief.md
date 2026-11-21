# 段 L 呈批书 — 0.1.127候（B1 前置件 + 安全硬化波发布段）

> **状态：终稿候 f4 批复**。gate 终态 **GATE-PASS**（判定单
> `user-e2e/reports/r-20261121-gate-0127.md`，锚 9a83e7ec HEAD=origin
> ALIGNED 独立 fetch 证；canon **6233/0/511 exit 0**；Δ账 +9/+1 恰合零
> 超集；wire A/B 段与 0.1.126 逐格同形零默认行为变更 + C 段注入形 wire
> 级成立 runTurnCalled=1；f4 增记 artifact 级闭环——execution bundle
> grep createExecutionComposition=2 处在品 + pack :246 判别腿 9/9 +
> runtime 面字节恒等第三版 7e7e6f38）。**L4 npm 双 org 发布候用户
> 亲署**（f4 裁定：0.1.127 为新版本号，0.1.126 授权不延及）。
> 注记勘误：gate 信号「kernel-execution 29/29」为双文件并跑口径
> （kernel-execution 27 + composition 2），e2e 单文件机器判 27/27，
> 域内全绿与 Δ 恰合不受影响。

> 波：B1 前置件 + 推送安全硬化（f4 附条件采认 + 归属裁定 @2f8a716）。
> **发布必要性定谳（f4 同意）**：已发布 0.1.126 execution bundle 无
> createExecutionComposition（发布时序事实非缺陷——形 1/2 与硬化均为
> 发布后增量），B1 upstream.ts 注入形前置载体 = 0.1.127，版本列车顺延
> 合规，无需回补 0.1.126。

## §1 发布内容（3 commits，34437b0f..9a83e7ec）

| commit | 内容 |
|---|---|
| 34437b0f | B1 前置件形 1/形 2（emitDelta 缝 + createExecutionComposition 注入形组合根 + entry/pack 出口面 + pack 判别腿） |
| 9a5e2075 | 推送安全审查 F1/F3/F5 硬化（decide 全三元组绑定 / 流键 NUL 守卫 / 终态后 delta 门） |
| 9a83e7ec | F4 delta 字节上限 kernel 入口执法（256KiB + turnStates 审计读门 running 段同步修） |

版本：`0.1.126 → 0.1.127`。用户面摘要：执行出口 kernel 硬化 + 注入形组合
根（B1 web 车道前置），默认仍 fail-closed off（`ATLAS_WEB_EXECUTION_ENABLED=1`
显式 opt-in），CLI 车道零参默认行为零变更。

**gate 判别要点（f4 增记，防同型时序缺口）**：execution bundle 本版须含
createExecutionComposition——pack 面 machine 判
`tests/func/web-session-runtime-pack.test.ts:246` 判别腿已在格
（34437b0f 落格，gate 覆盖）。

## §2 执行序列（GATE-PASS + f4 批复双在案后）

- **L1 release prep 落码**：package.json bump 0.1.127 + CHANGELOG `v0.1.127`
  节 + atlaswebCarrier 元数据重算 → release commit（路径限定）。
- **L2 build 紧贴 publish**（附则防三犯）：release commit 后跑
  prepublishOnly 5 步链 → staging tgz。
- **L3 push 安全审查补查**（先于任何 push）：34437b0f/9a5e2075/9a83e7ec
  三 commit 全查（34437b0f 已有 5 findings 闭环记录：F1/F3/F5 修形
  9a5e2075 + F2 归 upstream 裁定 + F4 归属裁定 9a83e7ec），log
  `/home/vince/.claude/security/log.txt`；有 finding 即停呈批改形。
- **L4 发布动作（候用户亲署）**：tag `v0.1.127` → push origin master+tag
  → gitcode 镜像双推（master+tags）→ npm publish（D-8 SOP：DNS-pin +
  `--registry https://registry.npmjs.org`）→ **@atlaswork 镜像双发**
  （同 staging tgz 仅 name，禁独立重建）→ packument 验真三步。
- **L5 SRI 留档**：`docs/sri/v0.1.127.md` 四值 + execution bundle 输入摘要
  （本版 executionSha256 预计**变**——组合根 + F1/F3/F5/F4 入包；
  runtimeSha256 预计不变）+ tree commit 记录 + 双 org tarball 值。
- **L6 生产 lane**：单信号 → e2e 同套判据 → 收口单 → Main → 用户。

## §3 预注册形

1. **atlaswebCarrier 元数据**：字段形不变
   `{ product: 'atlascode', version: '0.1.127', runtimeSha256, executionSha256 }`
   （script `build:atlasweb-carrier` 已在格，prepublishOnly 第 5 步）。
2. **Δ 账预估**：`dist/web-session-runtime-execution/index.js` 字节变
   （+createExecutionComposition +F1/F3/F5/F4 硬化）；d.ts 树增
   executionComposition.d.ts；`atlasweb-carrier.json` executionSha256 变、
   runtimeSha256 恒等；cli.js 零触碰；exports 面零新增。
3. **镜像双发**：@atlasharness/atlascode + @atlaswork 同版本并行，同一
   staging tgz 重 name 打包，禁独立重建。
4. **回退形**：publish 后 gate/生产 lane RED → 按硬门条款补丁版 + npm
   deprecate 标注，无豁免面。

## §4 验收件（发布后）

gate 判定单终态路径 + f4 采认记录 + SRI v0.1.127.md（executionSha256 变值
+ tree commit）+ packument 双 org 验真输出 + 生产 lane 收口单。
