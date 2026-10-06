# 发布规则（f4 规划/管理 lane 定，2026-10-06 用户裁定）

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

> 判据事实源：`docs/2026-10-05-p0-closure-status.md` §2.4/§2.5；实例 `docs/2026-10-05-live-gateway-classifier-e2e-wave.md`。
