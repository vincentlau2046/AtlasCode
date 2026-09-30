// 前向缝登记（§8.74.31 G-1，#197）：runSkillGenerator bundled skill（feature('RUN_SKILL_GENERATOR') 门控，默认关）未移植；
// 本 stub 仅为 bun build 静态解析 require('src/tui/skills/bundled/runSkillGenerator.js').registerRunSkillGeneratorSkill 而存——
// 运行期 feature 默认关，bundled/index.ts:67 `if (feature('RUN_SKILL_GENERATOR')) { ... }` 不进入，
// registerRunSkillGeneratorSkill 永不被调用。回流 = RUN_SKILL_GENERATOR 域实施波补真实现后删本 stub。
export function registerRunSkillGeneratorSkill(): void {}
