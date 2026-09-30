# AtlasCode 用户视角 E2E 测试报告（r-20261001-0312）

- **执行窗口**：2026-09-30T19:12:59.950Z → 2026-09-30T19:16:35.318Z（CST 对照见 artifacts）
- **对象**：@atlasharness/atlascode v0.1.2（git cbea591）
- **环境**：网关 127.0.0.1:8999 / 模型 iff/Qwen38-27B-TXT（settings modelRoles 池头） / fullHome=false
- **总体**：✅ 4  ❌ 1  💥 61  ⏭️ 27（共 93 case）

## 分 tier 结果
### gate — ❌ 1
| case | 结果 | 耗时 | 用户可见症状 / 说明 |
|------|------|------|---------------------|
| gate | ❌ FAIL | 5ms | 网关 200/2ms models=Qwen38-27B-TXT,bge-m3,deepseek-v4-flash,deepseek-v4-pro,glm-5,glm-5.1；settings roles=small,fast,premiu |

### core-1 — ⏭️ 1
| case | 结果 | 耗时 | 用户可见症状 / 说明 |
|------|------|------|---------------------|
| core-1 | ⏭️ SKIP | 0ms | GATE: 门控 LLM 未放行 |

### core-2 — ⏭️ 1
| case | 结果 | 耗时 | 用户可见症状 / 说明 |
|------|------|------|---------------------|
| core-2 | ⏭️ SKIP | 0ms | GATE: 门控 LLM 未放行 |

### core-3 — ⏭️ 1
| case | 结果 | 耗时 | 用户可见症状 / 说明 |
|------|------|------|---------------------|
| core-3 | ⏭️ SKIP | 0ms | GATE: 门控 LLM 未放行 |

### core-4 — ⏭️ 1
| case | 结果 | 耗时 | 用户可见症状 / 说明 |
|------|------|------|---------------------|
| core-4 | ⏭️ SKIP | 0ms | GATE: 门控 LLM 未放行 |

### slash — ✅ 4  💥 61  ⏭️ 15
| case | 结果 | 耗时 | 用户可见症状 / 说明 |
|------|------|------|---------------------|
| slash/add-dir | ✅ PASS | 4s | add-dir（local） |
| slash/agents | ✅ PASS | 4s | agents（local） |
| slash/ant-trace | 💥 STUCK | 3s | [STUCK] ant-trace（local） |
| slash/backfill-sessions | 💥 STUCK | 3s | [STUCK] backfill-sessions（local） |
| slash/branch | 💥 STUCK | 3s | [STUCK] branch（local） |
| slash/break-cache | 💥 STUCK | 3s | [STUCK] break-cache（local） |
| slash/clear | 💥 STUCK | 3s | [STUCK] clear（local，清屏后输入面须恢复） |
| slash/color | 💥 STUCK | 3s | [STUCK] color（local） |
| slash/config | 💥 STUCK | 3s | [STUCK] config（local） |
| slash/context | 💥 STUCK | 3s | [STUCK] context（local） |
| slash/copy | 💥 STUCK | 3s | [STUCK] copy（local） |
| slash/cost | 💥 STUCK | 3s | [STUCK] cost（local） |
| slash/ctx_viz | 💥 STUCK | 3s | [STUCK] ctx_viz（local） |
| slash/debug-tool-call | 💥 STUCK | 3s | [STUCK] debug-tool-call（local） |
| slash/diff | 💥 STUCK | 3s | [STUCK] diff（local） |
| slash/effort | 💥 STUCK | 3s | [STUCK] effort（local） |
| slash/env | 💥 STUCK | 3s | [STUCK] env（local） |
| slash/export | 💥 STUCK | 3s | [STUCK] export（local） |
| slash/files | 💥 STUCK | 3s | [STUCK] files（local） |
| slash/heapdump | 💥 STUCK | 3s | [STUCK] heapdump（local） |
| slash/help | 💥 STUCK | 3s | [STUCK] help（local） |
| slash/hooks | 💥 STUCK | 3s | [STUCK] hooks（local） |
| slash/ide | 💥 STUCK | 3s | [STUCK] ide（local） |
| slash/init-verifiers | 💥 STUCK | 3s | [STUCK] init-verifiers（local） |
| slash/install | 💥 STUCK | 3s | [STUCK] install（local，安装面（沙箱内）） |
| slash/keybindings | 💥 STUCK | 3s | [STUCK] keybindings（local） |
| slash/mcp | 💥 STUCK | 3s | [STUCK] mcp（local） |
| slash/memory | 💥 STUCK | 3s | [STUCK] memory（local） |
| slash/model | 💥 STUCK | 3s | [STUCK] model（local） |
| slash/onboarding | 💥 STUCK | 3s | [STUCK] onboarding（local） |
| slash/output-style | 💥 STUCK | 3s | [STUCK] output-style（local） |
| slash/permissions | 💥 STUCK | 3s | [STUCK] permissions（local） |
| slash/plan | 💥 STUCK | 3s | [STUCK] plan（local，plan 模式切换） |
| slash/plugin | 💥 STUCK | 3s | [STUCK] plugin（local） |
| slash/release-notes | 💥 STUCK | 3s | [STUCK] release-notes（local） |
| slash/reload-plugins | 💥 STUCK | 3s | [STUCK] reload-plugins（local） |
| slash/rename | 💥 STUCK | 3s | [STUCK] rename（local） |
| slash/resume | 💥 STUCK | 3s | [STUCK] resume（local） |
| slash/sandbox-toggle | 💥 STUCK | 3s | [STUCK] sandbox-toggle（local） |
| slash/session | 💥 STUCK | 3s | [STUCK] session（local） |
| slash/sessionlist | 💥 STUCK | 3s | [STUCK] sessionlist（local） |
| slash/skills | 💥 STUCK | 3s | [STUCK] skills（local） |
| slash/stats | 💥 STUCK | 3s | [STUCK] stats（local） |
| slash/status | 💥 STUCK | 3s | [STUCK] status（local） |
| slash/statusline | 💥 STUCK | 3s | [STUCK] statusline（local） |
| slash/stickers | 💥 STUCK | 3s | [STUCK] stickers（local） |
| slash/tag | 💥 STUCK | 3s | [STUCK] tag（local） |
| slash/tasklist | 💥 STUCK | 3s | [STUCK] tasklist（local） |
| slash/tasks | 💥 STUCK | 3s | [STUCK] tasks（local） |
| slash/terminal-setup | 💥 STUCK | 3s | [STUCK] terminal-setup（local） |
| slash/theme | 💥 STUCK | 3s | [STUCK] theme（local） |
| slash/thinkback | 💥 STUCK | 3s | [STUCK] thinkback（local） |
| slash/thinkback-play | 💥 STUCK | 3s | [STUCK] thinkback-play（local） |
| slash/usage | 💥 STUCK | 3s | [STUCK] usage（local） |
| slash/version | 💥 STUCK | 3s | [STUCK] version（local） |
| slash/vim | 💥 STUCK | 3s | [STUCK] vim（local，vim 模式切换后 Esc 退出） |
| slash/btw | ⏭️ SKIP | 0ms | GATE: LLM 未放行（本地面照跑） |
| slash/bughunter | ⏭️ SKIP | 0ms | GATE: LLM 未放行（本地面照跑） |
| slash/commit | ⏭️ SKIP | 0ms | GATE: LLM 未放行（本地面照跑） |
| slash/commit-push-pr | ⏭️ SKIP | 0ms | GATE: LLM 未放行（本地面照跑） |
| slash/compact | ⏭️ SKIP | 0ms | GATE: LLM 未放行（本地面照跑） |
| slash/doctor | ⏭️ SKIP | 0ms | GATE: LLM 未放行（本地面照跑） |
| slash/feedback | ⏭️ SKIP | 0ms | GATE: LLM 未放行（本地面照跑） |
| slash/good-atlas | ⏭️ SKIP | 0ms | GATE: LLM 未放行（本地面照跑） |
| slash/init | ⏭️ SKIP | 0ms | GATE: LLM 未放行（本地面照跑） |
| slash/insights | ⏭️ SKIP | 0ms | GATE: LLM 未放行（本地面照跑） |
| slash/issue | ⏭️ SKIP | 0ms | GATE: LLM 未放行（本地面照跑） |
| slash/perf-issue | ⏭️ SKIP | 0ms | GATE: LLM 未放行（本地面照跑） |
| slash/review | ⏭️ SKIP | 0ms | GATE: LLM 未放行（本地面照跑） |
| slash/security-review | ⏭️ SKIP | 0ms | GATE: LLM 未放行（本地面照跑） |
| slash/summary | ⏭️ SKIP | 0ms | GATE: LLM 未放行（本地面照跑） |
| slash/autofix-pr | 💥 STUCK | 3s | [STUCK] autofix-pr（auth，无 PR，优雅降级） |
| slash/install-slack-app | 💥 STUCK | 3s | [STUCK] install-slack-app（auth） |
| slash/login | 💥 STUCK | 3s | [STUCK] login（auth，OAuth 流程面，Esc 中止） |
| slash/logout | 💥 STUCK | 3s | [STUCK] logout（auth） |
| slash/oauth-refresh | 💥 STUCK | 3s | [STUCK] oauth-refresh（auth） |
| slash/pr_comments | 💥 STUCK | 3s | [STUCK] pr_comments（auth，无 PR，优雅降级） |
| slash/share | 💥 STUCK | 3s | [STUCK] share（auth，未登录态断优雅降级） |
| slash/exit | ✅ PASS | 5s | /exit 进程干净退出 |
| slash/rewind | ✅ PASS | 5s | rewind（独立 session，未崩） |

### short — ⏭️ 4
| case | 结果 | 耗时 | 用户可见症状 / 说明 |
|------|------|------|---------------------|
| short-marker | ⏭️ SKIP | 0ms | GATE: LLM 未放行 |
| short-multiturn | ⏭️ SKIP | 0ms | GATE: LLM 未放行 |
| short-filewrite | ⏭️ SKIP | 0ms | GATE: LLM 未放行 |
| short-tool-read | ⏭️ SKIP | 0ms | GATE: LLM 未放行 |

### medium — ⏭️ 2
| case | 结果 | 耗时 | 用户可见症状 / 说明 |
|------|------|------|---------------------|
| medium-fixbug | ⏭️ SKIP | 0ms | GATE: LLM 未放行 |
| medium-feature | ⏭️ SKIP | 0ms | GATE: LLM 未放行 |

### long — ⏭️ 2
| case | 结果 | 耗时 | 用户可见症状 / 说明 |
|------|------|------|---------------------|
| long-multistep | ⏭️ SKIP | 0ms | GATE |
| soak | ⏭️ SKIP | 0ms | GATE |

## 失败汇总（按用户影响排序）
- **slash/rename**（slash）💥 STUCK：[STUCK] rename（local）
- **slash/vim**（slash）💥 STUCK：[STUCK] vim（local，vim 模式切换后 Esc 退出）
- **slash/ant-trace**（slash）💥 STUCK：[STUCK] ant-trace（local）
- **slash/color**（slash）💥 STUCK：[STUCK] color（local）
- **slash/stickers**（slash）💥 STUCK：[STUCK] stickers（local）
- **slash/tag**（slash）💥 STUCK：[STUCK] tag（local）
- **slash/config**（slash）💥 STUCK：[STUCK] config（local）
- **slash/hooks**（slash）💥 STUCK：[STUCK] hooks（local）
- **slash/mcp**（slash）💥 STUCK：[STUCK] mcp（local）
- **slash/memory**（slash）💥 STUCK：[STUCK] memory（local）
- **slash/theme**（slash）💥 STUCK：[STUCK] theme（local）
- **slash/thinkback**（slash）💥 STUCK：[STUCK] thinkback（local）
- **slash/autofix-pr**（slash）💥 STUCK：[STUCK] autofix-pr（auth，无 PR，优雅降级）
- **slash/backfill-sessions**（slash）💥 STUCK：[STUCK] backfill-sessions（local）
- **slash/cost**（slash）💥 STUCK：[STUCK] cost（local）
- **slash/ctx_viz**（slash）💥 STUCK：[STUCK] ctx_viz（local）
- **slash/debug-tool-call**（slash）💥 STUCK：[STUCK] debug-tool-call（local）
- **slash/help**（slash）💥 STUCK：[STUCK] help（local）
- **slash/ide**（slash）💥 STUCK：[STUCK] ide（local）
- **slash/output-style**（slash）💥 STUCK：[STUCK] output-style（local）
- **slash/permissions**（slash）💥 STUCK：[STUCK] permissions（local）
- **slash/plan**（slash）💥 STUCK：[STUCK] plan（local，plan 模式切换）
- **slash/terminal-setup**（slash）💥 STUCK：[STUCK] terminal-setup（local）
- **slash/version**（slash）💥 STUCK：[STUCK] version（local）
- **slash/logout**（slash）💥 STUCK：[STUCK] logout（auth）
- **slash/oauth-refresh**（slash）💥 STUCK：[STUCK] oauth-refresh（auth）
- **slash/install**（slash）💥 STUCK：[STUCK] install（local，安装面（沙箱内））
- **slash/keybindings**（slash）💥 STUCK：[STUCK] keybindings（local）
- **slash/release-notes**（slash）💥 STUCK：[STUCK] release-notes（local）
- **slash/resume**（slash）💥 STUCK：[STUCK] resume（local）
- **slash/tasks**（slash）💥 STUCK：[STUCK] tasks（local）
- **slash/usage**（slash）💥 STUCK：[STUCK] usage（local）
- **slash/login**（slash）💥 STUCK：[STUCK] login（auth，OAuth 流程面，Esc 中止）
- **slash/pr_comments**（slash）💥 STUCK：[STUCK] pr_comments（auth，无 PR，优雅降级）
- **slash/branch**（slash）💥 STUCK：[STUCK] branch（local）
- **slash/break-cache**（slash）💥 STUCK：[STUCK] break-cache（local）
- **slash/clear**（slash）💥 STUCK：[STUCK] clear（local，清屏后输入面须恢复）
- **slash/context**（slash）💥 STUCK：[STUCK] context（local）
- **slash/env**（slash）💥 STUCK：[STUCK] env（local）
- **slash/export**（slash）💥 STUCK：[STUCK] export（local）
- **slash/init-verifiers**（slash）💥 STUCK：[STUCK] init-verifiers（local）
- **slash/model**（slash）💥 STUCK：[STUCK] model（local）
- **slash/onboarding**（slash）💥 STUCK：[STUCK] onboarding（local）
- **slash/reload-plugins**（slash）💥 STUCK：[STUCK] reload-plugins（local）
- **slash/sandbox-toggle**（slash）💥 STUCK：[STUCK] sandbox-toggle（local）
- **slash/sessionlist**（slash）💥 STUCK：[STUCK] sessionlist（local）
- **slash/tasklist**（slash）💥 STUCK：[STUCK] tasklist（local）
- **slash/thinkback-play**（slash）💥 STUCK：[STUCK] thinkback-play（local）
- **slash/copy**（slash）💥 STUCK：[STUCK] copy（local）
- **slash/diff**（slash）💥 STUCK：[STUCK] diff（local）
- **slash/effort**（slash）💥 STUCK：[STUCK] effort（local）
- **slash/plugin**（slash）💥 STUCK：[STUCK] plugin（local）
- **slash/session**（slash）💥 STUCK：[STUCK] session（local）
- **slash/skills**（slash）💥 STUCK：[STUCK] skills（local）
- **slash/status**（slash）💥 STUCK：[STUCK] status（local）
- **slash/statusline**（slash）💥 STUCK：[STUCK] statusline（local）
- **slash/install-slack-app**（slash）💥 STUCK：[STUCK] install-slack-app（auth）
- **slash/files**（slash）💥 STUCK：[STUCK] files（local）
- **slash/stats**（slash）💥 STUCK：[STUCK] stats（local）
- **slash/share**（slash）💥 STUCK：[STUCK] share（auth，未登录态断优雅降级）
- **slash/heapdump**（slash）💥 STUCK：[STUCK] heapdump（local）
- **gate**（gate）❌ FAIL：网关 200/2ms models=Qwen38-27B-TXT,bge-m3,deepseek-v4-flash,deepseek-v4-pro,glm-5,glm-5.1；settings roles=small,fast,premium；LLM 单轮 FAIL（0 内容形态！）

## 门控跳过（27）
- core-1：GATE: 门控 LLM 未放行
- core-2：GATE: 门控 LLM 未放行
- core-3：GATE: 门控 LLM 未放行
- core-4：GATE: 门控 LLM 未放行
- slash/btw：GATE: LLM 未放行（本地面照跑）
- slash/bughunter：GATE: LLM 未放行（本地面照跑）
- slash/commit：GATE: LLM 未放行（本地面照跑）
- slash/commit-push-pr：GATE: LLM 未放行（本地面照跑）
- slash/compact：GATE: LLM 未放行（本地面照跑）
- slash/doctor：GATE: LLM 未放行（本地面照跑）
- slash/feedback：GATE: LLM 未放行（本地面照跑）
- slash/good-atlas：GATE: LLM 未放行（本地面照跑）
- slash/init：GATE: LLM 未放行（本地面照跑）
- slash/insights：GATE: LLM 未放行（本地面照跑）
- slash/issue：GATE: LLM 未放行（本地面照跑）
- slash/perf-issue：GATE: LLM 未放行（本地面照跑）
- slash/review：GATE: LLM 未放行（本地面照跑）
- slash/security-review：GATE: LLM 未放行（本地面照跑）
- slash/summary：GATE: LLM 未放行（本地面照跑）
- short-marker：GATE: LLM 未放行
- short-multiturn：GATE: LLM 未放行
- short-filewrite：GATE: LLM 未放行
- short-tool-read：GATE: LLM 未放行
- medium-fixbug：GATE: LLM 未放行
- medium-feature：GATE: LLM 未放行
- long-multistep：GATE
- soak：GATE

## 判据与复跑
- marker 判据：「回复且仅回复标记词：X」→ X 在剥净转录中 ≥2 次（输入回显 + assistant 渲染）；弱模型（Qwen38-27B）下该指令遵循实测可靠。
- 工具/编码任务只信磁盘 ground truth（文件存在 / 测试 exit 0 / git log），不信模型自述。
- 复跑：`bun run user-e2e/run.ts --tier <tier>`（指定才跑，非必测）；断点：`--resume <runId>`。
