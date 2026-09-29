# AtlasCode 本地 dev loop（边使用边优化）

> R0 发布工具链 #177（roadmap §4 R0 并行带）。三条使用车道：
> **一键安装**（install.sh）/ **远端升级**（`atlas update`）/ **本地 dev loop**（本文）。

## 1. 一键安装（消费侧）

```bash
./install.sh <repo-url>        # 或 ATLAS_REPO=<url> ./install.sh
# = git clone → bun install → bun run build → link ~/.atlas/bin/atlas
```

- 安装根缺省 `~/.atlas/atlascode`，bin 符号链接 `~/.atlas/bin/atlas` → `<安装根>/dist/cli.js`（`#!/usr/bin/env bun` 直跑，bundle 自包含 2.1MB）。
- 前置：`git` + `bun`（脚本自带检测与安装指引）。
- ⚠️ **P-1 占位**：GitHub 发布仓未建前缺省 repo URL 是占位值——请显式传仓地址（本地路径亦可）；P-1 定案后回填缺省。

## 2. 远端升级（消费侧）

```bash
atlas update
# = git pull --ff-only → bun install → bun run build（安装根原地重建，符号链接即刻生效）
```

- 拒 diverge（`--ff-only`）：本地有 dev-loop 改动时先处理，不 force（dev-loop 边界）。
- 安装根无 git 远端（P-1 未建前 = 常态）→ 明示手动指引（`git remote add origin <仓> && git pull && bun install && bun run build`），不伪装升级能力。
- 版本报告：升级前后 `package.json` version（SemVer 自 W5 起初始化，此前 = 0.0.1 占位）。

## 3. 本地 dev loop（开发侧，边使用边优化）

```bash
git clone <repo> atlascode && cd atlascode
bun install
bun run build        # → dist/cli.js
chmod +x dist/cli.js
ln -sf $PWD/dist/cli.js ~/.atlas/bin/atlas   # 一次 link 后即"改码→build→即刻生效"
```

日常循环：

```bash
# 改码 → 重建 → 生效（atlas 符号链接指向本地构建，无需重装）
bun run build && chmod +x dist/cli.js
atlas ...            # 用本地改过的版本
```

验证四件套（每次改码后）：

```bash
npx tsc --noEmit && npx eslint src/ --no-warn-ignored && bun run build && bun test tests/
```

## 4. 车道边界

| 车道 | 场景 | 升级方式 |
|---|---|---|
| 消费侧 | 装来用 | `install.sh` 一次 + `atlas update` 持续 |
| 开发侧 | 边用边优化 | 本地 clone，`bun run build` 即刻生效；上游合并 `git pull --ff-only` |
| dev 态 vs 升级态冲突 | 本地有未合并改动 | `atlas update` 拒 diverge（明示指引）；或 `git stash` 后升级 |

**裁登记（H6）**：npm/npx 发布渠道 = 不入（版本管理方案裁定 GitHub 渠道 only）；`atlas update --check`（仅报告版本）= 未注册（面最小化，W5 按需补）。
