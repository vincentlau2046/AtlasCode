# AtlasCode E2E 问题定位报告（r-20261001-0332）

> 生成于 2026-09-30T19:43:02.042Z；证据在 `user-e2e/artifacts/r-20261001-0332/`（PTY 转录 / stream-json / 计时）。

## 失败逐条定位
### L2 — engine loop（queryAgentLoop / 终止判定）（78）
#### core-2 — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：headless 多轮断：r1=true r2=ok——engine loop 续轮面 r1 229ms r2 242ms
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
- 证据：{"markerCount":1,"diskOk":false,"waitMs":300305}
- [pty 尾屏]
```
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
       · /clear 清屏
· /sessionlist 会话列表
          · crl+d 退出
· Esc Esc 清空输入
                                                                      · Esc Esc 清空输入✓ Atlas marketplace installed · /plugin to browse Atlas plugins
/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/core-3
/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/core-3· /model切换模型                                                                         
                                                             · /model 切换模型                                                                                                                                                                                                          · /model 切换模型✓ Marketplace installed · /plugin to see available plugins
· /help 查看全部命令
```

#### slash/ant-trace — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] ant-trace（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/backfill-sessions — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] backfill-sessions（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/branch — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] branch（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/break-cache — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] break-cache（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/clear — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] clear（local，清屏后输入面须恢复） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/color — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] color（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/config — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] config（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/context — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] context（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/copy — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] copy（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/cost — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] cost（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/ctx_viz — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] ctx_viz（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/debug-tool-call — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] debug-tool-call（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/diff — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] diff（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/effort — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] effort（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/env — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] env（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/export — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] export（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/files — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] files（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/heapdump — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] heapdump（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/help — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] help（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":false,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/hooks — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] hooks（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/ide — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] ide（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/init-verifiers — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] init-verifiers（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/install — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] install（local，安装面（沙箱内）） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/keybindings — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] keybindings（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/mcp — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] mcp（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/memory — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] memory（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/model — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] model（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/onboarding — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] onboarding（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/output-style — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] output-style（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/permissions — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] permissions（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/plan — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] plan（local，plan 模式切换） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/plugin — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] plugin（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/release-notes — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] release-notes（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/reload-plugins — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] reload-plugins（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/rename — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] rename（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/resume — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] resume（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/sandbox-toggle — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] sandbox-toggle（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/session — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] session（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/sessionlist — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] sessionlist（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/skills — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] skills（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/stats — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] stats（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/status — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] status（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/statusline — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] statusline（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/stickers — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] stickers（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/tag — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] tag（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/tasklist — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] tasklist（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/tasks — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] tasks（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/terminal-setup — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] terminal-setup（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/theme — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] theme（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/thinkback — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] thinkback（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/thinkback-play — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] thinkback-play（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/usage — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] usage（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/version — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] version（local） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/vim — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] vim（local，vim 模式切换后 Esc 退出） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"local","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/btw — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] btw（llm） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"llm","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/bughunter — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] bughunter（llm） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"llm","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/commit — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] commit（llm，sweep 工作区已 git init） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"llm","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/commit-push-pr — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] commit-push-pr（llm，无远端 PR，预期优雅失败） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"llm","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/compact — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] compact（llm） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"llm","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/doctor — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] doctor（llm） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"llm","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/feedback — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] feedback（llm） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"llm","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/good-atlas — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] good-atlas（llm） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"llm","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/init — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] init（llm，写 CLAUDE.md（沙箱工作区）） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"llm","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/insights — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] insights（llm） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"llm","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/issue — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] issue（llm） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"llm","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/perf-issue — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] perf-issue（llm） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"llm","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/review — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] review（llm） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"llm","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/security-review — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] security-review（llm） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"llm","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/summary — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] summary（llm） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"llm","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/autofix-pr — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] autofix-pr（auth，无 PR，优雅降级） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"auth","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/install-slack-app — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] install-slack-app（auth） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"auth","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/login — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] login（auth，OAuth 流程面，Esc 中止） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"auth","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/logout — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] logout（auth） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"auth","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/oauth-refresh — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] oauth-refresh（auth） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"auth","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/pr_comments — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] pr_comments（auth，无 PR，优雅降级） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"auth","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

#### slash/share — 双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）
- 依据：[STUCK] share（auth，未登录态断优雅降级） 
- 嫌疑代码区：
  - src/engine/query/（queryAgentLoop 多轮面）
  - src/engine/loop（agent loop 状态/终止判定）
  - src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）
  - src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）
  - IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）
- 证据：{"cls":"auth","settleOk":true,"promptBack":false,"expectOk":true,"respawn":0}
- [pty 尾屏]
```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash◐medium·/effort
[>0q◐ medium · /effortAtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau20…
❯ /add-dir .                                                                                                                                                                                               ✢ Perambulating…                                                                                                                                                                                                                                                                                                                                                                                            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/AtlasC◐medium·/effortpAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
  ⎿  .isalreadyaccessiblewithintheexistingworkingdirectory/home/vince/projects/AtlasCode/user-e2e/workspaces/r-20261001-0332/slash.                ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────❯                                                                                                                                                                                                       ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  ⚡ Qwen38-27B-TXT · 🧠 med · ▶ Default · ⌂ /home/vince/projects/Atlas · /model 切换模型 AtlasCode is installed via npm (npm install -g @atlasharness/atlascode). See https://github.com/vincentlau204…Code/user-e2e/workspaces/r-20261001-0332/slash                                                                                                                                                                                                                                                                                                                                                                ◐medium· /effort AtlasCode is instaled via npm (npm instal -g @atlasharnes/atlascode). Se htps:/github.com/vincentlau20
❯ /agents                                                                                                                                                                                                  ✢ Nebulizing…                                                                                                                                                                                                                                                                                                                                                                                             ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯  
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⚡Qwen38-27B-TXT ·🧠med ·▶Default ·⌂/home/vince/projects/Atlas◐medium·/effortAtlasCodeisinstalledvianpm(npminstall-g@atlasharness/atlascode).Seehttps://github.com/vincentlau20…
Code/user-e2e/workspaces/r-20261001-0332/slash
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────Agents  No agents found                                                                                                                                                                                            ❯ Create new agent                                                                                                                                                                                                                                                                                                                                                                                      N agents found. Cret specialized subagent that Atlas can delegate to.
Eachsubagenthasitsowncontextwindow,customsystemprompt,andspecifictools.
Trycreating:CodeReviewer,CodeSimplifier,SecurityReviewer,TechLead,orUXReviewer.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────
Built-in(alwaysavailable):
atlas-code-guide·fast
general-purpose·inherit
statusline-setup·small
Press↑↓tonavigate·Entertoselect·Esctogoback
```

## IFF 监控交叉对照（§2-F4 / §7②）
- 用户 IFF 监控的 `Qwen38-27B-TXT 200 0/0 — — 1ms` 行须先分类：**健康探针/`/v1/models` 类的 0/0 1ms 属正常**（方案 §2-F1/F4）；只有与失败 case 时间戳重叠的 **chat 回合** 0-token 才计 L4 信号。
- 对照表模板（晨起人工补网关日志后填）：

| 失败 case | 时刻(UTC) | 监控时段 0/0 行是否重叠 | 判读 |
|----------|-----------|--------------------------|------|
| core-2 | 2026-09-30T19:33:01.906Z | （待补） | （待补） |
| core-3 | 2026-09-30T19:38:03.046Z | （待补） | （待补） |
| slash/ant-trace | 2026-09-30T19:38:36.569Z | （待补） | （待补） |
| slash/backfill-sessions | 2026-09-30T19:38:39.780Z | （待补） | （待补） |
| slash/branch | 2026-09-30T19:38:42.996Z | （待补） | （待补） |
| slash/break-cache | 2026-09-30T19:38:46.211Z | （待补） | （待补） |
| slash/clear | 2026-09-30T19:38:49.425Z | （待补） | （待补） |
| slash/color | 2026-09-30T19:38:52.636Z | （待补） | （待补） |
| slash/config | 2026-09-30T19:38:55.848Z | （待补） | （待补） |
| slash/context | 2026-09-30T19:38:59.062Z | （待补） | （待补） |
| slash/copy | 2026-09-30T19:39:02.275Z | （待补） | （待补） |
| slash/cost | 2026-09-30T19:39:05.489Z | （待补） | （待补） |
| slash/ctx_viz | 2026-09-30T19:39:08.702Z | （待补） | （待补） |
| slash/debug-tool-call | 2026-09-30T19:39:11.913Z | （待补） | （待补） |
| slash/diff | 2026-09-30T19:39:15.128Z | （待补） | （待补） |
| slash/effort | 2026-09-30T19:39:18.342Z | （待补） | （待补） |
| slash/env | 2026-09-30T19:39:21.556Z | （待补） | （待补） |
| slash/export | 2026-09-30T19:39:24.768Z | （待补） | （待补） |
| slash/files | 2026-09-30T19:39:27.980Z | （待补） | （待补） |
| slash/heapdump | 2026-09-30T19:39:31.197Z | （待补） | （待补） |
| slash/help | 2026-09-30T19:39:34.414Z | （待补） | （待补） |
| slash/hooks | 2026-09-30T19:39:37.626Z | （待补） | （待补） |
| slash/ide | 2026-09-30T19:39:40.837Z | （待补） | （待补） |
| slash/init-verifiers | 2026-09-30T19:39:44.050Z | （待补） | （待补） |
| slash/install | 2026-09-30T19:39:47.262Z | （待补） | （待补） |
| slash/keybindings | 2026-09-30T19:39:50.473Z | （待补） | （待补） |
| slash/mcp | 2026-09-30T19:39:53.683Z | （待补） | （待补） |
| slash/memory | 2026-09-30T19:39:56.893Z | （待补） | （待补） |
| slash/model | 2026-09-30T19:40:00.107Z | （待补） | （待补） |
| slash/onboarding | 2026-09-30T19:40:03.320Z | （待补） | （待补） |
| slash/output-style | 2026-09-30T19:40:06.534Z | （待补） | （待补） |
| slash/permissions | 2026-09-30T19:40:09.746Z | （待补） | （待补） |
| slash/plan | 2026-09-30T19:40:12.959Z | （待补） | （待补） |
| slash/plugin | 2026-09-30T19:40:16.173Z | （待补） | （待补） |
| slash/release-notes | 2026-09-30T19:40:19.387Z | （待补） | （待补） |
| slash/reload-plugins | 2026-09-30T19:40:22.597Z | （待补） | （待补） |
| slash/rename | 2026-09-30T19:40:25.807Z | （待补） | （待补） |
| slash/resume | 2026-09-30T19:40:29.020Z | （待补） | （待补） |
| slash/sandbox-toggle | 2026-09-30T19:40:32.236Z | （待补） | （待补） |
| slash/session | 2026-09-30T19:40:35.450Z | （待补） | （待补） |
| slash/sessionlist | 2026-09-30T19:40:38.664Z | （待补） | （待补） |
| slash/skills | 2026-09-30T19:40:41.877Z | （待补） | （待补） |
| slash/stats | 2026-09-30T19:40:45.092Z | （待补） | （待补） |
| slash/status | 2026-09-30T19:40:48.309Z | （待补） | （待补） |
| slash/statusline | 2026-09-30T19:40:51.523Z | （待补） | （待补） |
| slash/stickers | 2026-09-30T19:40:54.738Z | （待补） | （待补） |
| slash/tag | 2026-09-30T19:40:57.951Z | （待补） | （待补） |
| slash/tasklist | 2026-09-30T19:41:01.165Z | （待补） | （待补） |
| slash/tasks | 2026-09-30T19:41:04.375Z | （待补） | （待补） |
| slash/terminal-setup | 2026-09-30T19:41:07.586Z | （待补） | （待补） |
| slash/theme | 2026-09-30T19:41:10.796Z | （待补） | （待补） |
| slash/thinkback | 2026-09-30T19:41:14.007Z | （待补） | （待补） |
| slash/thinkback-play | 2026-09-30T19:41:17.221Z | （待补） | （待补） |
| slash/usage | 2026-09-30T19:41:20.434Z | （待补） | （待补） |
| slash/version | 2026-09-30T19:41:23.647Z | （待补） | （待补） |
| slash/vim | 2026-09-30T19:41:26.860Z | （待补） | （待补） |
| slash/btw | 2026-09-30T19:41:30.878Z | （待补） | （待补） |
| slash/bughunter | 2026-09-30T19:41:34.893Z | （待补） | （待补） |
| slash/commit | 2026-09-30T19:41:38.910Z | （待补） | （待补） |
| slash/commit-push-pr | 2026-09-30T19:41:42.925Z | （待补） | （待补） |
| slash/compact | 2026-09-30T19:41:46.941Z | （待补） | （待补） |
| slash/doctor | 2026-09-30T19:41:50.957Z | （待补） | （待补） |
| slash/feedback | 2026-09-30T19:41:54.973Z | （待补） | （待补） |
| slash/good-atlas | 2026-09-30T19:41:58.988Z | （待补） | （待补） |
| slash/init | 2026-09-30T19:42:03.006Z | （待补） | （待补） |
| slash/insights | 2026-09-30T19:42:07.023Z | （待补） | （待补） |
| slash/issue | 2026-09-30T19:42:11.038Z | （待补） | （待补） |
| slash/perf-issue | 2026-09-30T19:42:15.056Z | （待补） | （待补） |
| slash/review | 2026-09-30T19:42:19.073Z | （待补） | （待补） |
| slash/security-review | 2026-09-30T19:42:23.090Z | （待补） | （待补） |
| slash/summary | 2026-09-30T19:42:27.105Z | （待补） | （待补） |
| slash/autofix-pr | 2026-09-30T19:42:30.317Z | （待补） | （待补） |
| slash/install-slack-app | 2026-09-30T19:42:33.526Z | （待补） | （待补） |
| slash/login | 2026-09-30T19:42:36.734Z | （待补） | （待补） |
| slash/logout | 2026-09-30T19:42:39.941Z | （待补） | （待补） |
| slash/oauth-refresh | 2026-09-30T19:42:43.148Z | （待补） | （待补） |
| slash/pr_comments | 2026-09-30T19:42:46.358Z | （待补） | （待补） |
| slash/share | 2026-09-30T19:42:49.566Z | （待补） | （待补） |

## 已知残口 vs 新故障
- 与 `docs/product-status.md` `[ATLAS-HOLD]` 残口表逐条对照（IFF 网关 56 行/31 文件换值项、②档占位值等）：本报告的 L3/L4 条目中，凡命中已知残口者标「已知」，其余标「新故障」。

## 下一轮修复清单（P0/P1/P2）
- **P0（核心 loop / 基本功能不可用）**：core-2（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；core-3（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/ant-trace（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/backfill-sessions（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/branch（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/break-cache（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/clear（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/color（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/config（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/context（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/copy（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/cost（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/ctx_viz（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/debug-tool-call（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/diff（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/effort（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/env（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/export（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/files（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/heapdump（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/help（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/hooks（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/ide（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/init-verifiers（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/install（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/keybindings（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/mcp（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/memory（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/model（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/onboarding（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/output-style（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/permissions（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/plan（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/plugin（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/release-notes（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/reload-plugins（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/rename（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/resume（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/sandbox-toggle（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/session（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/sessionlist（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/skills（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/stats（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/status（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/statusline（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/stickers（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/tag（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/tasklist（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/tasks（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/terminal-setup（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/theme（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/thinkback（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/thinkback-play（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/usage（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/version（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/vim（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/btw（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/bughunter（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/commit（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/commit-push-pr（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/compact（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/doctor（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/feedback（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/good-atlas（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/init（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/insights（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/issue（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/perf-issue（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/review（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/security-review（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/summary（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/autofix-pr（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/install-slack-app（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/login（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/logout（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/oauth-refresh（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/pr_comments（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））；slash/share（L2：双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4））
- **P1（功能面损坏）**：无
- **P2（超时/体验/未决）**：无

> 注：本报告只定位不改码；修复按 P0 → P1 顺序进入下一轮功能补齐。
