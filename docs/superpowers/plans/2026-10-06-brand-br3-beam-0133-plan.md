# 0.1.33 writing-plan · 品牌 mark 定稿（BR-3 棱镜光锥）+ 收尾波

> 触发：用户 2026-10-06 裁定 BR-3 **方案 A 棱镜光锥 + 光核微符号**，"先更换再持续优化"，**并入 0.1.33 版本波交 Main 实施**。
> 事实源：spec `docs/superpowers/specs/2026-10-04-brand-system-design.md` §3.1/§3.2/§3.3/§3.4/§4.1/§8/§13（**已定稿**）+ tracker `docs/2026-10-06-0.1.33-deferred-tracker.md`。
> 角色：实施 = **Main**（单一实施者，继承 0.1.29-0.1.32 架构）；验收 = e2e；协调 + housekeeping = brand session（不做码）。
> 纪律：LogoV2 编译产物（React Compiler `_c` memo cache + 尾部 base64 source map）= **字面替换编译产物字符串即可**，不重编译（base64 stale/dev-only 不进 dist）。Main 落地前对届时 master 重新 diff 核对（防 0.1.33 前波漂移）。

---

## 0. 范围（0.1.33 = "更换" 波；"持续优化" 归 0.1.34+ 不预启）

**本波做（更换）**：

| 项 | 内容 | 关联 |
|---|---|---|
| **BR-3 mark** | `Clawd.tsx`→`Beam.tsx`：旧 "AH" monogram → **棱镜光锥 A 形 `BEAM_ART`**（§3.1/§8.4：3 色 + `▓` 晶面 + 负空间空腔 + 顶点 spark）；`AnimatedClawd.tsx`→`AnimatedBeam.tsx`（pose 机制废弃 → 光扫上爬单动效）；删 `AnimatedAsterisk.tsx`（VoiceModeNotice 消费方 → 光核静态色块） | BR-3 |
| **BR-3 色板** | **3 色收敛**（blue `#0066FF` / violet `#9B3A8A` / amber `#FFB800` + flame `#FF8C42` accent）；theme 键 `clawd_body`→`brand_mark`、`clawd_background`→`brand_mark_bg`（6 主题 + 41 处渲染引用），值换光锥色（旧 Anthropic 橙 `rgb(215,119,87)` 清零） | BR-3 + D-9 |
| **wordmark** | `Atlas`（暖金 `brand`）+ `Code`（冷蓝 `ascend-blue`）双色（§3.3） | BR-3 |
| **tagline** | 中文 `算力驱动的 Coding Agent`（英文副标 `AI Coding Agent` 保留，§3.4） | BR-3 |
| **tips 光核** | 闲时 tips 前缀 `·` → 光核微符号（`▀`/`▄` 光心色块，brand_mark 色）= 母题首次落地 | D-3 |
| **编译产物 import** | LogoV2 4 编译产物品牌字面走 `PRODUCT_BRAND` import（`src/shared`），不硬编码 "AtlasCode" | D-2 |
| **D-10** | insights HTML 报告标题 "Multi-Clauding (Parallel Sessions)" → Atlas 化（低风险单核销）+ `main.tsx:2058`/`useVoice.ts:558` 2 注释 → multi-session | D-10 |
| **D-8** | 发布验真 SOP 固化（shasum 比对 + packument `dist.tarball` 直下，**无 scope 前缀 canonical 名** `atlascode-<v>.tgz`，勿拼 scope 前缀恒 404）入 `docs/release-governance.md` 或 dev-loop §3 | D-8 |

**本波不做（0.1.34+ 持续优化，记 spec §13.1 时序，不预启）**：
- 母题铺开：spinner `█████` 光束串 / 进度条光束推进 / 分隔线 `█ █ █` / 边框角标 `╱` / 空态 `░` 底纹
- 动效精修（光扫上爬时序 / `prefers-reduced-motion` 节奏 / 脉冲周期）
- 多终端 CJK 矩阵（半块 `▄▀` 宽度实测：iTerm2/GNOME/kitty/WinTerm/Alacritty）= BR-6/BR-7
- 光核微符号铺开（spinner 光标 / watermark / favicon）

---

## 1. 逐文件改动清单

### 1.1 mark 重设计（核心）
- `src/tui/components/LogoV2/Clawd.tsx` → **`Beam.tsx`**
  - 删 `AH_ART`（5 行 "AH" monogram）+ `POSES`/`APPLE_EYES`/`ClawdPose`（pose 机制废弃）
  - 新增 `BEAM_ART`（§8.4 棱镜 A 形，按行 3 色 + `▓` 晶面 + 负空间空腔）：
    ```
     ▄█▄         apex spark（暖金，最亮，脉冲目标）
    ▓███▓        上斜面（▓ 晶面 = 上行色降亮）
     █▓▓▓▓▓█     beam 光带（最亮行 = 光本尊）
     ▓█   █▓     腿 + 负空间空腔（中部 3 空格）
    █▓█   █▓█    底（冷蓝算力冷源/承重）
    ```
  - `<Beam />` 渲染：`BEAM_ART` 行（`brand_mark` 色系）+ `<Text color="brand">Atlas</Text><Text color="ascend-blue">Code</Text>`（wordmark 双色）+ `<Text dimColor>算力驱动的 Coding Agent</Text>`（中文 tagline；英文副标保留则并列两行）
  - **保留** React Compiler `_c` memo cache 结构（性能关键）+ `AppleTerminalClawd`→`AppleTerminalBeam` 降级分支（Apple Terminal 单色 brand_mark，形状同上、空腔保留）
- `src/tui/components/LogoV2/AnimatedClawd.tsx` → **`AnimatedBeam.tsx`**
  - pose 帧（default/arms-up/look-* + APPLE_EYES）→ 单 **"光扫上爬"** 动效：loading 时 bottom→top 逐行点亮（0.6s）+ 顶点 spark 脉冲呼吸（0.8s 周期）；尊重 `prefers-reduced-motion`（关则静态 mark）。保留 `_c` memo cache。
- `src/tui/components/LogoV2/AnimatedAsterisk.tsx` → **删除**
  - 消费方 `VoiceModeNotice.tsx:9,57` ✦ 动画 → 光核静态色块（`▀` brand_mark 色，§7.3 同前缀语言）；`grep -rn 'AnimatedAsterisk' src/` 复核零残留
- `WelcomeV2.tsx` / `CondensedLogo.tsx` / `LogoV2.tsx`：`<Clawd>`/`<AnimatedClawd>` 引用 → `<Beam>`/`<AnimatedBeam>`；边框标题/wordmark 与 BR-4 已改 `AtlasCode` 一致（核不残留）

### 1.2 theme 键族（D-9 = 41 处渲染引用 + 键值）
- `src/tui/utils/theme.ts`：`clawd_body`→`brand_mark`、`clawd_background`→`brand_mark_bg`（6 主题对象键改名 + 值换光锥色：`brand_mark` 各主题 = amber/warm-gold；`brand_mark_bg` 按需）；`grep -rn 'clawd_body\|clawd_background' src/` = 0
- 41 处渲染引用（`color="clawd_body"` → `color="brand_mark"` 等）随 grep 全换
- **D-9(a) 核销**：旧 Anthropic 橙 `rgb(215,119,87)` = 0（clawd 键族全清，e2e 0.1.31 gate ② 源证 D-9 残 4 处一并清）

### 1.3 tips 光核（D-3）
- `useDynamicTips`（闲时 tips 12s 轮播 6 条）前缀 `·` → 光核微符号 `▀`（brand_mark 色），切换瞬间渐显（§2.2）

### 1.4 编译产物 import（D-2）
- LogoV2 4 编译产物品牌字面走 `PRODUCT_BRAND` import（`src/shared/identity.ts`），不硬编码 "AtlasCode" 字面

### 1.5 D-10 用户可见面
- `main.tsx:2058` / `useVoice.ts:558` 注释 "multi-clauding" → "multi-session"
- insights HTML 报告标题 "Multi-Clauding (Parallel Sessions)" → Atlas 化标题（低风险单核销）
- **本波不动**：`detectMultiClauding` 标识符 + `multi_clauding` 数据键（与 Python 参考交叉引用，回归风险高，记 0.1.34 专审）——与 0.1.32 gate 同口径（内部术语排除）

### 1.6 D-8 发布 SOP 固化
- `docs/release-governance.md`（f4 3 支柱已入 master）或 dev-loop §3 补：发布验真 = shasum 比对 + packument `dist.tarball` 直下（**无 scope 前缀 canonical 名** `atlascode-<v>.tgz`；勿按 `@atlasharness/atlascode-<v>.tgz` 取恒 404）；e2e 生产 lane 走 `npm install` 不受影响

---

## 2. 四件套 + 品牌 gate（Main 自检）
- `tsc --noEmit` 0 / `eslint src/` 0 / `bun test tests/` 全量 / `bun run build` ✓
- **品牌 gate**：
  - `grep -rn 'clawd_body\|clawd_background\|AH_ART\|AnimatedClawd\|AnimatedAsterisk' src/` = 0（clawd 键族 + 旧 mark 字面 + 旧组件名全清）
  - `grep -rn 'Multi-Clauding' src/`（用户可见 HTML 标题）= 0（`detectMultiClauding` 内部标识符排除，同 0.1.32 口径）
  - `BEAM_ART` 棱镜 A 形在场（`grep -rn '▄█▄\|brand_mark' src/tui/components/LogoV2/Beam.tsx`）
  - 暖金 `rgb(255,184,0)` / 冷蓝在场 + 旧 Anthropic 橙 `rgb(215,119,87)` = 0（D-9 收尾）

---

## 3. e2e 前 gate（e2e 验收判据 · 报告命名 `r-YYYYMMDD-HHMM-brand-br3-0133.md`）
- ① 启动屏 mark = **棱镜光锥 A 形**（非 AH monogram）+ wordmark 双色 `Atlas`（暖金）/`Code`（冷蓝）+ 中文 tagline `算力驱动的 Coding Agent`
- ② theme `brand_mark`/`brand_mark_bg` 在场 + 旧 `clawd_body`/`clawd_background` = 0 + Anthropic 橙 `rgb(215,119,87)` = 0（SGR 实捕，软面回落单测）
- ③ 闲时 tips 前缀 = 光核微符号（非 `·`）
- ④ insights HTML 标题无 "Multi-Clauding"（用户可见面）
- ⑤ 回归基线 S-A hardFail=0 + A4F 6 句不回归（P0 封口链 D-279-r1 无回归）
- ⑥ **多终端 CJK 宽度（半块 `▄▀`）= 本波 INCONCLUSIVE 定因登记**（软面，归 0.1.34 多终端矩阵 BR-7，不阻塞）
- ⑥ 报告命名 `r-YYYYMMDD-HHMM-brand-br3-0133.md` + artifact id

---

## 4. 时序与收口（5 段闭环，继承 0.1.29-0.1.32 同口径）
1. **实施**（Main）：四件套 + 品牌 gate 绿 + 实现提交
2. **e2e 前 gate**（e2e）：①-⑤ hard 绿 + ⑥ INCONCLUSIVE 定因登记 → verdict
3. **缺陷回环**（gate FAIL 时）：3-round 上限（R1 修非根因 → R2 根因 → R3 仍红升级用户裁定，不自行扩 scope）
4. **发布**（Main）：bump 0.1.33 → tag v0.1.33 → npm publish → packument 验真（**D-8 SOP**）
5. **生产 lane**（e2e）：banner 实测 v0.1.33 + ①-④ 子集 + 用户面走查层 → 版本闭环
- **持续优化（0.1.34+）不预启**，待用户启动。

---

## 5. 回退
- 无 feature flag（§13.1）；需回退靠 `git revert` 发布补丁。
- 半块 CJK 宽度异常（个别终端）= 单点回退晶面/顶点为实心 `█`（形状不变、仅少"切割"感，§3.2 备记），不整版回退。
