# Atlas vs Claude TUI 交互信息量对比（cmp-2026-10-03T07-20-17-b10h）

模型面：两侧均经 127.0.0.1:8999 网关，对齐到 deepseek-v4-pro（Qwen38 默认在 agentic 多工具任务上 0 tool-call，故对齐到更强模型以隔离 TUI 渲染层）。只比 TUI 渲染层。


## S4-skill · 调用 skill

prompt: Use the summarize-numbers skill on data.json and report what it returns.

| 信号 | Atlas | Claude |
|---|---|---|
| chars | 13412 | — |
| nonEmptyLines | 307 | — |
| read | 2 | — |
| edit | 0 | — |
| write | 0 | — |
| bash | 2 | — |
| addedLines | 0 | — |
| removedLines | 0 | — |
| plusMinus | true | — |
| thinking | 10 | — |
| skill | 7 | — |
| finalAnswer | true | — |