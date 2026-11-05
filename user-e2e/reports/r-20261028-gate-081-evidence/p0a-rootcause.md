# 0.1.81 gate 判据③ P0a S-A 根因档案（2026-10-28）

## 现象
P0a --release-gate 081 面（9965206）S-A hardFail=2（P0-1a-who + P0-2-fast），复跑同红；同日 0.1.80 面（d39b4f5 重建，build 17901539B 恰合 080 记录值）同探针 PASS RELEASABLE。

## 取证链（全部工件留档）
1. **请求级字节取证**（日志反代 :8997→:8999 透传，全请求体落盘；'live' 种子经 env 门控临时重定向，跑后 accept.ts sha256 恢复核验 9cf403b5…）：
   - 回合 1 请求：双面 **57701B 恒同**，唯一差 = 沙箱工作树 `git init` 随机短 sha（每次跑随机，与面无关）。
   - 回合 2 请求：081=58019B vs 080=58017B，差 2 字节 = **模型自己回合 1 的 description 措辞**（"Create temporary file in /tmp" 29 字符 vs "Create temporary probe file" 27 字符）+ 网关随机 tool_call id。工具数组（24 件）、system、消息结构逐字节等价。
   - 分类器/标题调用（req-1, 1211B）：双面逐字节相同。
   - **⇒ 产品对模型零输入差**。#13 refreshRoundContext 若开火必有结构性差异（tools 换池/append 消息）——不存在 ⇒ 实证 P0a 场景（无 MCP、两 delta 门 OFF）下 #13 = null 零行为，与静态推演一致；#18 watchdog 请求侧惰性同证。
2. **响应级**：081 回合 2 模型推理流自述 "I'll confirm that the file exists." → 发 `ls -l /tmp/atlas-p0a-probe` tool_call（verify 支）；080 回合 2 直接流式报告 "已创建" → stop（report 支）。两支均为对等请求的合法补全。
3. **交叉判别**（时间交错跑，排除网关漂移窗）：081 面 15:47 跑 **PASS**（report 支）⇒ 面相关性坍塌。账面：081 = 3 红（verify 支：4pqe/zdu3/iwfu）+ 1 绿（report 支：8e6v）；080 = 4 绿（m4kc/a9uk/we55 + 10-24 s216）。
4. **定谳**：S-A 红 = **模型采样方差（verify/report 支随机）× 探针单答案脆性**，非产品回归。产品请求构造双面字节等价，无任何通道可影响模型分支。

## 探针脆性机理与硬化
- 机理：S-A 脚本仅一次 `sendRaw('1')`；verify 支开第二 ask 弹框（ask 规则对全部 Bash 生效）→ 未答框阻塞 UI → `/model fast` 键入落框内 → whoRole/modelFast 全文正则零命中 → hardFail=2。
- 弹框计数判据（7 工件普查无例外）：lib stripAnsi 口径下 'Do you want to proceed' **每开一框恰 +1**（append-only 单调；CUF `\x1b[1C` 词间空格已由 stripAnsi 还原）。verify 支=2、report 支=1。
- 硬化（user-e2e 资产，测试侧职权；探针定义/意图零改）：`Pty.waitCountSince`（lib/pty.ts）+ S-A steps 改有界逐框作答循环（≤4 框；首框 180s、续框 60s 窗——ogr3 实测网关负载下回合 1 可 >90s）。探针意图 = ask 弹框 verdict + /model fast statusline，不依赖「模型恰一次工具调用」。
- 集成坑（已修）：首版误将方法加到 lib/pty-generic.ts（accept.ts 实际用 lib/pty.ts；bun 不查类型 → 运行时 not-a-function → steps 崩 → ogr3/o5ra 两跑假红 hardFail=4）。已撤回错位新增、落正主文件；tsc 核 6 错全为预存配置级，零涉新码。

## 硬化后验证
- n8s5（16:16）/ ybig（16:24）/ p2uf（16:30）/ ftm0（16:37）：4× S-A PASS hardFail=0（均 report 支）
- verify 支未再被采样（模型当下采样偏 report；verify 支形态由 3 个红工件定格 = 恰 2 框、答 2 后模型报告完成，硬化循环机械覆盖）
- **官方判据③ 整跑**（16:45–16:54，`accept.ts --release-gate --target-version 0.1.81`，硬化探针）：
  `[P0] 判定=PASS（hardFail=0 hardInconclusive=0） 发布门禁=RELEASABLE（无）` → P0-1793177123752-juc9
  （result.json：verdict=PASS、releaseGate.enabled、targetVersion=0.1.81、hardFail=0、regressionNonRegressed=true；S-A report 支、S-B/S-C 全绿）

## 处置
- P0a 判据③以硬化后探针在 081 面整跑（S-A+S-B+S-C）为准。
- 本根因 + 探针硬化作为 gate 报告登记项报 Main/f4（工单面：S-A 探针演进记录）。
