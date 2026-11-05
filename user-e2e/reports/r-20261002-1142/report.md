# AtlasCode 用户视角 E2E 测试报告（r-20261002-1142）

- **执行窗口**：2026-10-02T03:42:14.846Z → 2026-10-02T03:48:18.280Z（CST 对照见 artifacts）
- **对象**：@atlasharness/atlascode v0.1.9（git 96aa2f3）
- **环境**：网关 127.0.0.1:8999 / 模型 iff/Qwen38-27B-TXT（settings modelRoles 池头） / fullHome=false
- **总体**：✅ 4  ❌ 1（共 5 case）

## 分 tier 结果
### gate — ✅ 1
| case | 结果 | 耗时 | 用户可见症状 / 说明 |
|------|------|------|---------------------|
| gate | ✅ PASS | 1s | 网关 200/2ms models=Qwen38-27B-TXT,bge-m3,deepseek-v4-flash,deepseek-v4-pro,glm-5,glm-5.1；settings roles=small,fast,premiu |

### core — ✅ 3  ❌ 1
| case | 结果 | 耗时 | 用户可见症状 / 说明 |
|------|------|------|---------------------|
| core-1 | ✅ PASS | 36s | 4/4 轮 marker 渲染（基本多轮通） |
| core-2 | ✅ PASS | 3s | headless --resume 同 session 2 轮通过（74d8c162） |
| core-3 | ❌ FAIL | 5m1s | 工具回合断：渲染=false（marker 1/2）磁盘=false |
| core-4 | ✅ PASS | 22s | 流式中排队输入正常（w2 入队 → w1 完成后渲染） |

## 失败汇总（按用户影响排序）
- **core-3**（core）❌ FAIL：工具回合断：渲染=false（marker 1/2）磁盘=false

## 判据与复跑
- marker 判据：「回复且仅回复标记词：X」→ X 在剥净转录中 ≥2 次（输入回显 + assistant 渲染）；Qwen38-27B 下该指令遵循实测可靠。
- 工具/编码任务只信磁盘 ground truth（文件存在 / 测试 exit 0 / git log），不信模型自述。
- 复跑：`bun run user-e2e/run.ts --tier <tier>`（指定才跑，非必测）；断点：`--resume <runId>`。
