# 记忆文件（ATLAS.md）

> 内容事实源：`src/tui/utils/memoryFileMigration.ts`（ATLAS.md/ATLAS.local.md
> 文件名 + 一次性迁移）、`src/memdir/`（memory 提示词生成）、`src/tui/commands/memory/`（/memory 命令）。

## 文件族

| 文件 | 作用 | 入库？ |
|---|---|---|
| `ATLAS.md`（项目根 / 父目录逐级） | 项目指令：给 agent 的持久上下文（约定、命令、架构说明） | 是（团队共享） |
| `ATLAS.local.md` | 本机个人指令（覆盖/补充 ATLAS.md，不提交） | 否 |
| `~/.atlas/` 下记忆目录 | 跨项目 auto-memory（agent 自动沉淀的经验） | — |

## 用法

- 在项目根写 `ATLAS.md`，启动会话时自动发现并注入（父目录逐级向上找）。
- `/memory` 命令查看/编辑当前记忆文件。
- 旧文件名 `ATLASHARNESS.md` 在启动时一次性自动迁移为 `ATLAS.md`
  （`memoryFileMigration.ts`，无需手工改名）。
- `--add-dir <dirs...>` 可把额外目录纳入 ATLAS.md 发现范围。
- `--bare` 模式跳过 ATLAS.md 自动发现（最小模式语义，见 cli-reference.md）。

## 写什么

- 构建/测试命令（如 `bun run build`、测试跑法）
- 代码风格与约定、模块边界
- 环境特殊说明（依赖的系统工具、mock 开关如 `ATLAS_ASCEND_MOCK=1`）
- 不需要：agent 自己能读代码得到的信息（保持精简，省上下文）
