// 前向缝登记（§8.74.31 G-1，#197）：hunter bundled skill（feature('REVIEW_ARTIFACT') 门控，默认关）未移植；
// 本 stub 仅为 bun build 静态解析 require('src/tui/skills/bundled/hunter.js').registerHunterSkill 而存——
// 运行期 feature 默认关，bundled/index.ts:49 `if (feature('REVIEW_ARTIFACT')) { ... }` 不进入，
// registerHunterSkill 永不被调用。回流 = REVIEW_ARTIFACT 域实施波补真实现后删本 stub。
export function registerHunterSkill(): void {}
