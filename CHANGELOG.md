# Changelog

本文件是 AtlasCode 的版本变更日志（repo 内真实落点；产品内 `releaseNotes.ts`
启动时抓取本文件缓存展示，见 `src/tui/utils/releaseNotes.ts`）。
版本纪律：`0.1.x` 内自主递进，跨 `0.2`/`1.0` 需产品裁定。

## v0.1.1

- 修复 `--version` 显示：版本占位 `0.0.0` 闭核，改运行时包根自识别
  （`resolveCliVersion` 从 process.argv[1] 上行走 package.json 单一事实源，
  dev 态命中 repo 包根 / npm 全局安装命中 node_modules 包根）。
- 首发 0.1.0 发布面补丁（npm 通道 `@atlasharness/atlascode` 真机自动更新闭环
  0.1.0 → 0.1.1 验真通过）。

## v0.1.0

- 首发版（G-α）：
  - CLI：`atlascode`（bin = `atlas`）headless 面（`-p/--print`、stream-json、
    mcp / auto-mode / update 子命令族）。
  - 自动更新双通道：git 安装根 pull+bun+build / npm 全局安装
    `install -g @atlasharness/atlascode@latest`（`atlas update`，
    `--check` 仅查版）。
  - 模型车道 = OpenAI 协议静态键（`OPENAI_AUTH_TOKEN`/`OPENAI_API_KEY` +
    settings.json `providers`/`modelRoles` 角色池）。
  - WebSearch 客户端化：bing SERP 无 key 默认 + tavily 可选
    （`WEB_SEARCH_PROVIDER`/`WEB_SEARCH_ENDPOINT`/`TAVILY_API_KEY`，
    无 ATLAS_ 前缀；settings.json `search.tavilyApiKey`）。
  - 统一 node 运行器（bun 仅构建，bin shebang = node）。
