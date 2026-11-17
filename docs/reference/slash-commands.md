# Slash 命令参考

> 代码事实源：`src/tui/commands.ts`（`COMMANDS()` 注册表 + `INTERNAL_ONLY_COMMANDS`）与
> `src/tui/commands/<name>/` 各实现目录；feature 门语义 `src/shared/feature.ts`。
> 刷新：0.1.122（A2，工单 docs/2026-11-17-0122-docs-normalization-ticket.md）。
> 本文件引用符号名而非行号（行号是最快腐化面）；对表口径 = 命令注册表运行时实形。

交互式 TUI 内以 `/` 起头的命令面。总数口径（源码实核，0.1.122 刷新）：

- **默认构建常驻注册：61 个不同命令名**（63 个注册 entry，其中 `/context` 与 `/goal`
  各有交互 + headless 双 entry 同名）。
- 条件注册（feature 门默认关）：`/fork` / `/peers` / `/workflows`（默认关且实现为死 stub，
  不开也不可用）与 `/voice`（默认关，真实现）。
- 开发构建（`ATLAS_DEV=1` 且非 demo）另并入 INTERNAL_ONLY：`/commit`、
  `/commit-push-pr`、`/init-verifiers`、`/version`、`/force-snip`（`/force-snip` 还需
  `FEATURE_HISTORY_SNIP=true`）。
- 未注册但文件存在的命令实现：`/install`（`commands/install.tsx`，未入注册表，不可用）。

> 口径订正披露：早期工单口径「cmd 32」与源码不符——31–33 是部分历史波的对账口径，
> 实际默认构建为 61 名。本文件即权威全清单。

## 全量清单（默认构建）

type 说明：`prompt` = 展开为提示词发给模型；`local` = 本地执行；`local-jsx` = 交互 UI。
门控列省略 = 无条件注册。

| 命令 | 别名 | type | 说明 |
|---|---|---|---|
| /add-dir | — | local-jsx | 添加新的工作目录 |
| /agents | — | local-jsx | 管理 agent 配置 |
| /autocompact | — | local-jsx | 设置自动压缩窗口档位（选择器或 `/autocompact 128k` 直设：100k/128k/200k/256k/Nk/P%/auto/off） |
| /branch | /fork* | local-jsx | 在当前对话点创建分支（*别名仅在 `FEATURE_FORK_SUBAGENT` 未开时生效，默认即此形） |
| /btw | — | local-jsx | 不打断主对话的快速侧问 |
| /cd | — | local | 更改会话工作目录（不破坏 prompt 缓存） |
| /clear | /reset, /new | local | 清空会话历史并释放上下文 |
| /color | — | local-jsx | 设置本会话提示条颜色 |
| /compact | — | local | 压缩历史保留摘要；可 `/compact [摘要指令]`。门控 `!DISABLE_COMPACT` |
| /config | /settings | local-jsx | 打开配置面板 |
| /copy | — | local-jsx | 复制上一条回复到剪贴板（`/copy N` 取倒数第 N 条） |
| /context | — | local-jsx | 彩色网格可视化当前上下文占用（交互 entry；headless 另有同名 local entry） |
| /cost | — | local | 当前会话总费用与时长 |
| /diff | — | local-jsx | 查看未提交改动与逐回合 diff |
| /doctor | — | local-jsx | 诊断安装与设置。门控 `!DISABLE_DOCTOR_COMMAND` |
| /effort | — | local-jsx | 设置模型 effort 档位 |
| /exit | /quit | local-jsx | 退出 REPL |
| /export | — | local-jsx | 导出当前会话到文件或剪贴板 |
| /feedback | /bug | local-jsx | 提交反馈。门控 `!(DISABLE_FEEDBACK_COMMAND \|\| DISABLE_BUG_COMMAND \|\| isEssentialTrafficOnly())` |
| /files | — | local | 列出当前上下文中的文件 |
| /goal | — | local-jsx | 设置/清除目标条件（`set <condition>` \| `clear`；headless 同名 local entry） |
| /heapdump | — | local | 把 JS 堆转储到 ~/Desktop |
| /help | — | local-jsx | 帮助与可用命令 |
| /hooks | — | local-jsx | 查看工具事件的 hook 配置 |
| /ide | — | local-jsx | 管理 IDE 集成与状态 |
| /init | — | prompt | 初始化 ATLAS.md 代码库文档 |
| /insights | — | prompt | 生成会话分析报告 |
| /keybindings | — | local | 打开/创建键位配置文件。门控 `isKeybindingCustomizationEnabled()` |
| /login | — | local-jsx | 登录（有静态 API key 时为切换账号） |
| /logout | — | local-jsx | 登出（清除保存的 API key） |
| /mcp | — | local-jsx | 管理 MCP 服务器 |
| /memory | — | local-jsx | 编辑记忆文件 |
| /model | — | local-jsx | 设置模型 |
| /output-style | — | local | 查看/切换输出风格 |
| /permissions | /allowed-tools | local-jsx | 管理工具允许/拒绝规则 |
| /plan | — | local-jsx | 进入计划模式或查看当前计划 |
| /plugin | /plugins, /marketplace | local-jsx | 管理 Atlas 插件 |
| /release-notes | — | local | 查看发布说明 |
| /reload-plugins | — | local | 在当前会话激活待生效的插件变更 |
| /reload-skills | — | local | 重扫 skill 目录并刷新会话 skill 注册表 |
| /rename | — | local-jsx | 重命名当前会话 |
| /resume | /continue | local-jsx | 恢复历史会话 |
| /review | — | prompt | 审查一个 Pull Request |
| /rewind | /checkpoint | local | 把代码和/或对话恢复到之前的检查点 |
| /sandbox | — | local-jsx | 沙箱启用状态切换（平台支持时注册，否则隐藏） |
| /session | /remote | local-jsx | 会话信息（remote 二维码或本地会话详情） |
| /sessionlist | （显式无别名） | local-jsx | 浏览/管理会话（fork / 进入） |
| /skills | — | local-jsx | 列出可用 skills |
| /stats | — | local-jsx | 用量统计与活跃度 |
| /status | — | local-jsx | 版本/模型/账号/API 连通性/工具状态总览 |
| /stickers | — | local | 订购 Atlas 贴纸 |
| /tag | — | local-jsx | 给当前会话加可搜索标签 |
| /tasks | /bashes | local-jsx | 管理后台任务 |
| /tasklist | /filetsks | local-jsx | 查看/巡检文件式任务（TaskCreate/TaskUpdate） |
| /terminal-setup | — | local-jsx | 安装 Shift+Enter 换行键位（Apple_Terminal 文案不同） |
| /theme | — | local-jsx | 更换主题 |
| /think-back | — | local-jsx | 年度回顾（GrowthBook 门 `atlas_thinkback`） |
| /thinkback-play | — | local | 播放年度回顾动画（同上门控；隐藏命令） |
| /tui | — | local-jsx | 免重启切换全屏渲染：`/tui fullscreen\|off` |
| /usage | — | local-jsx | 套餐用量限额。可用性门：`OPENAI_API_KEY`/`OPENAI_BASE_URL`/`ATLAS_MODEL` 任一在环境 |
| /vim | — | local | Vim/Normal 编辑模式切换 |
| /voice | — | local | 语音模式开关（`FEATURE_VOICE_MODE=true` + GrowthBook 门；默认关） |

## 条件注册与开发命令

| 命令 | 门 | 说明 |
|---|---|---|
| /fork | `FEATURE_FORK_SUBAGENT=true` | 默认关；且实现为死 stub（无 name/description），开启亦不可用。默认形态下 `/fork` 是 `/branch` 的别名 |
| /peers | `FEATURE_UDS_INBOX=true` | 默认关；死 stub |
| /workflows | `FEATURE_WORKFLOW_SCRIPTS=true` | 默认关；死 stub |
| /voice | `FEATURE_VOICE_MODE=true` + GrowthBook | 默认关；真实现 |
| /commit | `ATLAS_DEV=1`（INTERNAL_ONLY） | 创建 git commit |
| /commit-push-pr | `ATLAS_DEV=1` | commit + push + 开 PR |
| /init-verifiers | `ATLAS_DEV=1` | 初始化 verifier |
| /version | `ATLAS_DEV=1` | 打印本会话运行版本 |
| /force-snip | `ATLAS_DEV=1` + `FEATURE_HISTORY_SNIP=true` | 强制历史 snip（摘要旧回合） |

## 英文速查（Quick reference）

- Session: `/clear` `/compact` `/rename` `/resume` `/rewind` `/sessionlist` `/tag` `/export`
- Context & cost: `/context` `/cost` `/stats` `/usage` `/autocompact` `/effort` `/model`
- Config & UI: `/config` `/theme` `/color` `/tui` `/vim` `/output-style` `/keybindings` `/terminal-setup`
- Integrations: `/mcp` `/ide` `/plugin` `/skills` `/hooks` `/permissions` `/sandbox` `/agents`
- Help & meta: `/help` `/doctor` `/status` `/release-notes` `/reload-plugins` `/reload-skills` `/feedback` `/files` `/copy` `/btw` `/init` `/insights` `/review` `/plan` `/goal` `/tasks` `/tasklist` `/memory` `/add-dir` `/cd` `/diff` `/branch` `/exit`
- Gated (off by default): `/voice` `/fork` `/peers` `/workflows`；dev-only (`ATLAS_DEV=1`): `/commit` `/commit-push-pr` `/init-verifiers` `/version` `/force-snip`

## 语义断言抽样（格 2b）

1. `/branch` 的 `/fork` 别名是**条件别名**——仅当 `FORK_SUBAGENT` feature 关（默认）时存在；
   feature 开反而注册出独立的死 stub `/fork`（不可用），此时别名消失。
2. `/usage` 不是无条件命令：availability 门要求三个环境变量之一在场
   （`OPENAI_API_KEY` / `OPENAI_BASE_URL` / `ATLAS_MODEL`），否则不注册。
3. `/context` 与 `/goal` 是**同名双 entry**：local-jsx 交互面 + local headless 面
   （`supportsNonInteractive: true` 且非 headless 态隐藏）——headless `-p` 会话里可用的是 local 形。
