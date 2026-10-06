# AtlasCode

面向国产计算生态的通用 Coding Agent（CLI + TUI）。基座 = 完整 AI 辅助编程能力
（代码生成 / 重构 / 调试 / 测试 / 多智能体编排），差异化 = 国产 LLM 后端深度支持
（OpenAI-protocol 静态键车道，任意 OpenAI-compatible 端点）与国产平台工具链预留
（Ascend NPU 域包为可插拔叠加层，W6 起接入）。

> 版本现状：G-α 前置阶段（v0.1.0 发布待 W2–W4 闭环 + P-1 远端仓库，见
> `docs/roadmap-domestic-and-residuals.md`）。

## 安装

两种通道，装好后得双命令：`atlascode`（正名，与包名 / 品牌全名一致）/ `atlas`
（别名，更短）——二者同起 TUI，行为等价（O-3，0.1.34）：

**① npm 一行（推荐，仅需 [node](https://nodejs.org) ≥ 20，无需 bun/源码构建）**

```bash
npm install -g @atlasharness/atlascode
atlascode --help   # 别名 `atlas` 同效
```

**② git 源码**（前置：`git` + [bun](https://bun.sh)（构建）+ `node`（运行））

```bash
./install.sh [repo-url]
# 或 ATLAS_REPO=<url> ./install.sh
```

流程：`git clone → bun install → bun run build → 链接 ~/.atlas/bin/atlas`。
可覆盖 env：`ATLAS_INSTALL_ROOT`（默认 `~/.atlas/atlascode`）/ `ATLAS_BIN_DIR`
（默认 `~/.atlas/bin`）/ `ATLAS_BIN_NAME`（默认 `atlas`）。

> git 通道缺省 REPO = 公开发布仓 `vincentlau2046/AtlasCode`（P-1 已解除）；
> 本地开发可显式传参（本地仓路径或 `ATLAS_REPO`）；npm 通道不依赖 git 远端，
> 发布后即可用。
> 装好后远端升级：git 通道跑 `atlas update`（= `git pull --ff-only` + `bun install`
> + build，原地重建符号链接即刻生效）；npm 通道跑 `npm install -g
> @atlasharness/atlascode@latest`。本地 dev loop 见 `docs/dev-loop.md`。

## 配置

配置目录 `~/.atlas/`，主配置 `~/.atlas/settings.json`：

- **三角色模型池**（`premium` / `fast` / `small`）：`modelRoles.<role>` =
  `{ provider, model?, models?（池，水平回退序）, baseURL?, apiKey? }`；
  `defaultRole` 选主循环默认角色（缺省 `small`）。
- **Provider 表**：`providers.<name>` =
  `{ baseURL, apiKey, api, models: [{ id, name?, contextWindow?, maxTokens? }],
  defaultContextWindow?, defaultMaxTokens? }`；模型引用 `"<provider>/<modelId>"`
  （池内裸 id 按 provider 表归一化）。
- **鉴权**（OpenAI-protocol 静态键，优先级 env > settings 角色级 > settings 全局）：
  全局 `OPENAI_AUTH_TOKEN` / `OPENAI_API_KEY`；per-role
  `ATLAS_<ROLE>_MODEL` / `_PROVIDER` / `_BASE_URL` / `_API_KEY`
  （`<ROLE>` ∈ `PREMIUM` / `FAST` / `SMALL`）。

示例（IFF 网关，本机 IFF 侧配置）：

```json
{
  "defaultRole": "small",
  "providers": {
    "iff": {
      "baseURL": "http://127.0.0.1:8999/v1",
      "apiKey": "<your-key>",
      "api": "openai-completions",
      "models": [{ "id": "Qwen38-27B-TXT" }]
    }
  },
  "modelRoles": {
    "small":   { "provider": "iff", "models": ["Qwen38-27B-TXT"] },
    "fast":    { "provider": "iff", "models": ["Qwen38-27B-TXT"] },
    "premium": { "provider": "iff", "models": ["Qwen38-27B-TXT"] }
  }
}
```

## 使用

```bash
atlas                    # 交互式 TUI（Ink）
atlas --help             # 全量选项
echo "hi" | atlas -p --output-format stream-json --allowedTools "Read"
atlas update             # 远端升级（装好车道后）
```

headless 提示词经 stdin（或置于可变选项之前）；`--allowedTools` / `--tools` /
`--disallowedTools` / `--mcp-config` 为可变选项，会吞掉尾随位置参数——
prompt 放前面。G-α 冒烟清单见 `docs/smoke-checklist.md`。

## 仓库布局

- `src/` 八域 + `engine` + 壳：`shared`（叶子）/ `sandbox` / `memory` /
  `executor` / `modelprovider` / `task` / `bootstrap` / `permissions` /
  `hooks` 八域（port 解耦，只依赖 shared）+ `engine`（agent loop + 工具本体）
  + `cli`（公共域）/ `tui`（React+Ink 壳）/ `atlascode`（组合根壳）+
  `swarm` / `lsp` / `remote` / `mcp` / `ascend`（域包，未挂载）。
- `docs/execution-strategy.md` = 实施裁定记录（§8.x，临场裁回设计记录）；
  `docs/roadmap-domestic-and-residuals.md` = 发布路线（W1–W5 + W-opt，
  G-α/G-β 门禁）。
