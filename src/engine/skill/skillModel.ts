/**
 * engine/skill — skill `model:` frontmatter 解析面（§8.67 D 波 S-E2a，
 * 旧仓 src/utils/model/model.ts skill 消费子集）。
 *
 * 适配裁定（复审勿当遗漏重提）：
 *   ① 旧仓 parseUserSpecifiedModel 的 role 别名解析
 *      （premium/fast/small → getDefaultPremiumModel 等默认模型表）→
 *      新模型车道 = ModelRole 一等（modelprovider roles.ts）：别名即
 *      角色标识本身，身份映射（无默认模型表可查）；自定义模型串
 *      （Azure Foundry deployment ID 类）原样保留大小写透传。
 *   ② 旧仓 resolveSkillModelOverride 的 `[1m]` 后缀携带（P6-2 B-4）→
 *      1M 变体已随 P6 删除（contextWindow 由 provider 元数据承载）→
 *      原样返回 skill 声明模型（逐字值）。
 */
import { MODEL_ROLES } from '../../modelprovider'

/**
 * 解析用户/skill 指定的模型输入。
 * role 别名（premium/fast/small）= 新模型车道角色标识（恒小写）；
 * 其余 = 自定义模型名，原样保留大小写透传（trim 后）。
 */
export function parseUserSpecifiedModel(modelInput: unknown): string {
  const trimmed = (
    typeof modelInput === 'string' ? modelInput : String(modelInput ?? '')
  ).trim()

  if (trimmed === '') {
    return ''
  }

  // role 别名 = 恒小写角色标识（MODEL_ROLES 单一事实源判定）。
  const lower = trimmed.toLowerCase()
  if ((MODEL_ROLES as readonly string[]).includes(lower)) {
    return lower
  }

  return trimmed
}

/**
 * 解析 skill `model:` 覆写对当前模型的生效值。
 * 原样返回 skill 声明模型（1M 后缀携带语义已随 P6 删除，见头注 ②）。
 */
export function resolveSkillModelOverride(
  skillModel: string,
  _currentModel: string,
): string {
  return skillModel
}
