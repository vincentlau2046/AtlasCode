# AtlasCode 用户视角 E2E 测试报告（r-20261001-0405）

- **执行窗口**：（regen） → 2026-10-01T03:36:09.595Z（CST 对照见 artifacts）
- **对象**：@atlasharness/atlascode v0.1.2（git 8a13732）
- **环境**：网关 127.0.0.1:8999 / 模型 iff/Qwen38-27B-TXT（settings modelRoles 池头） / fullHome=false
- **总体**：✅ 8  ❌ 7  ⏰ 1  💥 80（共 96 case）

## 分 tier 结果
### gate — ✅ 1
| case | 结果 | 耗时 | 用户可见症状 / 说明 |
|------|------|------|---------------------|
| gate | ✅ PASS | 245ms | 网关 200/1ms models=Qwen38-27B-TXT,bge-m3,deepseek-v4-flash,deepseek-v4-pro,glm-5,glm-5.1；settings roles=small,fast,premiu |

### core — ✅ 2  ❌ 2
| case | 结果 | 耗时 | 用户可见症状 / 说明 |
|------|------|------|---------------------|
| core-1 | ✅ PASS | 40s | 4/4 轮 marker 渲染（基本多轮通） |
| core-2 | ❌ FAIL | 466ms | headless 多轮断：r1=true r2=ok——engine loop 续轮面 |
| core-3 | ❌ FAIL | 5m1s | 工具回合断：渲染=false（marker 1/2）磁盘=false |
| core-4 | ✅ PASS | 21s | 流式中排队输入正常（w2 入队 → w1 完成后渲染） |

### slash — ✅ 2  ⏰ 1  💥 80
| case | 结果 | 耗时 | 用户可见症状 / 说明 |
|------|------|------|---------------------|
| slash/add-dir | 💥 STUCK | 2m7s | [STUCK] add-dir（local（渲染滞后 60s）） |
| slash/agents | 💥 STUCK | 2m12s | [STUCK] agents（local（渲染滞后 60s）） |
| slash/branch | 💥 STUCK | 2m7s | [STUCK] branch（local（渲染滞后 60s）） |
| slash/clear | 💥 STUCK | 2m7s | [STUCK] clear（local，清屏后输入面须恢复（渲染滞后 60s）） |
| slash/color | 💥 STUCK | 2m7s | [STUCK] color（local（渲染滞后 60s）） |
| slash/config | 💥 STUCK | 1m12s | [STUCK] config（local（渲染滞后 60s）） |
| slash/copy | 💥 STUCK | 1m37s | [STUCK] copy（local（渲染滞后 45s）） |
| slash/context | 💥 STUCK | 1m41s | [STUCK] context（local，命令面板面：Enter 被 suggestions guard 吞掉时输出缺失（渲染滞后 45s）） |
| slash/cost | 💥 STUCK | 1m37s | [STUCK] cost（local（渲染滞后 45s）） |
| slash/diff | 💥 STUCK | 1m37s | [STUCK] diff（local（渲染滞后 45s）） |
| slash/effort | 💥 STUCK | 1m37s | [STUCK] effort（local（渲染滞后 45s）） |
| slash/heapdump | 💥 STUCK | 1m37s | [STUCK] heapdump（local（渲染滞后 45s）） |
| slash/help | 💥 STUCK | 1m37s | [STUCK] help（local（渲染滞后 45s）） |
| slash/ide | 💥 STUCK | 1m37s | [STUCK] ide（local（渲染滞后 45s）） |
| slash/mcp | 💥 STUCK | 1m42s | [STUCK] mcp（local（渲染滞后 45s）） |
| slash/memory | 💥 STUCK | 1m42s | [STUCK] memory（local（渲染滞后 45s）） |
| slash/model | 💥 STUCK | 1m42s | [STUCK] model（local（渲染滞后 45s）） |
| slash/output-style | 💥 STUCK | 1m42s | [STUCK] output-style（local（渲染滞后 45s）） |
| slash/plugin | 💥 STUCK | 1m42s | [STUCK] plugin（local（渲染滞后 45s）） |
| slash/release-notes | 💥 STUCK | 1m37s | [STUCK] release-notes（local（渲染滞后 45s）） |
| slash/reload-plugins | 💥 STUCK | 1m37s | [STUCK] reload-plugins（local（渲染滞后 45s）） |
| slash/rename | 💥 STUCK | 1m37s | [STUCK] rename（local（渲染滞后 45s）） |
| slash/resume | 💥 STUCK | 1m42s | [STUCK] resume（local（渲染滞后 45s）） |
| slash/session | 💥 STUCK | 1m42s | [STUCK] session（local（渲染滞后 45s）） |
| slash/skills | 💥 STUCK | 1m47s | [STUCK] skills（local（渲染滞后 45s）） |
| slash/stats | 💥 STUCK | 1m37s | [STUCK] stats（local（渲染滞后 45s）） |
| slash/status | 💥 STUCK | 1m37s | [STUCK] status（local（渲染滞后 45s）） |
| slash/sessionlist | 💥 STUCK | 1m42s | [STUCK] sessionlist（local（渲染滞后 45s）） |
| slash/stickers | ⏰ TIMEOUT | 3m34s | [TIMEOUT] stickers（local（渲染滞后 45s）） |
| slash/theme | 💥 STUCK | 1m46s | [STUCK] theme（local（渲染滞后 45s）） |
| slash/terminal-setup | 💥 STUCK | 1m45s | [STUCK] terminal-setup（local（渲染滞后 45s）） |
| slash/vim | 💥 STUCK | 1m42s | [STUCK] vim（local，vim 模式切换后 Esc 退出（渲染滞后 45s）） |
| slash/permissions | 💥 STUCK | 1m42s | [STUCK] permissions（local（渲染滞后 45s）） |
| slash/plan | 💥 STUCK | 1m37s | [STUCK] plan（local，plan 模式切换（渲染滞后 45s）） |
| slash/hooks | 💥 STUCK | 1m37s | [STUCK] hooks（local（渲染滞后 45s）） |
| slash/export | 💥 STUCK | 1m37s | [STUCK] export（local（渲染滞后 45s）） |
| slash/sandbox | 💥 STUCK | 1m37s | [STUCK] sandbox（local（渲染滞后 45s）） |
| slash/tasks | 💥 STUCK | 1m42s | [STUCK] tasks（local（渲染滞后 45s）） |
| slash/tasklist | 💥 STUCK | 2s | [STUCK] tasklist（local） |
| slash/code-review:code-review | 💥 STUCK | 1m38s | [STUCK] code-review:code-review（llm（渲染滞后 45s）） |
| slash/claude-md-management:revise-claude-md | 💥 STUCK | 1m38s | [STUCK] claude-md-management:revise-claude-md（llm（渲染滞后 45s）） |
| slash/feature-dev:feature-dev | 💥 STUCK | 1m37s | [STUCK] feature-dev:feature-dev（llm（渲染滞后 45s）） |
| slash/frontend-design:frontend-design | 💥 STUCK | 1m38s | [STUCK] frontend-design:frontend-design（llm（渲染滞后 45s）） |
| slash/claude-md-management:claude-md-improver | 💥 STUCK | 1m38s | [STUCK] claude-md-management:claude-md-improver（llm（渲染滞后 45s）） |
| slash/skill-creator:skill-creator | 💥 STUCK | 1m38s | [STUCK] skill-creator:skill-creator（llm（渲染滞后 45s）） |
| slash/ascend-code-review:ascend-code-review | 💥 STUCK | 1m38s | [STUCK] ascend-code-review:ascend-code-review（llm（渲染滞后 45s）） |
| slash/ascend-perf-optimize:ascend-perf-optimize | 💥 STUCK | 1m38s | [STUCK] ascend-perf-optimize:ascend-perf-optimize（llm（渲染滞后 45s）） |
| slash/ascend-precision-debug:ascend-precision-debug | 💥 STUCK | 1m38s | [STUCK] ascend-precision-debug:ascend-precision-debug（llm（渲染滞后 45s）） |
| slash/ascend-runtime-debug:ascend-runtime-debug | 💥 STUCK | 1m38s | [STUCK] ascend-runtime-debug:ascend-runtime-debug（llm（渲染滞后 45s）） |
| slash/ascend-test-design:ascend-test-design | 💥 STUCK | 1m38s | [STUCK] ascend-test-design:ascend-test-design（llm（渲染滞后 45s）） |
| slash/ascend-tiling-design:ascend-tiling-design | 💥 STUCK | 1m38s | [STUCK] ascend-tiling-design:ascend-tiling-design（llm（渲染滞后 45s）） |
| slash/cannbot-aiss-tiling-solver:cannbot-aiss-tiling-solver | 💥 STUCK | 1m38s | [STUCK] cannbot-aiss-tiling-solver:cannbot-aiss-tiling-solver（llm（渲染滞后 45s）） |
| slash/cannbot-catlass-op:cannbot-catlass-op | 💥 STUCK | 1m38s | [STUCK] cannbot-catlass-op:cannbot-catlass-op（llm（渲染滞后 45s）） |
| slash/cannbot-cuda2ascend-simt:cannbot-cuda2ascend-simt | 💥 STUCK | 1m38s | [STUCK] cannbot-cuda2ascend-simt:cannbot-cuda2ascend-simt（llm（渲染滞后 45s）） |
| slash/cannbot-infra-skills:cannbot-infra-skills | 💥 STUCK | 1m38s | [STUCK] cannbot-infra-skills:cannbot-infra-skills（llm（渲染滞后 45s）） |
| slash/cannbot-model-infer:cannbot-model-infer | 💥 STUCK | 1m38s | [STUCK] cannbot-model-infer:cannbot-model-infer（llm（渲染滞后 45s）） |
| slash/cannbot-ops-direct-invoke:cannbot-ops-direct-invoke | 💥 STUCK | 1m38s | [STUCK] cannbot-ops-direct-invoke:cannbot-ops-direct-invoke（llm（渲染滞后 45s）） |
| slash/cannbot-pypto-op-orchestrator:cannbot-pypto-op-orchestrator | 💥 STUCK | 1m38s | [STUCK] cannbot-pypto-op-orchestrator:cannbot-pypto-op-orchestrator（llm（渲染滞后 45s）） |
| slash/cannbot-tilelang-op:cannbot-tilelang-op | 💥 STUCK | 1m38s | [STUCK] cannbot-tilelang-op:cannbot-tilelang-op（llm（渲染滞后 45s）） |
| slash/cannbot-triton-op-generator:cannbot-triton-op-generator | 💥 STUCK | 1m37s | [STUCK] cannbot-triton-op-generator:cannbot-triton-op-generator（llm（渲染滞后 45s）） |
| slash/common-deploy:common-deploy | 💥 STUCK | 1m38s | [STUCK] common-deploy:common-deploy（llm（渲染滞后 45s）） |
| slash/common-infra-skills:common-infra-skills | 💥 STUCK | 1m38s | [STUCK] common-infra-skills:common-infra-skills（llm（渲染滞后 45s）） |
| slash/common-migration:common-migration | 💥 STUCK | 1m38s | [STUCK] common-migration:common-migration（llm（渲染滞后 45s）） |
| slash/community-ascendc-op:community-ascendc-op | 💥 STUCK | 1m38s | [STUCK] community-ascendc-op:community-ascendc-op（llm（渲染滞后 45s）） |
| slash/community-catlass-op:community-catlass-op | 💥 STUCK | 1m38s | [STUCK] community-catlass-op:community-catlass-op（llm（渲染滞后 45s）） |
| slash/community-triton-op:community-triton-op | 💥 STUCK | 1m38s | [STUCK] community-triton-op:community-triton-op（llm（渲染滞后 45s）） |
| slash/mindspeed-drivingsdk:mindspeed-drivingsdk | 💥 STUCK | 1m38s | [STUCK] mindspeed-drivingsdk:mindspeed-drivingsdk（llm（渲染滞后 45s）） |
| slash/mindstudio-ascendc-perf-optim:mindstudio-ascendc-perf-optim | 💥 STUCK | 1m38s | [STUCK] mindstudio-ascendc-perf-optim:mindstudio-ascendc-perf-optim（llm（渲染滞后 45s）） |
| slash/vllm-ascend:vllm-ascend | 💥 STUCK | 1m38s | [STUCK] vllm-ascend:vllm-ascend（llm（渲染滞后 45s）） |
| slash/btw | 💥 STUCK | 1m38s | [STUCK] btw（llm（渲染滞后 45s）） |
| slash/compact | 💥 STUCK | 1m38s | [STUCK] compact（llm（渲染滞后 45s）） |
| slash/doctor | 💥 STUCK | 1m38s | [STUCK] doctor（llm（渲染滞后 45s）） |
| slash/init | 💥 STUCK | 1m40s | [STUCK] init（llm，写 CLAUDE.md（沙箱工作区）（渲染滞后 45s）） |
| slash/pr-comments | 💥 STUCK | 1m40s | [STUCK] pr-comments（llm，无 PR，优雅降级（渲染滞后 45s）） |
| slash/statusline | 💥 STUCK | 1m40s | [STUCK] statusline（llm（渲染滞后 45s）） |
| slash/feedback | 💥 STUCK | 1m38s | [STUCK] feedback（llm（渲染滞后 45s）） |
| slash/review | 💥 STUCK | 1m38s | [STUCK] review（llm（渲染滞后 45s）） |
| slash/security-review | 💥 STUCK | 1m37s | [STUCK] security-review（llm（渲染滞后 45s）） |
| slash/insights | 💥 STUCK | 2m20s | [STUCK] insights（llm（渲染滞后 45s）） |
| slash/logout | 💥 STUCK | 807ms | [STUCK] logout（auth） |
| slash/login | 💥 STUCK | 1m42s | [STUCK] login（auth，OAuth 流程面，Esc 中止（渲染滞后 45s）） |
| slash/exit | ✅ PASS | 6s | /exit 进程干净退出 |
| slash/rewind | ✅ PASS | 8s | rewind（独立 session，未崩） |

### short — ✅ 2  ❌ 2
| case | 结果 | 耗时 | 用户可见症状 / 说明 |
|------|------|------|---------------------|
| short-marker | ✅ PASS | 7s | short 任务通过（pty+headless） |
| short-multiturn | ✅ PASS | 10s | short 任务通过（pty） |
| short-filewrite | ❌ FAIL | 6m5s | short 任务断：pty(undefined:0/2 disk:false)；headless(result=success is_error=false tools= disk=false) |
| short-tool-read | ❌ FAIL | 6m6s | short 任务断：pty(undefined:0/2 disk:false)；headless(result=success is_error=false tools= disk=false) |

### medium — ❌ 2
| case | 结果 | 耗时 | 用户可见症状 / 说明 |
|------|------|------|---------------------|
| medium-fixbug | ❌ FAIL | 24s | fixture 任务断：pty(settle=true test=false（磁盘 ground truth）)；headless(result=success is_error=false tools=0次 test=false) |
| medium-feature | ❌ FAIL | 59s | fixture 任务断：pty(settle=true test=false（磁盘 ground truth）)；headless(result=success is_error=false tools=0次 test=false) |

### long — ✅ 1  ❌ 1
| case | 结果 | 耗时 | 用户可见症状 / 说明 |
|------|------|------|---------------------|
| long-multistep | ❌ FAIL | 7s | 长程断：result=true test=false commit=false 工具=0/25 |
| soak | ✅ PASS | 39s | soak 10/10 轮（loop 无漂移）；时延曲线 {"e2e-soak-1":4017,"e2e-soak-2":3216,"e2e-soak-3":3216,"e2e-soak-4":4016,"e2e-soak-5":3211," |

## 失败汇总（按用户影响排序）
- **core-2**（core）❌ FAIL：headless 多轮断：r1=true r2=ok——engine loop 续轮面
- **core-3**（core）❌ FAIL：工具回合断：渲染=false（marker 1/2）磁盘=false
- **medium-fixbug**（medium）❌ FAIL：fixture 任务断：pty(settle=true test=false（磁盘 ground truth）)；headless(result=success is_error=false tools=0次 test=false)
- **medium-feature**（medium）❌ FAIL：fixture 任务断：pty(settle=true test=false（磁盘 ground truth）)；headless(result=success is_error=false tools=0次 test=false)
- **long-multistep**（long）❌ FAIL：长程断：result=true test=false commit=false 工具=0/25
- **short-filewrite**（short）❌ FAIL：short 任务断：pty(undefined:0/2 disk:false)；headless(result=success is_error=false tools= disk=false)
- **short-tool-read**（short）❌ FAIL：short 任务断：pty(undefined:0/2 disk:false)；headless(result=success is_error=false tools= disk=false)
- **slash/logout**（slash）💥 STUCK：[STUCK] logout（auth）
- **slash/tasklist**（slash）💥 STUCK：[STUCK] tasklist（local）
- **slash/config**（slash）💥 STUCK：[STUCK] config（local（渲染滞后 60s））
- **slash/effort**（slash）💥 STUCK：[STUCK] effort（local（渲染滞后 45s））
- **slash/release-notes**（slash）💥 STUCK：[STUCK] release-notes（local（渲染滞后 45s））
- **slash/diff**（slash）💥 STUCK：[STUCK] diff（local（渲染滞后 45s））
- **slash/reload-plugins**（slash）💥 STUCK：[STUCK] reload-plugins（local（渲染滞后 45s））
- **slash/sandbox**（slash）💥 STUCK：[STUCK] sandbox（local（渲染滞后 45s））
- **slash/copy**（slash）💥 STUCK：[STUCK] copy（local（渲染滞后 45s））
- **slash/plan**（slash）💥 STUCK：[STUCK] plan（local，plan 模式切换（渲染滞后 45s））
- **slash/status**（slash）💥 STUCK：[STUCK] status（local（渲染滞后 45s））
- **slash/heapdump**（slash）💥 STUCK：[STUCK] heapdump（local（渲染滞后 45s））
- **slash/rename**（slash）💥 STUCK：[STUCK] rename（local（渲染滞后 45s））
- **slash/cost**（slash）💥 STUCK：[STUCK] cost（local（渲染滞后 45s））
- **slash/hooks**（slash）💥 STUCK：[STUCK] hooks（local（渲染滞后 45s））
- **slash/export**（slash）💥 STUCK：[STUCK] export（local（渲染滞后 45s））
- **slash/stats**（slash）💥 STUCK：[STUCK] stats（local（渲染滞后 45s））
- **slash/ide**（slash）💥 STUCK：[STUCK] ide（local（渲染滞后 45s））
- **slash/help**（slash）💥 STUCK：[STUCK] help（local（渲染滞后 45s））
- **slash/feature-dev:feature-dev**（slash）💥 STUCK：[STUCK] feature-dev:feature-dev（llm（渲染滞后 45s））
- **slash/security-review**（slash）💥 STUCK：[STUCK] security-review（llm（渲染滞后 45s））
- **slash/cannbot-triton-op-generator:cannbot-triton-op-generator**（slash）💥 STUCK：[STUCK] cannbot-triton-op-generator:cannbot-triton-op-generator（llm（渲染滞后 45s））
- **slash/claude-md-management:revise-claude-md**（slash）💥 STUCK：[STUCK] claude-md-management:revise-claude-md（llm（渲染滞后 45s））
- **slash/cannbot-tilelang-op:cannbot-tilelang-op**（slash）💥 STUCK：[STUCK] cannbot-tilelang-op:cannbot-tilelang-op（llm（渲染滞后 45s））
- **slash/ascend-tiling-design:ascend-tiling-design**（slash）💥 STUCK：[STUCK] ascend-tiling-design:ascend-tiling-design（llm（渲染滞后 45s））
- **slash/cannbot-infra-skills:cannbot-infra-skills**（slash）💥 STUCK：[STUCK] cannbot-infra-skills:cannbot-infra-skills（llm（渲染滞后 45s））
- **slash/compact**（slash）💥 STUCK：[STUCK] compact（llm（渲染滞后 45s））
- **slash/frontend-design:frontend-design**（slash）💥 STUCK：[STUCK] frontend-design:frontend-design（llm（渲染滞后 45s））
- **slash/cannbot-aiss-tiling-solver:cannbot-aiss-tiling-solver**（slash）💥 STUCK：[STUCK] cannbot-aiss-tiling-solver:cannbot-aiss-tiling-solver（llm（渲染滞后 45s））
- **slash/review**（slash）💥 STUCK：[STUCK] review（llm（渲染滞后 45s））
- **slash/skill-creator:skill-creator**（slash）💥 STUCK：[STUCK] skill-creator:skill-creator（llm（渲染滞后 45s））
- **slash/cannbot-model-infer:cannbot-model-infer**（slash）💥 STUCK：[STUCK] cannbot-model-infer:cannbot-model-infer（llm（渲染滞后 45s））
- **slash/cannbot-ops-direct-invoke:cannbot-ops-direct-invoke**（slash）💥 STUCK：[STUCK] cannbot-ops-direct-invoke:cannbot-ops-direct-invoke（llm（渲染滞后 45s））
- **slash/cannbot-pypto-op-orchestrator:cannbot-pypto-op-orchestrator**（slash）💥 STUCK：[STUCK] cannbot-pypto-op-orchestrator:cannbot-pypto-op-orchestrator（llm（渲染滞后 45s））
- **slash/cannbot-catlass-op:cannbot-catlass-op**（slash）💥 STUCK：[STUCK] cannbot-catlass-op:cannbot-catlass-op（llm（渲染滞后 45s））
- **slash/mindstudio-ascendc-perf-optim:mindstudio-ascendc-perf-optim**（slash）💥 STUCK：[STUCK] mindstudio-ascendc-perf-optim:mindstudio-ascendc-perf-optim（llm（渲染滞后 45s））
- **slash/ascend-precision-debug:ascend-precision-debug**（slash）💥 STUCK：[STUCK] ascend-precision-debug:ascend-precision-debug（llm（渲染滞后 45s））
- **slash/cannbot-cuda2ascend-simt:cannbot-cuda2ascend-simt**（slash）💥 STUCK：[STUCK] cannbot-cuda2ascend-simt:cannbot-cuda2ascend-simt（llm（渲染滞后 45s））
- **slash/common-infra-skills:common-infra-skills**（slash）💥 STUCK：[STUCK] common-infra-skills:common-infra-skills（llm（渲染滞后 45s））
- **slash/community-triton-op:community-triton-op**（slash）💥 STUCK：[STUCK] community-triton-op:community-triton-op（llm（渲染滞后 45s））
- **slash/btw**（slash）💥 STUCK：[STUCK] btw（llm（渲染滞后 45s））
- **slash/mindspeed-drivingsdk:mindspeed-drivingsdk**（slash）💥 STUCK：[STUCK] mindspeed-drivingsdk:mindspeed-drivingsdk（llm（渲染滞后 45s））
- **slash/vllm-ascend:vllm-ascend**（slash）💥 STUCK：[STUCK] vllm-ascend:vllm-ascend（llm（渲染滞后 45s））
- **slash/feedback**（slash）💥 STUCK：[STUCK] feedback（llm（渲染滞后 45s））
- **slash/community-catlass-op:community-catlass-op**（slash）💥 STUCK：[STUCK] community-catlass-op:community-catlass-op（llm（渲染滞后 45s））
- **slash/doctor**（slash）💥 STUCK：[STUCK] doctor（llm（渲染滞后 45s））
- **slash/claude-md-management:claude-md-improver**（slash）💥 STUCK：[STUCK] claude-md-management:claude-md-improver（llm（渲染滞后 45s））
- **slash/ascend-perf-optimize:ascend-perf-optimize**（slash）💥 STUCK：[STUCK] ascend-perf-optimize:ascend-perf-optimize（llm（渲染滞后 45s））
- **slash/common-migration:common-migration**（slash）💥 STUCK：[STUCK] common-migration:common-migration（llm（渲染滞后 45s））
- **slash/ascend-test-design:ascend-test-design**（slash）💥 STUCK：[STUCK] ascend-test-design:ascend-test-design（llm（渲染滞后 45s））
- **slash/common-deploy:common-deploy**（slash）💥 STUCK：[STUCK] common-deploy:common-deploy（llm（渲染滞后 45s））
- **slash/ascend-runtime-debug:ascend-runtime-debug**（slash）💥 STUCK：[STUCK] ascend-runtime-debug:ascend-runtime-debug（llm（渲染滞后 45s））
- **slash/code-review:code-review**（slash）💥 STUCK：[STUCK] code-review:code-review（llm（渲染滞后 45s））
- **slash/ascend-code-review:ascend-code-review**（slash）💥 STUCK：[STUCK] ascend-code-review:ascend-code-review（llm（渲染滞后 45s））
- **slash/community-ascendc-op:community-ascendc-op**（slash）💥 STUCK：[STUCK] community-ascendc-op:community-ascendc-op（llm（渲染滞后 45s））
- **slash/pr-comments**（slash）💥 STUCK：[STUCK] pr-comments（llm，无 PR，优雅降级（渲染滞后 45s））
- **slash/statusline**（slash）💥 STUCK：[STUCK] statusline（llm（渲染滞后 45s））
- **slash/init**（slash）💥 STUCK：[STUCK] init（llm，写 CLAUDE.md（沙箱工作区）（渲染滞后 45s））
- **slash/context**（slash）💥 STUCK：[STUCK] context（local，命令面板面：Enter 被 suggestions guard 吞掉时输出缺失（渲染滞后 45s））
- **slash/session**（slash）💥 STUCK：[STUCK] session（local（渲染滞后 45s））
- **slash/resume**（slash）💥 STUCK：[STUCK] resume（local（渲染滞后 45s））
- **slash/mcp**（slash）💥 STUCK：[STUCK] mcp（local（渲染滞后 45s））
- **slash/output-style**（slash）💥 STUCK：[STUCK] output-style（local（渲染滞后 45s））
- **slash/plugin**（slash）💥 STUCK：[STUCK] plugin（local（渲染滞后 45s））
- **slash/permissions**（slash）💥 STUCK：[STUCK] permissions（local（渲染滞后 45s））
- **slash/model**（slash）💥 STUCK：[STUCK] model（local（渲染滞后 45s））
- **slash/sessionlist**（slash）💥 STUCK：[STUCK] sessionlist（local（渲染滞后 45s））
- **slash/tasks**（slash）💥 STUCK：[STUCK] tasks（local（渲染滞后 45s））
- **slash/memory**（slash）💥 STUCK：[STUCK] memory（local（渲染滞后 45s））
- **slash/vim**（slash）💥 STUCK：[STUCK] vim（local，vim 模式切换后 Esc 退出（渲染滞后 45s））
- **slash/login**（slash）💥 STUCK：[STUCK] login（auth，OAuth 流程面，Esc 中止（渲染滞后 45s））
- **slash/terminal-setup**（slash）💥 STUCK：[STUCK] terminal-setup（local（渲染滞后 45s））
- **slash/theme**（slash）💥 STUCK：[STUCK] theme（local（渲染滞后 45s））
- **slash/skills**（slash）💥 STUCK：[STUCK] skills（local（渲染滞后 45s））
- **slash/clear**（slash）💥 STUCK：[STUCK] clear（local，清屏后输入面须恢复（渲染滞后 60s））
- **slash/branch**（slash）💥 STUCK：[STUCK] branch（local（渲染滞后 60s））
- **slash/color**（slash）💥 STUCK：[STUCK] color（local（渲染滞后 60s））
- **slash/add-dir**（slash）💥 STUCK：[STUCK] add-dir（local（渲染滞后 60s））
- **slash/agents**（slash）💥 STUCK：[STUCK] agents（local（渲染滞后 60s））
- **slash/insights**（slash）💥 STUCK：[STUCK] insights（llm（渲染滞后 45s））
- **slash/stickers**（slash）⏰ TIMEOUT：[TIMEOUT] stickers（local（渲染滞后 45s））

## 判据与复跑
- marker 判据：「回复且仅回复标记词：X」→ X 在剥净转录中 ≥2 次（输入回显 + assistant 渲染）；Qwen38-27B 下该指令遵循实测可靠。
- 工具/编码任务只信磁盘 ground truth（文件存在 / 测试 exit 0 / git log），不信模型自述。
- 复跑：`bun run user-e2e/run.ts --tier <tier>`（指定才跑，非必测）；断点：`--resume <runId>`。
