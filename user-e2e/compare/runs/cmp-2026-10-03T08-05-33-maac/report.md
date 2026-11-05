# Atlas vs Claude TUI 交互信息量对比（cmp-2026-10-03T08-05-33-maac）

模型面：两侧均经 127.0.0.1:8999 网关，对齐到 deepseek-v4-pro（Qwen38 默认在 agentic 多工具任务上 0 tool-call，故对齐到更强模型以隔离 TUI 渲染层）。只比 TUI 渲染层。


## S2-edit · 改文件（diff 面）

prompt: In calc.js, change the add() function so it takes a third argument `c` that defaults to 0 and returns a + b + c. Keep the existing console.log lines working and add one more console.log demonstrating the new third argument.

| 信号 | Atlas | Claude |
|---|---|---|
| chars | 10131 | — |
| nonEmptyLines | 217 | — |
| read | 2 | — |
| edit | 2 | — |
| write | 0 | — |
| bash | 0 | — |
| addedLines | 2 | — |
| removedLines | 1 | — |
| plusMinus | true | — |
| thinking | 2 | — |
| skill | 0 | — |
| finalAnswer | false | — |

diskCheck: atlas=true (add(a,b,c=0) present) · claude=undefined (undefined)

## S4-skill · 调用 skill

prompt: Use the summarize-numbers skill on data.json and report what it returns.

| 信号 | Atlas | Claude |
|---|---|---|
| chars | 12137 | — |
| nonEmptyLines | 271 | — |
| read | 4 | — |
| edit | 0 | — |
| write | 0 | — |
| bash | 1 | — |
| addedLines | 0 | — |
| removedLines | 0 | — |
| plusMinus | true | — |
| thinking | 10 | — |
| skill | 8 | — |
| finalAnswer | true | — |