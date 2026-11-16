# 0.1.120 段 I 波报告 — headless result usage 聚合 + USD 计费面首建

落码 commit `193d1fe3`（master 直落；lock-face = 工单
docs/2026-11-16-headless-usage-result-ticket.md §7 + 呈批书 L6-L8，f4 §10
@7ecf0fa4 批复）。

## 1. 落码面

| 件 | 落点 | 内容 |
|---|---|---|
| 件 1 usage 纯聚合（L6 落点 (a)） | src/cli/print.ts | 单一 helper `aggregateResultUsage`（导出，禁三处各算）；buildResultMessage + deferred 站点同形装配；error_during_execution 站点双缺席 |
| 件 2 USD 计费面首建（L7 D1 翻转） | src/cost/pricing.ts + index.ts（新域） | BUILTIN_PRICING 静态双价表 + resolvePricing + computeCostUsd；settings cost.pricingOverrides 接缝 |
| schema | src/engine/config/types.ts | 加性 `cost.pricingOverrides` 键（teams 键后） |
| boundaries | eslint.config.mjs | cost 域注册（出边 shared+modelprovider；cli allow 面 +cost） |

## 2. 判据钉核销

- **钉 i**：cost 独立单文件域，零 modelprovider/capabilities 域侵入；modelCost 其余面零复活。
- **钉 ii**：归一单源 = `stripProviderPrefix`（经 modelprovider index 门面 import，STR-1 合规；无第二归一实现）。
- **钉 iii**：override 整条替换语义——命中即定，半字段 → undefined fail-closed（不回落内置表）；优先序 内置表 < override。
- **钉 iv**：unknown 模型 total_cost_usd 缺席（禁伪造 0）；显式 0 = 合法 0；error_during_execution 站点 usage/total_cost_usd 双缺席（源级断言：`subtype: 'error_during_execution'` 块 700 字符内无 usage/total_cost_usd 字样）。
- **L6 单谓词**：`type === 'assistant' && usage 在场` 才累加；synthetic/压缩边界/progress 天然跳过（零类型枚举外推，测试锁形）。
- **L7 cache 零计入**：computeCostUsd 仅 input/output 两价；cache 字段不影响成本（测试锁形）；低估面注记于 pricing.ts 头注；schema 预留扩展位。

## 3. 判读披露（候 §3 采认）

1. **零 engine 触碰**：cost state 唯一活调用 = vcr.ts 缓存回放支（活路径恒空），engine→cost 写链不采，聚合全部在 print.ts 域内（(a) 终裁）。
2. **usage 取用形**：嵌套 `message.usage` 为主、顶层 `usage` fallback（loop.ts:1034 roundUsage 同形先例）。
3. **usage 恒在**：result 事件加性四 token 字段 snake_case；零 usage 消息 = 全 0（非缺席）。
4. **格 1 对账**：三回合 fixture，messages 求和 = 逐回合 roundUsage 精确累加 Δ=0（toEqual 全等断言）。
5. **boundaries 注册面**：新域成本 = eslint.config.mjs ELEMENTS +1 条 + element-types 2 面（cost 出边 / cli 消费边）——实现必要缝（lsp/mcp/remote 同型先例），非 lock-face 偏离（域注册是「新独立单文件域」钉 i 的机械推论）。
6. **import 路径合规**：cli → `../cost`（index 门面）；cost → `../modelprovider`（index 门面）——两处均为 STR-1 门面收口要求，非深路径。
7. **格 3 兼容**：wire 加性 diff；TUI/print 文本零变化；drain 序零变化（无渲染路径触碰）。

## 4. 四件套

| 件 | 结果 |
|---|---|
| tsc --noEmit | 0 error |
| eslint src/ | 0 error 0 warning |
| 定向测试 | 20/20（cost-pricing 9 + headless-usage-result 11）TDD RED（import error）→ GREEN |
| canon `bun test ./tests/` | 6128 tests / 503 files：6010 pass / 118 fail——fail 集逐名对账 vs canon-baseline.log（118 条）：**NEW 侧空集（零增量）**，GONE 侧 3 条 = C85-D JSONL flaky 家族（同 0.1.119 §5 先例，环境波动非代码面） |

## 5. 候段链

§3 采认（本报告）→ e2e gate（格 1-4 + reqlog 对账腿）→ 段 L release 0.1.120（发布完成→e2e 信号必发，0.1.119 订正条款）→ 生产 lane → issue #2 回执销项。
