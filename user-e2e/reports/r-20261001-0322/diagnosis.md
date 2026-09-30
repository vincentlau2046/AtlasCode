# AtlasCode E2E 问题定位报告（r-20261001-0322）

> 生成于 2026-09-30T19:28:35.505Z；证据在 `user-e2e/artifacts/r-20261001-0322/`（PTY 转录 / stream-json / 计时）。

## 失败逐条定位
### L2 — engine loop（queryAgentLoop / 终止判定）（2）
#### core-2 — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：headless 多轮断：r1=true r2=ok——engine loop 续轮面 r1 495ms r2 484ms
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- [headless stderr 尾]
```
[AtlasCode] main() starting...

[AtlasCode] main() starting...

```

#### core-3 — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：工具回合断：渲染=false（marker 1/2）磁盘=false 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"markerCount":1,"diskOk":false,"waitMs":300313}
- [pty 尾屏]
```
· /sessionlist 会话列表
          · crl+d 退出
· Esc Esc 清空输入
 · /model切换模型
· /help 查看全部命令
· /help 查看全部命令✓ Marketplace installed · /plugin to see available plugins
                                                         · /help 查看全部命令 
       · /clear 清屏
· /sessionlist 会话列表
          · crl+d 退出
· Esc Esc 清空输入
 · /model切换模型
· /help 查看全部命令
       · /clear 清屏
· /sessionlist 会话列表
          · crl+d 退出
· Esc Esc 清空输入
 · /model切换模型
· /help 查看全部命令
       · /clear 清屏
· /sessionlist 会话列表
          · crl+d 退出
· Esc Esc 清空输入
 · /model切换模型
· /help 查看全部命令
```

## IFF 监控交叉对照（§2-F4 / §7②）
- 用户 IFF 监控的 `Qwen38-27B-TXT 200 0/0 — — 1ms` 行须先分类：**健康探针/`/v1/models` 类的 0/0 1ms 属正常**（方案 §2-F1/F4）；只有与失败 case 时间戳重叠的 **chat 回合** 0-token 才计 L4 信号。
- 对照表模板（晨起人工补网关日志后填）：

| 失败 case | 时刻(UTC) | 监控时段 0/0 行是否重叠 | 判读 |
|----------|-----------|--------------------------|------|
| core-2 | 2026-09-30T19:23:12.084Z | （待补） | （待补） |
| core-3 | 2026-09-30T19:28:13.225Z | （待补） | （待补） |

## 已知残口 vs 新故障
- 与 `docs/product-status.md` `[ATLAS-HOLD]` 残口表逐条对照（IFF 网关 56 行/31 文件换值项、②档占位值等）：本报告的 L3/L4 条目中，凡命中已知残口者标「已知」，其余标「新故障」。

## 下一轮修复清单（P0/P1/P2）
- **P0（核心 loop / 基本功能不可用）**：core-2（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；core-3（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））
- **P1（功能面损坏）**：无
- **P2（超时/体验/未决）**：无

> 注：本报告只定位不改码；修复按 P0 → P1 顺序进入下一轮功能补齐。
