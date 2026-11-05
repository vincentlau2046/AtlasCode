# Atlas vs Claude TUI 交互信息量对比 & 用户友好性评估（首轮）

> 目的：以 **Claude TUI 为参照基准**，在相同任务场景下对比 Atlas TUI 与 Claude TUI 的
> 「交互信息量」，定位用户友好性差距（缺口）与功能性 bug，产出可落地的优化项给 main 修复。
> 约束：**不能降级**（可保留 Atlas 自身风格 / 提出更优方案，但不得低于 Claude 的信息密度）。

- 日期：2026-10-03
- 录制 runId：
  - `cmp-2026-10-03T00-54-09-vz5y` → S1-read、S2-edit（双 TUI）
  - `cmp-2026-10-03T01-07-09-q14e` → S3-think、S4-skill（双 TUI）
  - S2 另在 `cmp-2026-10-03T00-49-24-gbe9` 交叉验证（双 TUI 均 disk=true）
- 产物：`user-e2e/compare/runs/<runId>/<scenario>/{atlas,claude}/{transcript.log,stripped.txt,result.json}`

---

## 1. 评估方法

- **模型对齐**：两侧 TUI 都走本地网关 `http://127.0.0.1:8999`，统一用 **deepseek-v4-pro**。
  - 说明：网关默认模型 Qwen38-27B-TXT 在 agentic 多工具任务上纪律性差（S2 实测 0 tool call、
    不真正落盘），为把对比聚焦到「TUI 渲染层」而非模型能力，主动对齐到更强的 deepseek-v4-pro。
    这是**为对齐能力而做的判定**，不代表对 Qwen38 强弱的评价。
  - Atlas 侧经沙箱 `~/.atlas/settings.json` 三角色 + 顶层 model 全部指向 `iff/deepseek-v4-pro`；
    Claude 侧经 env `ANTHROPIC_MODEL=deepseek-v4-pro` 覆写。
- **隔离**：两侧各用独立沙箱 HOME + 一次性 workspace，所有 I/O 落在
  `user-e2e/compare/runs/<runId>/` 下；真实 `~/.atlas`、`~/.claude` 零写入。
- **权限**：两侧均 `--dangerously-skip-permissions`（沙箱内 auto-approve，已与用户确认）。
- **场景**：S1 读文件（单+多）、S2 改文件（Edit）、S3 思考（权衡+推荐）、S4 调用 skill。
- **记录**：pty 全量转录（ANSI 剥净）+ 自动信号抽取（工具/diff/thinking/skill 计数）+ 人工读转录定性。

### harness 说明（透明化，非 Atlas/Claude 缺陷）
- Atlas 的常驻 spinner 会持续写 ANSI 字节、难以 byte-quiet → `turnSettle` 对 Atlas 侧常为
  `false`（打到 settle 超时）。**这不代表回合失败**：转录是追加日志，`diskCheck`/`finalAnswer`
  才是回合完成的真判据。
- Claude 侧在 ink REPL 里裸 `\n` 是「多行输入字面换行」而非提交键 → harness 已改为
  `sendRaw(prompt)` + `\r`(Enter) 提交（修复前 Claude 侧 prompt 卡在输入框、回合不启动、disk=false）。

---

## 2. 结论速览（TL;DR）

| 面 | Claude（参照） | Atlas | 判定 |
|---|---|---|---|
| **改文件（diff 面）** | **默认内联 diff**：`Added N lines, removed M lines` + 编号 unified diff（`-`旧/`+`新/上下文），展开、持久 | 默认视图只有折叠的 `● Update(file)`，**无 diff、无行数** | ⚠️ **缺口（headline）** |
| 读文件 | 折叠 `Read N files (ctrl+o)`，答案正确 | 折叠 `Read N files (ctrl+o)`，答案正确 | ✅ 相当 |
| 思考 | `Thought for Ns, read K files`（时间+工具数 摘要，折叠） | `∴ Thinking <80 字首行预览> (ctrl+o)`（内容预览，折叠） | ✅ 相当（风格不同，Atlas 给内容预览，信息量不低） |
| 调用 skill | 项目内 skill（`.claude/skills/`）**按名直接调用成功** | 项目内 skill（`.atlas/skills/`）**未注册**，Skill 工具报 `Unknown skill`，靠模型手动读 SKILL.md 兜底 | ⚠️ **差距 G2（功能）** |
| 功能正确性 | 改文件落盘正确 | 改文件落盘正确（`diskCheck=true`） | ✅ 无功能回归 |

**两处差距**（main 0.1.15 修复波后均已回归验证 PASS，见 §4「回归验证结果」）：
- **G1（用户友好性 · 头号）✅ 已修**：改文件时 Claude 默认把 diff 摊开给用户看；Atlas 原本默认只给一行
  `Update(file)`，diff/行数都要手动展开。这正是用户点名的参照点（"修改文件时会有 diff 信息的显示"）。
  属**信息密度缺口**（非功能 bug —— 文件确实改对了）。main 修（c00efa4：工具结果消息挂 toolUseResult，
  TUI 零改动 4 挂点）→ 回归：Atlas 默认视图现渲染内联 diff（`Added N lines, removed M lines` + 编号 hunk），对齐 Claude。
- **G2（功能差距）✅ 已修**：项目级 skill（`.atlas/skills/`）原本默认不被发现/注册，Skill 工具按名调用失败
  （`Unknown skill`），靠模型手动读 SKILL.md 兜底；Claude 的等价默认即可用。根因是项目 skill 扫描
  被门在恒关闭的 `projectSettings` 源上。main 修（c4c17dc：skill 发现面与 settings 源解耦、默认开 +
  kill switch `ATLAS_DISABLE_PROJECT_SKILLS`）→ 回归：Atlas `Skill(summarize-numbers)` 直接命中
  `Successfully loaded skill`（**注：回归 workspace 需 `git init`，否则 projectRoot 解析到外层仓、G2 伪阴性**）。

> **模型面说明（判定，非模型强弱结论）**：为把对比聚焦到 TUI 渲染层，两侧统一对齐到
> deepseek-v4-pro（网关默认 Qwen38 在 agentic 多工具任务上 0 tool-call、不真正落盘，会污染「渲染层」
> 对比）。这是**为隔离变量而做的能力对齐**，不代表对 Qwen38-27B 强弱的评价。

---

## 3. 逐场景对比

### S1 · 读文件（单+多）
- prompt：读 notes.md + data.json，报 values 求和 + calc.js 用途。
- **两侧都答对**（sum=15；calc.js = 数学小工具 add/multiply）。
- 渲染：两侧都把 Read 折叠（`Read 2 files (ctrl+o to expand)` + 单个 `⎿ notes.md`），文件内容不内联。
  - Claude：`Thought for 3s, read 2 files`（一行合并 thinking+read 摘要）。
  - Atlas：`∴ Thinking Let me read the files.` + `Read 2 files`（两行分开）。
- **判定：读面相当，无差距。**（仅排版：Claude 更紧凑合并成一行。）

### S2 · 改文件（diff 面）★ 核心
- prompt：把 `add()` 改成带第三参 `c=0`，保留原 console.log 并新增一条演示。
- **两侧都落盘正确**（`diskCheck=true`：`function add(a, b, c = 0)` 存在）。
- **渲染差距（headline）**：
  - **Claude**（展开内联 diff，默认可见）：
    ```
    ●  ⎿  Added 2 lines, removed 2 lines
       1 -function add(a, b) {
       2 -  return a + b;
       1 +function add(a, b, c = 0) {
       2 +  return a + b + c;
       3  }
       4
       5 function multiply(a,b){
    ```
  - **Atlas**（默认视图，折叠）：
    ```
    Read 1 file (ctrl+o to expand)    ● Update(calc.js)
    ```
    只有工具名行；`transcript.log` 原始字节里 **0 个** "Added N lines"/diff hunk 标记 → diff 未渲染到终端。
- **判定：缺口（G1，见 §4）。**

### S3 · 思考（权衡 + 推荐）
- prompt：3 人小队维护两个紧耦合服务（web API + 后台 worker），monorepo 还是两仓？给一行推荐 + 两个最关键理由。
- **两侧都给出结构良好的答案**（都推荐 monorepo，理由：跨服务原子变更 / 降低协调成本）。
- 渲染：
  - **Claude**：进行中 `● Thinking for 4s… (ctrl+o to expand) ⎿ <实时思考内容>`；完成后折叠为 `Thought for 4s (ctrl+o to expand)`。
  - **Atlas**：`∴ Thinking <首行 80 字预览> (ctrl+o to expand)`（S2 感知面波引入的内容预览）。
- **判定：思考面相当，无差距。**（都渲染思考内容 + 完整答案；Claude 用时标注 "Thought for Ns"，Atlas 给首行内容预览，信息量互有高低、不降级。）

### S4 · 调用 skill（★ 发现功能差距 G2）
- prompt：用 summarize-numbers skill 处理 data.json，报告返回。（skill 期望输出 "The total is 15 (over 5 values)"。）
- fixture 放置：Atlas 侧 `<ws>/.atlas/skills/summarize-numbers/SKILL.md`；Claude 侧 `<ws>/.claude/skills/summarize-numbers/SKILL.md`。
- **Claude**：`● Skill(summarize-numbers) ⎿ Successfully loaded skill` → "The total is 15 (over 5 values)." —— **skill 按名直接调用成功**。
- **Atlas**：`● Skill(summarize-numbers) ⎿ Initializing… ⎿ Invalid tool parameters`；模型随后报
  「The skill summarize-numbers isn't registered… returned 'Unknown skill'」，**改由手动读
  `.atlas/skills/summarize-numbers/SKILL.md` 并照其步骤执行**，最终仍答对（15）。
  - 即：**Skill 工具的「按名直接调用项目内 skill」路径在 Atlas 上失败**，靠模型兜底才答对。
- **判定：功能差距 G2（见 §4）——项目级 skill 默认不被发现/注册。**

---

## 4. 差距项定位（缺口 vs bug）

### G1（缺口 · 用户友好性）：改文件 diff 默认不显示
- **现象**：Atlas 默认视图对 Edit 只渲染 `● Update(file)`；diff（`Added/Removed N lines` + hunk）
  不在默认视图里，需手动展开。Claude 默认就摊开。
- **代码落点**：
  - `src/tui/components/FileEditToolUpdatedMessage.tsx`：只有当 `style!=='condensed'` 且无
    `previewHint` 时才渲染完整 `StructuredDiffList`；`style==='condensed' && !verbose` 时只出
    "Added N lines" 文本；有 `previewHint` 且非 condensed 时只出 dim 提示。
  - `src/tui/tools/FileEditTool/UI.tsx:77-90`（`renderToolResultMessage`）：普通文件
    `previewHint=undefined`，`style`/`verbose` 由上层消息渲染层传入 → 默认交互视图下该结果被折叠成工具名行。
  - 渲染链路：`UserToolResultMessage` → `UserToolSuccessMessage`（透传 `style`/`verbose`）→ 工具 `renderToolResultMessage`。
- **性质**：产品缺口（信息密度），**非功能 bug**（落盘正确）。
- **建议（不降级、对齐 Claude）**：
  1. 最低限度：默认视图对 Edit 结果至少显示一行 `Added N lines, removed M lines`（即 `FileEditToolUpdatedMessage` 的
     condensed `text`），不要只剩工具名。
  2. 进一步（对齐 Claude）：默认展开 diff hunk（`StructuredDiffList`），或提供「默认展开 N 行 / 可折叠」的档位。
  3. 注意 Write（新建/覆盖）侧同样处理（`FileWriteTool` 的 `Wrote N lines` + 预览），保持一致。
- **验证**：重跑 S2，断言 Atlas 默认视图中出现 `Added`/`Removed` 或 diff hunk（当前 `addedLines=0`）。

### G2（功能差距 · 项目级 skill 不被发现）：`.atlas/skills/` 默认不注册
- **现象**：S4 里 Atlas 的 Skill 工具无法按名调用项目内 skill（`<ws>/.atlas/skills/summarize-numbers`），
  返回 `Unknown skill` / `Invalid tool parameters`；Claude 的等价（`<ws>/.claude/skills/…`）直接成功。
  Atlas 侧靠模型手动读 SKILL.md 兜底才答对 —— 属**功能性降级**（直接调用路径不可用）。
- **根因（代码链，已验证）**：
  1. `src/engine/config/constants.ts:57` `ALLOWED_SETTING_SOURCES = ['userSettings']`（硬编码单源），
     `getEnabledSettingSources()` 只加 `policySettings`/`flagSettings` → **`projectSettings` 恒不在启用集**。
  2. `src/engine/skill/loadSkillsDir.ts:340` `projectSettingsEnabled = isSettingSourceEnabled('projectSettings') && !skillsLocked`
     = `false` → 项目 skill 目录（`getProjectDirsUpToHome('skills', cwd)`，即各层 `.atlas/skills/`）**不扫描**，
     项目 skill 不注册进命令池（`loadSkillsDir.ts:358-372`）。
  3. `src/engine/tools/skill/skillTool.ts:507` 查无 → `Unknown skill: <name>`。
  - 对照：用户级 skill（`~/.atlas/skills/`，`userSettings` 源）正常加载；仅**项目级** `.atlas/skills/` 被门掉。
- **性质**：产品/安全权衡造成的**功能差距**（非崩溃 bug）。`projectSettings` 被排除是刻意的
  （`src/engine/config/settings.ts:371` RCE 注释：恶意项目可借仓库内 settings 提权）+「残留守」（源集扩展归组合根纵切）。
- **建议（不降级、对齐 Claude，且守住安全线）**：
  1. **把「项目级 *skill* 发现」与「项目级 *settings* 源」解耦**：`.atlas/skills/` 是 markdown 指令
     （由模型执行，与 Claude 的 `.claude/skills/` 同风险级），**默认启用**项目 skill 目录扫描；
     而 `.atlas/settings.json`（可配 provider/hooks → RCE）**继续排除**。
  2. 落点：`loadSkillsDir.ts` 的项目 skill 支不再门在 `isSettingSourceEnabled('projectSettings')`，
     改门一个独立、默认开启的「项目 skill 发现」开关（或新增恒启用的 `projectSkills` 源，仅喂 skill 目录、
     不喂 settings 合并级联）。
  3. 安全论证：skill = 只读 markdown 指令 + 模型执行，等价 Claude 现状；不引入 settings 级 RCE 面。
- **验证**：重跑 S4，断言 Atlas `Skill(summarize-numbers)` 直接命中（transcript 出现 `Successfully loaded skill`、
  不再出现 `Unknown skill`/手动读 SKILL.md 兜底）。

### 回归验证结果（main 0.1.15 修复波，master c00efa4/c4c17dc）
- **G1 ✅ PASS**（run `cmp-2026-10-03T06-04-22-4vtz` S2）：Atlas 默认视图现渲染内联 diff
  `● Update(calc.js) ⎿ Added 2 lines, removed 2 lines` + 编号 unified diff（`1 -function add(a, b) {` /
  `1 +function add(a, b, c = 0) {`），与 Claude 基线一致；两侧 `diskCheck=true`。
- **G2 ✅ PASS**（run `cmp-2026-10-03T06-15-31-z6pb` S4）：Atlas `Skill(summarize-numbers)` 直接命中
  `Successfully loaded skill`（`Unknown skill`/`Invalid tool parameters` 计数归零、无手读 SKILL.md 兜底），
  两侧答案均 "The total is 15 (over 5 values)"。
  - **harness 关键修正**：一次性 workspace 必须 `git init`（compare.ts `setupWs` 已加）。原因：Atlas
    `getProjectRoot()` = 自 cwd 上探最近 `.git`，项目 skill 扫描链从 projectRoot 起、到 git root 即停（防仓库外父目录泄漏）。
    ws 若嵌在本 repo 内（无自身 `.git`），projectRoot 会解析到外层仓根 → `ws/.atlas/skills`（子目录）按设计不扫 →
    G2 伪阴性。`git init` 使 ws 成为自己的 project root，对齐「真实项目 = git 仓」语义。
  - **engine 层佐证**（headless 探针 `getCommands(nearestGitRoot(cwd))`）：
    - 无 `.git` ws（4vtz 场景）→ projectRoot=外层仓、命令池 0 项、summarize-numbers 不在池（复现伪阴性）；
    - `git init` ws → projectRoot=ws、池含 `summarize-numbers`（G2 发现层生效）。

### 功能性 bug
- 本轮 Atlas 侧无崩溃/回归（S1 答案正确、S2 落盘正确）。
- G2 属「项目 skill 不被发现」的功能差距（上），非崩溃 bug。
- harness 侧发现并已修：Claude TUI prompt 提交键（`\n`→`\r`），属测试基建，非产品缺陷。

---

## 5. 复现

```bash
cd /home/vince/projects/AtlasCode
bun run user-e2e/compare/compare.ts S1-read S2-edit S3-think S4-skill   # 双 TUI 全场景
# 单侧/单场景：... S2-edit --tuis=claude   （注意 --tuis 用 = 连接，空格会被忽略而回退 both）
```
- 转录：`user-e2e/compare/runs/<runId>/<scenario>/{atlas,claude}/stripped.txt`（剥净）
- 逐 run 报告骨架：`user-e2e/compare/runs/<runId>/report.md` + `summary.json`
