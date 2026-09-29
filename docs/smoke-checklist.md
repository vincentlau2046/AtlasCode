# G-α 冒烟清单（roadmap §4 W5-5b）

发布门禁 G-α v0.1.0 全绿前置（`docs/roadmap-domestic-and-residuals.md` L172）：
以下各项全过方可切 `v0.1.0` 注解 tag + push + GitHub Release（alpha，内部）。
需 P-1（远端仓库建立，解除 no-push）后方可执行 push/Release 环节。

## 0. 版本管理初始化（5a）

- [ ] 远端仓库建立（P-1：`vincentlau2046-sudo/atlascode`，公开/私有裁定后）
- [ ] `package.json` version → `0.1.0`；`v0.1.0` **注解 tag**（波 tag 与 SemVer 双轨不混用）
- [ ] push master + tag；GitHub Release（alpha，内部；附本清单结果）

## 1. 一键安装验真（全新目录）

```bash
rm -rf ~/.atlas/atlascode ~/.atlas/bin/atlas
ATLAS_REPO=<P-1 仓 URL> ./install.sh
# 预期：clone → bun install → build（~800 模块）→ ln ~/.atlas/bin/atlas
~/.atlas/bin/atlas --help          # banner + 选项表，exit 0
```

- [ ] 全新目录安装成功，`atlas` 在 PATH（`~/.atlas/bin`）
- [ ] `--help` exit 0 且含 TUI/headless 选项

## 2. 远端升级验真（`atlas update`）

```bash
cd ~/.atlas/atlascode && git commit --allow-empty -m smoke && git push
~/.atlas/bin/atlas update          # = git pull --ff-only + bun install + build
~/.atlas/bin/atlas --help          # 符号链接即刻生效
```

- [ ] update 全链成功（ff-only 拉取 + 重建）；无 remote 态（P-1 未建期本地常态）
  = 明示手动指引 exit 1，不伪装能力

## 3. 配置（三角色模型池）

`~/.atlas/settings.json` 按 README 示例配置（`providers.<name>` +
`modelRoles.{premium,fast,small}` + `defaultRole`）；鉴权走
`OPENAI_AUTH_TOKEN`/`OPENAI_API_KEY` 或 per-role `ATLAS_<ROLE>_*` env。

- [ ] 配置写入后无 schema 报错（启动日志无 config 红）

## 4. `--help`

- [ ] `atlas --help` exit 0，选项表完整（TUI + headless + `update` 子命令）

## 5. headless `-p` 一轮（真 LLM 回合）

```bash
echo "回复且仅回复：OK" | atlas -p --output-format stream-json --verbose
```
（stream-json 输出格式需 `--verbose`，否则 gate 5 拒：「--output-format=stream-json requires --verbose」。
P-2 端点未通时本项 SKIP（live-gateway 门控，非红）。）

- [ ] 收到 assistant 文本（含 "OK"），stream-json 事件流完整（init/assistant/result），
  进程正常退出（**G-α 冒烟真跑 ≥ 1 次通过**，P-2 端点）。
  2026-09-30 dry-run 实测（IFF 网关 127.0.0.1:8999，模型 Qwen38-27B-TXT）：exit 0，
  assistant 文本 "OK"，`result.subtype=success, is_error=false, num_turns=1` ✓

## 6. TUI 启动 + 交互一轮（PTY）

```bash
# TUI 入口 = dev launcher 薄壳（不经 bin；S-C1 裁定「TUI 默认启动支归 launcher 壳，不经 bin」）
script -qec 'bun run src/atlascode/launcher.ts' /dev/null   # PTY 包裹（CI 无 PTY 会挂起，本地跑）
# 交互：首启 = 模型预设屏（选 IFF 预设 → 端点表单 3 字段）→ REPL；输入 prompt → Enter →
# 观察到 assistant 流式渲染 + 工具调用（如有）
```

> ⚠️ 已知态（勿当新故障）：安装的 `atlascode` bin（= dist/cli.js）无参交互态 =
> **登记前向接缝**（`src/cli/parse.ts:361`「交互入口 = 壳波 #152 前向接缝（launchRepl
> 未落盘）」H6 登记）——TUI 真启动走 dev launcher，bin 侧 TUI 接线 = **W5 收口项**
> （G-α 若要求「安装即用 TUI」须补 bin→TUI 接线，否则 v0.1.0 alpha 产品面 = headless
> -p + CLI 命令，TUI 需 dev 源）。另 banner 品牌面现仍渲染 **AtlasHarness**（`AtlasHarness
> v0.0.1`），与 CLI bin 名 `atlascode` / launcher 日志 `[AtlasCode]` 不一致 = 品牌一致性
> 残口（双层品牌规范：对外品牌 = AtlasHarness 对 AtlasHarness 仓成立；AtlasCode 仓是否
> 改对外品牌归 W5 裁定）。

- [ ] banner 模型 = `modelRoles.<defaultRole>` 池头（provider 前缀剥离）
- [ ] 交互一轮往返渲染正常；退出（Ctrl-D / 退出命令）进程无悬挂
  2026-09-30 dry-run 实测（dev launcher + IFF 网关）：banner `AtlasHarness v0.0.1 /
  Qwen38-27B-TXT` → REPL → prompt「回复且仅回复：OK」→ `✽ Roosting…` → assistant `● OK` 渲染 ✓

## 7. 静态门禁（发布前全量）

- [ ] `npx tsc --noEmit` 0
- [ ] `npx eslint src/ --no-warn-ignored` 0 error
- [ ] `bun run build` 成功
- [ ] `bun test --isolate tests/` 全绿 + CI gate（tests/ci）

> 已知坑（勿当新故障重查）：可变选项吞尾随位置参数（prompt 前置）；
> e2e PTY 测试 CI 挂起（skip 设计）；glob-grep 需系统 `rg`（缺则 skip）。
