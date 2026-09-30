# 远程与会话消息面（现状说明）

> 内容事实源：`src/remote/`（UDS 消息面，`isUdsInboxEnabled()` env opt-in 门）、
> `src/cli/parse.ts`（`--messaging-socket-path` 选项 + `--replay-user-messages`）、
> `src/engine/messaging/queueTypes.ts`（消息队列型面）。
> 本页同时登记 remote 族的历史裁撤去向（H6 防空洞：明示接缝，不假装能力）。

## 现状（v0.1.x）

AtlasCode 的远程/移动端桥接面（原 Remote Control / code sessions / 旧 1P 端点）
属于 1P-REST/remote 子系统裁撤范围（G-3 裁定：归 1P 簇裁剪波处理），
**当前版本不提供远程移动端会话控制**。本页只登记现存真实面：

## UDS 消息面（现存）

进程间消息交换走 Unix Domain Socket（UDS inbox），**默认关**，env opt-in：

- 门控：`isUdsInboxEnabled()`（remote 域根门面，env opt-in 默认 OFF）。
- CLI 选项：`--messaging-socket-path <path>`（UDS 服务器路径，缺省 tmp 路径）
  —— 仅当 UDS inbox 门开时注册（`src/cli/parse.ts`）。
- headless 配合：`--replay-user-messages`（stdin 用户消息回显 stdout 确认，
  需 `--input-format=stream-json` + `--output-format=stream-json`）。

## 多智能体（swarm / teammates）

队友 agent 以 tmux / in-process 方式 spawn（`--teammate-mode` / `--agent-id` /
`--team-name` 等选项，`src/swarm/`），消息经 `SendMessageTool` 传递——
这是本仓真实的多 agent 协作面（区别于已裁撤的远程移动端面）。

## 历史去向（裁登记，防「为什么没有 X」类问题）

| 旧面 | 去向 |
|---|---|
| `--teleport` / `--remote` 选项 | remote 族波裁（不随迁） |
| `--remote-control` / `--rc` 桥面 | 1P 簇裁剪波（#200） |
| code sessions / CCR 会话 API | 1P 簇裁剪波（#200） |
| 旧仓 GCS 更新通道 | 双通道升级取代（`atlas update`，见 cli-reference.md） |
