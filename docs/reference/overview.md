# AtlasCode 概览与快速上手

> 内容事实源：`package.json`（name/bin/version）、`src/atlascode/cli.ts`（bin 入口）、
> `README.md`（安装/发布通道）、`src/modelprovider/`（模型车道）。

## 是什么

AtlasCode（npm 包 `@atlasharness/atlascode`，bin = `atlas`）是面向国产计算生态的
通用 Coding Agent：AI 辅助编程全能力（代码生成、重构、调试、测试、多智能体编排），
差异化 = 深度集成国产硬件/工具链（CANN 算子开发、NPU 模型适配、硬件感知调试、
国产 LLM 后端）。

- 仓库：`https://github.com/vincentlau2046/AtlasCode`
- 发布通道：npm（`@atlasharness/atlascode`）+ git 双通道升级（`atlas update`）

## 安装

```bash
npm install -g @atlasharness/atlascode   # npm 通道（推荐）
atlas update                             # 原地升级（git 安装走 pull+build；npm 安装走 install -g @latest）
atlas update --check                     # 仅查最新版
```

## 第一次跑通（模型配置）

AtlasCode 的模型车道 = **OpenAI 协议静态键**（无账号/订阅/refresh-token 面）。
两种配法（任选其一，详见 [network-config.md](network-config.md)）：

1. **settings.json（推荐）**：`~/.atlas/settings.json` 写 `providers` +
   `modelRoles`（角色池：`main` / `small` / `fast` / `premium`…，角色内水平 fallback）。
2. **环境变量**：`OPENAI_AUTH_TOKEN`（或 `OPENAI_API_KEY`）+ 按角色
   `ATLAS_<ROLE>_MODEL`（如 `ATLAS_MAIN_MODEL=provider/model`）。

```bash
atlas        # 启动交互式 TUI（v0.1.2+ 三命令面：atlas / atlascode / atlas code）
atlas -p "解释这个仓库的结构"   # headless 单轮
```

## 配置文件位置

| 路径 | 用途 |
|---|---|
| `~/.atlas/settings.json` | 用户全局配置（providers / modelRoles / hooks / permissions / search …） |
| `<project>/.atlas/settings.json` | 项目共享配置（入库） |
| `<project>/.atlas/settings.local.json` | 项目本地配置（不入库） |
| `ATLAS.md` / `ATLAS.local.md`（项目根） | 项目记忆指令文件（见 [memory.md](memory.md)） |
| `~/.atlas/keybindings.json` | 自定义快捷键（见 [keybindings.md](keybindings.md)） |
| `~/.atlas/` | 运行时状态（会话日志、缓存、插件市场克隆等） |

## 常用入口

- `/help` — TUI 内帮助（含各主题深链到本目录）
- `/mcp` — MCP 服务器管理（CLI 面见 [cli-reference.md](cli-reference.md)）
- `atlas mcp add/list/remove/get` — MCP CLI
- `atlas auto-mode defaults|config|critique` — auto 模式分类器检视
- `--dangerously-skip-permissions` — 无互联网沙箱内跳过权限（见 [security.md](security.md)）

## 升级与回退

- 升级：`atlas update`（npm 通道）或 git 安装面 `git pull && bun run build`。
- 版本自识别：运行时包根 `package.json` 单一事实源（`-v` 输出 `<version> (AtlasCode)`）。
- 回退：npm `npm install -g @atlasharness/atlascode@<旧版本>`；git 面 `git checkout <tag>`。
