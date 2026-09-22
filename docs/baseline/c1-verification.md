# C-1 验真记录 — feature() 换前生产语义

> **charter L4.9 C-1**：换 import 前一次性验真 `bun:bundle` 生产语义。
> 判定：**= env 桩 → 零变化**（迁移到 `shared/feature.ts` 无语义差异）。

## 验证方法

在旧仓 `a8af45b` 上构建一个仅 import + 调用 `feature()` 的入口文件：

```typescript
import { feature } from "./src/native-ts/bunBundle.ts"
console.log(feature("COORDINATOR_MODE"))
```

`bun build c1-verify.ts --outfile /tmp/c1-out.js --target node` → 产物 0.75 KB。

## 产物分析

```javascript
function feature(_name) {
  const key = "FEATURE_" + _name;                                    // 字符串拼接，非构建期常量
  const env = (typeof process !== "undefined" ? process.env : undefined) ?? globalThis.process?.env ?? global.process?.env ?? {};
  if (env[key] === "true") return true;                              // call-time env 读
  if (env[key] === "false") return false;
  return ON_BY_DEFAULT.has(_name);
}
```

| 检查项 | 结果 | 判定 |
|---|---|---|
| `FEATURE_` 出现形态 | 字符串拼接前缀 `"FEATURE_" + _name` | 非构建期常量（非 DCE 内联） |
| `process.env` 读取 | 1 处，call-time 读 | env 桩语义 |
| flag 值是否内联 | 否（全部经 `env[key]` 运行时查） | 零常量 baked-in |

## 结论

**= env 桩**：旧仓 `bun:bundle` feature() 在生产 build 中是 call-time env 读，非构建期常量 DCE。

→ 迁移到新仓 `shared/feature.ts`（同为 call-time env 读）= **零语义变化**。

→ 不触发"= 构建期常量 → 换后对齐 ON_BY_DEFAULT 裁定意图"路径（charter L585 的备选判定不适用）。

## 后续

- feature() import 机械换随各文件在落地波（B/C/E/D）应用——纯机械零逻辑变更
- flag 语义分类（域级→domain-mount / 特性灰度→feature.ts / 远程实验→Port 8）仍 C2 细节
- E 层2 fixture 清单加 `env:` 字段显式 pin 涉及 `FEATURE_*`（charter L589）
