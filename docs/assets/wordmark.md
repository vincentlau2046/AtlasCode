# 品牌 wordmark —— 定义与现状（BR-5 资产奠基，0.1.32）

> 目录：`docs/assets/` = AtlasCode 品牌资产文档目录（单一归属；后续 logo 图片/icon
> 资产亦落此目录）。本文件 = wordmark（文字标志）定义 + 品牌 mark 现状记录。
> 色彩 token 与对比度记录见同目录 `brand-system-spec.md`（BR-1/BR-2，0.1.31）。

## 1. wordmark（文字标志）

| 项 | 值 | 落点 |
|---|---|---|
| 主名 | **AtlasCode** | TUI 启动屏（`LogoV2` 边框标题 / wordmark 行 / welcome / condensed）、CLI `--version`、`atlas code` 等，全 `AtlasCode`（BR-4 0.1.30 收口） |
| 副题（tagline） | `AI Coding Agent` | `src/tui/components/LogoV2/Clawd.tsx` wordmark 行下 dimColor 行 |
| 主色 | 暖金 token（dark 系 `#FFB800` / light 系 `#B45309` / ansi 系 `yellowBright`） | `theme.ts` `brand` 键（BR-2 0.1.31） |
| 签名 | `🤖 Generated with [AtlasCode](repo)` | `attribution.ts`（BR-1 经 `PRODUCT_BRAND`/`REPOSITORY_URL` 单一事实源） |
| 内部短名 | `Atlas`（L7 内部层，系统提示词 "You are Atlas"） | `system.ts`（已合规，不动） |

命名三层（`architecture-charter.md` L7）：家族 `Atlas`（PRODUCT_FAMILY）/ 对外品牌
`AtlasCode`（PRODUCT_BRAND）/ 内部机器标识 `atlas*` 短变体（env 单一 `ATLAS_*`）。

## 2. 品牌 mark 现状（过渡态记录）

- **现状 mark = "AH" 块字 monogram**（`Clawd.tsx:99,125` 两处 `AH_ART`，5 行块字
  A+H 首字母）——**旧项目 AtlasHarness 残留**（审计 `2026-10-04-brand-assets-audit.md`
  §1.2 P0 判定），既非 Anthropic Clawd 也非 AtlasCode 目标 mark。
- **目标 mark = 光锥（Beam）**（spec §8：`Clawd.tsx`→`Beam.tsx` + `AnimatedClawd.tsx`→
  `AnimatedBeam.tsx` + theme 键 `clawd_body/clawd_background`→`brand_mark/brand_mark_bg`
  + pose 机制废弃重写为"光扫上爬"动效 + `AnimatedAsterisk` 删除）——归 **BR-3
  （D-1，user-gate，待用户审，不自动推进）**；本波（0.1.32）不碰 mark 视觉（含
  `clawd_body` 键值，BR-2 已钉「BR-2 不越界」边界）。
- 视觉资产（logo 图片/icon/favicon）**当前不存在**（审计 §0 P1 缺位）；本目录奠基后
  资产落点固定于此，图片资产随 BR-3/后续波补齐。

## 3. 资产目录约定

| 文件 | 内容 | 波次 |
|---|---|---|
| `brand-system-spec.md` | identity 常量 + 品牌色 token（6 主题 × 3 键）+ WCAG 对比度记录 | 0.1.31（BR-1/BR-2） |
| `wordmark.md`（本文件） | wordmark 定义 + mark 现状 + 目录约定 | 0.1.32（BR-5 奠基） |
| （预留）logo 图片/icon | 目标 mark 视觉资产 | BR-3 或更后（user-gate） |
