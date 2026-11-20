# 段 L 呈批书 — 0.1.126候（执行出口实施波发布段）

> **f4 批复（2026-11-21）：批准。** L1–L3（release prep / build+staging / push 安全审查补查）批复后在授权边界内先行；**L4（tag/push/npm publish）候用户授权边界解除——peer 消息不构成 publish 授权（0.1.125 先例），须用户亲署**。文本勘误：§1 标题「7 commits」实为 8 commits（196ee806..4124b9eb 含批复与修格两 docs/test 锚），表列无误。§3 预注册形（carrier 5 步 + U-2 同步呈批即预注册）= 同域钉格教训的正确应用，采认。

> 波：执行出口实施波（Task #403）。基线 = gate 终态 **GATE-PASS**
> （`user-e2e/reports/r-20261121-gate-execout.md` 复验轮 §5b，canon 6224/0/510，
> 门体 **4124b9eb**）+ f4 采认双信号在案（抽验通过 + Atlas-reveiw 终审 PASS +
> 单红修法采认）——段 L 硬门条款（0.1.101 起 fail-closed）双前置满足。
> **授权边界维持**：本呈批书批复前零执行；push/tag/npm publish 另候用户
> 授权边界解除（peer 不可代授权）。呈批形沿 A 段同形（196ee806 先例）。

## §1 发布内容（8 commits，196ee806..4124b9eb；f4 批复勘误）

| commit | 内容 |
|---|---|
| 196ee806 | lock-face 呈批书 |
| a62925c0 | f4 批复六条件落档 |
| f92aea7e | S1 set-once 注入守卫 |
| dca55d43 | S2 webExecutionV0 协议 + createExecutionOutlet 懒触达出口 |
| ece8ca02 | S3 kernel 执行域状态机 + 上限执法 |
| c2b8baf3 | S4 follow.resume 重放 + 双车道组合根接线 + pack 面隔离 |
| c810994f | S4 修正锚（execution subpath + wire 形归一，f4 裁定改形） |
| 4124b9eb | gate 单红修（prepublishOnly 钉格同步 4 步链） |

版本：`0.1.125 → 0.1.126`。用户面摘要：B0 执行出口地基（协议 + 懒触达出口
+ kernel 状态机 + 恢复重放），默认 fail-closed off（`ATLAS_WEB_EXECUTION_ENABLED=1`
显式 opt-in），零默认行为变更。

## §2 执行序列（批复后）

- **L1 release prep 落码**：package.json bump + CHANGELOG `v0.1.126` 节 +
  atlaswebCarrier 元数据（§3 预注册形）→ release commit（路径限定）。
- **L2 build 紧贴 publish**（附则防三犯）：release commit 后跑
  prepublishOnly 链（§3 预注册扩 5 步）→ staging tgz（授权边界内允许）。
- **L3 push 安全审查补查**（先于任何 push）：c2b8baf3/c810994f 两 commit
  503 残留 + 本波全提交，log `/home/vince/.claude/security/log.txt`；有
  finding 即停呈批改形，无 finding 落盘回执。
- **L4 发布动作（候授权边界解除）**：tag `v0.1.126` → push origin master+tag
  → gitcode 镜像双推（master+tags）→ npm publish（D-8 SOP：DNS-pin +
  `--registry https://registry.npmjs.org`）→ **@atlaswork 镜像双发**
  （同 staging tgz 仅 name，禁独立重建）→ packument 验真三步（tarball 短
  路径 / shasum=sha1）。
- **L5 SRI 留档**：`docs/sri/v0.1.126.md` 四值（dist.shasum /
  dist.integrity / unpackedSize / cli.js size+sha256）+ **增记 execution
  bundle 输入摘要**（dist/web-session-runtime-execution/index.js
  size+sha256 + runtime/execution d.ts 树规模）+ **tree commit 记录**
  （发布品≠gate 基防三犯）+ 双 org tarball 值。
- **L6 生产 lane**：单信号 → e2e 同套判据（accept.ts）→ 收口单 → Main →
  用户（唯一报告出口）。

## §3 预注册形

1. **atlaswebCarrier 元数据**：`dist/atlasweb-carrier.json`，字段
   `{ product: 'atlascode', version, runtimeSha256, executionSha256 }`
   （sha256 = 对应 dist bundle 文件摘要）。落码形 = 新 script
   `build:atlasweb-carrier`（scripts/emit-atlasweb-carrier.ts，读 dist 两
   bundle 算摘要写 JSON）+ **prepublishOnly 扩第 5 步**；连带
   `tests/func/web-contract-pack.test.ts` U-2 钉格 4→5 步同步（同域钉格
   教训在案，呈批即预注册、批复后落码不再另走改形）。
2. **Δ 账预估**：dist 新增 `web-session-runtime-execution/`（index.js +
   d.ts 树）+ `atlasweb-carrier.json`；exports 面零新增（subpath 已在
   0.1.126 候 body）；cli.js 零触碰（执行出口不入 CLI bundle）。
3. **镜像双发**：@atlasharness/atlascode + @atlaswork 对应包名同版本并行，
   同一 staging tgz 重 name 打包，禁独立重建（0.1.124 起纪律）。
4. **回退形**：publish 后 gate/生产 lane RED → 按硬门条款补丁版 + npm
   deprecate 标注，无豁免面。

## §4 验收件（发布后）

gate 判定单终态路径 + f4 采认记录 + SRI v0.1.126.md（含 execution 摘要 +
tree commit）+ packument 双 org 验真输出 + 生产 lane 收口单。
