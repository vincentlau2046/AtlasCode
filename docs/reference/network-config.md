# 网络与模型配置

> 内容事实源：`src/modelprovider/`（roles.ts 角色池 / modelprovider.ts 车道 /
> errorMessaging.ts 错误面）、`src/tui/utils/settings/types.ts`（providers/modelRoles
> 字段）、`src/engine/tools/web/webSearchProvider.ts`（G-2 WebSearch 客户端面）、
> `docs/env-defaults-decision.md`（env 面决策记录）。

## 模型车道（OpenAI 协议静态键）

AtlasCode 无账号/订阅/refresh-token 面：模型调用一律走 **OpenAI 协议静态 key**。
两种配置车道（二选一或并用，优先级 settings.json 角色池 → env）：

### 车道 1：settings.json（推荐，唯一持久配置源方向）

`~/.atlas/settings.json`：

```jsonc
{
  "providers": {
    "bailian": {
      "baseUrl": "https://<your-openai-compatible-endpoint>/v1",
      "apiKey": "sk-...",
      "models": ["qwen38-27b"]
    }
  },
  "modelRoles": {
    "main":    { "models": ["bailian/qwen38-27b"] },
    "small":   { "models": ["bailian/qwen38-27b"] },
    "fast":    { "models": ["bailian/qwen38-27b"] },
    "premium": { "models": ["bailian/qwen38-27b"] }
  }
}
```

- 角色池（modelRoles）= 核心功能：main/small/fast/premium 等角色各持一列模型，
  角色内水平 fallback（roles.ts）。
- 未配角色池时报错文案会指路：`Add modelRoles/providers to ~/.atlas/settings.json,
  or set ATLAS_<ROLE>_MODEL`（modelprovider.ts）。
- `--model` 选项可用角色别名（`small`）或 `provider/model` 引用。
- TUI 内 `/model` 命令 + ModelSetup 对话框可交互配置（预设 + 端点填写）。

### 车道 2：环境变量

| env | 说明 |
|---|---|
| `OPENAI_AUTH_TOKEN` | OpenAI 协议 Bearer 静态键（主） |
| `OPENAI_API_KEY` | 同上（兼容名） |
| `ATLAS_<ROLE>_MODEL` | 按角色指定模型（如 `ATLAS_MAIN_MODEL=provider/model`） |

## 搜索（WebSearch 工具）

G-2 客户端化：默认 **bing SERP 无 key**；可选 **tavily**（API key 制）。

| 来源 | 键 | 说明 |
|---|---|---|
| env | `WEB_SEARCH_PROVIDER` | `bing`（缺省）/ `tavily` |
| env | `WEB_SEARCH_ENDPOINT` | 覆盖默认端点 |
| env | `TAVILY_API_KEY` | tavily key（仅 tavily provider 用） |
| settings.json | `search.tavilyApiKey` | 同上（settings 面） |

注意：这些键**不带 ATLAS_ 前缀**（G-2 裁定：搜索供应商面属开放约定）。

## 连接排障

- 启动预检（preflight）打 provider 端点；失败时 TUI 提示检查网络。
- SSL/证书问题：看 debug 日志（`--debug` / `--debug-file`）里 provider 请求错误。
- 代理环境：OpenAI 协议端点走标准 HTTP(S)，用系统代理即可；端点地址按你的网关
  实际域名配置（providers.baseUrl）。
- 模型不可用报错面：`src/modelprovider/errorMessaging.ts` 统一文案（含余额不足
  提示——静态键账号余额问题去你的网关/供应商侧充值，本仓无计费面）。
