# 测试方案重推导（test-strategy-rederive）

> **触发**：B 波复盘发现"测试盲区"——6 个空 `export {}` stub 骗过了 tsc/lint/test/build 四件套，核心执行行为（executor/sandbox）零覆盖却全绿。
> **地位**：活文档。本文记录**问题清单 + 每波测试方案骨架 + 防腐不变量**，后续逐波展开（标 ⏳ 的节在对应波实施时填细节）。
> **原则**：先记录问题，再逐步展开，最怕再次"被骗过"导致架构腐化。

---

## 0. 根因：这次为什么被骗过

**表面**：6 个空 stub 通过 CI 四件套。
**根因**：所有门都测**"现有代码的结构正确性"**（能编译、能 lint、纯函数单测绿），**从没有一门测"能力是否存在"**。
- `export {}` 是**结构合法**的（编译过、lint 过、导出了"无"）→ 顺过每一道门。
- 测试**与实现共存**：hollow 实现没有测试，而**没有任何门问"这个域声明的能力有没有测试"**。
- 报告口径混同：**"291 pass"被当 gate**，把"通过的单测数量"等同于"能力覆盖度"——291 个 config/纯函数测试的强绿，掩盖了 6 个空文件。

**一句话**：gate 量的是"我有什么代码是对的"，不是"该有但缺的能力"。

---

## 1. 问题清单（已记录，待逐波展开）

| # | 漏洞 | 证据 | 状态 |
|---|---|---|---|
| **H1** | 无提交 CI 管道 | 新仓无 `.github/workflows`；四件套是本地手工纪律，可跳过、无机器跑防腐门 | ⏳ 展开 |
| **H2** | 测试与实现共存非与能力共存 | executor 仅 `executor-config`+`executor-toolchain` 2 测试；sandbox 仅 `sandbox-config`+`sandbox-violation-text`；执行/建 manager 行为**零测试** | ⏳ 展开 |
| **H3** | 丢行为验收层 | 旧仓有 `golden-toolExecution` / `sandbox.test` 行为测试 + integration(10) + e2e(2) + mutation/coverage 系统；新仓只搬了 unit 一层 | ⏳ 展开 |
| **H4** | 无防腐不变量 | `export {}` 结构合法，tsc/lint/test/build 全顺；无门拦截"域核心是空 stub" | ⏳ 展开 |
| **H5** | 无独立能力规约/矩阵 | "done" = 交付物清单（config.ts 落、types 迁），非能力验收 | ⏳ 展开 |
| **H6** | 空洞等价腐化向量 | C 波 B9 双跑在 executor/sandbox 之上；若它们保持 hollow，上层等价**空真**通过（地基空 → 上层 diff 空对空） | ⏳ 展开 |
| **H7** | 测试计数混同 | "291 pass" 被当能力指标；数量强 ≠ 覆盖对 | ⏳ 展开 |

---

## 2. 重推导五原则

1. **done = 能力，非交付物**：每波"完成"由**能力验收测试**（域真的把活干成，mock 处用 mock）把关，**先于/伴随实现**从能力规约派生，非从代码派生。
2. **防腐不变量（机器门）**：
   - 域模块一旦该波声称完成，**不得是空 `export {}` / 低于实现下限**（AST/grep 门）。
   - 域公共契约（接口）须有 ≥1 个非平凡具体实现**并接入门面**（契约符合门）。
   - 每域须有 ≥1 个**行为测试**（非仅 config 解析）。
3. **分层能力不变量（防腐核心）**：层 N+1 只能建在层 N 通过能力门之后。**地基空 → 上层等价空真**——把"地基不腐烂"从口号变门。
4. **每波独立测试规约**：实施前先提交**能力矩阵**（域 × 能力 → 证明测试文件 → 状态），测试对着矩阵写（波级 TDD）。矩阵 = 本文的"问题记录"载体。
5. **提交 CI 管道 + 功能 smoke 门**：把四件套落 `.github/workflows`，加 **B6-func**（真实跑一条命令 / 建一个 manager / mock 一次 completion / 写读一次 memory）。

---

## 3. 每波测试方案（骨架，逐波展开）

### Wave A（已完 · 回顾补强）
- 原 smoke：框架加载 + feature() 纯函数。对 A 波本身够（当时无行为）。
- **补强（现在做）**：落地防腐不变量机制 + 能力矩阵机制，让 B/C 继承。
  - ⏳ 展开：`tests/ci/anti-stub.ts` + `tests/ci/capability-matrix.ts` 骨架 + `.github/workflows/ci.yml`。

### Wave B（已完 · 回顾纠偏）
- **盲区**：executor/sandbox 6 空 stub，行为零覆盖。
- **纠偏动作**：
  - memory/modelprovider（真码）→ 补**能力验收测试**：`memory 能写+读`、`modelprovider 能（mock）出 completion`。
  - executor/sandbox → 矩阵标 **STUB/MISSING（C-Deep 解锁）**，**不写假装通过的测试**。
  - 加防腐门（H4），让 6 空文件**过不了未来任何波的门**。
  - 加 **B6-func** 为 C 波首个行为门。
  - ⏳ 展开：memory/modelprovider 能力验收测试具体用例。

### Wave C（即将 · 前置重排）
顺序（功能纵切优先，见 execution-strategy §8）：
1. C1 叶子下沉 → 每叶子带单测（移植旧仓 unit 覆盖）。
2. C2-executor-ports（TaskOutput/bootstrap-state/sandbox 注入 3 port）→ 每 port 一个 fake + **port 契约测试**。
3. C-Deep（填 6 stub + 建 task/bootstrap/permissions/hooks 4 域骨架）→ **每填的 stub 配行为测试** + 4 新域各自能力测试。
4. **★ B6-func 功能门**：真实跑一条 shell 命令 + 建一个 sandbox manager（mock 后端）+ mock 一次 completion + 写读 memory —— **证明迁移链真能跑，先于 engine**。
5. 再 C1/C2 engine 212 叶子 + port → **B9 双跑**（此时建在**已验证地基**上，等价非空真）。
6. B9 + B14 package gate → wave-c。
  - ⏳ 展开：3 port 的 fake + 契约测试用例；4 域骨架的能力测试；B6-func 具体断言。

### Wave E（ascend）
- gelu L1 活体（调全 16 工具）+ 既有 L4 evals。
  - ⏳ 展开：4 业务面能力矩阵行。

### Wave D（壳/UI）
- 全栈 gelu 复验 + e2e PTY（移植旧仓 2 个 PTY e2e）。
  - ⏳ 展开：PTY e2e 移植清单。

### Wave F（清尾）
- 回归守卫（旧路径行为在删除前守，仿旧仓 regression 层）。
  - ⏳ 展开：回归守卫清单。

---

## 4. 防腐不变量（机器门，落 tests/ci/）

| 门 | 文件 | 拦截什么 | 波次 |
|---|---|---|---|
| 防腐 anti-stub | `tests/ci/anti-stub.ts` | 域完成波内出现空 `export {}` / 低于实现下限 | A 补起，B 起生效 |
| 契约符合 | `tests/ci/contract-conformance.ts` | 域门面须 re-export ≥1 具体实现；factory 用 fake deps 实例化非 throw | B 起 |
| 能力覆盖 | `tests/ci/capability-coverage.ts` | 每域 ≥1 行为测试（非仅 config）；读能力矩阵，标 DONE 的行缺证明测试即红 | B 起 |
| 分层不变量 | `tests/ci/layered-invariant.ts` | 层 N 能力门 JSON stamp 为前置件，层 N+1 门检查它 | C 起 |
| 能力矩阵 | `tests/ci/capability-matrix.ts` | 域×能力→证明文件→状态 的单一事实源 | A 补起 |

**H1 收口**：以上门全部进 `.github/workflows/ci.yml`，机器自动跑，非手工纪律。

---

## 5. 能力矩阵（骨架，逐波填）

| 域 | 能力 | 证明测试文件 | 状态 |
|---|---|---|---|
| memory | 写+读 memory | `tests/unit/memory-store.test.ts`（已） | ✅ |
| memory | 路径解析/校验 | `tests/unit/memory-paths.test.ts`（已） | ✅ |
| modelprovider | mock 出 completion | ⏳ 待建 | ⏳ |
| modelprovider | 角色 fallback | `tests/unit/model-roles.test.ts`（已） | ✅ |
| executor | 执行一条 shell 命令 | **无**（stub） | ❌ MISSING→C-Deep |
| executor | 工具链占位替换 | `tests/unit/executor-toolchain.test.ts`（已） | ✅ |
| sandbox | 建 sandbox manager | **无**（stub） | ❌ MISSING→C-Deep |
| sandbox | 违规文本处理 | `tests/unit/sandbox-violation-text.test.ts`（已） | ✅ |
| engine | （C 波建） | — | ⏳ C 波 |

> 状态口径：`✅` 有通过的行为测试；`❌ MISSING` 能力未实现（标解锁波次）；**绝不写假装通过的能力测试**。

---

## 6. 下一步（展开顺序）

1. **现在做**：落 `tests/ci/anti-stub.ts` + `capability-matrix.ts` 骨架 + `.github/workflows/ci.yml`（收 H1+H4），让 6 空 stub 从此**过不了门**——这是"怕再被骗"的第一道锁。
2. **C 波开第一步时**：展开 C1 叶子单测 + 3 port 契约测试的具体用例。
3. **C-Deep 时**：展开 4 域骨架能力测试 + B6-func 断言。

每步展开后回写本文对应 ⏳ 节，保持活文档。
