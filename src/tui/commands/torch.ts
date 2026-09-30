// 前向缝登记（§8.74.31 G-1，#197）：TORCH 命令（feature('TORCH') 门控，默认关）未移植；
// 本 stub 仅为 bun build 静态解析 require('src/tui/commands/torch.js').default 而存——
// 运行期 feature 默认关，commands.ts:80 `feature('TORCH') ? require(...) : null` 短路，
// 本支不可达（.filter(Boolean)/`...(torch ? [torch] : [])` 对 null 天然安全）。
// 回流 = TORCH 域实施波补真实现后删本 stub。
export default null
