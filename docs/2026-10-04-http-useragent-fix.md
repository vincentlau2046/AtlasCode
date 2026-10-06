# Implement 工单：LLM 请求 User-Agent 品牌串（OpenAI/JS → AtlasCode）

分析侧 `issule analysist` 2026-10-04 提交 `AtlasCode 架构实施Main`。**根因已定位 + 架构口径已与用户核对**（修法必须走 `src/shared/identity`，不从壳接）。

## 根因

LLM API 客户端用 `openai` SDK 但没传自定义 UA → 请求头是 SDK 默认 `OpenAI/JS 7.21.0`（`package.json` `"openai": "^7.9.0"` 实装 7.21.0；SDK `client.mjs:422` `getUserAgent() = \`${this.constructor.name}/JS ${VERSION}\``，`:1210` 非浏览器时无条件挂）。品牌串（AtlasCode+版本+repo）只调整到了壳的 HTTP 面（`src/tui/utils/http.ts` / `userAgent.ts`），没落到真正发 LLM 请求的 modelprovider 客户端。

- `src/modelprovider/clients.ts:26` `new OpenAI({ baseURL, apiKey, maxRetries: 0, timeout })` —— 无 UA。
- `src/modelprovider/modelprovider.ts:649`（`verifyKey`）`new OpenAI({...})` —— 同样无 UA。

## 架构约束（数字划分，修法据此）

- `src/modelprovider` = 核的**自包含 leaf**：对外仅 import `openai`/`crypto`/`zod/v4`/自身 `src/modelprovider/*`，**0 依赖 `src/tui`、`src/engine`、`src/shared`**。
- 壳层 UA（`src/tui/utils/userAgent.ts`）读 `MACRO.VERSION`；`MACRO` 是 `main.tsx:27` 运行时注入的 global（= `src/engine` 的 `getVersion()` package.json 读），**主循环启动前不存在** → 不能给核/SDK-bundled 面用。
- 品牌串单一事实源 = `src/shared/identity.ts`（`VERSION/PRODUCT_NAME/PRODUCT_BRAND/PACKAGE_URL/FEEDBACK_CHANNEL`），**现为空占位**（`export {}`，状态「A 波骨架占位（实现待 A-2）」）。

⇒ 修法必须**先实现 shared identity**、核从 shared 取，**不得从 `tui/utils/userAgent.ts` 接**。

## 改动

### 1. 实现 `src/shared/identity.ts`（A-2 待办落掉）

导出（对齐现有品牌串 `http.ts:34/50/59` 与 `userAgent.ts:10`）：
- `PRODUCT_NAME = 'AtlasCode'`
- `PACKAGE_NAME = '@atlasharness/atlascode'`（npm 包名，注意：`main.tsx:29` 现把 npm 名错塞进 `MACRO.PACKAGE_URL`，此处字段语义分开）
- `REPOSITORY_URL = 'https://github.com/vincentlau2046/AtlasCode'`
- `getVersion(): string` —— **复用 `src/engine/session/paths.ts:148-177` 同款算法**（`process.argv[1]` 上行走定位最近 `package.json` 读 `version`，`'0.0.0'` 回落），不要再抄第三份、不要碰 `MACRO`。
- `buildUserAgent(): string` = `` `${PRODUCT_NAME}/${getVersion()} (+${REPOSITORY_URL})` ``（与 `http.ts:34` 的 `AtlasCode/<v> (... +repo)` 语义对齐）。

> FEEDBACK_CHANNEL / PRODUCT_BRAND 若现有值（`http.ts`/`doctor` 面），A-2 一并落；无现状则留 TBD，本次 UA 面不依赖。

### 2. modelprovider 接 UA（两处 `new OpenAI`）

- `src/modelprovider/clients.ts:26`：加 `defaultHeaders: { 'User-Agent': buildUserAgent() }`（`import { buildUserAgent } from 'src/shared/identity'`）。
- `src/modelprovider/modelprovider.ts:649`（`verifyKey`）：同款。

两处都经 shared leaf，不引 tui/engine，层边界干净。

### 3.（去漂移，非本轮必需，可后续）壳 UA 归一

`src/tui/utils/userAgent.ts:11` 的 `getDefaultUserAgent()` 改从 `identity.ts` 取 `PRODUCT_NAME` + `getVersion()`（替换 `MACRO.VERSION`）；`http.ts:34/50/59` 硬编码的 `+https://github.com/vincentlau2046/AtlasCode` 改读 `REPOSITORY_URL`。此条只是消掉版本读/品牌串的三处复制（`paths.ts getVersion` / `cli/parse.ts resolveCliVersion` / 壳 `MACRO` polyfill），不阻塞 header 主修复。

## 回归判别（分析侧承接）

- 单测：`buildUserAgent()` 返回 `AtlasCode/<package.json version> (+https://github.com/vincentlau2046/AtlasCode)`；`getVersion()` 在 dev 与 npm 安装两态都读到 0.1.1x（非 '0.0.0'）。
- 产物面：build 后 `dist/cli.js` 里 `OpenAI/JS` 不再作为出站 UA 来源（grep 产物确认 `buildUserAgent` 串在 bundle、且 modelprovider 客户端带 `defaultHeaders`）。可选 pty：对网关发一次真实 LLM 请求，抓网关侧 UA 头应转 `AtlasCode/…`（需 gateway + 探针，非本轮必备）。

## 注

- 本地 `package.json` version 现为 **0.1.19**（0.1.18 发布后已 bump，未发）。UA 版本段取 `getVersion()`，与发布版本号自动一致，无需特别处理。