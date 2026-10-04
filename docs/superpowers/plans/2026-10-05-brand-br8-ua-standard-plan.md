# BR-8 · UA 品牌串标准化实施计划（0.1.25）

> **状态**：实施计划（writing-plans）· **待 Main 0.1.24 发布后执行** · 对应 spec §10.3 + §6.2 Step 1b
> **性质**：自包含（只复用 `shared/identity.ts` 现有常量，不等 BR-1~BR-7 视觉工单）
> **目标**：UA 品牌串 = 品牌 + 版本 + repo URL 三段定式，**去字面 `+`**，repo/版本/品牌段走 `shared/identity` 单一事实源，delta ⑥ 版本段缺口收口

---

## 0. 改动范围总览

| 文件 | 改动类型 | 数 |
|---|---|---|
| `src/shared/identity.ts` | 去 `+` + 新增 builder | 1 串 + 1 注释 + 1 函数 |
| `src/shared/index.ts` | 导出 builder | 1 |
| `src/tui/utils/http.ts` | 去 `+` + import 化 + 换 builder | 3 串 + 3 注释 |
| `src/engine/tools/web/webFetchUtils.ts` | 换 builder（delta ⑥ 收口） | 1 串 |
| `src/tui/utils/userAgent.ts` | 注释去 `+`（实现不动） | 1 注释 |
| `src/modelprovider/clients.ts` | 注释去 `+` | 1 注释 |

---

## 1. 逐文件改动

### 1.1 `src/shared/identity.ts`

**① `buildUserAgent()`（L50-53）去 `+`：**

```ts
// 改前（L52）
return `${PRODUCT_NAME}/${getVersion()} (+${REPOSITORY_URL})`
// 改后
return `${PRODUCT_NAME}/${getVersion()} (${REPOSITORY_URL})`
```

注释 L50「（与 tui/utils/http.ts `AtlasCode/<v> (... +repo)` 语义对齐）」→ 去 `+repo` 表述。

**② 新增 WebFetch UA 共用 builder（§6.2 Step 1b）：**

```ts
// WebFetch UA 共用 builder（tui ④ 与 engine ⑤ 同一出处，零分叉）。
// 'Atlas-User' = 家族级 WebFetch agent 名（robots.txt 匹配串，Branded House 共享面 §12）。
export function buildWebFetchUserAgent(): string {
  return `Atlas-User (${PRODUCT_NAME}/${getVersion()}; ${REPOSITORY_URL})`
}
```

### 1.2 `src/shared/index.ts`

门面导出新增：`buildWebFetchUserAgent`（与既有 `REPOSITORY_URL` / `buildUserAgent` 同批导出）。

### 1.3 `src/tui/utils/http.ts`

import 增补：`REPOSITORY_URL` 与 `buildWebFetchUserAgent`（import 路径依既有 DEP 约定，`'src/shared'` 或相对 shared 门面）。

**③ `getUserAgent()`（L34）：**

```ts
// 改前（尾段）
…${workloadSuffix}, +https://github.com/vincentlau2046/AtlasCode)`
// 改后
…${workloadSuffix}, ${REPOSITORY_URL})`
```

**④ `getMCPUserAgent()`（L50）：**

```ts
// 改前
return `AtlasCode/${MACRO.VERSION}${suffix} (+https://github.com/vincentlau2046/AtlasCode)`
// 改后
return `AtlasCode/${MACRO.VERSION}${suffix} (${REPOSITORY_URL})`
```

**⑤ `getWebFetchUserAgent()`（L58-60）：**

```ts
// 改前
return `Atlas-User (${getDefaultUserAgent()}; +https://github.com/vincentlau2046/AtlasCode)`
// 改后
return buildWebFetchUserAgent()
```

注释 L13-15 / L33 / L49 的 G-3 裁定注「品牌串 = AtlasCode + 版本 + repo」改写为「无字面 `+`」。

### 1.4 `src/engine/tools/web/webFetchUtils.ts`

**⑥ L232 静态常量换 builder（delta ⑥ 收口：版本段恢复）：**

```ts
// 改前
const WEB_FETCH_USER_AGENT = 'Atlas-User (+https://github.com/vincentlau2046/AtlasCode)'
// 改后
import { buildWebFetchUserAgent } from '…/shared'
const WEB_FETCH_USER_AGENT = buildWebFetchUserAgent()
```

（engine → shared 为既有 DEP 允许，`agentDefinition.ts` 同款 `import { isEnvDefinedFalsy } from '../../../shared'`。）

### 1.5 `src/tui/utils/userAgent.ts`

`getDefaultUserAgent()` 实现不动（`AtlasCode/${MACRO.VERSION}`，BR-8 后仓内零消费者，保留供 SDK bundle 外部消费者）。注释 L8-9 去 `+repo` 表述。

### 1.6 `src/modelprovider/clients.ts`

注释 L33「（AtlasCode/<v> (+repo)…）」去 `+repo` 表述（代码不动，已走 `buildUserAgent()`）。

---

## 2. 验证（spec §14.4）

- [ ] `grep -rnF '+https://github' src/` = 0
- [ ] `grep -rnF '+${REPOSITORY_URL}' src/` = 0
- [ ] UA 五变体行为回归：LLM 出站 UA（核 `buildUserAgent` + tui `getUserAgent`）、MCP UA、WebFetch UA（tui ④ + engine ⑤）均无字面 `+`，repo/版本段 import 化，engine ⑤ 版本段补齐
- [ ] 构建 + 既有 e2e 回归全绿

## 3. 依赖 / 时序

- **前置**：Main 0.1.24 发布
- **自包含**：只复用 `identity.ts` 现有 `REPOSITORY_URL`/`getVersion`/`PRODUCT_NAME`，不依赖 BR-1 identity 扩常量
- **后续**：0.1.26 起 BR-1~BR-7 视觉工单（另出 writing-plans）