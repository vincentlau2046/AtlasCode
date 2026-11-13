// W2-2b（§8.74.12）：BASH_TOOL_NAME 名常量切 engine toolNames 单一事实源
// （值逐字 'Bash'，27 外部消费点 import 路径不变，零消费方改动）。
// 本文件保留语义 = 原循环依赖断点（prompt.ts 不直引 BashTool 本体模块；
// engine 域不 import tui，断点性质不变）。
export { BASH_TOOL_NAME } from 'src/engine'
