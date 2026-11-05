# AtlasCode 品牌专项（0.1.29–0.1.33）用户视角体验报告

- **报告性质**：用户视角体验层（用户习惯 / 美学 / 惯例三轴），**非**判定层（gate/prod-lane 判定结论以 e2e 系列报告为准：`r-20261006-0705` / `-0722` / `-1246` / `-0742` / `-0803` / `-1343` 等）。
- **体验对象**：0.1.29（BR-8）/ 0.1.30（BR-4）/ 0.1.31（BR-1+2）/ 0.1.32（BR-9+5）/ 0.1.33（BR-3+D-9/D-10/D-3/D-8）全部已发布 npm 产物与 release commit。
- **体验方法**：真实环境 PTY 实启 TUI 抓屏（THEMES 6 场景 + A4F 场景，`artifacts/THEMES-1791263042630-1vb5` 等）+ 源级交叉核证（Beam.tsx / theme.ts / spinnerVerbs.ts / useDynamicTips.ts / identity.ts / configDir.ts / useNpmDeprecationNotification.tsx / main.tsx）+ UA wire 实捕 + 发布物（npm packument/shasum）核证。
- **输出**：体验结论（§3–§5）+ 优化项清单（§6，供 0.1.34-2 登记，逐项四件套由 Main 裁定排期）。
- **声明**：本报告中所有"源证/实捕"标注均可复核；未标注者为体验判断（主观层，供参考）。

---

## 1. 体验覆盖总览

| 版本 | 落地需求 | 用户可见面 | 体验通道 |
|---|---|---|---|
| 0.1.29 | BR-8 | LLM 出网 UA 无字面 `+`（`AtlasCode/<v> (repo URL)`） | fault-proxy wire 实捕（用户不可直接感知，属"对外形象"层） |
| 0.1.30 | BR-4 | 启动屏 4 组件 + 权限弹框 + commit 签名全量 AtlasCode，用户可见面 AtlasHarness=0 | 实启抓屏 + grep 面核 |
| 0.1.31 | BR-1+2 | identity 5 常量 + 6 套主题暖金品牌键（去 Anthropic 橙） | THEMES 6 主题实切 + SGR 实捕 |
| 0.1.32 | BR-9+5 | spinner 动词池 132 条（去 Clauding 化）+ outputStyles/guideAgent=Atlas + 资产奠基 | 实启 spinner 观察 + 源面核 |
| 0.1.33 | BR-3+D-9/D-10/D-3/D-8 | 棱镜光锥 mark 更换 + clawd 键族改名 + insights 标题去 "Multi-Clauding" + tips 光核 ▀ + 发布验真 SOP | 实启抓屏 + SGR 实捕 |

---

## 2. 启动屏：品牌时刻（美学核心）

实际抓屏重建（dark 主题，95% 帧）：

```
   ▄█▄
  ▓███▓
 █▓▓▓▓▓█
 ▓█   █▓                 AtlasCode v0.1.33
█▓█   █▓█                deepseek-v4-pro with medium effort · API Usage Billing
AtlasCode                <cwd>
算力驱动的 Coding Agent
AI Coding Agent
──────────────────────────────────────────────
❯
──────────────────────────────────────────────
  ⚡ deepseek-v4-pro · 🧠 med · ▶ default · ⌂ <path>  ▀ /help 查看全部命令
```

**美学评价（主观层，有源证支撑）**：

1. **光锥 mark 叙事自洽**（5×9 Block Elements，█▓▄ 半块谱系）：顶点暖金（ascendAmber 255,184,0）→ 光束焰色（ascendFlame 255,140,66）→ 腿紫（ascendViolet 155,58,138）→ 基座冷蓝（ascendBlue 0,102,255）。"一束光经棱镜分光"的物理隐喻与 tagline「算力驱动」形成语义闭环：暖色=算力（能量源），冷色=代码（确定性输出）。**四色不是装饰色，是有叙事顺序的**。
2. **wordmark 双色克制**：Atlas（brand 暖金）+ Code（ascendBlue 冷蓝）同行双色，冷暖对位 mark 的"算力→代码"梯度，视觉重量均衡，不抢 mark。
3. **双语 tagline**：中文主（dim，「算力驱动的 Coding Agent」）+ 英文次（dim，「AI Coding Agent」），主次明确，符合中文用户主场景 + 国际惯例兼容的定位。
4. **动效克制**：light-scan-up 逐行点亮（120ms×5 行 ≈0.6s，底→顶，光"注入"）+ 顶点 spark 0.8s 周期脉冲；`prefersReducedMotion` 时直接全显（不动效）。动效服务于"光"母题而非炫技，0.6s 完成不拖启动节奏。
5. **CJK 安全**：mark 用 U+2580–259F Block Elements（Neutral 宽度=1，spec §3.2），不触发全角字体错位——**设计时为 CJK 用户做过字体学考量**，这是很多 ASCII art 品牌没做到的。
6. **Apple Terminal 降级**：单色 brand_mark 版（该终端 256 色受限时的兜底），有"低配终端也能保形"的考虑。

**已知美学边界**：

- **light-ansi（16 色降级）主题**：brand 键 = `ansi:yellowBright`，白底对比度 **1.07:1**（spec 对比度表已记录为已知限制）——**浅色 16 色终端下品牌色基本不可读**。dark-ansi（黑底 yellowBright 19.56 AAA）无问题。
- **light（truecolor）主题光锥 4 色未重映射**（本报告新发现，缺陷级）：`theme.ts` light 主题的 `ascend*` 4 键（:167-170）与 dark 主题**同 RGB 值**，未做白底安全化。实算白底（255,255,255）对比度（WCAG 相对亮度）：

  | 光锥色 | 黑底 | 白底 | 判定 |
  |---|---|---|---|
  | ascendAmber 255,184,0 | 12.11 | **1.73** | 白底 < 3:1（图形元素 AA 线）→ **顶点+光束行基本不可见** |
  | ascendFlame 255,140,66 | 9.08 | **2.31** | 白底 < 3:1 → **mark 上半整体不可读** |
  | ascendViolet 155,58,138 | 3.37 | 6.24 | 白底 OK（黑底反而偏低，腿行发闷） |
  | ascendBlue 0,102,255 | 4.34 | 4.83 | 双底 OK |

  即 light 主题下光锥 mark 只有"下半（腿紫+基座蓝）"可读，最亮的顶点两行在白底上几乎消失——**与 dark 主题的"顶点最亮"叙事正好相反**。spec 对比度表只记录了 brand/warning 键的白底值，未覆盖光锥 4 色 → 该缺口未被 gate 判据捕获（判据面 = dark 场景 SGR，light 场景只验"4 色在场"未验对比度）。已立为优化项 **O-8**。
- **多终端 CJK 宽度**（半块 ▄▀ 在 iTerm2/WezTerm/Windows Terminal 全角字体下的实际宽度矩阵）= 已排 0.1.34-1（BR-7），本报告不重复立项。

---

## 3. 用户习惯维度

### 3.1 命名与调用习惯（发现 2 项）

1. **双 bin 入口**（`package.json` bin = `{"atlas": "dist/cli.js", "atlascode": "dist/cli.js"}`）：两个命令都能启动，无主次文档化。用户习惯角度：**需要记忆一个"正名"**。现状两者同权，首次使用用户会困惑（装完敲 `atlas` 还是 `atlascode`？man 页/帮助里哪个是"官方"？）。建议明确主次（体验判断：`atlascode` 为品牌全名宜为正，`atlas` 为别名），并在安装提示/文档中一句话点明。
2. **npm scope 与品牌名不一致**：包名 = `@atlasharness/atlascode`。scope 还停在旧组织名 `atlasharness`，品牌序列 BR-4 已把**用户可见产品面**全量刷成 AtlasCode，但**安装面**（`npm i -g @atlasharness/atlascode`）仍是旧字。用户视角：这是品牌序列收口后**唯一还露出旧名的用户可见面**（footer 的 npm deprecation 提示原文即 "npm install -g @atlasharness/atlascode"，源证 `useNpmDeprecationNotification.tsx:8`）。改包名是 breaking change（需重装 + 迁移指引），不宜塞进小版本，宜独立波次 + 迁移文档；短期可先中性化提示文案。

### 3.2 配置与迁移习惯

- 配置目录 `.atlas`（`ATLAS_CONFIG_DIR` 可覆盖）/ 记忆文件 `ATLAS.md`·`ATLAS.local.md`；旧 `CLAUDE.md`/`CLAUDE.local.md` 仍被 `isMemoryFilePath` 兼容识别（只读迁移兼容，新文件一律 ATLAS.md）。**从 Claude Code 迁移来的用户**：旧记忆文件还能被读到（兼容面在），但产品不会提示"你的 CLAUDE.md 已兼容读取/建议改名"——迁移体验靠用户自己发现（文档面）。低优先观察项，非缺陷。

### 3.3 语言质感（发现 1 项）

- **双语质感混排**：用户面文案 = 中文（tagline「算力驱动」+ 5 条 idle tips：`/model 切换模型`、`/help 查看全部命令`、`/clear 清屏`、`/sessionlist 会话列表`、`ctrl+d 退出`）；spinner 动词池 = **132 条全英文 whimsical 动词**（Caramelizing / Julienning / Spelunking / Philosophising…，4 轴：算力 45 / 意象 25 / 哲学 20 / 趣味 27 / 通用 13）。
- 体验判断：英文 whimsical spinner 动词是**品类惯例**（同类 CLI 工具同质感），不违和；但与"中文为主"的品牌定位形成两种语言质感并置。是否加中文子池属产品决策（可保持现状=有意留英文质感；加池=强化中文主调）。低优先，**不建议为此动 132 条池**。

### 3.4 启动首行（发现 1 项）

- TUI 接管屏幕前，stderr 打一行 `[AtlasCode] main() starting...`（源证 `main.tsx:525` / `cli/dispatch.ts:50`，`process.stderr.write`）。品牌启动屏（光锥 mark + 动效）是精心设计的品牌时刻，但**它前面先闪过一行 debug 风格诊断行**——美学上轻微折损品牌时刻的"仪式感"（体验判断，轻微）。建议：默认不打，改 `--debug`/env 门控或写日志文件（启动诊断用途保留）。

### 3.5 footer 提示（发现 2 项）

1. **npm deprecation 提示用 warning 色**（amber `rgb(150,108,30)`，light 主题 SGR 实捕 `38;2;150;108;30`）：这是一条**中性信息**（"你通过 npm 安装，可用 npm 更新"），却用了 warning 语义色。颜色语义惯例：warning 色应留给真警告。建议改 dim/inactive 色。（顺带澄清：light 主题抓屏中出现的第二暖金色 `150,108,30` 即此提示行，**不是** brand 键双值——brand 键 light 主题恒为 `rgb(180,83,9)`，色板一致，无 token 不一致问题。）
2. **观察项（已定因销项）**：抓屏重建中 footer 行 "▀ /help 查看全部命令" 出现**两处**（路径段后 + 行尾各一）。白盒粗核：产品侧整段日志仅 1 次 `\x1b[2K`（擦整行）、0 次 `0K`，两次 hint 写入列偏移不同（col 0 与 col ~42）。**Main 切片③ 已用真 PTY 字节流 + pyte 忠实仿真定因 = 我 PTY 重建器 last-write-wins 屏幕模型假象（非真叠显、非 footer 行擦残留），销项**（master `7126e1e`）——印证本节"亦可能是重建器假象"的预判。gate C4 = 引用 Main 定因留痕（不重复写探针）。

### 3.6 版本与发布习惯（正面）

- 5 段闭环（实施→gate→发布→生产 lane→核销）+ 发布治理 3 规则（版本=收口契约 / 前后 lane 同标准 / 失败不发布），用户侧感知 = **版本号干净**（0.1.27.1 四段版被 npm 拒后顺延 0.1.28，规则③实例）、每版"测的=发布的"可验真（npm shasum 对齐）。品牌序列 5 版无一次用户可见面回归漏出（每版 gate + 生产 lane 双跑）。

---

## 4. 惯例维度

### 4.1 de-Clauding（去 Claude 化）完成度 —— 用户可见面 = 完成

| 面 | 状态 | 证 |
|---|---|---|
| insights 标题 "Multi-Clauding (Parallel Sessions)" → "Parallel Sessions" | ✅ 0 残留（用户可见面） | 0.1.33 gate/prod-lane 源面核（残留 8 处全=内部术语/数据键，非用户可见） |
| outputStyles "Claude explains…" → "Atlas explains…" | ✅ | 0.1.32 核 |
| guideAgent claude-code-guide → atlas-code-guide | ✅ | 0.1.32 核 |
| spinner 动词池 clauding/whimsical 禁词 | ✅ 0 | 0.1.32 核 |
| 启动屏/弹框/签名 AtlasHarness | ✅ 0（余仅 mdm 注册表+迁移注释，非用户可见） | 0.1.30 核 |
| LLM 出网 UA 无字面 `+`、带版本段 | ✅ `AtlasCode/<v> (repo)` | 0.1.29/0.1.33 UA wire 实捕 |
| clawd_* 键族 → brand_mark（内部键，用户不可见） | ✅ 清零 | 0.1.33 核 |

### 4.2 单一事实源（identity.ts）

`PRODUCT_NAME` / `PACKAGE_NAME` / `REPOSITORY_URL` / `PRODUCT_FAMILY` / `PRODUCT_BRAND` / `FEEDBACK_CHANNEL` / `ACCENT_HUE` 7 常量一处维护，UA/wordmark/borderTitle 全部 import 自此处——品牌串不会再"改了一处漏一处"（0.1.21 UA 裸发事故的制度化修复，本轮持续受益）。

### 4.3 资产奠基（docs/assets）

wordmark.md / README.md / brand-system-spec.md 三件（含对比度记录：dark brand 12.11 AAA / light 5.02 AA / ansi 黑底 19.56 AAA / 白底 1.07 已知限制）——品牌有"规格书"而非只散落在代码里，后续 0.1.35（母题铺开+动效精修）有判定基准。

### 4.4 发布治理（用户侧含义）

3 支柱 = ①版本=收口契约（一版一事、deferred 显式命名）②前后 lane 统一（同判据+"测的=发布的"+hard 默认）③失败闭环门禁（fail-closed）。用户视角的翻译：**版本号可信**（0.1.33 = 你看到的 0.1.33，src 与 gate 基线零 diff）、**回退有依据**（每版有 artifact 链可追溯）。

---

## 5. 总体评价

1. **品牌叙事闭环达成**：mark（光锥=算力分光）→ tagline（算力驱动）→ 色板（暖算力/冷代码对位）→ 母题细节（tips ▀ 光核）四层自洽，不是"贴了个 logo"，是一套有内部逻辑的视觉系统。这是本轮品牌专项最大的成功。
2. **de-Clauding 收口彻底**：用户可见面 7 个面全清，残留仅内部术语（有术语排除同类别口径，非漏）。
3. **克制的工程美学**：动效 0.6s 即止、reduced-motion 兜底、16 色/Apple Terminal 降级、CJK 字体学考量、对比度 AAA/AA 记录在案——细节处有"为真实终端环境做工程"的诚意。
4. **剩余缺口集中在"安装/命名面"**（非"使用面"）：npm scope 旧名、双 bin 无主次、启动首行 debug 行、warning 色用在中性提示——都是小项，但都落在用户"第一次接触产品"的环节。
5. **一个真边界**：light-ansi 16 色终端品牌色不可读（1.07:1）——已知限制，需要兜底方案；另有 light-truecolor 光锥色未重映射（§2 边界表，O-8）。

---

## 5.5 视觉舒适度批判（独立视角：不预设方案正确）

> 本节与 §3–§4 不同：不再对照"既定方案是否落地"，而是以**长时间使用终端的用户**视角直接评判"这个界面盯着舒不舒服"，允许对既定方案本身提改进。判定分级：**缺陷**（有实测/实算证据）/ **建议**（体验判断，低成本）/ **观察**（需裁定或需更多场景）。

### V-1 光锥 mark 在 light 主题"上半消失"（缺陷，O-8）

- **证据**：light 主题光锥 4 色沿用 dark 的 RGB（`theme.ts:167-170`），白底实算：顶点 amber 1.73:1、焰色 2.31:1 均低于 WCAG 图形 3:1 线。用户切到 light 主题后，mark 只剩"腿+基座"两行可读，**品牌时刻的核心（顶点 spark，也是脉冲动效的位置）恰好是白底上看不见的部分**——动效（§5.5 V-2 的脉冲）在 light 全屏模式下等于"在看不见的像素上动"。
- **改进建议**：light 主题给光锥 4 色出"白底安全变体"（同色相加深：amber→~120,80,0 档 / flame→~150,60,20 档，violet/blue 保留或微调），**对比度单测断言 ≥3:1**（gate 判据补一条 light 场景对比度断言，堵住"只验在场不验可读"的判据缺口）；若不想出 4 色变体，light 主题 mark 直接降级为单色 brand_mark（复用 Apple Terminal 单色 fallback 策略，`brand_mark` light 值 217,119,6 = 5.02:1 已达标）——两案选一，单色案成本更低。

### V-2 全屏模式下顶点脉冲是"给防闪烁人群看的闪烁"（建议，O-9）

- **证据**：`AnimatedBeam` 点亮 0.6s 后顶点 spark 进入**永久** 0.8s 周期脉冲（amber↔violet 呼吸），且 `AnimatedBeam` 只在 `isFullscreenEnvEnabled()`（= `ATLAS_NO_FLICKER=1` 全屏模式）挂载（`CondensedLogo.tsx:45`；默认用户用静态 `Beam`）。讽刺点：选全屏模式的用户**动机就是减少闪烁**（alt-screen 无滚屏），却得到一个 1.25Hz 常驻闪烁点，且顶点 amber 是全 mark 最高亮度像素（黑底 12.11:1），长时间 session 中它是视野上缘的持续高光。
- **改进建议**：脉冲限定 beat 数（如 4 拍 ≈3.2s 后收敛为静态全亮 apex），或仅 loading 期间脉冲、回合开始即停；`prefersReducedMotion` 路径已全静态（现状保留）。改动面 = `AnimatedBeam.tsx` 几行 + 单测。

### V-3 footer 四 emoji 依赖在 CJK 终端面的不确定性（观察，O-10）

- **证据**：footer 状态段恒用 4 个 emoji glyph（`⚡ model · 🧠 effort · ▶ mode · ⌂ cwd`，源证 `ModelSegment.tsx:24` 等）。品牌主调已定为中文用户场景，而目标终端面（Windows Terminal 默认字体、极简 CJK 字体配置、部分远程终端）的 emoji 渲染 = 彩色字体/单色字形/2 格宽/豆腐块（□）四态并存。**品牌自己选了 CJK 安全路径（mark 用 Neutral 宽度 Block Elements），footer 却依赖了渲染最不确定的 glyph 类**——品牌内部两套宽度哲学。
- **改进建议**：① 纳入 0.1.34-1（BR-7）多终端矩阵同波验证 4 glyph 的渲染/宽度行为（与 CJK 宽度同矩阵，边际成本低）；② 提供非 emoji 降级档（ANSI 几何符号 `*`/`§`/`▷`/`⌂` 或纯文本 label `model/effort/mode/home`），由终端探测/设置切换；③ 若保留 emoji，至少确认 4 个 glyph 在 CJK 字体下宽度稳定（并入 BR-7 宽度矩阵判据）。

### V-4 footer 单行三信息通道，窄终端互相挤（建议，O-11）

- **证据**：footer 同行承载 ① 状态段（⚡/🧠/▶/⌂）② 轮换 tips（▀ /help…）③ 启动期 npm 提示（15s 高优 toast，warning 色，源证 `useNpmDeprecationNotification.tsx`：`timeoutMs:15000, priority:"high"`）。200 列宽终端三者并排无压力（抓屏实证），**80 列（经典终端宽度）下三者必竞争**：状态段本身已 ~50 列，tip + 提示挤进剩余 ~30 列将互相截断，且 warning 色提示与 tips 的 brand 色 ▀ 并排 = 一行内两色竞争注意力。
- **改进建议**：定义 footer 通道优先级（状态 > tips > 提示），窄屏按序截断（先砍提示、再砍 tips）；npm 提示 15s 后自然消失可接受，但**展示期间应让位 tips**（当前 priority high 挤占）；80 列场景加一条 harness 断言（本 lane 可补，不占 src）。

### V-5 宽终端品牌块"左上角聚落"（观察，O-12 设计裁定项；用户已认可此发现，以下为详细设计意见）

**问题分解（含布局机制根因）**：

- **现象**（200 列抓屏重建实证）：品牌块（mark 5 行 + wordmark + 双语 tagline + 版本/模型/cwd 3 meta 行，实测总宽 ~70 列）整体锚定在**左 ~1/3 屏**，右 ~2/3 空白；welcome/resume 分支（`LogoV2.tsx:283`）另有**全宽** brand 色圆角边框（dark = 200 列宽的亮琥珀长框）。宽终端（≥200 列，用户常态 = 2 分屏/大窗）下：品牌时刻缩在左上角，仪式感被留白稀释；且**全宽亮边框 + 光锥脉冲顶点（V-2）+ tips ▀ 同屏 = 顶部 3 个注意捕获元素**，注意力预算超载。
- **根因（白盒）**：`calculateLayoutDimensions`（`logoV2Utils.ts:43-65`）horizontal 模式 = `leftWidth` 固定取 `optimalLeftWidth`（不随屏宽变化）+ `rightWidth = max(30, columns − used)` 弹性撑满 → **屏越宽，右列留白越大，品牌块位置不变**；welcome 分支则直接 `width={columns}` 全宽框（`LogoV2.tsx:283`）。即布局机制对"宽屏"无感知。

**分级优化方案**（按成本/收益排序，可拆开裁定）：

1. **方案 B（核心，最低成本，可先行）**：welcome 分支全宽亮 brand 边框降为 `inactive`/dim（`LogoV2.tsx:283` `borderColor="brand"` → `"inactive"`）。效果：200 列宽的高饱和长框（全屏幕最抢眼的横向元素）降为低饱和语义框，分组语义保留；与 O-9（脉冲收敛）叠加后，顶部 3 注意元素 → 1（tips ▀）。改动面 = 1 行。
2. **方案 A（布局层，中成本）**："品牌卡"条件居中——`columns ≥ 160` 时把品牌块（mark+wordmark+meta 左列组合）整体居中（`paddingLeft = floor((columns − cardWidth)/2)`，`cardWidth` 复用 `calculateOptimalLeftWidth` 现有计算）；`columns < 160` 保持现状左锚定（窄屏无留白问题，零回归）。效果：宽屏品牌时刻从"左上角"变"屏中央"，仪式感回归。改动面 = `calculateLayoutDimensions` + `CondensedLogo` 布局层，**零行为变化**（纯布局）。
3. **方案 C（可选，0.1.35 精修）**：右侧重平衡——`columns ≥ 200` 时把一个低权重元素（tagline 第 2 行或版本号）右对齐到右缘，或 meta 3 行压 2 行（version+model 合并，cwd 下沉 footer ⌂ 段已有）；品牌块 8 行高 → 6 行，内容区让渡。

**不建议项**（明确排除，省裁定带宽）：

- 品牌块移右下角/随机位——破坏"用户视线先扫左上"的阅读惯例（"左上→中上"是惯例与仪式感的平衡点）；
- 删除 welcome 边框——失去分组语义，降级（方案 B）已足够。

**验证计划（e2e lane 承接，0.1.35 gate 或 0.1.34-2 加固，判据已定）**：

- harness 补 120 列 / 200 列两档场景（当前 200×50 单档）：≥160 列场景断言品牌卡左 margin = `(cols − cardWidth)/2 ± 2 列`；120 列场景 = 左锚定零 padding 回归断言（方案 A 生效前提）；
- SGR 断言：welcome 边框 = `inactive` SGR（**非** brand 琥珀 SGR）（方案 B 生效判据）；
- 用户面走查层：双宽度整屏抓屏附报告附录（本 lane 重建器可直接出图）。

**排期意见 + triage 现状**：方案 B + A = O-12 核心，**Main triage 已裁定归 0.1.35 母题轮**（master `4bafee0`，与本报告"0.1.34 不动"建议一致；若 Main 判断方案 B 仅 1 行布局层改动，可作 0.1.34-2 加性先行，开波时 f4/Main 裁定）；方案 C = 0.1.35 精修随动效轮。

### V-6 光锥四色的"骨架偏暗"（观察，不立项，供 0.1.35 参考）

- **证据**：黑底下 mark 最暗色是腿行 violet（3.37:1），而腿正是 A 形 mark 的**结构骨架**——骨架比基座（4.34:1）还暗，mark 识别重心压在上两行。此与设计隐喻（光束向下衰减）自洽，物理逻辑成立；但在终端小尺寸（5×9 字符 ≈ 实际屏幕 ~1.5cm 高）下，骨架偏暗会削弱 10 米外一眼可辨识度。
- **建议**：0.1.35 动效精修轮评估"腿行提亮一档（violet 明度 +20%）vs 保持衰减隐喻"，属精修范畴，本轮不立项。

### 小结

| 视角 | 结论 |
|---|---|
| dark 主题（主场景） | mark/wordmark/tips 舒适度好：亮度层级清晰、动效 0.6s 即止（默认模式无脉冲）、CJK 字体学安全、对比度 AAA/AA 达标。**可长期盯着看** |
| light 主题 | **V-1 是本轮唯一的真视觉缺陷**：光锥上半白底不可读，品牌时刻在 light 用户手里折半 |
| 全屏（ATLAS_NO_FLICKER）用户 | V-2 脉冲与该人群诉求（防闪烁）相悖，低成本可改 |
| 窄终端（80 列） | V-4 footer 三通道拥挤 + V-3 emoji 宽度不确定性叠加，最易"看着别扭"的场景，建议补一条 80 列 harness 断言 |
| 宽终端（≥200 列） | 布局留白/边框强度属设计裁定（V-5），归 0.1.35 |

---

## 6. 优化项清单（0.1.34-2 候选，供 Main 逐项四件套裁定排期）

| # | 项 | 面 | 建议 | 影响/成本 | 依据 |
|---|---|---|---|---|---|
| O-1 | light-ansi 品牌色 1.07:1 不可读 | 美学/无障碍 | light-ansi 主题 brand/brand_mark 键加降级（如 magentaBright 或纯文本 mark 兜底 + 单独键），保形优先保可读 | 小（theme.ts 单主题键位） | spec 对比度表 + light-ansi 场景实捕 |
| O-2 | npm scope `@atlasharness` 旧名露出 | 品牌一致性/惯例 | 独立波次：包名迁移（`@atlascode` 或 `@atlas`）+ 迁移指引 + 重装说明；短期先中性化 footer 提示文案 | 中（breaking，需迁移文档） | `useNpmDeprecationNotification.tsx:8` + package.json |
| O-3 | 双 bin 无主次 | 命名习惯 | 文档明确 `atlascode` 正 / `atlas` 别名（或反之），安装提示一句话点明 | 低（文档+提示） | package.json bin |
| O-4 | footer 安装提示用 warning 色 | 颜色语义 | 中性信息改 dim/inactive，warning 色留给真警告 | 低（单组件色键） | SGR 实捕 + 颜色语义惯例 |
| O-5 | 启动首行 `[AtlasCode] main() starting...` | 启动美学 | 默认静默，`--debug`/env 门控（保留诊断用途） | 低（2 处 stderr.write 加门） | `main.tsx:525` / `cli/dispatch.ts:50` |
| O-6 | 双语质感（132 英文 whimsical spinner 动词 vs 中文主调） | 语言质感 | 产品决策项：保持现状（品类惯例）或加中文子池；**不建议动 132 条池** | 决策项，0 成本若保持 | spinnerVerbs.ts |
| O-7 | footer hint 双显观察项 | 渲染（**已定因销项**） | Main 切片③ 真 PTY 字节流 + pyte 忠实仿真定因 = **我 PTY 重建器 last-write-wins 屏幕模型假象，非真叠显，销项**（`7126e1e`）；gate C4 = 引用 Main 定因留痕（不重复写探针） | 已闭环 | 本报告 §3.5-2 + Main 定因 7126e1e |
| O-8 | **light（truecolor）主题光锥 4 色未重映射，白底顶点/焰色不可读**（amber 1.73:1 / flame 2.31:1 < 3:1） | 美学/无障碍（**本轮唯一真视觉缺陷，Main triage 定 0.1.34-2 P0**） | 两案选一：① light 主题光锥 4 色出白底安全变体（同色相加深）+ 对比度单测断言 ≥3:1 + gate 判据补 light 场景对比度断言（堵"只验在场不验可读"缺口）；② light 主题 mark 降级单色 brand_mark（217,119,6 = 5.02:1，复用 Apple Terminal 单色 fallback 策略，成本更低）。**Main 预核确认 0.1.33 引入 + WCAG 独立复算与本报告一致（master `4bafee0`），默认裁①保形案（光锥叙事是品牌核心），开波时用户可否决** | 低（theme.ts light 块 4 行或 1 处组件分支 + 单测） | 本报告 §5.5 V-1（`theme.ts:167-170` 实算）+ Main 预核 |
| O-9 | 全屏（ATLAS_NO_FLICKER）模式光锥顶点**永久** 0.8s 脉冲，与"防闪烁"人群诉求相悖 | 动效舒适度 | 脉冲限定 4 拍（≈3.2s）后收敛静态全亮 apex，或仅 loading 期间脉冲（回合开始即停） | 低（`AnimatedBeam.tsx` 几行 + 单测） | 本报告 §5.5 V-2（`CondensedLogo.tsx:45` 挂载面 + `AnimatedBeam.tsx` 脉冲面） |
| O-10 | footer 4 emoji glyph（⚡🧠▶⌂）在 CJK 终端面渲染/宽度不确定性（与品牌 CJK 安全路径两套宽度哲学） | 终端兼容 | ① 并入 0.1.34-1（BR-7）多终端矩阵验证 4 glyph 行为（边际成本低）；② 提供非 emoji 降级档（ANSI 几何符号/纯文本 label） | 中（可搭 BR-7 车） | 本报告 §5.5 V-3（`ModelSegment.tsx:24`） |
| O-11 | footer 单行三通道（状态段/tips/15s npm 提示）在 80 列窄屏互相挤 + warning 色提示与 tips 双色竞争 | 布局/颜色语义 | 定义通道优先级（状态 > tips > 提示）按序截断；npm 提示展示期间让位 tips；**e2e 侧补一条 80 列 harness 断言**（不占 src） | 低 | 本报告 §5.5 V-4（`useNpmDeprecationNotification.tsx` 15s/priority high 源证） |
| O-12 | 宽终端（≥200 列）品牌块左上角聚落 + welcome 分支全宽亮 brand 边框（三注意捕获元素同屏） | 设计裁定（**Main triage 已裁定归 0.1.35 母题轮**（master `4bafee0`），0.1.34 不动；用户已认可此发现） | **详细设计意见见 §5.5 V-5**：根因 = `calculateLayoutDimensions`（`logoV2Utils.ts:43-65`）leftWidth 固定 + 右列弹性 → 宽屏留白全在右；分级方案 = **B（核心，1 行）welcome 边框 brand→inactive 降档** + **A（布局层）≥160 列"品牌卡"条件居中**（<160 列零回归）+ **C（0.1.35 精修）右侧重平衡/meta 压缩**；不建议移右下/删边框；验证计划 = 120/200 列双档 harness 断言（左 margin 公式 + 边框 inactive SGR）+ 用户面走查抓屏。方案 B 若 Main 判断为 1 行改动可 0.1.34-2 加性先行，开波裁定 | 设计裁定项（B 低成本 / A 中成本 / C 随 0.1.35） | 本报告 §5.5 V-5（`LogoV2.tsx:283` + `logoV2Utils.ts:43-65` + 200 列抓屏） |

**观察不立项（供 0.1.35 动效精修参考）**：V-6 光锥腿行（violet 3.37:1）为 mark 最暗色=结构骨架偏暗，与"光束向下衰减"隐喻自洽，小尺寸下识别度可评估提亮一档。

**不在本清单**（已另行排期/登记）：多终端 CJK 宽度 = 0.1.34-1（BR-7，O-10 的 emoji 矩阵验证可搭车）；exit-reason 日志 = 0.1.34-C 候选；**Main triage 已登记 master `fe6a553` + `4bafee0`（0.1.34-2 候选 = O-1/O-3/O-4/O-5/O-9/O-11 低成本加性 / O-8 = 0.1.34-2 P0 〔默认保形案①，用户可否决〕/ O-6 默认保持 132 池 / O-2 npm scope 迁移 = 独立 breaking 波次不入 0.1.34/0.1.35 / O-12 = 0.1.35 母题轮 / O-10 搭 0.1.34-1 BR-7 车 / O-3 正名方向待用户一句裁定）**。

**用户总裁定（2026-10-06，效果优先·代价可接受）**：
- **O-8 = 案①保形**：light 光锥 4 色白底安全变体（同色相加深）+ 对比度单测 ≥3:1 + gate 补 light 场景对比度断言，**不降级单色**（代价仅 theme.ts light 块 4 键+单测+1 判据，效果=保住光锥叙事核心；Main 已落 `6dc9dbf` 单测 8/8，gate 我侧补 SGR 期望值+对比度断言）。
- **O-3 = atlascode 正 / atlas 短别名**（品牌全名一致性，代价≈0，与 Main 裁定同向确认）。
- **O-6 = 保持 132 英文池**（效果论证：spinner 动词=低权重装饰位，中文主调已由 tagline+中文 tips 承载；英文 whimsical=CLI 品类质感资产，硬译 132 条中文会掉价——**保持是效果最优，非省代价**；拉满选项=增量中文子池〔~40 条，不删英文〕+设置切换档〔默认英文可切中文〕，代价中等不默认切，若要再单独立项）。
- **O-12-B = 允许 0.1.34-2 加性先行**（1 行 welcome 边框 brand→inactive + C2 判据，效果早见/代价近零；A/C 归 0.1.35 母题轮不变）。

---

## 附：证据索引（§5.5 视觉舒适度批判）

- **V-1 光锥对比度实算**：`theme.ts:167-170`（light 主题 ascend* 4 键 = dark 同值）+ WCAG 相对亮度实算（白底 255,255,255：amber 1.73 / flame 2.31 / violet 6.24 / blue 4.83；黑底：amber 12.11 / flame 9.08 / violet 3.37 / blue 4.34）
- **V-2 脉冲挂载面**：`CondensedLogo.tsx:45`（`isFullscreenEnvEnabled() ? <AnimatedBeam/> : <Beam/>`）+ `fullscreen.ts:111`（默认 off，ATLAS_NO_FLICKER=1 opt-in）+ `AnimatedBeam.tsx`（PULSE_MS=800 常驻，reducedMotion 静态）
- **V-3 emoji 面**：`ModelSegment.tsx:24`（⚡/🧠/▶/⌂ 4 glyph）
- **V-4 三通道**：`useNpmDeprecationNotification.tsx`（15s timeout / warning / high 源证）+ footer 状态段 StatusLine 组件族 + `PersistentFooterIndicator.tsx`（tips）
- **V-5 布局**：`LogoV2.tsx:283`（全宽 brand 圆角框 welcome 分支）+ 200 列抓屏重建（品牌块左半屏）
- **V-6 色板**：`theme.ts:56-59/167-170`（光锥 4 色板双主题同值）

---

## 附：证据索引

- 抓屏 artifacts：`user-e2e/tui-diff/artifacts/THEMES-1791263042630-1vb5/`（6 主题 + switch，0.1.33 发布 commit 412ca61 产物）
- 源证文件：`src/tui/components/LogoV2/Beam.tsx`（BEAM_ART/wordmark/tagline :27-39）、`AnimatedBeam.tsx`（REVEAL_MS/PULSE_MS/reducedMotion）、`src/tui/utils/theme.ts:121/141`（light brand/warning 值）、`src/tui/constants/spinnerVerbs.ts`、`src/tui/components/StatusLine/useDynamicTips.ts`、`src/shared/identity.ts`、`src/tui/utils/configDir.ts`、`src/tui/hooks/notifs/useNpmDeprecationNotification.tsx:8`、`src/tui/main.tsx:525`、`src/cli/dispatch.ts:50`、`docs/assets/brand-system-spec.md`（对比度表）
- 判定层报告：`r-20261006-0705`（BR-1+2 gate）/ `-0722`（BR-9+5 gate）/ `-1246`（BR-3 gate）/ `-0742` / `-0803` / `-1343`（prod lane 0.1.31/0.1.32/0.1.33）
