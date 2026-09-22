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
2. C2-executor-ports（TaskOutput/bootstrap-state/sandbox 注入 3 port）→ 每 port 一个 fake + **port 契约测试**。✅ 2026-09-22 完成（6343d4a：3 port + tests/fixtures/executor-port-fakes.ts 三 fake + 3 契约测试文件 15 断言）。
3. C-Deep（填 6 stub + 建 task/bootstrap/permissions/hooks 4 域骨架）→ **每填的 stub 配行为测试** + 4 新域各自能力测试。2026-09-22 修订（execution-strategy §8.9，C2-复审后）：切 **3 纵切片**（切片 1 executor 裁剪版 bash-only / 切片 2 sandbox / 切片 3 4 新域骨架+真端口适配器同提交登记）；B6-func 加 3 端口注入前置清单（fail-fast 运行时后果）；hooks 域跨域边（经 ShellCommand.taskOutput 穿透）建骨架时斩断。
4. **★ B6-func 功能门**：真实跑一条 shell 命令 + 建一个 sandbox manager（mock 后端）+ mock 一次 completion + 写读 memory —— **证明迁移链真能跑，先于 engine**。
5. 再 C1/C2 engine 212 叶子 + port → **B9 双跑**（此时建在**已验证地基**上，等价非空真）。
6. B9 + B14 package gate → wave-c。
  - ✅ 展开（2026-09-22）：3 port 的 fake + 契约测试用例已落（tests/fixtures/executor-port-fakes.ts + 3 契约测试文件）。⏳ 余：4 域骨架的能力测试（C-Deep）；B6-func 具体断言（B6-func 时展开）。

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

| 门 | 文件 | 拦截什么 | 波次 | 状态 |
|---|---|---|---|---|
| 防腐 anti-stub | `tests/ci/anti-stub.test.ts` | 空 `export {}` / 低于实现下限未登记 = 红；注册表漂移 = 红；wave-c 时注册表清零 | B-fix | ✅ 2026-09-22 |
| 能力覆盖（矩阵） | `tests/ci/capability-matrix.test.ts` | done 行缺证明测试 = 红；missing 行无解锁波次 = 红；四域须各有规约 | B-fix | ✅ 2026-09-22 |
| 契约符合 | `tests/ci/contract-conformance.ts` | 域门面须 re-export ≥1 具体实现；factory 用 fake deps 实例化非 throw | C 起 | ⏳ |
| 分层不变量 | `tests/ci/layered-invariant.ts` | 层 N 能力门 JSON stamp 为前置件，层 N+1 门检查它 | C 起 | ⏳ |

**H1 收口**：✅ `.github/workflows/ci.yml` 已落（四件套 + tests/ci 防腐门全管道化，机器自动跑非手工纪律；仓库暂无 remote，建 remote 后即刻生效）。

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

1. ✅ **已完成（2026-09-22，B-fix 独立项，C 波前置）**：`tests/ci/anti-stub.test.ts` + `tests/ci/capability-matrix.test.ts` + `.github/workflows/ci.yml`（收 H1+H4），让 6 空 stub 从此**过不了门**（未登记空壳 = 红 / 注册表漂移 = 红 / wave-c tag 时注册表清零）。门经变异验真（临时造未登记空壳 → 门①红，还原 → 绿）。**归类裁定：B-fix（B 波缺陷纠偏），非 C 波范围，C-Deep 前置件**——盲区是 B 交付留下的，纠偏记 B 账；但 C-Deep 填 stub 前门必须就位。已记入 execution-strategy §7/§8.3。
2. ✅ **C1 叶子单测已展开（2026-09-22，438a93b + b3c2fe1）**：4 个新叶子测试文件（`shared-string-utils` / `shared-circular-buffer` / `shared-errors` / `shared-format`，行为断言移植旧仓口径，含边界：safeJoinLines 部分容纳/无剩余空间、EndTruncatingAccumulator 截断+标记+totalBytes 全量、CircularBuffer 回绕 getRecent、shortErrorStack 帧数裁切）+ `shared-env` 扩展（parseBoundedIntEnv min 参数 / isEnvTruthy·isEnvDefinedFalsy 全集合）。**教训回写**：首版 4 个用例期望算错（标记串 14 非 13 字符 / addAll 保留满容量窗 / 9999999 才触 cap）——叶子移植必须逐边界实跑验证，不能凭读码推期望。
3. **C-Deep 时**：展开 4 域骨架能力测试 + B6-func 断言；填一个 stub 销一个 STUB_REGISTRY 条目（门②强制）。
4. ✅ **C1 复审（2026-09-22）已落 3 项防腐前置**（execution-strategy §8.6 复审表 + §8.7）：
   - 防腐门预覆盖 C-Deep 四域（task/bootstrap/permissions/hooks 目录存在即纳扫，变异验真：造空壳→门①红）；
   - fs 抽象 / debug no-op 单一事实源下沉 shared（防 C-Deep 域内复制腐化）；
   - **C-Deep 切 2 纵切片 + 每片功能 smoke**（tests/func/，port 之下全真）——把 H6 空洞等价的暴露窗口从"整个 C-Deep"缩到单切片；4 新域骨架须与 STUB_REGISTRY/capability-matrix 同提交登记（不留无门窗口）；mock-completion 由 B6-func 承载执行（不等 B9）。
5. ✅ **C2 3 port 契约测试已落（2026-09-22，6343d4a + C2-复审 f8c6719）**：executor 域 3 port（窄面依据旧仓真实消费面）+ `tests/fixtures/executor-port-fakes.ts` 三 fake（确定性+可观测，**不模拟真实域语义**——真语义归 C-Deep 域实现）+ 3 契约测试文件 16 断言（结构可赋值/fail-fast 未注入抛错/reset/行为可观测）。fail-fast 裁定：静默 no-op 兜底 = H6 空洞等价向量，故未注入 get = 抛错。capability-matrix 加 "3 port 契约" done 行。**C2-复审 3 发现（f8c6719）**：F1 TaskOutput 窄面漏 ShellCommand.ts 9 点消费→Handle 扩 12 成员；F2 fake 路径须真文件（真 spawn `open(O_CREAT)` 落 fd）→FileTaskOutputFake tmpdir 惰性 I/O（unit 层零磁盘纪律不破，func 层真 I/O 预验全绿）；F3 bootstrap 端口缺 pwd() 初值→加 getCwd()（ALS 覆盖层归 engine 不进门面）。**教训回写：port 面调研必须枚举"该 port 的全部消费文件"（初版只查了 Shell.ts，漏了 ShellCommand.ts）——消费面 grep 按符号全仓搜，非按单文件**。

每步展开后回写本文对应 ⏳ 节，保持活文档。
