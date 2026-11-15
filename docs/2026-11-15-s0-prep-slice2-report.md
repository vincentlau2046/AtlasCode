# S0 #391 prep 切片② 波报告（8 安全 findings 修形 + G1/G2 拆分 + schema v2/pairing + 总约 §8 修订）

日期：2026-11-15。依据：工单 §2.1 必改面 + §2.2 G1/G2 分离预注册形 + §5.5-3
事项 A 裁定（findings 全落 prep 必改面 = 计划内 prep 切片②）。序列：
S0-P/U/R 五段全链收口（含 e2e 生产复验 r-20261115-prodlane-115-116 PASS）→
**本切片** → prep gate（G1 六证据键 + 真值表）f4 采认。

## 落码面

| 文件 | 内容 |
|---|---|
| `scripts/atlas-family-foundation-readiness.ts` | **G1/G2 拆分**：新增 `evaluateImplementationAdmission`（G1 实施准入，六证据键 `IMPLEMENTATION_ADMISSION_EVIDENCE`：userAuthorization / ticketAuditPass / s3bProductionEvidence / isolationPlan / contractReview / upstreamDependencyPlan；缺失/空/空白均拒，fail-closed；**不要求 controller PASS**）；`evaluateFoundationReadiness`（G2）原谓词与证据键零改动 |
| `scripts/atlas-host-state-access-scan.ts` | **缺 root 显式 fail**：候选根不存在/非目录 → violation `candidate-root-missing`（原静默 continue 销项）；头注钉死「正则仅辅助信号，绿灯不证明运行隔离/授权读写」 |
| `scripts/atlasweb-kernel-boundary-scan.ts` | ①`.js`→`.ts/.tsx` 映射（node16 边）；②`@atlas/*` 非 private alias 解析为仓库内 `src/` 边并做 boundary 检查（不解析即 fail-closed）；③bare 外部包闭包证据：新输入 `externalDependencies`——未提供 → `external-import-unverified`（不靠跳过当闭包通过）；提供但未声明 → `undeclared-external-import`；声明内 → 记入 `externalImports`（审计面，非闭包证明）；④symlink canonicalize（`realpathSync` 后做 boundary 检查）+ walk 改 `statSync` 跟随（symlink 源文件不再静默跳过，dangling 跳过）；⑤re-export（`export…from`）与字面 `import()` 边既有正则覆盖，测试补断言 |
| `docs/products/atlas-family-manifest.v2.schema.yaml`（新） | v2：schemaVersion const 2；**pairingRef 必填**（path + 64-hex sha256 不可变绑定）；provenance commit 收紧为 40-hex 全长；`configDirName` 收窄 `^~/\.[A-Za-z0-9][A-Za-z0-9._-]*$`（单一 dot 目录，禁穿越）；additionalProperties:false 保持（未知字段拒非静默丢） |
| `docs/products/atlas-family-pairing.schema.yaml`（新） | 独立配对证据 schema v1（§2.2 字段全列）：upstream 40-hex / packageName+version / contractEntry 必填 + runtimeEntry 可 null / artifact sha512 integrity / protocolVersion 'v0' + envelopeVersion 0 / consumerCommit+consumerLockDigest 可 null / evidenceDigest 64-hex / products{registered,enabled,accepted 独立} / rollback{disabled|verified-pair，verified-pair 须 pairDigest}；**if/then 两条**：placeholder:true → accepted:false；runtimeEntry:null → ready 不得 true |
| `docs/products/atlas-family-manifest.schema.yaml` | v1 零语义改动（仅移除 ajv-strict 非标 `name`/`version` 元键，验证行为不变） |

## 总约 §8 条款修订面（按 317f4845 原文定位，保留历史依据）

| 文件 | 修订 |
|---|---|
| `docs/2026-11-13-atlasweb-arch-pin.md` | 新增 §0 修订记录表（A4 :15 / A7 :18 / F1-F7 :27-35 / §3 :43-45 / §5 :52-65 五行）+ §3、§5 就地 blockquote；**「立即可启动」「源树稳定零内核改动即可」撤回当授权**（G1 后开发、G2 后交付） |
| `docs/products/atlas-family-roadmap.md` | §S0 段后修订块（历史基座与未来桥分账；实际 commit/artifact 配对）+ :54-60、:86-89 两处就地注 |
| `docs/products/atlasweb/README.md` | Ownership（:9）→ G1/G2 分层注；Contract boundary（:31）→ 消费者禁私引 + 上游已审窄服务可消费 + scanner 非闭包证明 |
| `docs/products/atlasweb/foundation-readiness.md` | Releasability rule（:27-29）→ G1 建仓开发 / G2 保留全部发布硬门，G1=true/G2=false 合法 |
| `docs/superpowers/plans/2026-11-13-atlas-family-platform-plan.md` | Task 5（:232-246）+ Gate Foundation（:336）→ 分阶段 G1/G2；未经修订不按旧 gate 执行 |

## 测试（TDD：先 RED 21 pass/11 fail/4 err → 后 GREEN）

- 既有 3 文件扩形：readiness +5 件（六键冻结/G1 全正/逐键缺失+空拒/G1 不需 controller/G1≠G2 真值表/空白拒）、host-state +2 件（缺 root/根为文件均 fail-closed）、boundary +11 件（.js 映射×2/bare 未证/bare 未声明/scoped 包名/@atlas alias×2/re-export/动态 import/symlink 目标 canonicalize/symlink 源扫描/CLI 形）。
- 新 `tests/unit/atlas-family-manifest-schema.test.ts`：17 件（v1 兼容 3 + v2 6 + pairing 8）——ajv 2020 + yaml 实解析实校验（真 schema 编译，非形状快照）。

## 验证

- 四文件定向：**46 pass / 0 fail**（`./tests/` 前缀过滤——陈旧 worktree 副本隔离坑见披露 ④）。
- `npx tsc --noEmit` 0；`npx eslint src/` 0；`git diff --check` 0。
- canon 全量：**6070 pass / 0 fail / 497 文件**（基线 6034/0/496，Δ+36/+1 恰合：
  新 schema 件 17 + readiness +5 + host-state +2 + boundary +12）。

## 披露（f4 §5.6 纪律）

1. **§2.2 字段微扩**：pairing schema 在 §2.2 字段清单外加 `ready`（optional boolean，
   支撑「runtimeEntry null 不得标 ready」的可校验编码）与 `placeholder`（optional，
   支撑「占位产品不得 accepted」）。均为加严向、默认缺席不影响既有文档。
2. **bare 包语义**：`externalDependencies` 未提供时 bare import 判
   `external-import-unverified`（比「记录不拦」更严）——「不能靠跳过当闭包通过」
   的 fail-closed 直读；调用方声明 deps 后即恢复可过面。
3. **schema 元键**：v1 schema 头部非标 `name`/`version` 键移除（ajv strict 拒），
   纯验证面无损；v2/pairing 从一开始就不含。
4. **环境残留**：`worktrees/atlas-family-p0`（@317f4845，内容已被 master fdb4e569
   完全覆盖、dirty 面为 master 已落内容的重复）删除被权限 classifier 拒——
   留置待用户裁定；bun test 以 `./tests/` 前缀过滤规避其旧测试副本。
   `user-e2e/k5-bridge-proxy-v2.py` 未提交改动为 e2e lane 工作面，本波不触碰。
