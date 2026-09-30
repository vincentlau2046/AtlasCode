// 前向缝登记（§8.74.31 G-1，#197）：agents-platform 命令（IS_ATLAS_DEV 门控，生产恒关）未移植；
// 本 stub 仅为 bun build 静态解析 require('src/tui/commands/agents-platform/index.js').default 而存——
// 运行期 IS_ATLAS_DEV 生产恒 false，commands.ts:48 `IS_ATLAS_DEV ? require(...) : null` 短路，
// INTERNAL_ONLY_COMMANDS.filter(Boolean) 对 null 天然安全。回流 = agents-platform 域实施波补真实现后删本 stub。
export default null
