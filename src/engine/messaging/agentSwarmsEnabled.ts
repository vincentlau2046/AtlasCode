/**
 * messaging 域 — agent teams / swarms 总开关（§8.56 S-D2 依赖闭包层）。
 *
 * 0.1.93 W-D-A（f4 批复五(c)）：门面下移 shared/agentSwarmsEnabled.ts 单源
 * （modelprovider/params.ts wire 投影需门判读而 engine→modelprovider 单向，
 * 反向 import 成环；shared 底层两侧皆可消费）。本模块保留 = engine 门面
 * re-export 槽，消费面（engine/index.ts:1155 + team 工具 isEnabled 族）零变。
 *
 * 旧仓来源（a8af45b）：src/utils/agentSwarmsEnabled.ts（isAgentTeamsFlagSet
 * + isAgentSwarmsEnabled；import 重指：isEnvTruthy → shared 门面单一事实源）。
 *
 * delta ①（§8.56.3 裁面裁定 growthbook 2 站点之一，复审勿当遗漏重提）：
 *   旧仓 growthbook killswitch 支 `getFeatureValue_CACHED_MAY_BE_STALE(
 *   'atlas_amber_flint', true)` → 裁（growthbook 面归 analytics 波归位；
 *   默认值 true = 无远端配置态恒放行 → 裁后恒放行与旧缺省态行为等价，
 *   仅失「远端拉闸」能力，登记为前向接缝）。
 */
export { isAgentSwarmsEnabled } from '../../shared/agentSwarmsEnabled'
