/**
 * atlasoffice（Atlas Office 壳）— 预建占位（不实施，零行为）
 *
 * 裁定（2026-09-28，产品拆分 session 后续）：Atlas Office 壳文件夹**先建起来、
 * 先不实施**——仅标注清楚未来扩展方向，防止误认本仓为单体导致后续走偏
 * （office 域壳必须是与 atlascode/ 平级的独立顶层壳，不得混入 atlascode/）。
 *
 * 未来三面相（预声明接缝，头注登记，复审勿当遗漏重提）：
 *   - office 域命令注册表（与 src/cli/commands.ts 同型，office 变体）
 *   - office UI 壳（atlascode/ui 兄弟位；Ink/React 或 Web 壳）
 *   - office 产品入口（atlascode/launcher.ts 薄壳同型）
 * 激活波 = AtlasCode 全功能复刻审视优化（task #154）之后 + office 域工具链
 * 评估（产品拆分 session atlascore/atlascode/atlasoffice 裁定）。
 *
 * 状态: A 波骨架占位（export {}，零行为零测试；任何域不得引用本模块）。
 */
export {}
