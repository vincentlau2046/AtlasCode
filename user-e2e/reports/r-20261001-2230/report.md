# AtlasCode 用户视角 E2E 测试报告（r-20261001-2230）

- **执行窗口**：2026-10-01T14:30:05.522Z → 2026-10-01T14:33:21.727Z（CST 对照见 artifacts）
- **对象**：@atlasharness/atlascode v0.1.5（git 06da48d）
- **环境**：网关 127.0.0.1:8999 / 模型 iff/Qwen38-27B-TXT（settings modelRoles 池头） / fullHome=false
- **总体**：✅ 4（共 4 case）

## 分 tier 结果
### gate — ✅ 1
| case | 结果 | 耗时 | 用户可见症状 / 说明 |
|------|------|------|---------------------|
| gate | ✅ PASS | 1s | 网关 200/2ms models=Qwen38-27B-TXT,bge-m3,deepseek-v4-flash,deepseek-v4-pro,glm-5,glm-5.1；settings roles=small,fast,premiu |

### conv — ✅ 3
| case | 结果 | 耗时 | 用户可见症状 / 说明 |
|------|------|------|---------------------|
| conv-tic-tac-toe | ✅ PASS | 1m24s | 5/5 轮通过。R1响应:true 输入活:true (17244ms) / R2响应:true 上下文:true(井字棋) 输入活:true / R3响应:true 纠正确认:true(4×4) 输入活:true / R4响应:true  |
| conv-refactor | ✅ PASS | 54s | 5/5 轮通过。R1响应:true 输入活:true (8416ms) / R2响应:true 上下文:true(公共) 输入活:true / R3响应:true 纠正确认:true(subtract) 输入活:true / R4响应:tr |
| conv-debug | ✅ PASS | 57s | 5/5 轮通过。R1响应:true 输入活:true (17244ms) / R2响应:true 上下文:true(字符串) 输入活:true / R3响应:true 修复验证:false 输入活:true / R4响应:true 边界讨论 |

## 失败汇总（按用户影响排序）
无失败 case。

## 判据与复跑
- marker 判据：「回复且仅回复标记词：X」→ X 在剥净转录中 ≥2 次（输入回显 + assistant 渲染）；Qwen38-27B 下该指令遵循实测可靠。
- 工具/编码任务只信磁盘 ground truth（文件存在 / 测试 exit 0 / git log），不信模型自述。
- 复跑：`bun run user-e2e/run.ts --tier <tier>`（指定才跑，非必测）；断点：`--resume <runId>`。
