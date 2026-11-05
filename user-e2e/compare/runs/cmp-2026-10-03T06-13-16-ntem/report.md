# Atlas vs Claude TUI 交互信息量对比（cmp-2026-10-03T06-13-16-ntem）

模型面：两侧均经 127.0.0.1:8999 网关，对齐到 deepseek-v4-pro（Qwen38 默认在 agentic 多工具任务上 0 tool-call，故对齐到更强模型以隔离 TUI 渲染层）。只比 TUI 渲染层。


## S2-edit · 改文件（diff 面）

prompt: In calc.js, change the add() function so it takes a third argument `c` that defaults to 0 and returns a + b + c. Keep the existing console.log lines working and add one more console.log demonstrating the new third argument.

| 信号 | Atlas | Claude |
|---|---|---|
| chars | 9545 | 10066 |
| nonEmptyLines | 164 | 241 |
| read | 2 | 0 |
| edit | 2 | 2 |
| write | 0 | 0 |
| bash | 0 | 0 |
| addedLines | 2 | 2 |
| removedLines | 1 | 1 |
| plusMinus | true | true |
| thinking | 2 | 1 |
| skill | 0 | 0 |
| finalAnswer | true | true |

diskCheck: atlas=true (add(a,b,c=0) present) · claude=true (add(a,b,c=0) present)

## S4-skill · 调用 skill

prompt: Use the summarize-numbers skill on data.json and report what it returns.

| 信号 | Atlas | Claude |
|---|---|---|
| chars | 14002 | 4527 |
| nonEmptyLines | 259 | 88 |
| read | 4 | 2 |
| edit | 0 | 0 |
| write | 0 | 0 |
| bash | 2 | 0 |
| addedLines | 0 | 0 |
| removedLines | 0 | 0 |
| plusMinus | true | true |
| thinking | 8 | 0 |
| skill | 9 | 4 |
| finalAnswer | true | true |